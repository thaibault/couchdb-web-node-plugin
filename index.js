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
import {spawn as spawnChildProcess} from 'child_process'
import Tools from 'clientnode'
import type {File, PlainObject} from 'clientnode'
import fileSystem from 'fs'
import path from 'path'
import PouchDB from 'pouchdb'
import PouchDBFindPlugin from 'pouchdb-find'
// NOTE: Only needed for debugging this file.
try {
    require('source-map-support/register')
} catch (error) {}
import type {Configuration, ServicePromises, Services} from 'web-node/type'

import DatabaseHelper from './databaseHelper'
import Helper from './helper'
import type {
    Constraint, Document, ModelConfiguration, Models, RetrievedDocument
} from './type'
// endregion
// region plugins/classes
/**
 * Launches an application server und triggers all some pluginable hooks on
 * an event.
 */
export default class Database {
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
        servicePromises:ServicePromises, services:Services,
        configuration:Configuration
    ):Promise<{promise:?Promise<Object>}> {
        let promise:?Promise<Object> = null
        if (services.database.server.hasOwnProperty('binaryFilePath')) {
            services.database.server.process = spawnChildProcess(
                services.database.server.binaryFilePath, [
                    '--config', configuration.database.configurationFilePath,
                    '--dir', path.resolve(configuration.database.path),
                    /*
                        NOTE: This redundancy seems to be needed to forward
                        ports in docker containers.
                    */
                    '--host', configuration.database['httpd/host'],
                    '--port', `${configuration.database.port}`
                ], {
                    cwd: eval('process').cwd(),
                    env: eval('process').env,
                    shell: true,
                    stdio: 'inherit'
                })
            promise = new Promise((resolve:Function, reject:Function):void => {
                for (const closeEventName:string of Tools.closeEventNames)
                    services.database.server.process.on(
                        closeEventName, Tools.getProcessCloseHandler(
                            resolve, reject, {
                                reason: closeEventName,
                                process: services.database.server.process
                            }))
            })
            await Tools.checkReachability(
                Tools.stringFormat(configuration.database.url, ''), true)
        }
        if (services.database.hasOwnProperty('connection'))
            return {promise}
        // region ensure presence of global admin user
        if (
            configuration.database.ensureAdminPresence ||
            configuration.debug
        ) {
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
                if (error.hasOwnProperty(
                    'name'
                ) && error.name === 'unauthorized') {
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
        // region apply database/rest api configuration
        if (configuration.database.updateConfiguration || configuration.debug)
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
        // region apply latest/upsert plugin
        const nativeBulkDocs:Function =
            services.database.connector.prototype.bulkDocs
        const idName:string =
            configuration.database.model.property.name.special.id
        const revisionName:string =
            configuration.database.model.property.name.special.revision
        const typeName:string =
            configuration.database.model.property.name.special.type
        const bulkDocs:Function = async function(
            firstParameter:any, ...parameter:Array<any>
        ):Promise<Array<PlainObject>> {
            /*
                Implements a generic retry mechanism for "upsert" and "latest"
                updates.
            */
            if (
                !Array.isArray(firstParameter) &&
                typeof firstParameter === 'object' &&
                firstParameter !== null &&
                firstParameter.hasOwnProperty(idName)
            )
                firstParameter = [firstParameter]
            let result:Array<PlainObject>
            try {
                result = await nativeBulkDocs.call(
                    this, firstParameter, ...parameter)
            } catch (error) {
                throw error
            }
            const conflictingIndexes:Array<number> = []
            const conflicts:Array<PlainObject> = []
            let index:number = 0
            for (const item:PlainObject of result) {
                if (firstParameter[index].hasOwnProperty(revisionName) && [
                    'latest', 'upsert'
                ].includes(firstParameter[index][revisionName]) &&
                item.name === 'conflict') {
                    conflicts.push(item)
                    conflictingIndexes.push(index)
                }
                index += 1
            }
            if (conflicts.length) {
                firstParameter = conflicts
                let retriedResults:Array<PlainObject>
                try {
                    retriedResults = await this.bulkDocs(
                        firstParameter, ...parameter)
                } catch (error) {
                    throw error
                }
                for (const retriedResult:PlainObject of retriedResults)
                    result[conflictingIndexes.shift()] = retriedResult
            }
            return result
        }
        services.database.connector.plugin({bulkDocs})
        // endregion
        services.database.connection = new services.database.connector(
            Tools.stringFormat(
                configuration.database.url,
                `${configuration.database.user.name}:` +
                `${configuration.database.user.password}@`
            ) + `/${configuration.name}`, configuration.database.connector)
        // region ensure presence of database security settings
        if (
            configuration.database.ensureSecuritySettingsPresence ||
            configuration.debug
        )
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
        const modelConfiguration:ModelConfiguration =
            Tools.copyLimitedRecursively(configuration.database.model)
        delete modelConfiguration.property.defaultSpecification
        delete modelConfiguration.entities
        const models:Models = Helper.extendModels(configuration.database.model)
        if (configuration.database.updateValidation || configuration.debug) {
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
                `    return require('helper').default.authenticate(` +
                        '...parameter.concat([' + JSON.stringify(
                            Helper.determineAllowedModelRolesMapping(
                                configuration.database.model
                            )) + `, '${typeName}']))\n` +
                '}'
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
                                        models[modelName][name][type] &&
                                        models[modelName][name][type]
                                            .hasOwnProperty('description')
                                    )
                                        try {
                                            new Function(models[modelName][
                                                name
                                            ][type].description)
                                        } catch (error) {
                                            throw new Error(
                                                `Specified constraint ` +
                                                `description "` + models[
                                                    modelName
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
        // region ensure all constraints to have a consistent initial state
        if (
            configuration.database.model.autoMigrationPath ||
            configuration.debug
        ) {
            if (await Tools.isDirectory(path.resolve(
                configuration.database.model.autoMigrationPath
            )))
                for (const file:File of await Tools.walkDirectoryRecursively(
                    path.resolve(
                        configuration.database.model.autoMigrationPath)
                )) {
                    const extension:string = path.extname(file.name)
                    const basename = path.basename(file.name, extension)
                    if (configuration.database.model.entities.hasOwnProperty(
                        basename
                    ) && extension === '.json')
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
                                `Migrating document "` +
                                `${document[idName]}" of type "` +
                                `${document[typeName]}" was successful.`)
                        }
                }
            // TODO run migration scripts by providing an authenticated
            // database connection instance.
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
                    const newDocument:PlainObject =
                        Tools.copyLimitedRecursively(document)
                    newDocument[
                        configuration.database.model.property.name.special
                        .strategy
                    ] = 'migrate'
                    /*
                        Auto migration can:

                        - Remove not specified old properties.
                        - Add properties whose are missing and a default value
                          is specified.
                    */
                    try {
                        DatabaseHelper.validateDocumentUpdate(
                            newDocument,
                            Tools.copyLimitedRecursively(document), {
                                db: configuration.name,
                                name: configuration.database.user.name,
                                roles: ['_admin']
                            }, Tools.copyLimitedRecursively(
                                configuration.database.security
                            ), models, modelConfiguration)
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
        }
        // endregion
        // region create/remove needed/unneeded generic indexes
        if (configuration.database.createGenericFlatIndex && (
            configuration.database.model.autoMigrationPath ||
            configuration.debug
        )) {
            for (const modelName:string in models)
                if (models.hasOwnProperty(modelName) && (new RegExp(
                    configuration.database.model.property.name
                        .typeRegularExpressionPattern.public
                )).test(modelName))
                    for (
                        const name:string of
                        Helper.determineGenericIndexablePropertyNames(
                            configuration.database.model, models[modelName]))
                        try {
                            await services.database.connection.createIndex({
                                index: {
                                    ddoc: `${modelName}-${name}-GenericIndex`,
                                    fields: [typeName, name],
                                    name: `${modelName}-${name}-GenericIndex`
                                }
                            })
                        } catch (error) {
                            throw error
                        }
            let indexes:Array<PlainObject>
            try {
                indexes = (await services.database.connection.getIndexes(
                )).indexes
            } catch (error) {
                throw error
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
                                if (index.name ===
                                    `${modelName}-${name}-GenericIndex`
                                )
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
        return {name: 'database', promise}
    }
    /**
     * Appends an application server to the web node services.
     * @param services - An object with stored service instances.
     * @param configuration - Mutable by plugins extended configuration object.
     * @returns Given and extended object of services.
     */
    static async preLoadService(
        services:Services, configuration:Configuration
    ):Promise<Services> {
        if (!services.hasOwnProperty('database'))
            services.database = {}
        if (!services.database.hasOwnProperty('connector'))
            services.database.connector = PouchDB.plugin(PouchDBFindPlugin)
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
     * Application will be closed soon.
     * @param services - An object with stored service instances.
     * @param configuration - Mutable by plugins extended configuration object.
     * @returns Given object of services.
     */
    static async shouldExit(
        services:Services, configuration:Configuration
    ):Promise<Services> {
        const logFilePath:string = 'log.txt'
        if (await Tools.isFile(logFilePath))
            await new Promise((resolve:Function, reject:Function):void =>
                fileSystem.unlink(logFilePath, (error:?Error):void =>
                    error ? reject(error) : resolve()))
        services.database.connection.close()
        services.database.server.process.kill('SIGINT')
        await Tools.checkUnreachability(
            Tools.stringFormat(configuration.database.url, ''), true)
        delete services.database
        return services
    }
}
// endregion
// region vim modline
// vim: set tabstop=4 shiftwidth=4 expandtab:
// vim: foldmethod=marker foldmarker=region,endregion:
// endregion
