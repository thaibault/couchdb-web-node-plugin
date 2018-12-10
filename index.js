// @flow
// #!/usr/bin/env node
// -*- coding: utf-8 -*-
/** @module databaseWebNodePlugin */
'use strict'
/* !
    region header
    [Project page](http://torben.website/databaseWebNodePlugin)

    Copyright Torben Sickert (info["~at~"]torben.website) 16.12.2012

    License
    -------

    This library written by Torben Sickert stand under a creative commons
    naming 3.0 unported license.
    See http://creativecommons.org/licenses/by/3.0/deed.de
    endregion
*/
// region imports
import Tools from 'clientnode'
/* eslint-disable no-unused-vars */
import type {File, PlainObject} from 'clientnode'
/* eslint-enable no-unused-vars */
import fileSystem from 'fs'
import path from 'path'
import PouchDB from 'pouchdb'
import PouchDBFindPlugin from 'pouchdb-find'
import WebNodePluginAPI from 'web-node/pluginAPI'
import type {
    Configuration, Plugin, ServicePromises, Services
} from 'web-node/type'

import DatabaseHelper from './databaseHelper'
import Helper from './helper'
import type {
    /* eslint-disable no-unused-vars */
    Constraint, Document, ModelConfiguration, Models, RetrievedDocument
    /* eslint-enable no-unused-vars */
} from './type'
// endregion
// region plugins/classes
/**
 * Launches an application server und triggers all some pluginable hooks on
 * an event.
 * @property static:changesStream - Stream which triggers database events.
 * @property static:skipIDDetermining - Indicates whether id's should be
 * determined if "bulkDocs" had skipped a real change due to ignore a
 * "NoChange" error.
 * @property static:toggleIDDetermining - Token to give a "bulkDocs" method
 * call to indicate id determination skip or not (depends on the static
 * "skipIDDetermining" configuration).
 */
