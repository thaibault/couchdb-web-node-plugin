// -*- coding: utf-8 -*-
/** @module helper */
'use strict'
/* !
    region header
    Copyright Torben Sickert (info["~at~"]torben.website) 16.12.2012

    License
    -------

    This library written by Torben Sickert stand under a creative commons
    naming 3.0 unported license.
    See https://creativecommons.org/licenses/by/3.0/deed.de
    endregion
*/
// region imports
import {ChildProcess, spawn as spawnChildProcess} from 'child_process'
import {
    checkReachability,
    checkUnreachability,
    CLOSE_EVENT_NAMES,
    getProcessCloseHandler,
    globalContext,
    Logger,
    Mapping,
    PlainObject,
    ProcessCloseCallback,
    ProcessCloseReason,
    ProcessErrorCallback,
    SecondParameter
} from 'clientnode'
import {jsonParser, sendError, sendJSON} from 'express-pouchdb/lib/utils'
import {Express} from 'express-serve-static-core'
import {
    IncomingMessage as IncomingHTTPMessage,
    Server as HTTPServer,
    ServerResponse as HTTP1ServerResponse
} from 'http'
import {
    mkdirp as makeDirectorPath, mkdirpSync as makeDirectorPathSync
} from 'mkdirp'
import nodeFetch from 'node-fetch'
import {promises as fileSystem} from 'fs'
import {dirname, resolve} from 'path'

import {authorize} from './databaseHelper'
import {
    determineAllowedModelRolesMapping,
    getEffectiveURL,
    initializeConnection,
    waitWithTimeout
} from './helper'
import {
    BinaryRunner,
    ChangesResponse,
    ChangesResponseChange,
    Configuration,
    Connection,
    Connector,
    CoreConfiguration,
    Document,
    FindResponse,
    FindRequest,
    InPlaceRunner,
    SecuritySettings,
    Services,
    State,
    UserContext, InitializeExpressPouchDBStateData
} from './type'
// endregion
globalContext.fetch = nodeFetch as unknown as typeof fetch

export const log = new Logger({name: 'web-node.couchdb.server'})
// region functions
/**
 * Initializes an express instance connected with pouchdb.
 * @param name - Instance name.
 * @param state - Application state.
 * @param connector - Database connector instance.
 * @param configuration - Couchdb configuration object.
 * @param pluginAPI - Plugin API to call plugin hooks.
 * @param expressUtilities - Optional express related utilities.
 * @returns A promise resolving to the wrapping express instance and pouchdb's
 * express instance.
 */
