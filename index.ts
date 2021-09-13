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
import {File, Mapping, PlainObject, ProcessCloseReason} from 'clientnode/type'
import {promises as fileSystem} from 'fs'
import path from 'path'
import PouchDB from 'pouchdb'
import PouchDBFindPlugin from 'pouchdb-find'
import {PluginAPI} from 'web-node'
import {Plugin, PluginHandler} from 'web-node/type'

import DatabaseHelper from './databaseHelper'
import Helper from './helper'
import {
    ChangesStream,
    Configuration,
    Connection,
    Constraint,
    DatabaseError,
    DatabasePlugin,
    DeleteIndexOptions,
    Document,
    Exception,
    Index,
    ModelConfiguration,
    Models,
    PropertySpecification,
    Runner,
    Service,
    ServicePromises,
    Services
} from './type'
// endregion
// region plugins/classes
/**
 * Launches an application server und triggers all some pluginable hooks on
 * an event.
 *
 * @property static:additionalChangesStreamOptions - Can provide additional
 * (non static) changes stream options.
 * @property static:changesStream - Stream which triggers database events.
 * @property static:skipIDDetermining - Indicates whether id's should be
 * determined if "bulkDocs" had skipped a real change due to ignore a
 * "NoChange" error.
 * @property static:toggleIDDetermining - Token to give a "bulkDocs" method
 * call to indicate id determination skip or not (depends on the static
 * "skipIDDetermining" configuration).
 */