export class Database {
    static changesStream:Object
    static skipIDDetermining:boolean = true
    static toggleIDDetermining:any = Symbol('toggleIDDetermining')
    /**
     * Start database's child process and return a Promise which observes this
     * service.
     * @param servicePromises - An object with stored service promise
     * instances.
     * @param services - An object with stored service instances.
     * @param configuration - Mutable by plugins extended configuration object.
     * @returns A promise which correspond to the plugin specific continues
     * service.
     */
    static async loadService(
        servicePromises:ServicePromises,
        services:Services,
        configuration:Configuration
    ):Promise<{promise:?Promise<Object>}> {
        let promise:?Promise<Object> = null
        if (services.database.server.hasOwnProperty('binaryFilePath')) {
            await Helper.startServer(services, configuration)
            services.database.server.restart = Helper.restartServer
            services.database.server.start = Helper.startServer
            services.database.server.stop = Helper.stopServer
            promise = new Promise((resolve:Function, reject:Function):void => {
                /*
                    NOTE: These callbacks can be reassigned during server
                    restart.
                */
                services.database.server.resolve = resolve
                services.database.server.reject = reject
            })
        }
        if (services.database.hasOwnProperty('connection'))
            return {promise}
        // region ensure presence of global admin user
        if (configuration.database.ensureAdminPresence) {
            const unauthenticatedUserDatabaseConnection:PouchDB =
                new services.database.connector(
                    `${Tools.stringFormat(configuration.database.url, '')}/` +
                        `_users`,
                    configuration.database.connector)
            try {
                await unauthenticatedUserDatabaseConnection.allDocs()
                console.info(
                    'No admin user available. Automatically creating admin ' +
                    `user "${configuration.database.user.name}".`)
                await fetch(
                    `${Tools.stringFormat(configuration.database.url, '')}/` +
                    `_config/admins/${configuration.database.user.name}`,
                    {
                        method: 'PUT',
                        body: `"${configuration.database.user.password}"`
                    })
            } catch (error) {
                if (
                    error.hasOwnProperty('name') &&
                    error.name === 'unauthorized'
                ) {
                    const authenticatedUserDatabaseConnection =
                        new services.database.connector(Tools.stringFormat(
                            configuration.database.url,
                            `${configuration.database.user.name}:` +
                            `${configuration.database.user.password}@`
                        ) + '/_users', configuration.database.connector)
                    try {
                        await authenticatedUserDatabaseConnection.allDocs()
                    } catch (error) {
                        console.error(
                            `Can't login as existing admin user "` +
                            `${configuration.database.user.name}": "` +
                            `${Tools.representObject(error)}".`)
                    } finally {
                        authenticatedUserDatabaseConnection.close()
                    }
                } else
                    console.error(
                        `Can't create new admin user "` +
                        `${configuration.database.user.name}": "` +
                        `${Tools.representObject(error)}".`)
            } finally {
                unauthenticatedUserDatabaseConnection.close()
            }
        }
        // endregion
        // region ensure presence of regular users
        if (configuration.database.ensureUserPresence)
            for (const type:string of ['admins', 'members'])
                for (
                    const name:string of
                    configuration.database.security[type].names
                ) {
                    const userDatabaseConnection:Object =
                        new services.database.connector(Tools.stringFormat(
                            configuration.database.url,
                            `${configuration.database.user.name}:` +
                            `${configuration.database.user.password}@`
                        ) + '/_users', configuration.database.connector)
                    try {
                        await userDatabaseConnection.get(
                            `org.couchdb.user:${name}`)
                    } catch (error) {
                        if (
                            error.hasOwnProperty('error') &&
                            error.error === 'not_found'
                        )
                            try {
                                await userDatabaseConnection.put({
                                    [
                                    configuration.database.model.property.name
                                        .special.id
                                    ]: `org.couchdb.user:${name}`,
                                    name,
                                    password: name,
                                    roles: [].concat(
                                        configuration.database.security[type]
                                            .roles.includes(`${name}s`) ?
                                            `${name}s` : []
                                    ),
                                    type: 'user'
                                })
                            } catch (error) {
                                throw new Error(
                                    `Couldn't create missing user "${name}":` +
                                    ` ${Tools.representObject(error)}`)
                            }
                        else
                            throw new Error(
                                `Couldn't check for presence of user "` +
                                `${name}": ${Tools.representObject(error)}`)
                    } finally {
                        userDatabaseConnection.close()
                    }
                }
        // endregion
        // region apply database/rest api configuration
        if (configuration.database.model.updateConfiguration)
            for (const configurationPath:string in configuration.database)
                if (configuration.database.hasOwnProperty(
                    configurationPath
                ) && configurationPath.includes('/'))
                    try {
                        await fetch(Tools.stringFormat(
                            configuration.database.url,
                            `${configuration.database.user.name}:` +
                            `${configuration.database.user.password}@`
                        ) + `/_config/${configurationPath}`, {
                            method: 'PUT',
                            body: '"' +
                                `${configuration.database[configurationPath]}"`
                        })
                    } catch (error) {
                        console.error(
                            `Configuration "${configurationPath}" couldn't ` +
                            'be applied to "' +
                            `${configuration.database[configurationPath]}": ` +
                            Tools.representObject(error))
                    }
        // endregion
        Helper.initializeConnection(services, configuration)
        const idName:string =
            configuration.database.model.property.name.special.id
        const typeName:string =
            configuration.database.model.property.name.special.type
        // region ensure presence of database security settings
        if (configuration.database.ensureSecuritySettingsPresence)
            try {
                /*
                    NOTE: As a needed side effect: This clears preexisting
                    document references in "securitySettings[
                        configuration.database.model.property.name
                            .validatedDocumentsCache]".
                */
                await fetch(Tools.stringFormat(
                    configuration.database.url,
                    `${configuration.database.user.name}:` +
                    `${configuration.database.user.password}@`
                ) + `/${configuration.name}/_security`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(configuration.database.security)
                })
            } catch (error) {
                console.error(
                    `Security object couldn't be applied.: ` +
                    Tools.representObject(error))
            }
        // endregion
        const modelConfiguration:ModelConfiguration = Tools.copy(
            configuration.database.model)
        delete modelConfiguration.property.defaultSpecification
        delete modelConfiguration.entities
        const models:Models = Helper.extendModels(configuration.database.model)
        if (configuration.database.model.updateValidation) {
            const databaseHelperCode:string = await new Promise((
                resolve:Function, reject:Function
            ):void => fileSystem.readFile(
                /* eslint-disable no-eval */
                eval('require.resolve')('./databaseHelper.compiled'),
                /* eslint-enable no-eval */
                {encoding: (configuration.encoding:string), flag: 'r'},
                (error:?Error, data:string):void =>
                    error ? reject(error) : resolve(data)))
            // region generate/update authentication/validation code
            // / region validation
            const validationCode:string = 'function(...parameter) {\n' +
                `    return require('helper').default.validateDocumentUpdate` +
                    '(...parameter.concat([' +
                        JSON.stringify(models) + ', ' +
                        JSON.stringify(modelConfiguration) + ']))\n' +
                '}'
            try {
                new Function(`return ${validationCode}`)
            } catch (error) {
                throw new Error(
                    `Generated validation code "${validationCode}" doesn't ` +
                    `compile: ${Tools.representObject(error)}`)
            }
            if (configuration.debug)
                console.info('Specification \n\n"' + Tools.representObject(
                    configuration.database.model
                ) + `"\n\nhas generated validation code: \n\n"` +
                `${validationCode}".`)
            await Helper.ensureValidationDocumentPresence(
                services.database.connection, 'validation', {
                    helper: databaseHelperCode,
                    /* eslint-disable camelcase */
                    validate_doc_update: validationCode
                    /* eslint-enable camelcase */
                }, 'Model specification')
            // / endregion
            // / region authentication
            const authenticationCode:string = 'function(...parameter) {\n' +
                /* eslint-disable indent */
                `    return require('helper').default.authenticate(` +
                        '...parameter.concat([' + JSON.stringify(
                            Helper.determineAllowedModelRolesMapping(
                                configuration.database.model)
                        ) + `, '${idName}', '${typeName}']))\n` +
                '}'
                /* eslint-enable indent */
            try {
                new Function(`return ${authenticationCode}`)
            } catch (error) {
                throw new Error(
                    `Generated authentication code "${authenticationCode}" ` +
                    `doesn't compile: ${Tools.representObject(error)}`)
            }
            if (configuration.debug)
                console.info(
                    `Authentication code "${authenticationCode}" generated.`)
            await Helper.ensureValidationDocumentPresence(
                services.database.connection, 'authentication', {
                    helper: databaseHelperCode,
                    /* eslint-disable camelcase */
                    validate_doc_update: authenticationCode
                    /* eslint-enable camelcase */
                }, 'Authentication logic')
            // / endregion
            // endregion
            // region check if all constraint descriptions compile
            for (const modelName:string in models)
                if (models.hasOwnProperty(modelName))
                    for (const name:string in models[modelName])
                        if (models[modelName].hasOwnProperty(name))
                            if ([
                                modelConfiguration.property.name.special
                                    .constraint.execution,
                                modelConfiguration.property.name.special
                                    .constraint.expression
                            ].includes(name)) {
                                // IgnoreTypeCheck
                                for (const constraint:Constraint of models[
                                    modelName
                                ][name])
                                    if (constraint.hasOwnProperty(
                                        'description'
                                    ) && constraint.description)
                                        try {
                                            new Function('return ' +
                                                constraint.description)
                                        } catch (error) {
                                            throw new Error(
                                                `Specified constraint ` +
                                                `description "` +
                                                `${constraint.description}" ` +
                                                `for model "${modelName}" ` +
                                                `doesn't compile: "` +
                                                Tools.representObject(error) +
                                                '".'
                                            )
                                        }
                            } else
                                for (const type:string of [
                                    'conflictingConstraintExpression',
                                    'conflictingConstraintExecution',
                                    'constraintExpression',
                                    'constraintExecution'
                                ])
                                    if (
                                        models[modelName][name] !== null &&
                                        models[modelName][name] === 'object' &&
                                        // IgnoreTypeCheck
                                        models[modelName][name][type] !==
                                            null &&
                                        models[modelName][name][type] ===
                                            'object' &&
                                        models[modelName][name][type]
                                            .hasOwnProperty('description')
                                    )
                                        try {
                                            new Function(models[modelName][
                                                name
                                            // IgnoreTypeCheck
                                            ][type].description)
                                        } catch (error) {
                                            throw new Error(
                                                `Specified constraint ` +
                                                `description "` + models[
                                                    modelName
                                                // IgnoreTypeCheck
                                                ][name][type].description +
                                                `" for model "${modelName}" ` +
                                                `in property "${name}" as "` +
                                                `${type}" doesn't compile: "` +
                                                Tools.representObject(error) +
                                                '".'
                                            )
                                        }
            // endregion
        }
        // region run auto-migration
        if (configuration.database.model.autoMigrationPath) {
            const migrater:{[key:string]:Function} = {}
            if (await Tools.isDirectory(path.resolve(
                configuration.database.model.autoMigrationPath
            )))
                for (const file:File of await Tools.walkDirectoryRecursively(
                    path.resolve(
                        configuration.database.model.autoMigrationPath)
                )) {
                    const extension:string = path.extname(file.name)
                    const basename = path.basename(file.name, extension)
                    if (
                        configuration.database.model.entities.hasOwnProperty(
                            basename
                        ) &&
                        extension === '.json'
                    )
                        for (const document:Document of JSON.parse(
                            await new Promise((
                                resolve:Function, reject:Function
                            ):void => fileSystem.readFile(file.path, {
                                encoding: (configuration.encoding:string),
                                flag: 'r'
                            }, (error:?Error, data:string):void =>
                                error ? reject(error) : resolve(data)))
                        )) {
                            document[typeName] = basename
                            try {
                                await services.database.connection.put(
                                    document)
                            } catch (error) {
                                throw new Error(
                                    `Migrating document "` +
                                    `${document[idName]}" of type "` +
                                    `${document[typeName]}" has failed: ` +
                                    Tools.representObject(error))
                            }
                            console.info(
                                `Including document "` +
                                `${document[idName]}" of type "` +
                                `${document[typeName]}" was successful.`)
                        }
                    else if (path.extname(file.name) === '.js')
                        // region collect migrater
                        migrater[file.path] = eval('require')(
                            file.path
                        ).default
                        // endregion
                }
            // region ensure all constraints to have a consistent initial state
            for (const retrievedDocument:RetrievedDocument of (
                await services.database.connection.allDocs({
                    /* eslint-disable camelcase */
                    include_docs: true
                    /* eslint-enable camelcase */
                })
            ).rows)
                if (!(
                    typeof retrievedDocument.id === 'string' &&
                    retrievedDocument.id.startsWith('_design/')
                )) {
                    const document:Document = retrievedDocument.doc
                    let newDocument:PlainObject = Tools.copy(document)
                    newDocument[
                        configuration.database.model.property.name.special
                            .strategy
                    ] = 'migrate'
                    for (const name:string of Object.keys(migrater).sort()) {
                        let result:PlainObject|null
                        try {
                            result = migrater[name](newDocument, {
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
                            })
                        } catch (error) {
                            throw new Error(
                                `Running migrater "${name}" in document ` +
                                `${Tools.representObject(document)}" ` +
                                `failed: ${Tools.representObject(error)}`)
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
                                name: configuration.database.user.name,
                                roles: ['_admin']
                            },
                            /*
                                NOTE: We need a copy to ignore validated
                                document caches.
                            */
                            Tools.copy(configuration.database.security),
                            models, modelConfiguration)
                    } catch (error) {
                        if ('forbidden' in error) {
                            if (!error.forbidden.startsWith('NoChange:'))
                                console.warn(
                                    `Document "` +
                                    `${Tools.representObject(document)}" ` +
                                    `doesn't satisfy its schema (and can not` +
                                    ` be migrated automatically): ` +
                                    Tools.representObject(error))
                            continue
                        } else
                            throw error
                    }
                    try {
                        await services.database.connection.put(newDocument)
                    } catch (error) {
                        throw new Error(
                            `Replaceing auto migrated document "` +
                            `${newDocument[idName]}" has failed: ` +
                            Tools.representObject(error))
                    }
                    console.info(
                        `Auto migrating document "${newDocument[idName]}" ` +
                        'was successful.')
                }
            // endregion
        }
        // endregion
        // region create/remove needed/unneeded generic indexes
        if (
            configuration.database.createGenericFlatIndex &&
            configuration.database.model.autoMigrationPath
        ) {
            let indexes:Array<PlainObject>
            try {
                indexes = (await services.database.connection.getIndexes(
                )).indexes
            } catch (error) {
                throw error
            }
            for (const modelName:string in models)
                if (models.hasOwnProperty(modelName) && (new RegExp(
                    configuration.database.model.property.name
                        .typeRegularExpressionPattern.public
                )).test(modelName)) {
                    await services.database.connection.createIndex({index: {
                        ddoc: `${modelName}-GenericIndex`,
                        fields: [typeName],
                        name: `${modelName}-GenericIndex`
                    }})
                    for (
                        const propertyName:string of
                        Helper.determineGenericIndexablePropertyNames(
                            configuration.database.model, models[modelName])
                    ) {
                        const name:string =
                            `${modelName}-${propertyName}-GenericIndex`
                        let foundPosition:number = -1
                        let position:number = 0
                        for (const index:PlainObject of indexes) {
                            if (index.name === name) {
                                foundPosition = position
                                break
                            }
                            position += 1
                        }
                        if (foundPosition === -1)
                            try {
                                await services.database.connection.createIndex(
                                    {
                                        index: {
                                            ddoc: name,
                                            fields: [typeName, propertyName],
                                            name
                                        }
                                    })
                            } catch (error) {
                                throw error
                            }
                        else
                            indexes.slice(position, 1)
                    }
                }
            for (const index:PlainObject of indexes)
                if (index.name.endsWith('-GenericIndex')) {
                    let exists:boolean = false
                    for (const modelName:string in models)
                        if (index.name.startsWith(`${modelName}-`)) {
                            for (
                                const name:string of
                                Helper.determineGenericIndexablePropertyNames(
                                    configuration.database.model,
                                    models[modelName])
                            )
                                if ([
                                    `${modelName}-${name}-GenericIndex`,
                                    `${modelName}-GenericIndex`
                                ].includes(index.name))
                                    exists = true
                            break
                        }
                    if (!exists)
                        try {
                            await services.database.connection.deleteIndex(
                                index)
                        } catch (error) {
                            throw error
                        }
                }
        }
        // endregion
        // TODO check conflicting constraints and mark them if necessary (check
        // how couchdb deals with "id" conflicts)
        // region initial compaction
        try {
            await services.database.connection.compact()
        } catch (error) {
            throw new Error(
                'Initial database compaction has failed: ' +
                Tools.representObject(error))
        }
        // endregion
        return {name: 'database', promise}
    }
    /**
     * Add database event listener to auto restart database server on
     * unexpected server issues.
     * @param servicePromises - An object with stored service promise
     * instances.
     * @param services - An object with stored service instances.
     * @param configuration - Mutable by plugins extended configuration object.
     * @param plugins - Topological sorted list of loaded plugins.
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
        setInterval(():void => {
            if (numberOfErrorsThrough > 0) {
                console.info(
                    'No additional errors (initially got ' +
                    `${numberOfErrorsThrough} errors through) occurred ` +
                    'during observing changes stream for ' +
                    `${periodToClearNumberOfErrorsInSeconds} seconds. ` +
                    'Clearing saved number of errors through.')
                numberOfErrorsThrough = 0
            }
        }, periodToClearNumberOfErrorsInSeconds * 1000)
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
            /* eslint-disable camelcase */
            Database.changesStream = services.database.connection.changes({
                include_docs: true,
                live: true,
                since: 'now',
                timeout: false
            })
            /* eslint-enable camelcase */
            Database.changesStream.on('error', async (
                error:Error
            ):Promise<void> => {
                numberOfErrorsThrough += 1
                if (numberOfErrorsThrough > 3) {
                    console.warn(
                        'Observing changes feed throws an error for ' +
                        `${numberOfErrorsThrough} times through: ` +
                        `${Tools.representObject(error)}. Restarting ` +
                        'database server and reinitialize changes stream...')
                    numberOfErrorsThrough = 0
                    Database.changesStream.cancel()
                    await services.database.server.restart(
                        services, configuration, plugins)
                } else
                    console.warn(
                        'Observing changes feed throws an error for ' +
                        `${numberOfErrorsThrough} times through: ` +
                        `${Tools.representObject(error)}. Reinitializing ` +
                        'changes stream...')
                initialize()
            })
            await WebNodePluginAPI.callStack(
                'databaseInitializeChangesStream',
                plugins,
                configuration,
                Database.changesStream,
                services)
        })
        if (configuration.database.attachAutoRestarter)
            initialize()
        // endregion
        return servicePromises
    }
    /**
     * Appends an application server to the web node services.
     * @param services - An object with stored service instances.
     * @param configuration - Mutable by plugins extended configuration object.
     * @returns Given and extended object of services wrapped in a promise
     * resolving after pre-loading has finished.
     */
    static async preLoadService(
        services:Services, configuration:Configuration
    ):Promise<Services> {
        if (!services.hasOwnProperty('database')) {
            services.database = {}
            try {
                require('request').Request.timeout =
                    configuration.database.connector.ajax.timeout
            } catch (error) {
                console.warn(
                    `Couldn't find module "request" to synchronize timeout ` +
                    `option with pouchdb's one: ` +
                    Tools.representObject(error))
            }
        }
        if (!services.database.hasOwnProperty('connector')) {
            const idName:string =
                configuration.database.model.property.name.special.id
            const revisionName:string =
                configuration.database.model.property.name.special.revision
            services.database.connector = PouchDB
            // region apply "latest/upsert" and ignore "NoChange" error plugin
            const nativeBulkDocs:Function =
                services.database.connector.prototype.bulkDocs
            services.database.connector.plugin({bulkDocs: async function(
                firstParameter:any, ...parameter:Array<any>
            ):Promise<Array<PlainObject>> {
                const toggleIDDetermining:boolean = (
                    parameter.length > 0 &&
                    parameter[
                        parameter.length - 1
                    ] === Database.toggleIDDetermining)
                const skipIDDetermining:boolean = toggleIDDetermining ?
                    !Database.skipIDDetermining : Database.skipIDDetermining
                if (toggleIDDetermining)
                    parameter.pop()
                /*
                    Implements a generic retry mechanism for "upsert" and
                    "latest" updates and optionally supports to ignore
                    "NoChange" errors.
                */
                if (
                    !Array.isArray(firstParameter) &&
                    typeof firstParameter === 'object' &&
                    firstParameter !== null &&
                    idName in firstParameter
                )
                    firstParameter = [firstParameter]
                /*
                    NOTE: "bulkDocs()" does not get constructor given options
                    if none were provided for a single function call.
                */
                if (
                    configuration.database.connector.ajax &&
                    configuration.database.connector.ajax.timeout && (
                        parameter.length === 0 ||
                        typeof parameter[0] !== 'object')
                )
                    parameter.unshift({timeout:
                        configuration.database.connector.ajax.timeout})
                const result:Array<PlainObject> = await nativeBulkDocs.call(
                    this, firstParameter, ...parameter)
                const conflictingIndexes:Array<number> = []
                const conflicts:Array<PlainObject> = []
                let index:number = 0
                for (const item:PlainObject of result) {
                    if (
                        typeof firstParameter[index] === 'object' &&
                        firstParameter !== null
                    )
                        if (
                            revisionName in firstParameter[index] &&
                            item.name === 'conflict' &&
                            ['latest', 'upsert'].includes(
                                firstParameter[index][revisionName])
                        ) {
                            conflicts.push(item)
                            conflictingIndexes.push(index)
                        } else if (
                            idName in firstParameter[index] &&
                            configuration.database.ignoreNoChangeError &&
                            'name' in item &&
                            item.name === 'forbidden' &&
                            'message' in item &&
                            item.message.startsWith('NoChange:')
                        ) {
                            result[index] = {
                                id: firstParameter[index][idName],
                                ok: true
                            }
                            if (!skipIDDetermining)
                                try {
                                    result[index].rev =
                                        revisionName in firstParameter[
                                            index
                                        ] &&
                                        !['latest', 'upsert'].includes(
                                            firstParameter[index][revisionName]
                                        ) ? firstParameter[index][
                                            revisionName
                                        ] : (await this.get(result[index].id))[
                                            revisionName]
                                } catch (error) {
                                    throw error
                                }
                        }
                    index += 1
                }
                if (conflicts.length) {
                    firstParameter = conflicts
                    if (toggleIDDetermining)
                        parameter.push(Database.toggleIDDetermining)
                    const retriedResults:Array<PlainObject> =
                        await this.bulkDocs(firstParameter, ...parameter)
                    for (const retriedResult:PlainObject of retriedResults)
                        result[conflictingIndexes.shift()] = retriedResult
                }
                return result
            }})
            // endregion
            if (configuration.database.debug)
                services.database.connector.debug.enable('*')
            services.database.connector = services.database.connector.plugin(
                PouchDBFindPlugin)
        }
        if (!services.database.hasOwnProperty('server')) {
            services.database.server = {}
            // region search for binary file to start database server
            for (
                const filePath:string of
                configuration.database.binary.locations
            ) {
                const binaryFilePath:string = path.resolve(
                    filePath, configuration.database.binary.name)
                if (await Tools.isFile(binaryFilePath))
                    services.database.server.binaryFilePath = binaryFilePath
            }
            if (!services.database.server.hasOwnProperty('binaryFilePath'))
                throw new Error(
                    'No binary file name "' +
                    `${configuration.database.binary.name}" in one of the ` +
                    'following locations found: "' +
                    `${configuration.database.binary.locations.join('", "')}` +
                    '".')
            // endregion
        }
        return services
    }
    /**
     * Triggered when application will be closed soon.
     * @param services - An object with stored service instances.
     * @param configuration - Mutable by plugins extended configuration object.
     * @returns Given object of services wrapped in a promise resolving after
     * finish.
     */
    static async shouldExit(
        services:Services, configuration:Configuration
    ):Promise<Services> {
        const logFilePath:string = 'log.txt'
        if (await Tools.isFile(logFilePath))
            await new Promise((resolve:Function, reject:Function):void =>
                fileSystem.unlink(logFilePath, (error:?Error):void =>
                    error ? reject(error) : resolve()))
        await Helper.stopServer(services, configuration)
        delete services.database
        return services
    }
}
export default Database
// endregion
// region vim modline
// vim: set tabstop=4 shiftwidth=4 expandtab:
// vim: foldmethod=marker foldmarker=region,endregion:
// endregion
