// -*- coding: utf-8 -*-
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
import {spawn as spawnChildProcess} from 'child_process'
import Tools from 'clientnode'
import {CloseEventNames, PlainObject} from 'clientnode/type'
import {promises as fileSystem} from 'fs'
// NOTE: Remove when "fetch" is supported by node.
import fetch from 'node-fetch'
import path from 'path'
import {PluginAPI} from 'web-node'
import {Plugin} from 'web-node/type'

import {
    AllowedModelRolesMapping,
    AllowedRoles,
    Configuration,
    Model,
    ModelConfiguration,
    Models,
    NormalizedAllowedRoles,
    Services
} from './type'
// endregion
// NOTE: Remove when "fetch" is supported by node.
global.fetch = fetch
// region methods
/**
 * A dumm plugin interface with all available hooks.
 */
export class Helper {
    /**
     * Determines a representation for given plain object.
     * @param data - Object to represent.
     * @param maximumRepresentationTryLength - Maximum representation string to
     * process.
     * @param maximumRepresentationLength - Maximum length of returned
     * representation.
     * @returns Representation string.
     */
    static determineRepresentation(
        data:PlainObject,
        maximumRepresentationTryLength:number,
        maximumRepresentationLength:number
    ):string {
        let representation:string = Tools.represent(data)
        if (representation.length <= maximumRepresentationTryLength) {
            if (representation.length > maximumRepresentationLength)
                representation =
                    representation.substring(
                        0, maximumRepresentationLength - '...'.length
                    ) +
                    '...'
        } else
            return 'DOCUMENT IS TOO BIG TO REPRESENT'
        return representation
    }
    /**
     * Updates/creates a design document in database with a validation function
     * set to given code.
     * @param databaseConnection - Database connection to use for document
     * updates.
     * @param documentName - Design document name.
     * @param documentData - Design document data.
     * @param description - Used to produce semantic logging messages.
     * @param log - Enables logging.
     * @returns Promise which will be resolved after given document has updated
     * successfully.
     */
    static async ensureValidationDocumentPresence(
        databaseConnection:Object,
        documentName:string,
        documentData:PlainObject,
        description:string,
        log:boolean = true
    ):Promise<void> {
        const newDocument:{[key:string]:string} = Tools.extend(
            {_id: `_design/${documentName}`, language: 'javascript'},
            documentData
        )
        try {
            const oldDocument:PlainObject = await databaseConnection.get(
                `_design/${documentName}`)
            newDocument._rev = oldDocument._rev
            await databaseConnection.put(newDocument)
            if (log)
                console.info(`${description} updated.`)
        } catch (error) {
            if (log)
                if (error.error === 'not_found')
                    console.info(
                        `${description} not available: create new one.`
                    )
                else
                    console.info(
                        `${description} couldn't be updated: "` +
                        `${Tools.represent(error)}" create new one.`
                    )
            try {
                await databaseConnection.put(newDocument)
                if (log)
                    console.info(`${description} installed/updated.`)
            } catch (error) {
                throw new Error(
                    `${description} couldn't be installed/updated: "` +
                    `${Tools.represent(error)}".`
                )
            }
        }
    }
    /**
     * Initializes a database connection instance.
     * @param services - An object with stored service instances.
     * @param configuration - Mutable by plugins extended configuration object.
     * @returns Given and extended object of services.
     */
    static async initializeConnection(
        services:Services, configuration:Configuration
    ):Promise<Services> {
        const url:string =
            Tools.stringFormat(
                configuration.database.url,
                `${configuration.database.user.name}:` +
                `${configuration.database.user.password}@`
            ) +
            `/${configuration.name}`
        services.database.connection = new services.database.connector(
            url, configuration.database.connector)
        services.database.connection.setMaxListeners(Infinity)
        const idName:string =
            configuration.database.model.property.name.special.id
        const revisionName:string =
            configuration.database.model.property.name.special.revision
        // region apply "latest/upsert" and ignore "NoChange" error feature
        /*
            NOTE: A "bulkDocs" plugin does not get called for every "put" and
            "post" call so we have to wrap runtime generated methods.
        */
        for (const pluginName of ['post', 'put']) {
            const nativeMethod:Function =
                services.database.connection[pluginName].bind(
                    services.database.connection)
            services.database.connection[pluginName] = async function(
                firstParameter:any, ...parameter:Array<any>
            ):Promise<any> {
                try {
                    return await nativeMethod(firstParameter, ...parameter)
                } catch (error) {
                    if (
                        idName in firstParameter &&
                        configuration.database.ignoreNoChangeError &&
                        'name' in error &&
                        error.name === 'forbidden' &&
                        'message' in error &&
                        error.message.startsWith('NoChange:')
                    ) {
                        const result:PlainObject = {
                            id: firstParameter[idName],
                            ok: true
                        }
                        try {
                            result.rev =
                                revisionName in firstParameter &&
                                !['latest', 'upsert'].includes(
                                    firstParameter[revisionName]
                                ) ?
                                    firstParameter[revisionName] :
                                    (await this.get(result.id))[revisionName]
                        } catch (error) {
                            throw error
                        }
                        return result
                    }
                    throw error
                }
            }
        }
        // endregion
        // region ensure database presence
        try {
            await Tools.checkReachability(url)
        } catch (error) {
            console.info('Database could not be retrieved yet: Creating it.')
            await fetch(url, {method: 'PUT'})
        }
        // endregion
        return services
    }
    /**
     * Starts server process.
     * @param services - An object with stored service instances.
     * @param configuration - Mutable by plugins extended configuration object.
     * @returns A promise representing the server process wrapped in a promise
     * which resolves after server is reachable.
     */
    static async startServer(
        services:Services, configuration:Configuration
    ):Promise<void> {
        // region create configuration file if needed
        if (services.database.server.runner.hasOwnProperty(
            'configurationFile'
        )) {
            try {
                await fileSystem.mkdir(
                    path.dirname(
                        services.database.server.runner.configurationFile.path
                    ),
                    {recursive: true}
                )
            } catch (error) {
                if (error.code !== 'EEXIST')
                    throw error
            }
            await fileSystem.writeFile(
                services.database.server.runner.configurationFile.path,
                services.database.server.runner.configurationFile.content,
                {encoding: configuration.encoding}
            )
        }
        // endregion
        services.database.server.process = spawnChildProcess(
            (
                configuration.database.binary.memoryInMegaByte === 'default' ?
                    services.database.server.runner.binaryFilePath :
                    configuration.database.binary.nodePath
            ),
            (
                configuration.database.binary.memoryInMegaByte === 'default' ?
                    [] :
                    [
                        '--max-old-space-size=' +
                            configuration.database.binary.memoryInMegaByte,
                        services.database.server.runner.binaryFilePath
                    ]
            ).concat(services.database.server.runner.arguments),
            {
                cwd: eval('process').cwd(),
                env: (
                    services.database.server.runner.hasOwnProperty(
                        'environment'
                    ) ?
                        Tools.extend(
                            {},
                            eval('process').env,
                            services.database.server.runner.environment
                        ) :
                        eval('process').env
                ),
                shell: true,
                stdio: 'inherit'
            }
        );
        (new Promise((resolve:Function, reject:Function):void => {
            for (const closeEventName of CloseEventNames)
                services.database.server.process.on(
                    closeEventName, Tools.getProcessCloseHandler(
                        resolve,
                        reject,
                        {
                            reason: closeEventName,
                            process: services.database.server.process
                        }
                    )
                )
        })).then(
            (...parameter:Array<any>):void => {
                if (
                    services.database &&
                    services.database.server &&
                    services.database.server.resolve
                )
                    services.database.server.resolve.apply(this, parameter)
            },
            (...parameter:Array<any>):void => {
                if (
                    services.database &&
                    services.database.server &&
                    services.database.server.resolve
                )
                    services.database.server.reject.apply(this, parameter)
            })
        await Tools.checkReachability(
            Tools.stringFormat(configuration.database.url, ''), true
        )
    }
    /**
     * Stops open database connection if exist, stops server process, restarts
     * server process and re-initializes server connection.
     * @param services - An object with stored service instances.
     * @param configuration - Mutable by plugins extended configuration object.
     * @param plugins - Topological sorted list of plugins.
     * @returns Given object of services wrapped in a promise resolving after
     * after finish.
     */
    static async restartServer(
        services:Services, configuration:Configuration, plugins:Array<Plugin>
    ):Promise<void> {
        const resolveServerProcessBackup:Function =
            services.database.server.resolve
        const rejectServerProcessBackup:Function =
            services.database.server.reject
        // Avoid to notify web node about server process stop.
        services.database.server.resolve = services.database.server.reject =
            Tools.noop
        await Helper.stopServer(services, configuration)
        // Reattach server process to web nodes process pool.
        services.database.server.resolve = resolveServerProcessBackup
        services.database.server.reject = rejectServerProcessBackup
        await Helper.startServer(services, configuration)
        Helper.initializeConnection(services, configuration)
        await PluginAPI.callStack(
            'restartDatabase', plugins, configuration, services
        )
    }
    /**
     * Stops open database connection if exists and stops server process.
     * @param services - An object with stored service instances.
     * @param configuration - Mutable by plugins extended configuration object.
     * @returns Given object of services wrapped in a promise resolving after
     * after finish.
     */
    static async stopServer(
        services:Services, configuration:Configuration
    ):Promise<void> {
        if (services.database.connection)
            services.database.connection.close()
        if (services.database.server.process)
            services.database.server.process.kill('SIGINT')
        await Tools.checkUnreachability(
            Tools.stringFormat(configuration.database.url, ''), true)
    }
    // region model
    /**
     * Determines a mapping of all models to roles who are allowed to edit
     * corresponding model instances.
     * @param modelConfiguration - Model specification object.
     * @returns The mapping object.
     */
    static determineAllowedModelRolesMapping(
        modelConfiguration:ModelConfiguration
    ):AllowedModelRolesMapping {
        const allowedRoleName:string =
            modelConfiguration.property.name.special.allowedRole
        const allowedModelRolesMapping:AllowedModelRolesMapping = {}
        const models:Models = Helper.extendModels(modelConfiguration)
        for (const modelName in models)
            if (
                models.hasOwnProperty(modelName) &&
                models[modelName].hasOwnProperty(allowedRoleName)
            ) {
                allowedModelRolesMapping[modelName] =
                    Helper.normalizeAllowedModelRoles(
                        models[modelName][allowedRoleName]
                    )
                allowedModelRolesMapping[modelName].properties = {}
                for (const name in models[modelName])
                    if (
                        models[modelName].hasOwnProperty(name) &&
                        models[modelName][name] !== null &&
                        typeof models[modelName][name] === 'object' &&
                        models[modelName][name].hasOwnProperty(
                            'allowedRoles'
                        ) &&
                        models[modelName][name].allowedRoles
                    )
                        allowedModelRolesMapping[modelName].properties[name] =
                            Helper.normalizeAllowedModelRoles(
                                models[modelName][name].allowedRoles
                            )
            } else
                allowedModelRolesMapping[modelName] = {
                    properties: {},
                    read: [],
                    write: []
                }
        return allowedModelRolesMapping
    }
    /**
     * Determines all property names which are indexable in a generic manner.
     * @param modelConfiguration - Model specification object.
     * @param model - Model to determine property names from.
     * @returns The mapping object.
     */
    static determineGenericIndexablePropertyNames(
        modelConfiguration:ModelConfiguration, model:Model
    ):Array<string> {
        const specialNames:PlainObject =
            modelConfiguration.property.name.special
        return Object.keys(model).filter((name:string):boolean =>
            model[name] !== null &&
            typeof model[name] === 'object' &&
            (
                model[name].hasOwnProperty('index') &&
                model[name].index ||
                !(
                    model[name].hasOwnProperty('index') &&
                    !model[name].index ||
                    modelConfiguration.property.name.reserved.concat(
                        specialNames.additional,
                        specialNames.allowedRole,
                        specialNames.attachment,
                        specialNames.conflict,
                        specialNames.constraint.execution,
                        specialNames.constraint.expression,
                        specialNames.deleted,
                        specialNames.deleted_conflict,
                        specialNames.extend,
                        specialNames.id,
                        specialNames.maximumAggregatedSize,
                        specialNames.minimumAggregatedSize,
                        specialNames.oldType,
                        specialNames.revision,
                        specialNames.revisions,
                        specialNames.revisionsInformation,
                        specialNames.type
                    ).includes(name) ||
                    model[name].type &&
                    (
                        typeof model[name].type === 'string' &&
                        model[name].type.endsWith('[]') ||
                        Array.isArray(model[name].type) &&
                        model[name].type.length &&
                        Array.isArray(model[name].type[0]) ||
                        modelConfiguration.entities.hasOwnProperty(
                            model[name].type)
                    )
                )
            )
        ).concat(specialNames.id, specialNames.revision)
    }
    /**
     * Extend given model with all specified one.
     * @param modelName - Name of model to extend.
     * @param models - Pool of models to extend from.
     * @param extendPropertyName - Property name which indicates model
     * inheritance.
     * @returns Given model in extended version.
     */
    static extendModel(
        modelName:string, models:Models, extendPropertyName:string = '_extends'
    ):Model {
        if (modelName === '_base')
            return models[modelName]
        if (models.hasOwnProperty('_base'))
            if (models[modelName].hasOwnProperty(extendPropertyName))
                models[modelName][extendPropertyName] = ['_base'].concat(
                    models[modelName][extendPropertyName]
                )
            else
                models[modelName][extendPropertyName] = '_base'
        if (models[modelName].hasOwnProperty(extendPropertyName)) {
            for (const modelNameToExtend of ([] as Array<string>).concat(
                models[modelName][extendPropertyName]
            ))
                models[modelName] = Tools.extend(
                    true,
                    {},
                    Helper.extendModel(
                        modelNameToExtend, models, extendPropertyName
                    ),
                    models[modelName]
                )
            delete models[modelName][extendPropertyName]
        }
        return models[modelName]
    }
    /**
     * Extend default specification with specific one.
     * @param modelConfiguration - Model specification object.
     * @returns Models with extended specific specifications.
     */
    static extendModels(modelConfiguration:PlainObject):Models {
        const specialNames:PlainObject =
            modelConfiguration.property.name.special
        const models:Models = {}
        for (const modelName in modelConfiguration.entities)
            if (modelConfiguration.entities.hasOwnProperty(
                modelName
            )) {
                if (!(
                    new RegExp(
                        modelConfiguration.property.name
                            .typeRegularExpressionPattern.public
                    ).test(modelName) ||
                    (new RegExp(
                        modelConfiguration.property.name
                            .typeRegularExpressionPattern.private
                    )).test(modelName)
                ))
                    throw new Error(
                        'Model names have to match "' +
                        modelConfiguration.property.name
                            .typeRegularExpressionPattern.public +
                        '" or "' + modelConfiguration.property.name
                            .typeRegularExpressionPattern.private +
                        `" for private one (given name: "${modelName}").`)
                models[modelName] = Helper.extendModel(
                    modelName, modelConfiguration.entities, specialNames.extend
                )
            }
        for (const modelName in models)
            if (models.hasOwnProperty(modelName))
                for (const propertyName in models[modelName])
                    if (models[modelName].hasOwnProperty(propertyName))
                        if (propertyName === specialNames.attachment) {
                            for (const type in models[modelName][propertyName])
                                if (models[modelName][
                                    propertyName
                                ].hasOwnProperty(type))
                                    models[modelName][propertyName][type] =
                                        Tools.extend(true, Tools.copy(
                                            modelConfiguration.property
                                                .defaultSpecification
                                        ),
                                        models[modelName][propertyName][type])
                        } else if (![
                            specialNames.allowedRole,
                            specialNames.constraint.execution,
                            specialNames.constraint.expression,
                            specialNames.extend,
                            specialNames.maximumAggregatedSize,
                            specialNames.minimumAggregatedSize,
                            specialNames.oldType
                        ].includes(propertyName))
                            models[modelName][propertyName] = Tools.extend(
                                true,
                                Tools.copy(
                                    modelConfiguration.property
                                        .defaultSpecification,
                                ),
                                models[modelName][propertyName]
                            )
        return models
    }
    /**
     * Convert given roles to its normalized representation.
     * @param roles - Unstructured roles description.
     * @returns Normalized roles representation.
     */
    static normalizeAllowedModelRoles(
        roles:AllowedRoles
    ):NormalizedAllowedRoles {
        if (Array.isArray(roles))
            return {read: roles, write: roles}
        if (typeof roles === 'object') {
            const result:NormalizedAllowedRoles = {read: [], write: []}
            for (const type in result)
                if (roles.hasOwnProperty(type))
                    if (Array.isArray(roles[type]))
                        result[type] = roles[type]
                    else
                        result[type] = [roles[type]]
            return result
        }
        return {read: [roles], write: [roles]}
    }
    // endregion
}
export default Helper
// endregion
// region vim modline
// vim: set tabstop=4 shiftwidth=4 expandtab:
// vim: foldmethod=marker foldmarker=region,endregion:
// endregion