export class Database implements PluginHandler {
    static additionalChangesStreamOptions:object = {}
    static changesStream:ChangesStream
    static skipIDDetermining:boolean = true
    static toggleIDDetermining = Symbol('toggleIDDetermining')
    /**
     * Start database's child process and return a Promise which observes this
     * service.
     *
     * @param servicePromises - An object with stored service promise
     * instances.
     * @param services - An object with stored service instances.
     * @param configuration - Mutable by plugins extended configuration object.
     *
     * @returns A promise which correspond to the plugin specific continues
     * service.
     */
    static async loadService(
        servicePromises:ServicePromises,
        services:Services,
        configuration:Configuration
    ):Promise<Service> {
        let promise:null|Promise<ProcessCloseReason> = null

        if (services.couchdb.server.hasOwnProperty('runner')) {
            await Helper.startServer(services, configuration)

            services.couchdb.server.restart = Helper.restartServer
            services.couchdb.server.start = Helper.startServer
            services.couchdb.server.stop = Helper.stopServer

            promise = new Promise((resolve:Function, reject:Function):void => {
                /*
                    NOTE: These callbacks can be reassigned during server
                    restart.
                */
                services.couchdb.server.resolve = resolve
                services.couchdb.server.reject = reject
            })
        }

        if (services.couchdb.hasOwnProperty('connection'))
            return {name: 'couchdb', promise}

        const urlPrefix:string = Tools.stringFormat(
            configuration.couchdb.url,
            `${configuration.couchdb.user.name}:` +
            `${configuration.couchdb.user.password}@`
        )
        // region ensure presence of global admin user
        if (configuration.couchdb.ensureAdminPresence) {
            const unauthenticatedUserDatabaseConnection:Connection =
                new services.couchdb.connector(
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
                    services.couchdb.server.runner
                        .adminUserConfigurationPath +
                    `/${configuration.couchdb.user.name}`,
                    {
                        body: `"${configuration.couchdb.user.password}"`,
                        method: 'PUT'
                    }
                )
            } catch (error) {
                if ((error as Exception).name === 'unauthorized') {
                    const authenticatedUserDatabaseConnection:Connection =
                        new services.couchdb.connector(
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
                        authenticatedUserDatabaseConnection.close()
                    }
                } else
                    console.error(
                        `Can't create new admin user "` +
                        `${configuration.couchdb.user.name}": "` +
                        `${Tools.represent(error)}".`
                    )
            } finally {
                unauthenticatedUserDatabaseConnection.close()
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
                        new services.couchdb.connector(
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
                        userDatabaseConnection.close()
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
                    if (
                        configuration.couchdb.backend.configuration
                            .hasOwnProperty(subPath)
                    ) {
                        const fullPath:string =
                            `/${prefix}${prefix.trim() ? '/' : ''}${subPath}`
                        const url:string = `${urlPrefix}${fullPath}`

                        const value:any =
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
                                let changeNeeded:boolean = true
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
                                                    configuration.couchdb
                                                        .backend.configuration[
                                                            subPath
                                                        ] +
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

        const idName:string =
            configuration.couchdb.model.property.name.special.id
        const typeName:string =
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
                    `${urlPrefix}/${configuration.name}/_security`,
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

        delete (modelConfiguration.property as {
            defaultSpecification?:PlainObject
        }).defaultSpecification
        delete (modelConfiguration as {entities?:PlainObject}).entities

        const models:Models = Helper.extendModels(configuration.couchdb.model)
        if (configuration.couchdb.model.updateValidation) {
            const databaseHelperCode:string = await fileSystem.readFile(
                /* eslint-disable no-eval */
                eval('require.resolve')('./databaseHelper'),
                /* eslint-enable no-eval */
                {encoding: configuration.encoding, flag: 'r'}
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
                    new Function(`return ${code}`)
                } catch (error) {
                    throw new Error(
                        `Generated ${type.name} code "${code}" doesn't ` +
                        `compile: ${Tools.represent(error)}`
                    )
                }

                if (configuration.debug)
                    console.debug(
                        `${type.name} code: \n\n"${code}" intgrated.`
                    )

                await Helper.ensureValidationDocumentPresence(
                    services.couchdb.connection,
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
            for (const modelName in models)
                if (models.hasOwnProperty(modelName))
                    for (const name in models[modelName])
                        if (models[modelName].hasOwnProperty(name))
                            if ([
                                modelConfiguration.property.name.special
                                    .constraint.execution,
                                modelConfiguration.property.name.special
                                    .constraint.expression
                            ].includes(name)) {
                                for (const constraint of (
                                    [] as Array<Constraint>
                                ).concat(
                                    models[modelName][name] as
                                        Array<Constraint>
                                ))
                                    if (constraint.description)
                                        try {
                                            new Function(
                                                'return ' +
                                                constraint.description
                                            )
                                        } catch (error) {
                                            throw new Error(
                                                `Specified constraint ` +
                                                `description "` +
                                                `${constraint.description}" ` +
                                                `for model "${modelName}" ` +
                                                `doesn't compile: "` +
                                                `${Tools.represent(error)}".`
                                            )
                                        }
                            } else {
                                const property:PropertySpecification =
                                    models[modelName][name]

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
                                        const constraint:Constraint|null|undefined =
                                            property[type]

                                        if (constraint?.description)
                                            try {
                                                new Function(
                                                    constraint.description
                                                )
                                            } catch (error) {
                                                throw new Error(
                                                    'Specified constraint ' +
                                                    'description "' +
                                                    constraint.description +
                                                    '" for model "' +
                                                    `${modelName}" in ` +
                                                    `property "${name}" as "` +
                                                    `${type}" doesn't ` +
                                                    'compile: "' +
                                                    Tools.represent(error) +
                                                    '".'
                                                )
                                            }
                                    }
                            }
            // endregion
        }
        // region run auto-migration
        if (configuration.couchdb.model.autoMigrationPath) {
            const migrater:Mapping<Function> = {}
            if (await Tools.isDirectory(path.resolve(
                configuration.couchdb.model.autoMigrationPath
            )))
                for (const file of await Tools.walkDirectoryRecursively(
                    path.resolve(
                        configuration.couchdb.model.autoMigrationPath),
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
                                {encoding: configuration.encoding, flag: 'r'}
                            ))
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
                            await services.couchdb.connection.put(document)
                        } catch (error) {
                            if ((
                                error as {forbidden:string}
                            ).forbidden?.startsWith('NoChange:'))
                                console.info(
                                    `Including document "${document[idName]}` +
                                    `" of type "${document[typeName]}" ` +
                                    `hasn't changed existing document.`
                                )
                            throw new Error(
                                `Migrating document "${document[idName]}" of` +
                                ` type "${document[typeName]}" has failed: ` +
                                Tools.represent(error)
                            )
                        }

                        console.info(
                            `Including document "${document[idName]}" of ` +
                            `type "${document[typeName]}" was successful.`
                        )
                    } else if (path.extname(file.name) === '.js')
                        // region collect migrater
                        migrater[file.path] = eval('require')(
                            file.path
                        ).default
                        // endregion
                }
            // region ensure all constraints to have a consistent initial state
            for (const retrievedDocument of (
                await services.couchdb.connection.allDocs({
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
                    const document:Document = retrievedDocument.doc as Document
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
                                    idName,
                                    migrater,
                                    models,
                                    modelConfiguration,
                                    selfFilePath: name,
                                    services,
                                    tools: Tools,
                                    typeName
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
                                `${newDocument[idName]}" (of type "` +
                                `${newDocument[typeName]}") was successful.`)
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
                            Tools.copy(newDocument),
                            /*
                                NOTE: During processing attachments sub object
                                will be manipulated so copying is needed to
                                copy to avoid unexpected behavior in this
                                context.
                            */
                            Tools.copy(document), {
                                db: configuration.name,
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
                        await services.couchdb.connection.put(newDocument)
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
                await services.couchdb.connection.getIndexes()
            ).indexes

            for (const modelName in models)
                if (
                    models.hasOwnProperty(modelName) &&
                    (new RegExp(
                        configuration.couchdb.model.property.name
                            .typeRegularExpressionPattern.public
                    )).test(modelName)
                ) {
                    await services.couchdb.connection.createIndex({index: {
                        ddoc: `${modelName}-GenericIndex`,
                        fields: [typeName],
                        name: `${modelName}-GenericIndex`
                    }})

                    for (
                        const propertyName of
                        Helper.determineGenericIndexablePropertyNames(
                            configuration.couchdb.model, models[modelName]
                        )
                    ) {
                        const name:string =
                            `${modelName}-${propertyName}-GenericIndex`
                        let foundPosition:number = -1
                        let position:number = 0

                        for (const index of indexes) {
                            if (index.name === name) {
                                foundPosition = position

                                break
                            }

                            position += 1
                        }

                        if (foundPosition === -1)
                            await services.couchdb.connection.createIndex({
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
                    let exists:boolean = false
                    for (const modelName in models)
                        if (index.name.startsWith(`${modelName}-`)) {
                            for (
                                const name of
                                Helper.determineGenericIndexablePropertyNames(
                                    configuration.couchdb.model,
                                    models[modelName]
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
                        await services.couchdb.connection.deleteIndex(
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
                await services.couchdb.connection.compact()
            } catch (error) {
                console.warn(
                    'Initial database compaction has failed: ' +
                    Tools.represent(error)
                )
            }
        // endregion
        return {name: 'couchdb', promise}
    }
    /**
     * Add database event listener to auto restart database server on
     * unexpected server issues.
     *
     * @param servicePromises - An object with stored service promise
     * instances.
     * @param services - An object with stored service instances.
     * @param configuration - Mutable by plugins extended configuration object.
     * @param plugins - Topological sorted list of loaded plugins.
     *
     * @returns A promise which wraps plugin promises to represent plugin
     * continues services.
     */
    static postLoadService(
        servicePromises:ServicePromises,
        services:Services,
        configuration:Configuration,
        plugins:Array<Plugin>
    ):ServicePromises {
        // region register database changes stream
        let numberOfErrorsThrough:number = 0
        const periodToClearNumberOfErrorsInSeconds:number = 30

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
            Database.changesStream.emit('error', {test: 2}), 6 * 1000)
        */
        const initialize:Function = Tools.debounce(async ():Promise<void> => {
            if (Database.changesStream)
                Database.changesStream.cancel()

            Database.changesStream = services.couchdb.connection.changes(
                Tools.extend(
                    true,
                    Tools.copy(configuration.couchdb.changesStream),
                    Database.additionalChangesStreamOptions
                )
            )

            Database.changesStream.on(
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
                        Database.changesStream.cancel()

                        await services.couchdb.server.restart(
                            services, configuration, plugins
                        )
                    } else
                        console.warn(
                            'Observing changes feed throws an error for ' +
                            `${numberOfErrorsThrough} times through: ` +
                            `${Tools.represent(error)}. Reinitializing ` +
                            'changes stream...'
                        )

                    initialize()
                }
            )

            await PluginAPI.callStack(
                'couchdbInitializeChangesStream',
                plugins,
                configuration,
                Database.changesStream,
                services
            )
        })

        if (configuration.couchdb.attachAutoRestarter)
            initialize()
        // endregion
        return servicePromises
    }
    /**
     * Appends an application server to the web node services.
     *
     * @param services - An object with stored service instances.
     * @param configuration - Mutable by plugins extended configuration object.
     *
     * @returns Given and extended object of services wrapped in a promise
     * resolving after pre-loading has finished.
     */
    static async preLoadService(
        services:Services, configuration:Configuration
    ):Promise<Services> {
        if (!services.hasOwnProperty('couchdb'))
            services.couchdb = {} as Services['couchdb']

        if (!services.couchdb.hasOwnProperty('connector')) {
            const idName:string =
                configuration.couchdb.model.property.name.special.id
            const revisionName:string =
                configuration.couchdb.model.property.name.special.revision

            services.couchdb.connector = PouchDB
            // region apply "latest/upsert" and ignore "NoChange" error plugin
            const nativeBulkDocs:Function =
                services.couchdb.connector.prototype.bulkDocs
            services.couchdb.connector.plugin({bulkDocs: async function(
                firstParameter:any, ...parameters:Array<any>
            ):Promise<Array<PlainObject>> {
                const toggleIDDetermining:boolean = (
                    parameters.length > 0 &&
                    parameters[parameters.length - 1] ===
                        Database.toggleIDDetermining
                )
                const skipIDDetermining:boolean = toggleIDDetermining ?
                    !Database.skipIDDetermining :
                    Database.skipIDDetermining
                if (toggleIDDetermining)
                    parameters.pop()
                /*
                    Implements a generic retry mechanism for "upsert" and
                    "latest" updates and optionally supports to ignore
                    "NoChange" errors.
                */
                if (
                    !Array.isArray(firstParameter) &&
                    firstParameter !== null &&
                    typeof firstParameter === 'object' &&
                    idName in firstParameter
                )
                    firstParameter = [firstParameter]
                /*
                    NOTE: "bulkDocs()" does not get constructor given options
                    if none were provided for a single function call.
                */
                if (
                    configuration.couchdb.connector.fetch?.timeout &&
                    (
                        parameters.length === 0 ||
                        typeof parameters[0] !== 'object'
                    )
                )
                    parameters.unshift({
                        timeout: configuration.couchdb.connector.fetch.timeout
                    })
                const result:Array<PlainObject> = await nativeBulkDocs.call(
                    this, firstParameter, ...parameters
                )
                const conflictingIndexes:Array<number> = []
                const conflicts:Array<PlainObject> = []
                let index:number = 0
                for (const item of result) {
                    if (
                        typeof firstParameter[index] === 'object' &&
                        firstParameter !== null
                    )
                        if (
                            revisionName in firstParameter[index] &&
                            item.name === 'conflict' &&
                            ['latest', 'upsert'].includes(
                                firstParameter[index][revisionName]
                            )
                        ) {
                            conflicts.push(item)
                            conflictingIndexes.push(index)
                        } else if (
                            idName in firstParameter[index] &&
                            configuration.couchdb.ignoreNoChangeError &&
                            'name' in item &&
                            item.name === 'forbidden' &&
                            'message' in item &&
                            (item.message as string).startsWith('NoChange:')
                        ) {
                            result[index] = {
                                id: firstParameter[index][idName], ok: true
                            }
                            if (!skipIDDetermining)
                                result[index].rev =
                                    revisionName in firstParameter[index] &&
                                    !['latest', 'upsert'].includes(
                                        firstParameter[index][revisionName]
                                    ) ?
                                        firstParameter[index][revisionName] :
                                        (await this.get(result[index].id))[
                                            revisionName
                                        ]
                        }
                    index += 1
                }
                if (conflicts.length) {
                    firstParameter = conflicts
                    if (toggleIDDetermining)
                        parameters.push(Database.toggleIDDetermining)
                    const retriedResults:Array<PlainObject> =
                        await this.bulkDocs(firstParameter, ...parameters)
                    for (const retriedResult of retriedResults)
                        result[conflictingIndexes.shift() as number] =
                            retriedResult
                }
                return result
            }} as DatabasePlugin)
            // endregion
            if (configuration.couchdb.debug)
                services.couchdb.connector.debug.enable('*')

            services.couchdb.connector =
                services.couchdb.connector.plugin(PouchDBFindPlugin)
        }

        if (!services.couchdb.hasOwnProperty('server')) {
            services.couchdb.server = {} as Services['couchdb']['server']
            // region search for binary file to start database server
            const triedPaths:Array<string> = []
            for (const runner of ([] as Array<Runner>).concat(
                configuration.couchdb.binary.runner
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
                            services.couchdb.server.runner = runner

                            break
                        }
                    }

                    if (services.couchdb.server.hasOwnProperty('runner'))
                        break
                }

                if (services.couchdb.server.hasOwnProperty('runner'))
                    break
            }

            if (!services.couchdb.server.hasOwnProperty('runner'))
                throw new Error(
                    'No binary file in one of the following locations found:' +
                    ` "${triedPaths.join('", "')}".`
                )
            // endregion
        }

        return services
    }
    /**
     * Triggered when application will be closed soon.
     *
     * @param services - An object with stored service instances.
     * @param configuration - Mutable by plugins extended configuration object.
     *
     * @returns Given object of services wrapped in a promise resolving after
     * finish.
     */
    static async shouldExit(
        services:Services, configuration:Configuration
    ):Promise<Services> {
        await Helper.stopServer(services, configuration)

        delete (services as {couchdb?:Services['couchdb']}).couchdb

        const logFilePath:string = 'log.txt'
        if (await Tools.isFile(logFilePath))
            await fileSystem.unlink(logFilePath)

        return services
    }
}
export default Database
// endregion
// region vim modline
// vim: set tabstop=4 shiftwidth=4 expandtab:
// vim: foldmethod=marker foldmarker=region,endregion:
// endregion
