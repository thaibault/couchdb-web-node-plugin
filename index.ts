// #!/usr/bin/env babel-node
// -*- coding: utf-8 -*-
/** @module couchdb-web-node-plugin */
'use strict'
/* !
    region header
    [Project page](https://torben.website/couchdb-web-node-plugin)

    Copyright Torben Sickert (info["~at~"]torben.website) 16.12.2012

    License
    -------

    This library written by Torben Sickert stand under a creative commons
    naming 3.0 unported license.
    See https://creativecommons.org/licenses/by/3.0/deed.de
    endregion
*/
// region imports
import Tools, {globalContext} from 'clientnode'
import {
    File,
    FirstParameter,
    Mapping,
    PlainObject,
    ProcessCloseReason,
    SecondParameter
} from 'clientnode/type'
import {promises as fileSystem} from 'fs'
import path from 'path'
import PouchDB from 'pouchdb'
import PouchDBFindPlugin from 'pouchdb-find'
import {PluginHandler, PluginPromises} from 'web-node/type'

import DatabaseHelper from './databaseHelper'
import Helper from './helper'
import {
    ChangesStream,
    Connection,
    Constraint,
    DatabaseError,
    DatabasePlugin,
    DatabaseResponse,
    DeleteIndexOptions,
    Document,
    ExistingDocument,
    Exception,
    FullDocument,
    Index,
    Migrator,
    ModelConfiguration,
    Models,
    PartialFullDocument,
    PropertySpecification,
    Runner,
    Services,
    ServicesState,
    SpecialPropertyNames,
    State
} from './type'
// endregion
// region plugins/classes
/**
 * Launches an application server und triggers all some pluginable hooks on
 * an event.
 * @property static:toggleIDDetermining - Token to provide to "bulkDocs" method
 * call to indicate id determination skip or not (depends on
 * "skipIDDetermining" configuration).
 */
