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
import {spawn as spawnChildProcess} from 'child_process'
import Tools, {CloseEventNames, globalContext} from 'clientnode'
import {
    Mapping, ProcessCloseCallback, ProcessCloseReason, ProcessErrorCallback
} from 'clientnode/type'
import nodeFetch from 'node-fetch'
import {promises as fileSystem} from 'fs'
import path from 'path'
import {PluginAPI} from 'web-node'
import {Plugin} from 'web-node/type'

import {
    AllowedModelRolesMapping,
    AllowedRoles,
    Configuration,
    Connection,
    DatabaseConnectorConfiguration,
    DatabaseFetch,
    DatabasePlugin,
    DatabaseResponse,
    Document,
    DocumentRevisionIDMeta,
    Exception,
    FileSpecification,
    FullDocument,
    Model,
    ModelConfiguration,
    Models,
    NormalizedAllowedRoles,
    PartialFullDocument,
    Services,
    SpecialPropertyNames
} from './type'
// endregion
globalContext.fetch = nodeFetch as unknown as typeof fetch
// region classes
/**
 * A dumm plugin interface with all available hooks.
 */
export class Helper {
    /**
     * Converts internal declarative database connector configuration object
     * into a database compatible one.
     * @param this - Indicates an unbound method.
     * @param configuration - Mutable by plugins extended configuration object.
     *
     * @returns Database compatible configuration object.
    */
    static getConnectorOptions(
        this:void, configuration:Configuration
    ):DatabaseConnectorConfiguration {
        if (configuration.couchdb.connector.fetch)
            return {
                fetch: ((
                    url:RequestInfo, options?:RequestInit
                ):Promise<Response> => globalContext.fetch(
                    url,
                    Tools.extend(
                        true,
                        Tools.copy(configuration.couchdb.connector.fetch),
                        options || {}
                    )
                )) as unknown as DatabaseFetch
            }

        return {
            fetch: ((
                url:RequestInfo, options?:RequestInit
            ):Promise<Response> => globalContext.fetch(url, options)) as
                unknown as
                DatabaseFetch
        }
    }
    /**
     * Determines a representation for given plain object.
     * @param this - Indicates an unbound method.
     * @param object - Object to represent.
     * @param maximumRepresentationTryLength - Maximum representation string to
     * process.
     * @param maximumRepresentationLength - Maximum length of returned
     * representation.
     *
     * @returns Representation string.
     */
    static mayStripRepresentation(
        this:void,
        object:unknown,
        maximumRepresentationTryLength:number,
        maximumRepresentationLength:number
    ):string {
        const representation:string = Tools.represent(object)
        if (representation.length <= maximumRepresentationTryLength) {
            if (representation.length > maximumRepresentationLength)
                return (
                    representation.substring(
                        0, maximumRepresentationLength - '...'.length
                    ) +
                    '...'
                )
        } else
            return 'DOCUMENT IS TOO BIG TO REPRESENT'

        return representation
    }
    /**
     * Updates/creates a design document in database with a validation function
     * set to given code.
     * @param this -yy Indicates an unbound method.
     * @param databaseConnection - Database connection to use for document
     * updates.
     * @param documentName - Design document name.
     * @param documentData - Design document data.
     * @param description - Used to produce semantic logging messages.
     * @param log - Enables logging.
     * @param idName - Property name for ids.
     * @param designDocumentNamePrefix - Document name prefix indicating deign
     * documents.
     *
     * @returns Promise which will be resolved after given document has updated
     * successfully.
     */
    static async ensureValidationDocumentPresence(
        this:void,
        databaseConnection:Connection,
        documentName:string,
        documentData:Mapping,
        description:string,
        log = true,
        idName:SpecialPropertyNames['id'] = '_id',
        designDocumentNamePrefix = '_design/'
    ):Promise<void> {
        const newDocument:Partial<Document> = {
            [idName]: `${designDocumentNamePrefix}${documentName}`,
            language: 'javascript',
            ...documentData
        }

        try {
            const oldDocument:Document = await databaseConnection.get(
                `${designDocumentNamePrefix}${documentName}`
            )
            newDocument._rev = oldDocument._rev

            await databaseConnection.put(newDocument)

            if (log)
                console.info(`${description} updated.`)
        } catch (error) {
            if (log)
                if ((error as {error:string}).error === 'not_found')
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
     * @param this - Indicates an unbound method.
     * @param services - An object with stored service instances.
     * @param configuration - Mutable by plugins extended configuration object.
     *
     * @returns Given and extended object of services.
     */
    static async initializeConnection(
        this:void, services:Services, configuration:Configuration
    ):Promise<Services> {
        const url:string =
            Tools.stringFormat(
                configuration.couchdb.url,
                `${configuration.couchdb.user.name}:` +
                `${configuration.couchdb.user.password}@`
            ) +
            `/${configuration.couchdb.databaseName}`

        services.couchdb.connection = new services.couchdb.connector(
            url, Helper.getConnectorOptions(configuration)
        )
        services.couchdb.connection.setMaxListeners(Infinity)

        const idName:SpecialPropertyNames['id'] =
            configuration.couchdb.model.property.name.special.id
        const revisionName:SpecialPropertyNames['revision'] =
            configuration.couchdb.model.property.name.special.revision
        // region apply "latest/upsert" and ignore "NoChange" error feature
        /*
            NOTE: A "bulkDocs" plugin does not get called for every "put" and
            "post" call so we have to wrap runtime generated methods.
        */
        for (const pluginName of ['post', 'put'] as const) {
            const nativeMethod:DatabasePlugin =
                services.couchdb.connection[pluginName]
                    .bind(services.couchdb.connection)

            services.couchdb.connection[pluginName] = async function(
                this:Connection,
                firstParameter:unknown,
                ...parameter:Array<unknown>
            ):Promise<DatabaseResponse> {
                try {
                    return (
                        await nativeMethod(firstParameter, ...parameter)
                    ) as DatabaseResponse
                } catch (error) {
                    if (
                        idName in (firstParameter as PartialFullDocument) &&
                        configuration.couchdb.ignoreNoChangeError &&
                        (error as Exception).name === 'forbidden' &&
                        (error as Exception).message?.startsWith('NoChange:')
                    ) {
                        const result:DatabaseResponse = {
                            id: (firstParameter as FullDocument)[idName],
                            ok: true
                        } as DatabaseResponse

                        result.rev = (
                            revisionName in
                                (firstParameter as PartialFullDocument) &&
                            !['latest', 'upsert'].includes(
                                (firstParameter as FullDocument)[revisionName]
                            )
                        ) ?
                            (firstParameter as FullDocument)[revisionName] :
                            (await this.get(result.id))[
                                revisionName as keyof DocumentRevisionIDMeta
                            ]

                        return result
                    }

                    throw error
                }
            } as DatabasePlugin
        }
        // endregion
        // region ensure database presence
        try {
            await Tools.checkReachability(url)
        } catch (error) {
            console.info('Database could not be retrieved yet: Creating it.')

            await globalContext.fetch(url, {method: 'PUT'})
        }
        // endregion
        return services
    }
    /**
     * Starts server process.
     * @param this - Indicates an unbound method.
     * @param services - An object with stored service instances.
     * @param configuration - Mutable by plugins extended configuration object.
     *
     * @returns A promise representing the server process wrapped in a promise
     * which resolves after server is reachable.
     */
    static async startServer(
        this:void, services:Services, configuration:Configuration
    ):Promise<void> {
        // region  create configuration file if needed
        if (Object.prototype.hasOwnProperty.call(
            services.couchdb.server.runner, 'configurationFile'
        )) {
            try {
                await fileSystem.mkdir(
                    path.dirname(
                        services.couchdb.server.runner.configurationFile!.path
                    ),
                    {recursive: true}
                )
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
                    throw error
            }

            await fileSystem.writeFile(
                services.couchdb.server.runner.configurationFile!.path,
                services.couchdb.server.runner.configurationFile!.content,
                {encoding: configuration.core.encoding}
            )
        }
        // endregion
        services.couchdb.server.process = spawnChildProcess(
            (
                configuration.couchdb.binary.memoryInMegaByte === 'default' ?
                    services.couchdb.server.runner.binaryFilePath as string :
                    configuration.couchdb.binary.nodePath
            ),
            (
                configuration.couchdb.binary.memoryInMegaByte === 'default' ?
                    [] :
                    [
                        '--max-old-space-size=' +
                            configuration.couchdb.binary.memoryInMegaByte,
                        services.couchdb.server.runner.binaryFilePath!
                    ]
            ).concat(
                services.couchdb.server.runner.arguments ?
                    services.couchdb.server.runner.arguments :
                    []
            ),
            {
                cwd: (eval('process') as typeof process).cwd(),
                env: (
                    Object.prototype.hasOwnProperty.call(
                        services.couchdb.server.runner, 'environment'
                    ) ?
                        {
                            ...(eval('process') as typeof process).env,
                            ...services.couchdb.server.runner.environment
                        } :
                        (eval('process') as typeof process).env
                ),
                shell: true,
                stdio: 'inherit'
            }
        )

        ;(new Promise((
            resolve:ProcessCloseCallback, reject:ProcessErrorCallback
        ):void => {
            for (const closeEventName of CloseEventNames)
                services.couchdb.server.process.on(
                    closeEventName,
                    Tools.getProcessCloseHandler(
                        resolve,
                        reject,
                        {
                            process: services.couchdb.server.process,
                            reason: closeEventName
                        }
                    )
                )
        }))
            .then(
                (value:ProcessCloseReason):void => {
                    if (services.couchdb?.server?.resolve as unknown)
                        services.couchdb.server.resolve.call(this, value)
                },
                (reason:ProcessCloseReason):void => {
                    if (services.couchdb?.server?.resolve as unknown)
                        services.couchdb.server.reject.call(this, reason)
                }
            )

        await Tools.checkReachability(
            Tools.stringFormat(configuration.couchdb.url, ''), {wait: true}
        )
    }
    /**
     * Stops open database connection if exist, stops server process, restarts
     * server process and re-initializes server connection.
     * @param this - Indicates an unbound method.
     * @param services - An object with stored service instances.
     * @param configuration - Mutable by plugins extended configuration object.
     * @param plugins - Topological sorted list of plugins.
     * @param pluginAPI - Plugin api reference.
     *
     * @returns Given object of services wrapped in a promise resolving after
     * after finish.
     */
    static async restartServer(
        this:void,
        services:Services,
        configuration:Configuration,
        plugins:Array<Plugin>,
        pluginAPI:typeof PluginAPI
    ):Promise<void> {
        const resolveServerProcessBackup:(_value:ProcessCloseReason) => void =
            services.couchdb.server.resolve
        const rejectServerProcessBackup:(_reason:ProcessCloseReason) => void =
            services.couchdb.server.reject

        // Avoid to notify web node about server process stop.
        services.couchdb.server.resolve =
            services.couchdb.server.reject =
            Tools.noop

        await Helper.stopServer(services, configuration)

        // Reattach server process to web nodes process pool.
        services.couchdb.server.resolve = resolveServerProcessBackup
        services.couchdb.server.reject = rejectServerProcessBackup

        await Helper.startServer(services, configuration)

        void Helper.initializeConnection(services, configuration)

        await pluginAPI.callStack(
            'restartCouchdb', plugins, configuration, services
        )
    }
    /**
     * Stops open database connection if exists and stops server process.
     * @param this - Indicates an unbound method.
     * @param services - An object with stored service instances.
     * @param configuration - Mutable by plugins extended configuration object.
     *
     * @returns Given object of services wrapped in a promise resolving after
     * after finish.
     */
    static async stopServer(
        this:void, services:Services, configuration:Configuration
    ):Promise<void> {
        if (services.couchdb.connection)
            void services.couchdb.connection.close()

        if (services.couchdb.server.process)
            services.couchdb.server.process.kill('SIGINT')

        await Tools.checkUnreachability(
            Tools.stringFormat(configuration.couchdb.url, ''), {wait: true}
        )
    }
    // region model
    /**
     * Determines a mapping of all models to roles who are allowed to edit
     * corresponding model instances.
     * @param this - Indicates an unbound method.
     * @param modelConfiguration - Model specification object.
     *
     * @returns The mapping object.
     */
    static determineAllowedModelRolesMapping(
        this:void, modelConfiguration:ModelConfiguration
    ):AllowedModelRolesMapping {
        const {allowedRoles: allowedRolesName} =
            modelConfiguration.property.name.special
        const allowedModelRolesMapping:AllowedModelRolesMapping = {}
        const models:Models = Helper.extendModels(modelConfiguration)

        for (const modelName in models)
            if (
                Object.prototype.hasOwnProperty.call(models, modelName) &&
                Object.prototype.hasOwnProperty.call(
                    models[modelName], allowedRolesName
                )
            ) {
                allowedModelRolesMapping[modelName] = {
                    properties: {},

                    ...Helper.normalizeAllowedRoles(
                        models[modelName][allowedRolesName]!
                    )
                }

                for (const name in models[modelName])
                    if (
                        Object.prototype.hasOwnProperty.call(
                            models[modelName], name
                        ) &&
                        models[modelName][name] !== null &&
                        typeof models[modelName][name] === 'object' &&
                        models[modelName][name].allowedRoles
                    )
                        allowedModelRolesMapping[modelName].properties[name] =
                            Helper.normalizeAllowedRoles(
                                models[modelName][name].allowedRoles!
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
     * @param this - Indicates an unbound method.
     * @param modelConfiguration - Model specification object.
     * @param model - Model to determine property names from.
     *
     * @returns The mapping object.
     */
    static determineGenericIndexablePropertyNames(
        this:void, modelConfiguration:ModelConfiguration, model:Model
    ):Array<string> {
        const specialNames:SpecialPropertyNames =
            modelConfiguration.property.name.special

        return Object.keys(model)
            .filter((name:string):boolean =>
                model[name] !== null &&
                typeof model[name] === 'object' &&
                (
                    Object.prototype.hasOwnProperty.call(
                        model[name], 'index'
                    ) &&
                    model[name].index ||
                    !(
                        Object.prototype.hasOwnProperty.call(
                            model[name], 'index'
                        ) &&
                        !model[name].index ||
                        modelConfiguration.property.name.reserved.concat(
                            specialNames.additional,
                            specialNames.allowedRoles,
                            specialNames.attachment,
                            specialNames.conflict,
                            specialNames.constraint.execution,
                            specialNames.constraint.expression,
                            specialNames.deleted,
                            specialNames.deletedConflict,
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
                            (model[name].type as string).endsWith('[]') ||
                            Array.isArray(model[name].type) &&
                            (model[name].type as Array<string>).length &&
                            Array.isArray(
                                (model[name].type as Array<string>)[0]
                            ) ||
                            Object.prototype.hasOwnProperty.call(
                                modelConfiguration.entities,
                                model[name].type as string
                            )
                        )
                    )
                )
            )
            .concat(specialNames.id, specialNames.revision)
            .sort()
    }
    /**
     * Extend given model with all specified one.
     * @param this - Indicates an unbound method.
     * @param modelName - Name of model to extend.
     * @param models - Pool of models to extend from.
     * @param extendPropertyName - Property name which indicates model
     * inheritance.
     *
     * @returns Given model in extended version.
     */
    static extendModel(
        this:void,
        modelName:string,
        models:Models,
        extendPropertyName = '_extends'
    ):Model {
        if (modelName === '_base')
            return models[modelName]

        if (Object.prototype.hasOwnProperty.call(models, '_base'))
            if (
                Object.prototype.hasOwnProperty.call(
                    models[modelName], extendPropertyName
                ) &&
                models[modelName][extendPropertyName]
            )
                (models[modelName][extendPropertyName] as Array<string>) =
                    ['_base'].concat(
                        models[modelName][extendPropertyName] as Array<string>
                    )
            else
                (
                    models[modelName][extendPropertyName] as unknown as string
                ) = '_base'

        if (Object.prototype.hasOwnProperty.call(
            models[modelName], extendPropertyName
        )) {
            for (const modelNameToExtend of ([] as Array<string>).concat(
                models[modelName][extendPropertyName] as Array<string>
            ))
                models[modelName] = Tools.extend(
                    true,
                    Tools.copy(Helper.extendModel(
                        modelNameToExtend, models, extendPropertyName
                    )),
                    models[modelName]
                )

            delete models[modelName][extendPropertyName]
        }

        return models[modelName]
    }
    /**
     * Extend default specification with specific one.
     * @param this - Indicates an unbound method.
     * @param modelConfiguration - Model specification object.
     *
     * @returns Models with extended specific specifications.
     */
    static extendModels(
        this:void, modelConfiguration:ModelConfiguration
    ):Models {
        const specialNames:SpecialPropertyNames =
            modelConfiguration.property.name.special
        const models:Models = {}

        for (const modelName in modelConfiguration.entities)
            if (Object.prototype.hasOwnProperty.call(
                modelConfiguration.entities, modelName
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
                        '" or "' +
                        modelConfiguration.property.name
                            .typeRegularExpressionPattern.private +
                        `" for private one (given name: "${modelName}").`
                    )

                models[modelName] = Helper.extendModel(
                    modelName, modelConfiguration.entities, specialNames.extend
                )
            }

        for (const modelName in models)
            if (Object.prototype.hasOwnProperty.call(models, modelName))
                for (const propertyName in models[modelName])
                    if (Object.prototype.hasOwnProperty.call(
                        models[modelName], propertyName
                    ))
                        if (propertyName === specialNames.attachment) {
                            for (const type in models[modelName][propertyName])
                                if (
                                    Object.prototype.hasOwnProperty.call(
                                        models[modelName][propertyName]!,
                                        type
                                    )
                                )
                                    (
                                        models[modelName][propertyName] as
                                            Mapping<FileSpecification>
                                    )[type] = Tools.extend(
                                        true,
                                        Tools.copy(
                                            modelConfiguration.property
                                                .defaultSpecification
                                        ),
                                        (
                                            models[modelName][propertyName] as
                                                Mapping<FileSpecification>
                                        )[type]
                                    )
                        } else if (![
                            specialNames.allowedRoles,
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
                                        .defaultSpecification
                                ),
                                models[modelName][propertyName]
                            )

        return models
    }
    /**
     * Convert given roles to its normalized representation.
     * @param this - Indicates an unbound method.
     * @param roles - Unstructured roles description.
     *
     * @returns Normalized roles representation.
     */
    static normalizeAllowedRoles(
        this:void, roles:AllowedRoles
    ):NormalizedAllowedRoles {
        if (Array.isArray(roles))
            return {read: roles, write: roles}

        if (typeof roles === 'object') {
            const result:NormalizedAllowedRoles = {read: [], write: []}

            for (const type in result)
                if (Object.prototype.hasOwnProperty.call(roles, type))
                    if (Array.isArray(roles[type as 'read'|'write']))
                        result[type as 'read'|'write'] =
                            roles[type as 'read'|'write'] as Array<string>
                    else
                        result[type as 'read'|'write'] =
                            [roles[type as 'read'|'write'] as string]

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