export const initializeExpress = async (
    name: string,
    state: State,
    connector: Connector,
    configuration: CoreConfiguration,
    pluginAPI: State['pluginAPI'],
    expressUtilities?: (typeof import('./loadExpress'))['default']
): Promise<{
    expressInstance: Express
    expressPouchDBInstance: Express
}> => {
    log.info(`Couchdb runner is in-place with: "${name}".`)

    const specialNames = configuration.model.property.name.special

    // eslint-disable-next-line camelcase
    const testConnector = new connector('', {skip_setup: true})
    const isInMemory =
        (testConnector as unknown as {adapter: string}).adapter === 'memory'
    await testConnector.close()

    const {
        express,
        expressPouchDB,
        allDocs,
        changes,
        compact,
        revsDiff,
        security,
        viewCleanup,
        tempViews,
        find,
        views,
        ddocInfo,
        show,
        list,
        update,
        attachments,
        documents,
        validation,
        notFoundError
    } = expressUtilities ??
        /*
            NOTE: Depending on target environment module wrapper might differs
            and we have to normalize here.
        */
        ((
            module: typeof import('./loadExpress')['default']
        ): typeof import('./loadExpress')['default'] =>
            (module as
                unknown as
                {default?: typeof import('./loadExpress')['default']}
            ).default ||
            module
        )(
            (await eval(`import('./loadExpress.js')`)).default as
                typeof import('./loadExpress')['default']
        )

    const expressInstance: Express = express()
    /*
        These routes take many remaining paths (fallback). We will add
        these manually after custom routes have been added.
    */

    /*
        We have to overwrite to apply read right authorization on
        property level:

        'routes/all-docs',
        'routes/changes',
        'routes/find',
        'routes/attachments',
        'routes/documents',
    */
    const routesToPostpone = [
        [
            ['routes/all-docs', allDocs],
            ['routes/changes', changes],
            ['routes/compact', compact],
            ['routes/revs-diff', revsDiff],
            ['routes/security', security],
            ['routes/view-cleanup', viewCleanup],
            ['routes/temp-views', tempViews]
        ],
        [
            ['routes/find', find],
            ['routes/views', views],
            ['routes/ddoc-info', ddocInfo],
            ['routes/show', show],
            ['routes/list', list],
            ['routes/update', update]
        ],
        [
            ['routes/attachments', attachments]
        ],
        [
            ['routes/documents', documents],
            ['validation', validation],
            ['routes/404', notFoundError]
        ]
    ]
    const expressPouchDBInstance: Express =
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        expressPouchDB(
            connector,
            {
                overrideMode: {
                    exclude: ([] as typeof routesToPostpone[0])
                        .concat(...routesToPostpone)
                        .map(([name]) => name as string)
                },
                inMemoryConfig: isInMemory,
                logPath: '/dev/null'
            }
        )

    // routes/all-docs
    expressPouchDBInstance.all(
        '/:db/_all_docs',
        jsonParser,
        async (
            givenRequest: IncomingHTTPMessage,
            response: HTTP1ServerResponse,
            next
        ) => {
            const request = givenRequest as (
                IncomingHTTPMessage &
                {
                    body: PlainObject
                    couchSession: {userCtx: Partial<UserContext>}
                    couchSecurityObj: Partial<SecuritySettings>
                    query: Mapping
                }
                )
            const options = {...request.body, ...request.query}

            if (!options.include_docs) {
                next()
                return
            }

            try {
                const result = await (
                    request as unknown as {db: PouchDB.Database}
                ).db.allDocs(options)
                // authorize documents
                const modelRolesMapping =
                    determineAllowedModelRolesMapping(configuration.model)

                for (const row of result.rows)
                    try {
                        authorize(
                            row.doc as unknown as Partial<Document>,
                            null,
                            request.couchSession.userCtx,
                            request.couchSecurityObj,
                            modelRolesMapping,
                            true,
                            specialNames
                        )
                    } catch (error) {
                        sendError(response, error, 403)
                        return
                    }
                // endregion
                sendJSON(response, 200, result)
            } catch (error) {
                sendError(response, error, 400)
            }
        }
    )
    // routes/changes
    const authorizedChanges = ((
        givenRequest: IncomingHTTPMessage,
        _response: HTTP1ServerResponse,
        next
    ) => {
        const request = givenRequest as (
            IncomingHTTPMessage &
            {
                body: PlainObject
                couchSession: {userCtx: Partial<UserContext>}
                couchSecurityObj: Partial<SecuritySettings>
                db: Connection
                query: Mapping
            }
            )
        const options = {...request.body, ...request.query}

        /*
            NOTE: Needed workaround to allow changes implementation to set query
            params on its own.
        */
        Object.defineProperty(request, 'query', {
            value: {...request.query},
            writable: true,
            configurable: true,
            enumerable: true
        })

        if (!options.include_docs) {
            next()
            return
        }

        const modelRolesMapping =
            determineAllowedModelRolesMapping(configuration.model)

        const authorizeChange = (document: ChangesResponseChange['doc']) =>
            authorize(
                document as Document,
                null,
                request.couchSession.userCtx,
                request.couchSecurityObj,
                modelRolesMapping,
                true,
                specialNames
            )

        const nativeChanges = request.db.changes.bind(request.db)
        request.db.changes = ((...parameters) => {
            const result = (
                nativeChanges as
                    (...parameter: Array<unknown>) =>
                        EventEmitter | Promise<ChangesResponse> | undefined
            )(...parameters)
            if (result)
                if ((result as Partial<EventEmitter>).on)
                    (result as EventEmitter).on(
                        'change',
                        (change: ChangesResponseChange) => {
                            if (change.doc)
                                try {
                                    authorizeChange(change.doc)
                                } catch (error) {
                                    try {
                                        delete change.doc
                                        ;(
                                            change as
                                                unknown as
                                                {error: unknown}
                                        ).error = error
                                    } catch (e) {
                                        console.error(e)
                                    }
                                }
                        }
                    )
                else if ((result as Partial<Promise<ChangesResponse>>).then)
                    void (result as Promise<ChangesResponse>).then(
                        (results) => {
                            for (const change of results.results)
                                if (change.doc)
                                    try {
                                        authorizeChange(change.doc)
                                    } catch (error) {
                                        try {
                                            delete change.doc
                                            ;(
                                                change as
                                                    unknown as
                                                    {error: unknown}
                                            ).error = error
                                        } catch (e) {
                                            console.error(e)
                                        }
                                    }
                        }
                    )
            return result
        }) as Connection['changes']
        next()
        request.db.changes = nativeChanges
    }) as SecondParameter<typeof expressPouchDBInstance.get>
    expressPouchDBInstance.get('/:db/_changes', authorizedChanges)
    expressPouchDBInstance.post('/:db/_changes', jsonParser, authorizedChanges)

    for (const [_name, module] of routesToPostpone[0])
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        module(expressPouchDBInstance)
    // routes/find
    expressPouchDBInstance.post(
        '/:db/_find',
        jsonParser,
        async (
            givenRequest: IncomingHTTPMessage, response: HTTP1ServerResponse
        ) => {
            const request = givenRequest as (
                IncomingHTTPMessage &
                {
                    body: FindRequest<PlainObject>
                    couchSession: {userCtx: Partial<UserContext>}
                    couchSecurityObj: Partial<SecuritySettings>
                    db: Connection
                }
                )
            /*
                NOTE: We always have to determine type to be able to evaluate
                type based authorization rules.
            */
            let addedType = false
            if (
                Array.isArray(request.body.fields) &&
                !request.body.fields.includes(specialNames.type)
            ) {
                request.body.fields.push(specialNames.type)
                addedType = true
            }
            try {
                const hookData = {request, response}
                let result = await pluginAPI.callStack<
                    State<{
                        request: typeof request
                        response: HTTP1ServerResponse
                    }>,
                    FindResponse<object> | undefined
                >({
                    ...state,
                    hook: 'onPouchDBFind',
                    data: hookData
                }) as FindResponse<object> | undefined

                if (!result?.docs)
                    result = await request.db.find(request.body)
                // authorize documents
                const modelRolesMapping =
                    determineAllowedModelRolesMapping(configuration.model)

                for (const document of result.docs)
                    try {
                        authorize(
                            document,
                            null,
                            request.couchSession.userCtx,
                            request.couchSecurityObj,
                            modelRolesMapping,
                            true,
                            specialNames
                        )
                        if (addedType)
                            delete (document as Mapping)[specialNames.type]
                    } catch (error) {
                        sendError(response, error, 403)
                        return
                    }
                // endregion
                sendJSON(response, 200, result)
            } catch (error) {
                sendError(response, error, 400)
            }
        }
    )

    for (const [_name, module] of routesToPostpone[1])
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        module(expressPouchDBInstance)

    // routes/attachments
    expressPouchDBInstance.get(
        '/:db/:id/:attachment(*)',
        async (
            givenRequest: IncomingHTTPMessage,
            response: HTTP1ServerResponse,
            next
        )=> {
            const request = givenRequest as (
                IncomingHTTPMessage &
                {
                    couchSession: {userCtx: Partial<UserContext>}
                    couchSecurityObj: Partial<SecuritySettings>
                    db: Connection
                    params: Mapping
                    query: Mapping
                }
                )

            try {
                const modelRolesMapping =
                    determineAllowedModelRolesMapping(configuration.model)

                const {docs: [document]} = await request.db.find({
                    fields: [specialNames.type],
                    selector: {[specialNames.id]: request.query.id}
                })

                try {
                    authorize(
                        {
                            [specialNames.type]: document[specialNames.type],
                            [specialNames.attachment]: {
                                [request.params.attachment]: {}
                            }
                        } as unknown as Partial<Document>,
                        null,
                        request.couchSession.userCtx,
                        request.couchSecurityObj,
                        modelRolesMapping,
                        true,
                        specialNames
                    )
                } catch (error) {
                    sendError(response, error, 403)
                    return
                }
            } catch (error) {
                sendError(response, error, 400)
                return
            }
            next()
        }
    )
    // We already cover put and delete attachment via "bulkDocs" operation.

    for (const [_name, module] of routesToPostpone[2])
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        module(expressPouchDBInstance)

    // routes/documents
    expressPouchDBInstance.get(
        '/:db/:id(*)',
        async (
            givenRequest: IncomingHTTPMessage, response: HTTP1ServerResponse
        )=> {
            const request = givenRequest as (
                IncomingHTTPMessage &
                {
                    couchSession: { userCtx: Partial<UserContext> }
                    couchSecurityObj: Partial<SecuritySettings>
                    db: Connection
                    params: Mapping
                    query: Mapping
                }
                )

            try {
                const modelRolesMapping =
                    determineAllowedModelRolesMapping(configuration.model)

                const document =
                    await request.db.get(request.params.id, request.query)

                try {
                    authorize(
                        document as Document,
                        null,
                        request.couchSession.userCtx,
                        request.couchSecurityObj,
                        modelRolesMapping,
                        true,
                        specialNames
                    )
                } catch (error) {
                    sendError(response, error, 403)
                    return
                }
                sendJSON(response, 200, document)
            } catch (error) {
                sendError(response, error, 400)
            }
        }
    )

    // We already cover delete and copy via "get" and "bulkDocs" operation.

    for (const [_name, module] of routesToPostpone[3])
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        module(expressPouchDBInstance)

    if (!isInMemory) {
        /*
            NOTE: Currently needed to use synchronized folder creation to avoid
            having the folder not yet persisted in following execution when
            working on not mounted locations. Seems to be an issue within a
            container environment.
        */
        makeDirectorPathSync(resolve(configuration.path))
        await makeDirectorPath(resolve(configuration.path))
    }

    await pluginAPI.callStack<State<InitializeExpressPouchDBStateData>>({
        ...state,
        hook: 'initializeExpressPouchDB',
        data: {expressInstance, expressPouchDBInstance}
    })

    expressInstance.use('/', expressPouchDBInstance)

    return {expressInstance, expressPouchDBInstance}
}
/**
 * Starts server process.
 * @param state - Application state.
 * @param expressUtilities - Optional express related utilities.
 * @returns A promise representing the server process wrapped in a promise
 * which resolves after server is reachable.
 */