export class Database implements PluginHandler {
    static toggleIDDetermining = Symbol('toggleIDDetermining')
    /**
     * Appends an application server to the web node services.
     * @param state - Application state.
     * @param state.configuration - Applications configuration.
     * @param state.configuration.couchdb - Plugins configuration.
     * @param state.services - Applications services.
     *
     * @returns Promise resolving to nothing.
     */
    static async preLoadService({
        configuration: {couchdb: configuration}, services
    }:ServicesState):Promise<void> {
        if (!Object.prototype.hasOwnProperty.call(services, 'couchdb'))
            services.couchdb = {} as Services['couchdb']
        const {couchdb} = services

        if (!Object.prototype.hasOwnProperty.call(couchdb, 'connector')) {
            const idName:SpecialPropertyNames['id'] =
                configuration.model.property.name.special.id
            const revisionName:SpecialPropertyNames['revision'] =
                configuration.model.property.name.special.revision

            couchdb.connector = PouchDB
            // region apply "latest/upsert" and ignore "NoChange" error plugin
            const nativeBulkDocs:Connection['bulkDocs'] =
                // eslint-disable-next-line @typescript-eslint/unbound-method
                (couchdb.connector.prototype as Connection).bulkDocs
            couchdb.connector.plugin({bulkDocs: async function(
                this:Connection,
                firstParameter:unknown,
                ...parameters:Array<unknown>
            ):Promise<Array<DatabaseError|DatabaseResponse>> {
                const toggleIDDetermining:boolean = (
                    parameters.length > 0 &&
                    parameters[parameters.length - 1] ===
                        Database.toggleIDDetermining
                )
                const skipIDDetermining:boolean = toggleIDDetermining ?
                    !configuration.skipIDDetermining :
                    configuration.skipIDDetermining
                if (toggleIDDetermining)
                    parameters.pop()
                /*
                    Implements a generic retry mechanism for "upsert" and
                    "latest" updates and optionally supports to ignore
                    "NoChange" errors.
                */
                let data:Array<PartialFullDocument> = (
                    !Array.isArray(firstParameter) &&
                    firstParameter !== null &&
                    typeof firstParameter === 'object' &&
                    idName in firstParameter
                ) ?
                    [firstParameter as PartialFullDocument] :
                    firstParameter as Array<PartialFullDocument>
                /*
                    NOTE: "bulkDocs()" does not get constructor given options
                    if none were provided for a single function call.
                */
                if (
                    configuration.connector.fetch?.timeout &&
                    (
                        parameters.length === 0 ||
                        typeof parameters[0] !== 'object'
                    )
                )
                    parameters.unshift({
                        timeout: configuration.connector.fetch.timeout
                    })

                const result:Array<DatabaseError|DatabaseResponse> =
                    await nativeBulkDocs.call(
                        this,
                        data as FirstParameter<Connection['bulkDocs']>,
                        ...parameters as
                            [SecondParameter<Connection['bulkDocs']>]
                    )

                const conflictingIndexes:Array<number> = []
                const conflicts:Array<PartialFullDocument> = []
                let index = 0
                for (const item of result) {
                    if (typeof data[index] === 'object')
                        if (
                            revisionName in data[index] &&
                            (item as DatabaseError).name === 'conflict' &&
                            ['latest', 'upsert'].includes(
                                data[index][revisionName]!
                            )
                        ) {
                            conflicts.push(data[index])
                            conflictingIndexes.push(index)
                        } else if (
                            idName in data[index] &&
                            configuration.ignoreNoChangeError &&
                            'name' in item &&
                            item.name === 'forbidden' &&
                            'message' in item &&
                            (item.message as string).startsWith('NoChange:')
                        ) {
                            result[index] = {
                                id: data[index][idName], ok: true
                            }
                            if (!skipIDDetermining)
                                result[index].rev =
                                    revisionName in data[index] &&
                                    !['latest', 'upsert'].includes(
                                        data[index][revisionName]!
                                    ) ?
                                        data[index][revisionName] :
                                        ((await this.get(result[index].id!)) as
                                            unknown as
                                            FullDocument
                                        )[revisionName]
                        }

                    index += 1
                }

                if (conflicts.length) {
                    data = conflicts
                    if (toggleIDDetermining)
                        parameters.push(Database.toggleIDDetermining)

                    const retriedResults:Array<
                        DatabaseError|DatabaseResponse
                    > = (await this.bulkDocs(
                        data,
                        ...parameters as
                            [SecondParameter<Connection['bulkDocs']>]
                    )) as
                        unknown as
                        Array<DatabaseError|DatabaseResponse>
                    for (const retriedResult of retriedResults)
                        result[conflictingIndexes.shift() as number] =
                            retriedResult
                }

                return result
            } as unknown as DatabasePlugin})
            // endregion
            if (configuration.debug)
                couchdb.connector.debug.enable('*')

            couchdb.connector = couchdb.connector.plugin(PouchDBFindPlugin)
        }

        if (!Object.prototype.hasOwnProperty.call(couchdb, 'server')) {
            couchdb.server = {} as Services['couchdb']['server']
            // region search for binary file to start database server
            const triedPaths:Array<string> = []
            for (const runner of ([] as Array<Runner>).concat(
                configuration.binary.runner
            )) {
                for (const directoryPath of (
                    ([] as Array<string>).concat(runner.location)
                )) {
                    for (const name of (
                        ([] as Array<string>).concat(runner.name)
                    )) {
                        const binaryFilePath:string = path.resolve(
                            directoryPath, name
                        )
                        triedPaths.push(binaryFilePath)

                        if (await Tools.isFile(binaryFilePath)) {
                            runner.binaryFilePath = binaryFilePath
                            couchdb.server.runner = runner

                            break
                        }
                    }

                    if (Object.prototype.hasOwnProperty.call(
                        couchdb.server, 'runner'
                    ))
                        break
                }

                if (Object.prototype.hasOwnProperty.call(
                    couchdb.server, 'runner'
                ))
                    break
            }

            if (!Object.prototype.hasOwnProperty.call(
                couchdb.server, 'runner'
            ))
                throw new Error(
                    'No binary file in one of the following locations found:' +
                    ` "${triedPaths.join('", "')}".`
                )
            // endregion
        }
    }
    /**
     * Start database's child process and return a Promise which observes this
     * service.
     * @param state - Application state.
     * @param state.configuration - Applications configuration.
     * @param state.services - Applications services.
     *
     * @returns A mapping to promises which correspond to the plugin specific
     * continues services.
     */
    static async loadService(
        {configuration, services}:State
    ):Promise<PluginPromises> {
        let promise:null|Promise<ProcessCloseReason> = null
        const {couchdb} = services

        if (Object.prototype.hasOwnProperty.call(couchdb.server, 'runner')) {
            await Helper.startServer(services, configuration)

            couchdb.server.restart = Helper.restartServer
            couchdb.server.start = Helper.startServer
            couchdb.server.stop = Helper.stopServer

            promise = new Promise<ProcessCloseReason>((
                resolve:(value:ProcessCloseReason) => void,
                reject:(reason:ProcessCloseReason) => void
            ):void => {
                /*
                    NOTE: These callbacks can be reassigned during server
                    restart.
                */
                couchdb.server.resolve = resolve
                couchdb.server.reject = reject
            })
        }

        if (Object.prototype.hasOwnProperty.call(couchdb, 'connection'))
            return {couchdb: promise}

        const urlPrefix:string = Tools.stringFormat(
            configuration.couchdb.url,
            `${configuration.couchdb.user.name}:` +
            `${configuration.couchdb.user.password}@`
        )
        // region ensure presence of global admin user
        if (configuration.couchdb.ensureAdminPresence) {
            const unauthenticatedUserDatabaseConnection:Connection =
                new couchdb.connector(
                    `${Tools.stringFormat(configuration.couchdb.url, '')}/` +
                        `_users`,
                    Helper.getConnectorOptions(configuration)
                )

            try {
                // NOTE: We check if we are in admin party mode.
                await unauthenticatedUserDatabaseConnection.allDocs()

                console.info(
                    'No admin user available. Automatically creating admin ' +
                    `user "${configuration.couchdb.user.name}".`
                )

                await globalContext.fetch(
                    `${Tools.stringFormat(configuration.couchdb.url, '')}/` +
                    couchdb.server.runner.adminUserConfigurationPath +
                    `/${configuration.couchdb.user.name}`,
                    {
                        body: `"${configuration.couchdb.user.password}"`,
                        method: 'PUT'
                    }
                )
            } catch (error) {
                if ((error as Exception).name === 'unauthorized') {
                    const authenticatedUserDatabaseConnection:Connection =
                        new couchdb.connector(
                            `${urlPrefix}/_users`,
                            Helper.getConnectorOptions(configuration)
                        )

                    try {
                        await authenticatedUserDatabaseConnection.allDocs()
                    } catch (error) {
                        console.error(
                            `Can't login as existing admin user "` +
                            `${configuration.couchdb.user.name}": "` +
                            `${Tools.represent(error)}".`
                        )
                    } finally {
                        void authenticatedUserDatabaseConnection.close()
                    }
                } else
                    console.error(
                        `Can't create new admin user "` +
                        `${configuration.couchdb.user.name}": "` +
                        `${Tools.represent(error)}".`
                    )
            } finally {
                void unauthenticatedUserDatabaseConnection.close()
            }
        }
        // endregion
        // region ensure presence of regular users
        if (configuration.couchdb.ensureUserPresence)
            for (const type of [
                configuration.couchdb.security.admins,
                configuration.couchdb.security.members
            ])
                for (const name of type.names) {
                    const userDatabaseConnection:Connection =
                        new couchdb.connector(
                            `${urlPrefix}/_users`,
                            Helper.getConnectorOptions(configuration)
                        )

                    try {
                        await userDatabaseConnection.get(
                            `org.couchdb.user:${name}`
                        )
                    } catch (error) {
                        if ((error as {error:string}).error === 'not_found')
                            try {
                                await userDatabaseConnection.put({
                                    [
                                    configuration.couchdb.model.property.name
                                        .special.id
                                    ]: `org.couchdb.user:${name}`,
                                    name,
                                    password: name,
                                    roles: ([] as Array<string>).concat(
                                        type.roles.includes(`${name}s`) ?
                                            `${name}s` :
                                            []
                                    ),
                                    type: 'user'
                                })
                            } catch (error) {
                                throw new Error(
                                    `Couldn't create missing user "${name}":` +
                                    ` ${Tools.represent(error)}`
                                )
                            }
                        else
                            throw new Error(
                                `Couldn't check for presence of user "` +
                                `${name}": ${Tools.represent(error)}`
                            )
                    } finally {
                        void userDatabaseConnection.close()
                    }
                }
        // endregion
        // region apply database/rest api configuration
        if (configuration.couchdb.model.updateConfiguration)
            for (const prefix of configuration.couchdb.backend.prefixes)
                for (
                    const subPath in
                    configuration.couchdb.backend.configuration
                )
                    if (Object.prototype.hasOwnProperty.call(
                        configuration.couchdb.backend.configuration, subPath
                    )) {
                        const fullPath =
                            `/${prefix}${prefix.trim() ? '/' : ''}${subPath}`
                        const url = `${urlPrefix}${fullPath}`

                        const value:unknown =
                            configuration.couchdb.backend.configuration[
                                subPath
                            ]

                        let response:Response|undefined
                        try {
                            response = await globalContext.fetch(url)
                        } catch (error) {
                            console.warn(
                                `Configuration "${fullPath}" (with desired ` +
                                `value "${Tools.represent(value)}") couldn't` +
                                ` be determined: ${Tools.represent(error)}`
                            )
                        }

                        if (response)
                            if (response.ok) {
                                let changeNeeded = true
                                if (typeof response.text === 'function')
                                    try {
                                        changeNeeded = (
                                            value === await response[
                                                typeof value === 'string' ?
                                                    'text' :
                                                    'json'
                                            ]()
                                        )
                                    } catch (error) {
                                        console.warn(
                                            'Error checking curent value of ' +
                                            `"${fullPath}" to be "` +
                                            `${Tools.represent(value)}": ` +
                                            Tools.represent(error)
                                        )
                                    }

                                if (changeNeeded)
                                    try {
                                        await globalContext.fetch(
                                            url,
                                            {
                                                body:
                                                    '"' +
                                                    (configuration.couchdb
                                                        .backend.configuration[
                                                            subPath
                                                        ] as string
                                                    ) +
                                                    '"',
                                                method: 'PUT'
                                            }
                                        )
                                    } catch (error) {
                                        console.error(
                                            `Configuration "${fullPath}" ` +
                                            `couldn't be applied to "` +
                                            `${Tools.represent(value)}": ` +
                                            Tools.represent(error)
                                        )
                                    }
                                else
                                    console.info(
                                        `Configuration "${fullPath}" is ` +
                                        'already set to desired value "' +
                                        `${Tools.represent(value)}".`
                                    )
                            } else
                                console.info(
                                    `Configuration "${fullPath}" does not ` +
                                    `exist (desired value "` +
                                    `${Tools.represent(value)}"). Response ` +
                                    `code is ${response.status}.`
                                )
                    }
        // endregion
        await Helper.initializeConnection(services, configuration)

        const idName:SpecialPropertyNames['id'] =
            configuration.couchdb.model.property.name.special.id
        const typeName:SpecialPropertyNames['type'] =
            configuration.couchdb.model.property.name.special.type

        // region ensure presence of database security settings
        if (configuration.couchdb.ensureSecuritySettingsPresence)
            try {
                /*
                    NOTE: As a needed side effect:
                    This clears preexisting document references in
                    "securitySettings[
                        configuration.couchdb.model.property.name
                            .validatedDocumentsCache
                    ]".
                */
                await globalContext.fetch(
                    `${urlPrefix}/${configuration.couchdb.databaseName}/` +
                    '_security',
                    {
                        body: JSON.stringify(configuration.couchdb.security),
                        method: 'PUT'
                    }
                )
            } catch (error) {
                console.error(
                    `Security object couldn't be applied.: ` +
                    Tools.represent(error)
                )
            }
        // endregion
        const modelConfiguration:ModelConfiguration = Tools.copy(
            configuration.couchdb.model
        )

        delete (modelConfiguration.property as
            {defaultSpecification?:PropertySpecification}
        ).defaultSpecification
        delete (modelConfiguration as {entities?:Models}).entities

        const models:Models = Helper.extendModels(configuration.couchdb.model)
        if (configuration.couchdb.model.updateValidation) {
            const databaseHelperCode:string = await fileSystem.readFile(
                eval(`require.resolve('./databaseHelper')`) as string,
                {encoding: configuration.core.encoding, flag: 'r'}
            )
            // region generate/update authentication/validation code
            for (const type of [
                {
                    description: 'Model specification',
                    methodName: 'validateDocumentUpdate',
                    name: 'validation',
                    serializedParameter:
                        `${JSON.stringify(modelConfiguration)}, ` +
                        JSON.stringify(models)
                },
                {
                    description: 'Authorisation',
                    methodName: 'authenticate',
                    name: 'authentication',
                    serializedParameter:
                        JSON.stringify(
                            Helper.determineAllowedModelRolesMapping(
                                configuration.couchdb.model
                            )
                        ) +
                        `, '${idName}', '${typeName}', '` +
                        configuration.couchdb.model.property.name.special
                            .designDocumentNamePrefix +
                        `'`
                }
            ] as const) {
                /*
                    NOTE: This code should be widely supported since no
                    transpiler can interacts here easily.
                */
                const code:string = 'function(...parameters) {\n' +
                    `    return require('helper').default.${type.methodName}` +
                        `(...parameters.concat([${type.serializedParameter}]` +
                        '))\n' +
                    '}'

                try {
                    /* eslint-disable @typescript-eslint/no-implied-eval */
                    new Function(`return ${code}`)
                    /* eslint-enable @typescript-eslint/no-implied-eval */
                } catch (error) {
                    throw new Error(
                        `Generated ${type.name} code "${code}" doesn't ` +
                        `compile: ${Tools.represent(error)}`
                    )
                }

                if (configuration.core.debug)
                    console.debug(
                        `${type.name} code: \n\n"${code}" intgrated.`
                    )

                await Helper.ensureValidationDocumentPresence(
                    couchdb.connection,
                    type.name,
                    {
                        helper: databaseHelperCode,
                        /* eslint-disable camelcase */
                        validate_doc_update: code
                        /* eslint-enable camelcase */
                    },
                    type.description,
                    true,
                    idName,
                    modelConfiguration.property.name.special
                        .designDocumentNamePrefix
                )
            }
            // endregion
            // region check if all constraint descriptions compile
            for (const [modelName, model] of Object.entries(models))
                for (const [name, specification] of Object.entries(model))
                    if ([
                        modelConfiguration.property.name.special.constraint
                            .execution,
                        modelConfiguration.property.name.special.constraint
                            .expression
                    ].includes(name)) {
                        for (const constraint of (
                            [] as Array<Constraint>
                        ).concat(specification as Array<Constraint>))
                            if (constraint.description)
                                /*
                                    eslint-disable
                                    @typescript-eslint/no-implied-eval
                                */
                                try {
                                    new Function(
                                        `return ${constraint.description}`
                                    )
                                } catch (error) {
                                    throw new Error(
                                        `Specified constraint description "` +
                                        `${constraint.description}" for ` +
                                        `model "${modelName}" doesn't ` +
                                        `compile: "${Tools.represent(error)}".`
                                    )
                                }
                                /*
                                    eslint-enable
                                    @typescript-eslint/no-implied-eval
                                */
                    } else {
                        const property:PropertySpecification = specification

                        for (const type of [
                            'conflictingConstraintExpression',
                            'conflictingConstraintExecution',
                            'constraintExpression',
                            'constraintExecution'
                        ] as const)
                            if (
                                property !== null &&
                                typeof property === 'object'
                            ) {
                                const constraint:(Constraint|null|undefined) =
                                    property[type]

                                /*
                                    eslint-disable
                                    @typescript-eslint/no-implied-eval
                                */
                                if (constraint?.description)
                                    try {
                                        new Function(constraint.description)
                                    } catch (error) {
                                        throw new Error(
                                            'Specified constraint ' +
                                            'description "' +
                                            constraint.description +
                                            `" for model "${modelName}" in ` +
                                            `property "${name}" as "${type}"` +
                                            ' doesn\'t compile: "' +
                                            `${Tools.represent(error)}".`
                                        )
                                    }
                                /*
                                    eslint-enable
                                    @typescript-eslint/no-implied-eval
                                */
                            }
                    }
            // endregion
        }
        // region run auto-migration
        if (configuration.couchdb.model.autoMigrationPath) {
            const migrater:Mapping<Migrator> = {}
            if (await Tools.isDirectory(path.resolve(
                configuration.couchdb.model.autoMigrationPath
            )))
                for (const file of await Tools.walkDirectoryRecursively(
                    path.resolve(
                        configuration.couchdb.model.autoMigrationPath
                    ),
                    configuration.couchdb.debug ?
                        Tools.noop :
                        ((file:File):boolean => file.name !== 'debug')
                )) {
                    const extension:string = path.extname(file.name)
                    const basename:string = path.basename(file.name, extension)

                    if (extension === '.json') {
                        let document:Document
                        try {
                            document = JSON.parse(await fileSystem.readFile(
                                file.path,
                                {
                                    encoding: configuration.core.encoding,
                                    flag: 'r'
                                }
                            )) as Document
                        } catch (error) {
                            throw new Error(
                                `Parsing document "${file.path}" to include ` +
                                'by automigration of has failed: ' +
                                Tools.represent(error)
                            )
                        }

                        document[idName] = basename
                        document[
                            configuration.couchdb.model.property.name.special
                                .revision
                        ] = 'upsert'

                        try {
                            await couchdb.connection.put(document)
                        } catch (error) {
                            if ((
                                error as {forbidden:string}
                            ).forbidden?.startsWith('NoChange:'))
                                console.info(
                                    'Including document "' +
                                    `${document[idName]}" of type ` +
                                    `"${document[typeName] as string}" ` +
                                    `hasn't changed existing document.`
                                )
                            throw new Error(
                                `Migrating document "` +
                                `${document[idName]}" of type "` +
                                `${document[typeName] as string}" has failed` +
                                `: ${Tools.represent(error)}`
                            )
                        }

                        console.info(
                            'Including document "' +
                            `${document[idName]}" of type "` +
                            `${document[typeName] as string}" was successful.`
                        )
                    } else if (['.js'].includes(path.extname(file.name)))
                        // region collect script migrater
                        migrater[file.path] = (
                            eval(`require('${file.path}')`) as
                                {default:Migrator}
                        ).default
                        // endregion
                    else if (['.mjs'].includes(path.extname(file.name)))
                        // region collect module migrater
                        migrater[file.path] = (
                            (await eval(`import('${file.path}')`)) as
                                {default:Migrator}
                        ).default
                        // endregion
                }
            // region ensure all constraints to have a consistent initial state
            for (const retrievedDocument of (
                await couchdb.connection.allDocs<PlainObject>({
                    /* eslint-disable camelcase */
                    include_docs: true
                    /* eslint-enable camelcase */
                })
            ).rows)
                if (!(
                    typeof retrievedDocument.id === 'string' &&
                    retrievedDocument.id.startsWith(
                        configuration.couchdb.model.property.name.special
                            .designDocumentNamePrefix
                    )
                )) {
                    const document:ExistingDocument = retrievedDocument.doc!
                    let newDocument:Document = Tools.copy(document)
                    newDocument[
                        configuration.couchdb.model.property.name.special
                            .strategy
                    ] = 'migrate'

                    for (const name of Object.keys(migrater).sort()) {
                        let result:Document|null = null
                        try {
                            result = migrater[name](
                                newDocument,
                                {
                                    configuration,

                                    databaseHelper: DatabaseHelper,
                                    Tools,

                                    idName,
                                    typeName,

                                    migrater,
                                    models,
                                    modelConfiguration,

                                    selfFilePath: name,

                                    services
                                }
                            )
                        } catch (error) {
                            throw new Error(
                                `Running migrater "${name}" in document ` +
                                Helper.mayStripRepresentation(
                                    document,
                                    configuration.couchdb
                                        .maximumRepresentationTryLength,
                                    configuration.couchdb
                                        .maximumRepresentationLength
                                ) +
                                `" failed: ${Tools.represent(error)}`
                            )
                        }

                        if (result) {
                            newDocument = result

                            console.info(
                                `Running migrater "${name}" for document "` +
                                `${newDocument[idName]}" (of type ` +
                                `"${newDocument[typeName] as string}") was ` +
                                'successful.'
                            )
                        }
                    }
                    /*
                        Auto migration can:

                        - Remove not specified old properties.
                        - Add properties whose are missing and a default value
                          is specified.
                        - Trim existing strings if newly specified.
                        - Remove property values if there values equals to an
                          empty instance and the "emptyEqualsToNull" property
                          is specified as positive.
                        - Rename custom type properties if new specified model
                          provides is a super set of existing properties.
                        - TODO: Renames property names if "oldPropertyName" is
                          provided in model specification.
                    */
                    try {
                        DatabaseHelper.validateDocumentUpdate(
                            /*
                                NOTE: Removed property marked with "null" will
                                be removed so final removing would be skipped
                                if we do not use a copy here.
                            */
                            Tools.copy(newDocument) as FullDocument,
                            /*
                                NOTE: During processing attachments sub object
                                will be manipulated so copying is needed to
                                copy to avoid unexpected behavior in this
                                context.
                            */
                            Tools.copy(document) as FullDocument,
                            {
                                db: configuration.couchdb.databaseName,
                                name: configuration.couchdb.user.name,
                                roles: ['_admin']
                            },
                            /*
                                NOTE: We need a copy to ignore validated
                                document caches.
                            */
                            Tools.copy(configuration.couchdb.security),
                            modelConfiguration,
                            models
                        )
                    } catch (error) {
                        if (Object.prototype.hasOwnProperty.call(
                            error, 'forbidden'
                        )) {
                            if (!(
                                error as {forbidden:string}
                            ).forbidden.startsWith('NoChange:'))
                                console.warn(
                                    `Document "` +
                                    Helper.mayStripRepresentation(
                                        document,
                                        configuration.couchdb
                                            .maximumRepresentationTryLength,
                                        configuration.couchdb
                                            .maximumRepresentationLength
                                    ) +
                                    `" doesn't satisfy its schema (and can ` +
                                    'not be migrated automatically): ' +
                                    Tools.represent(error)
                                )

                            continue
                        } else
                            throw error
                    }

                    try {
                        await couchdb.connection.put(newDocument)
                    } catch (error) {
                        throw new Error(
                            `Replaceing auto migrated document "` +
                            `${newDocument[idName]}" has failed: ` +
                            Tools.represent(error)
                        )
                    }

                    console.info(
                        `Auto migrating document "${newDocument[idName]}" ` +
                        'was successful.'
                    )
                }
            // endregion
        }
        // endregion
        // region create/remove needed/unneeded generic indexes
        if (
            configuration.couchdb.createGenericFlatIndex &&
            configuration.couchdb.model.autoMigrationPath
        ) {
            const indexes:Array<Index> = (
                await couchdb.connection.getIndexes()
            ).indexes

            for (const [modelName, model] of Object.entries(models))
                if ((new RegExp(
                    configuration.couchdb.model.property.name
                        .typeRegularExpressionPattern.public
                )).test(modelName)) {
                    await couchdb.connection.createIndex({index: {
                        ddoc: `${modelName}-GenericIndex`,
                        fields: [typeName],
                        name: `${modelName}-GenericIndex`
                    }})

                    for (
                        const propertyName of
                        Helper.determineGenericIndexablePropertyNames(
                            configuration.couchdb.model, model
                        )
                    ) {
                        const name =
                            `${modelName}-${propertyName}-GenericIndex`
                        let foundPosition = -1
                        let position = 0

                        for (const index of indexes) {
                            if (index.name === name) {
                                foundPosition = position

                                break
                            }

                            position += 1
                        }

                        if (foundPosition === -1)
                            await couchdb.connection.createIndex({
                                index: {
                                    ddoc: name,
                                    fields: [typeName, propertyName],
                                    name
                                }
                            })
                        else
                            indexes.slice(position, 1)
                    }
                }

            for (const index of indexes)
                if (index.name.endsWith('-GenericIndex')) {
                    let exists = false
                    for (const [modelName, model] of Object.entries(models))
                        if (index.name.startsWith(`${modelName}-`)) {
                            for (
                                const name of
                                Helper.determineGenericIndexablePropertyNames(
                                    configuration.couchdb.model, model
                                )
                            )
                                if ([
                                    `${modelName}-${name}-GenericIndex`,
                                    `${modelName}-GenericIndex`
                                ].includes(index.name))
                                    exists = true

                            break
                        }

                    if (!exists)
                        await couchdb.connection.deleteIndex(
                            index as DeleteIndexOptions
                        )
                }
        }
        // endregion
        // TODO check conflicting constraints and mark them if necessary (check
        // how couchdb deals with "id" conflicts)
        // region initial compaction
        if (configuration.couchdb.model.triggerInitialCompaction)
            try {
                await couchdb.connection.compact()
            } catch (error) {
                console.warn(
                    'Initial database compaction has failed: ' +
                    Tools.represent(error)
                )
            }
        // endregion
        return {couchdb: promise}
    }
    /**
     * Add database event listener to auto restart database server on
     * unexpected server issues.
     * @param state - Application state.
     *
     * @returns Promise resolving to nothing.
     */
    static postLoadService(state:State):Promise<void> {
        const {configuration: {couchdb: configuration}, pluginAPI, services} =
            state
        const {couchdb} = services
        // region register database changes stream
        let numberOfErrorsThrough = 0
        const periodToClearNumberOfErrorsInSeconds = 30

        setInterval(
            ():void => {
                if (numberOfErrorsThrough > 0) {
                    console.info(
                        'No additional errors (initially got ' +
                        `${numberOfErrorsThrough} errors through) occurred ` +
                        'during observing changes stream for ' +
                        `${periodToClearNumberOfErrorsInSeconds} seconds. ` +
                        'Clearing saved number of errors through.'
                    )
                    numberOfErrorsThrough = 0
                }
            },
            periodToClearNumberOfErrorsInSeconds * 1000
        )
        /*
            NOTE: Use this code to test changes stream reinitialisation and
            database server restarts. Play with length of interval to trigger
            error events.
        */
        /*
        setInterval(():void =>
            couchdb.changesStream.emit('error', {test: 2}), 6 * 1000)
        */
        const initialize = Tools.debounce(async ():Promise<void> => {
            if (couchdb.changesStream as unknown as boolean)
                couchdb.changesStream.cancel()

            couchdb.changesStream =
                couchdb.connection.changes(configuration.changesStream)

            void couchdb.changesStream.on(
                'error',
                async (error:DatabaseError):Promise<void> => {
                    numberOfErrorsThrough += 1
                    if (numberOfErrorsThrough > 3) {
                        console.warn(
                            'Observing changes feed throws an error for ' +
                            `${numberOfErrorsThrough} times through: ` +
                            `${Tools.represent(error)}. Restarting database ` +
                            'server and reinitialize changes stream...'
                        )

                        numberOfErrorsThrough = 0
                        couchdb.changesStream.cancel()

                        await couchdb.server.restart(state)
                    } else
                        console.warn(
                            'Observing changes feed throws an error for ' +
                            `${numberOfErrorsThrough} times through: ` +
                            `${Tools.represent(error)}. Reinitializing ` +
                            'changes stream...'
                        )

                    void initialize()
                }
            )

            await pluginAPI.callStack<State<ChangesStream>>({
                ...state,
                data: couchdb.changesStream,
                hook: 'couchdbInitializeChangesStream'
            })
        })

        if (configuration.attachAutoRestarter)
            void initialize()
        // endregion
        return Promise.resolve()
    }
    /**
     * Triggered when application will be closed soon.
     * @param state - Application state.
     * @param state.configuration - Applications configuration.
     * @param state.services - Applications services.
     *
     * @returns Promise resolving to nothing.
     */
    static async shouldExit({configuration, services}:State):Promise<void> {
        await Helper.stopServer(services, configuration)

        delete (services as {couchdb?:Services['couchdb']}).couchdb

        const logFilePath = 'log.txt'
        if (await Tools.isFile(logFilePath))
            await fileSystem.unlink(logFilePath)
    }
}
export default Database
// endregion
// region vim modline
// vim: set tabstop=4 shiftwidth=4 expandtab:
// vim: foldmethod=marker foldmarker=region,endregion:
// endregion
