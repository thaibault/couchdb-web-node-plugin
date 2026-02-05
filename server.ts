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
    format,
    getProcessCloseHandler,
    globalContext,
    Logger,
    NOOP,
    PlainObject,
    ProcessCloseCallback,
    ProcessCloseReason,
    ProcessErrorCallback, timeout
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
    initializeConnection
} from './helper'
import {
    BinaryRunner,
    Configuration,
    FindResponse,
    FindRequest,
    InPlaceRunner,
    Services,
    State
} from './type'
// endregion
globalContext.fetch = nodeFetch as unknown as typeof fetch

export const log = new Logger({name: 'web-node.couchdb.server'})
// region functions
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
        configuration, pluginAPI, services: {couchdb: {connector, server}}
    } = state
    const {
        couchdb: {
            connector: connectorConfiguration,
            backend: {configuration: backendConfiguration},
            runner: runnerConfiguration
        }
    } = configuration
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

    if ((runner as InPlaceRunner).packages) {
        const name = ([] as Array<string>).concat(runner.names)[0]
        log.info(`Couchdb runner is in-place with: "${name}".`)

        const {
            express,
            expressPouchDB,
            bulkGet,
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
            (await eval(`import('./loadExpress')`)).default as
                (typeof import('./loadExpress'))['default']

        const expressInstance: Express = server.expressInstance = express()
        /*
            These routes take many remaining paths (fallback). We will add
            these manually after custom routes could be added.
        */

        /*
            We have to overwrite to apply read right authorization on property
            level:

            'routes/bulk-get',
            'routes/all-docs',
            'routes/attachments',
            'routes/documents',
        */
        const routesToPostpone = [
            [
                ['routes/bulk-get', bulkGet],
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
                ['routes/attachments', attachments],
                ['routes/documents', documents],
                ['validation', validation],
                ['routes/404', notFoundError]
            ]
        ]
        const expressPouchDBInstance: Express =
            server.expressPouchDBInstance =
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            expressPouchDB(
                connector,
                {
                    configPath: resolve(
                        configuration.couchdb.path, 'database.json'
                    ),
                    logPath: resolve(
                        configuration.couchdb.path,
                        backendConfiguration['log/file'] as string
                    ),
                    overrideMode: {
                        exclude: ([] as typeof routesToPostpone[0])
                            .concat(...routesToPostpone)
                            .map(([name]) => name as string)
                    }
                }
            )

        // TODO overwrite security related apis
        // 'routes/bulk-get'
        // 'routes/all-docs'
        // 'routes/changes'

        for (const [_name, module] of routesToPostpone[0])
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            module(expressPouchDBInstance)

        expressPouchDBInstance.post(
            '/:db/_find',
            jsonParser,
            async (
                request:
                    IncomingHTTPMessage &
                    {body: FindRequest<PlainObject>},
                response: HTTP1ServerResponse
            ) => {
                try {
                    let result = await pluginAPI.callStack<
                        State<{
                            request:
                                IncomingHTTPMessage &
                                {body: FindRequest<PlainObject>},
                            response: HTTP1ServerResponse
                        }>,
                        FindResponse<object> | undefined
                    >({
                        ...state,
                        hook: 'onPouchDBFind',
                        data: {request, response}
                    }) as FindResponse<object> | undefined

                    if (!result)
                        result = await (
                            request as unknown as {db: PouchDB.Database}
                        ).db.find(request.body)
                    // authorize documents
                    const modelRolesMapping =
                        determineAllowedModelRolesMapping(
                            configuration.couchdb.model
                        )
                    const specialNames =
                        configuration.couchdb.model.property.name.special

                    console.log('TODO extract user context', request)

                    for (const document of result.docs)
                        authorize(
                            document,
                            null,
                            modelRolesMapping,
                            {}, // TODO determine user context
                            // TODO determine security object
                            configuration.couchdb.security,
                            specialNames.id,
                            specialNames.type,
                            specialNames.designDocumentNamePrefix,
                            true
                        )
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

        // TODO overwrite security related apis
        // 'routes/attachments'
        // 'routes/documents'

        for (const [_name, module] of routesToPostpone[2])
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            module(expressPouchDBInstance)

        if (connectorConfiguration.adapter !== 'memory') {
            /*
                NOTE: Currently needed to use synchronized folder creation to
                avoid having the folder not yet persisted in following
                execution when working on not mounted locations. Seems to be an
                issue within a container environment.
            */
            makeDirectorPathSync(resolve(
                backendConfiguration['couchdb/database_dir'] as string
            ))
            await makeDirectorPath(resolve(
                backendConfiguration['couchdb/database_dir'] as string
            ))
        }

        await pluginAPI.callStack<
            State<{
                expressInstance: Express,
                expressPouchDBInstance: Express
            }>,
            FindResponse<object> | undefined
        >({
            ...state,
            hook: 'initializeExpressPouchDB',
            data: {expressInstance, expressPouchDBInstance}
        })

        server.expressInstance.use('/', expressPouchDBInstance)

        await new Promise((resolve) => {
            server.process = expressInstance.listen(
                backendConfiguration['httpd/port'], resolve
            )
            server.process.on('close', () => {
                server.resolve.call(this)
            })
            server.process.on('error', (error: Error) => {
                server.reject.call(this, error)
            })
        })
    } else {
        const name = ([] as Array<string>).concat(runner.names)[0]
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

    const url = format(configuration.couchdb.url, '')
    if (/^https?:\/\//.test(url))
        await checkReachability(url, {wait: true})
}
/**
 * Stops open database connection if exists, stops server process, restarts
 * server process and re-initializes server connection.
 * @param state - Application state.
 * @param expressUtilities - Optional express related utilities.
 * @returns Given object of services wrapped in a promise resolving after
 * finish.
 */
export const restart = async (
    state: State,
    expressUtilities?: (typeof import('./loadExpress'))['default']
): Promise<void> => {
    const {configuration, pluginAPI, services} = state
    const {couchdb: {server}} = services

    const resolveServerProcessBackup = server.resolve
    const rejectServerProcessBackup = server.reject

    // Avoid to notify web node about server process stop.
    server.resolve = server.reject = NOOP

    await stop(services, configuration)

    // NOTE: Pouchdb needs some time finished further microtasks.
    await timeout(100)

    // Reattach server process to web nodes process pool.
    server.resolve = resolveServerProcessBackup
    server.reject = rejectServerProcessBackup

    await start(state, expressUtilities)

    void initializeConnection(services, configuration)

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
        if (promise?.catch)
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
    }

    if (couchdb.server.process)
        if ((couchdb.server.runner as InPlaceRunner).packages)
            (couchdb.server.process as HTTPServer).close()
        else
            (couchdb.server.process as ChildProcess).kill('SIGINT')

    const url = format(configuration.url, '')
    if (/^https?:\/\//.test(url))
        await checkUnreachability(url, {wait: true})
}