export const start = async (
    state: State,
    expressUtilities?: (typeof import('./loadExpress'))['default']
): Promise<void> => {
    const {
        configuration, pluginAPI, services: {couchdb: {
            backendConnector, server
        }}
    } = state
    const {couchdb: {runner: runnerConfiguration}} = configuration
    const {runner} = server

    // region create configuration file if needed
    if (runner.configurationFile) {
        try {
            await fileSystem.mkdir(
                dirname(runner.configurationFile.path), {recursive: true}
            )
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
                throw error
        }

        await fileSystem.writeFile(
            runner.configurationFile.path,
            runner.configurationFile.content,
            {encoding: configuration.core.encoding}
        )
    }
    // endregion

    const name = ([] as Array<string>).concat(runner.names)[0]
    if ((runner as InPlaceRunner).packages) {
        /*
            We run into memory leaks and ongoing background tasks if we try to
            fully reinitialize express with pouchdb here.
        */
        if (!server.expressInstance) {
            const {expressInstance, expressPouchDBInstance} =
                await initializeExpress(
                    name,
                    state,
                    backendConnector,
                    configuration.couchdb,
                    pluginAPI,
                    expressUtilities
                )
            server.expressInstance = expressInstance
            server.expressPouchDBInstance = expressPouchDBInstance
        }

        await new Promise((resolve) => {
            server.process = server.expressInstance?.listen(
                configuration.couchdb.runner.port, resolve
            )
            server.process?.on('close', () => {
                server.resolve.call(this)
            })
            server.process?.on('error', (error: Error) => {
                server.reject.call(this, error)
            })
        })
    } else {
        log.info(`Couchdb runner is: "${name}".`)

        const binaryRunner = runner as BinaryRunner

        server.process = spawnChildProcess(
            (
                runnerConfiguration.memoryInMegaByte === 'default' ?
                    binaryRunner.binaryFilePath as string :
                    runnerConfiguration.nodePath
            ),
            (
                runnerConfiguration.memoryInMegaByte === 'default' ?
                    [] :
                    [
                        '--max-old-space-size=' +
                        runnerConfiguration.memoryInMegaByte,
                        binaryRunner.binaryFilePath as string
                    ]
            )
                .concat(binaryRunner.arguments ? binaryRunner.arguments : []),
            {
                cwd: (eval('process') as typeof process).cwd(),
                env: (
                    Object.prototype.hasOwnProperty.call(
                        runner, 'environment'
                    ) ?
                        {
                            ...(eval('process') as typeof process).env,
                            ...binaryRunner.environment
                        } :
                        (eval('process') as typeof process).env
                ),
                shell: true,
                stdio: 'inherit'
            }
        )

        // Forward process events to service promise.
        ;(new Promise((
            resolve: ProcessCloseCallback, reject: ProcessErrorCallback
        ): void => {
            for (const closeEventName of CLOSE_EVENT_NAMES)
                server.process?.on(
                    closeEventName,
                    getProcessCloseHandler(
                        resolve,
                        reject,
                        {process: server.process, reason: closeEventName}
                    )
                )
        }))
            .then(
                /*
                    NOTE: Please be aware of newly set server instances when
                    resolving happens here.
                 */
                (value: ProcessCloseReason) => {
                    server.resolve.call(this, value)
                },
                (reason: unknown) => {
                    server.reject.call(this, reason as ProcessCloseReason)
                }
            )
    }

    await checkReachability(
        getEffectiveURL(configuration.couchdb, false, false), {wait: true}
    )
}
/**
 * Stops open database connection if exists, stops server process, restarts
 * server process and re-initializes server connection.
 * @param state - Application state.
 * @param destroy - Defined whether the database should be destroyed or just
 * closed.
 * @param expressUtilities - Optional express related utilities.
 * @returns Given object of services wrapped in a promise resolving after
 * finish.
 */
export const restart = async (
    state: State,
    destroy = false,
    expressUtilities?: (typeof import('./loadExpress'))['default']
): Promise<void> => {
    const {configuration, pluginAPI, services} = state
    const {couchdb: {server}} = services

    const resolveServerProcessBackup = server.resolve
    const rejectServerProcessBackup = server.reject

    // Avoid to notify web node about server process stop.
    const temporaryServerPromise = new Promise((resolve, reject) => {
        server.resolve = resolve
        server.reject = reject
    })
    await stop(services, configuration, destroy)

    // NOTE: Pouchdb needs some time finished further microtasks.
    await temporaryServerPromise

    // Reattach server process to web nodes process pool.
    server.resolve = resolveServerProcessBackup
    server.reject = rejectServerProcessBackup

    await initializeConnection(services, configuration, false)

    await start(state, expressUtilities)

    await pluginAPI.callStack<State>({...state, hook: 'restartCouchdb'})
}
/**
 * Stops open database connection if exists and stops server process.
 * @param services - An object with stored service instances.
 * @param services.couchdb - Couchdb service instance.
 * @param configuration - Mutable by plugins extended configuration object.
 * @param configuration.couchdb - Mutable by plugins extended configuration
 * object.
 * @param destroy - Defined whether the database should be destroyed or just
 * closed.
 * @returns Given object of services wrapped in a promise resolving after
 * finish.
 */
export const stop = async (
    {couchdb}: Services,
    {couchdb: configuration}: Configuration,
    destroy = false
): Promise<void> => {
    if (destroy)
        await couchdb.connection.destroy()
    else {
        const promise = couchdb.connection.close() as Promise<void> | undefined
        if (promise?.catch) {
            /*
                NOTE: Waiting for close promise to resolved often takes endless
                time.
            */
            promise.catch((error: unknown) => {
                log.error(
                    'Couchdb connection could not be gracefully closed:',
                    error
                )
            })
            await waitWithTimeout(
                promise,
                configuration.closeTimeoutInSeconds,
                'couchdb connection to close'
            )
        }
    }

    if (couchdb.server.process)
        if ((couchdb.server.runner as InPlaceRunner).packages)
            (couchdb.server.process as HTTPServer).close()
        else
            (couchdb.server.process as ChildProcess).kill('SIGINT')

    await checkUnreachability(getEffectiveURL(configuration), {wait: true})
}
