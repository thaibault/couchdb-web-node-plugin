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
import {
    checkReachability,
    copy,
    extend,
    format,
    identity,
    isObject,
    globalContext,
    Mapping,
    represent,
    ValueOf
} from 'clientnode'
import {lastValueFrom, map, retry, timer} from 'rxjs'
import {fromFetch} from 'rxjs/fetch'

import packageConfiguration from './package.json'
import {
    AllowedModelRolesMapping,
    AllowedRoles,
    BaseModel,
    Configuration,
    Connection,
    DatabaseConnectorConfiguration,
    DatabaseResponse,
    Document,
    FileSpecification,
    Model,
    ModelConfiguration,
    Models,
    NormalizedAllowedRoles,
    PropertySpecification,
    PutDocument,
    PutOptions,
    Services,
    SpecialPropertyNames
} from './type'
// endregion
// region functions
/**
 * Converts internal declarative database connector configuration object
 * into a database compatible one.
 * @param configuration - Mutable by plugins extended configuration object.
 * @returns Database compatible configuration object.
 */
export const getConnectorOptions = (
    configuration: Configuration
): DatabaseConnectorConfiguration => {
    /*
        NOTE: We convert given fetch options into a fetch function wrapper
        which is than accepted by pouchdb's api.
    */
    const getOptions = configuration.couchdb.connector.fetch ?
        (options?: RequestInit) => extend(
            true,
            copy(configuration.couchdb.connector.fetch),
            options || {}
        ) :
        identity

    const KNOWN_ERRORS = new Map([
        [408, 'Request Timeout'],
        [425, 'Too Early'],
        [429, 'Too Many Requests'],
        [502, 'Bad Gateway'],
        [503, 'Service Unavailable'],
        [504, 'Gateway Timeout']
    ])

    return {
        fetch: ((
            url: RequestInfo, options?: RequestInit
        ): Promise<Response> => {
            const {
                numberOfRetries,
                retryIntervalInSeconds,
                exponentialBackoff,
                maximumRetryIntervallInSeconds
            } = configuration.couchdb.connector.fetchInterceptor

            // Provides a retry mechanism with configurable delay mechanism.
            const $result = fromFetch(url, getOptions(options)).pipe(
                map((response) => {
                    if (KNOWN_ERRORS.has(response.status))
                        // eslint-disable-next-line no-throw-literal
                        throw response as unknown as Error

                    return response
                }),
                retry({
                    count: numberOfRetries,
                    delay: (error, retryCount) => {
                        // Client side error will just be forwarded
                        if (typeof error.status !== 'number')
                            throw error

                        const httpError = error as Response

                        if (httpError.headers.has('retry-after')) {
                            const retryValue =
                                httpError.headers.get('retry-after')

                            if (typeof retryValue === 'string') {
                                const intervallInSeconds = parseInt(retryValue)
                                if (String(intervallInSeconds) === retryValue) {
                                    console.info(
                                        `Retry in ${retryValue} seconds`,
                                        'according to given retry value.'
                                    )
                                    // We interpret value as seconds.
                                    return timer(intervallInSeconds * 1000)
                                }

                                const futureRetryMoment = new Date(retryValue)
                                if (!isNaN(futureRetryMoment.getTime())) {
                                    if (new Date() < futureRetryMoment) {
                                        console.info(
                                            'Retry at',
                                            futureRetryMoment.toUTCString(),
                                            'according to given retry value.'
                                        )

                                        return timer(futureRetryMoment)
                                    }

                                    console.warn(
                                        'Given retry time recommendation from ',
                                        'server is in the past and has to be',
                                        'ignored therefore.'
                                    )
                                }
                            }
                        }

                        const delay = exponentialBackoff ?
                            Math.pow(2, retryCount - 1) *
                            retryIntervalInSeconds * 1000 :
                            retryIntervalInSeconds

                        return timer(
                            Math.max(delay, maximumRetryIntervallInSeconds)
                        )
                    }
                })
            )

            return lastValueFrom($result)
        })
    }
}
/**
 * Determines a representation for given plain object.
 * @param object - Object to represent.
 * @param maximumRepresentationTryLength - Maximum representation string to
 * process.
 * @param maximumRepresentationLength - Maximum length of returned
 * representation.
 * @returns Representation string.
 */
export const mayStripRepresentation = (
    object: unknown,
    maximumRepresentationTryLength: number,
    maximumRepresentationLength: number
): string => {
    const representation: string = represent(object)
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
 * @param databaseConnection - Database connection to use for document
 * updates.
 * @param documentName - Design document name.
 * @param documentData - Design document data.
 * @param description - Used to produce semantic logging messages.
 * @param log - Enables logging.
 * @param idName - Property name for ids.
 * @param revisionName - Property name for revisions.
 * @param designDocumentNamePrefix - Document name prefix indicating deign
 * documents.
 * @returns Promise which will be resolved after given document has updated
 * successfully.
 */
export const ensureValidationDocumentPresence = async (
    databaseConnection: Connection,
    documentName: string,
    documentData: Mapping,
    description: string,
    log = true,
    idName: SpecialPropertyNames['id'] = '_id',
    revisionName: SpecialPropertyNames['revision'] = '_rev',
    designDocumentNamePrefix = '_design/'
): Promise<void> => {
    const newDocument: Partial<Document> = {
        [idName]: `${designDocumentNamePrefix}${documentName}`,
        language: 'javascript',
        version: packageConfiguration.version,
        ...documentData
    }

    try {
        const oldDocument: Document = await databaseConnection.get(
            `${designDocumentNamePrefix}${documentName}`
        )
        newDocument[revisionName] = oldDocument[revisionName]

        await databaseConnection.put(newDocument)

        if (log)
            console.info(`${description} updated.`)
    } catch (error) {
        if (log)
            if ((error as {error: string}).error === 'not_found')
                console.info(
                    `${description} not available: create new one.`
                )
            else
                console.info(
                    `${description} couldn't be updated: "` +
                    `${represent(error)}" create new one.`
                )
        try {
            await databaseConnection.put(newDocument)

            if (log)
                console.info(`${description} installed/updated.`)
        } catch (error) {
            throw new Error(
                `${description} couldn't be installed/updated: "` +
                `${represent(error)}".`
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
export const initializeConnection = async (
    services: Services, configuration: Configuration
): Promise<Services> => {
    const config = configuration.couchdb

    const url: string =
        format(config.url, `${config.admin.name}:${config.admin.password}@`) +
        `/${config.databaseName}`

    services.couchdb.connection =
        new services.couchdb.connector(url, getConnectorOptions(configuration))
    const {connection} = services.couchdb
    connection.setMaxListeners(Infinity)

    const idName = config.model.property.name.special.id
    const revisionName = config.model.property.name.special.revision
    // region apply "latest/upsert" and ignore "NoChange" error feature
    /*
        NOTE: A "bulkDocs" plugin does not get called for every "put" and
        "post" call so we have to wrap runtime generated methods.
    */
    type Put = <Type extends Mapping<unknown>>(
        document: PutDocument<Type>, ...parameters: Array<unknown>
    ) => Promise<DatabaseResponse>

    for (const pluginName of ['post', 'put'] as const) {
        const nativeMethod = connection[pluginName].bind(connection) as Put

        ;(connection[pluginName] as Put) = async function<
            Type extends Mapping<unknown> = Mapping<unknown>
        >(
            this: Connection,
            document: PutDocument<Type>,
            ...parameters: Array<unknown>
        ) {
            const options: PutOptions =
                parameters.length && typeof parameters[0] === 'object' ?
                    parameters[0] as PutOptions :
                    {}

            try {
                return await nativeMethod(document, ...parameters)
            } catch (givenError) {
                const id = document[idName]
                const error = givenError as Error

                if (
                    id &&
                    config.ignoreNoChangeError &&
                    'name' in error &&
                    error.name === 'forbidden' &&
                    'message' in error &&
                    error.message.startsWith('NoChange:')
                ) {
                    const revision = revisionName in options ?
                        options[revisionName] :
                        document[revisionName]

                    return {
                        id,
                        rev: (
                            revisionName in document &&
                            !['0-latest', '0-upsert'].includes(
                                revision as string
                            )
                        ) ?
                            revision as string :
                            (await this.get(id))[revisionName],

                        ok: true
                    }
                }

                throw error
            }
        }
    }
    // endregion
    // region ensure database presence
    try {
        await checkReachability(url)
    } catch {
        console.info('Database could not be retrieved yet: Creating it.')

        if (!globalContext.fetch)
            throw new Error('Missing fetch implementation.')

        await globalContext.fetch(url, {method: 'PUT'})
    }
    // endregion
    return services
}
// region model
/**
 * Determines a mapping of all models to roles who are allowed to edit
 * corresponding model instances.
 * @param modelConfiguration - Model specification object.
 * @returns The mapping object.
 */
export const determineAllowedModelRolesMapping = (
    modelConfiguration: ModelConfiguration
): AllowedModelRolesMapping => {
    const {allowedRole: allowedRoleName} =
        modelConfiguration.property.name.special
    const allowedModelRolesMapping: AllowedModelRolesMapping = {}
    const models: Models = extendModels(modelConfiguration)

    for (const [modelName, model] of Object.entries(models))
        if (model[allowedRoleName]) {
            allowedModelRolesMapping[modelName] = {
                properties: {},

                ...normalizeAllowedRoles(model[allowedRoleName])
            }

            for (const [name, property] of Object.entries(model))
                if (isObject(property) && property.allowedRoles)
                    allowedModelRolesMapping[modelName].properties[name] =
                        normalizeAllowedRoles(
                            property.allowedRoles as AllowedRoles
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
 * Determines whether given value of a model is a property specification.
 * @param value - Value to analyze.
 * @returns Boolean indicating the case.
 */
export const isPropertySpecification = (
    value: ValueOf<Model>
): value is PropertySpecification =>
    isObject(value)
/**
 * Determines all property names which are indexable in a generic manner.
 * @param modelConfiguration - Model specification object.
 * @param model - Model to determine property names from.
 * @returns The mapping object.
 */
export const determineGenericIndexablePropertyNames = (
    modelConfiguration: ModelConfiguration, model: Model
): Array<string> => {
    const specialNames = modelConfiguration.property.name.special

    return (Object.keys(model) as Array<keyof Model>)
        .filter((name): boolean => {
            const specification = model[name]

            return (
                isPropertySpecification(specification) &&
                Object.prototype.hasOwnProperty.call(
                    specification, 'index'
                ) &&
                specification.index ||
                isPropertySpecification(specification) &&
                !(
                    Object.prototype.hasOwnProperty.call(
                        specification, 'index'
                    ) &&
                    !specification.index ||
                    modelConfiguration.property.name.reserved.concat(
                        specialNames.additional,

                        specialNames.allowedRole,

                        specialNames.attachment,

                        specialNames.conflict,

                        specialNames.constraint.execution,
                        specialNames.constraint.expression,

                        specialNames.deleted,
                        specialNames.deletedConflict,

                        specialNames.extend,

                        specialNames.maximumAggregatedSize,
                        specialNames.minimumAggregatedSize,

                        specialNames.oldType,

                        specialNames.id,
                        specialNames.revision,
                        specialNames.revisions,
                        specialNames.revisionsInformation,

                        specialNames.type
                    ).includes(name) ||
                    specification.type &&
                    (
                        typeof specification.type === 'string' &&
                        specification.type.endsWith('[]') ||
                        Array.isArray(specification.type) &&
                        (specification.type as Array<string>).length &&
                        Array.isArray(
                            (specification.type as Array<string>)[0]
                        ) ||
                        Object.prototype.hasOwnProperty.call(
                            modelConfiguration.entities,
                            specification.type as string
                        )
                    )
                )
            )
        })
        .concat([specialNames.id, specialNames.revision] as Array<keyof Model>)
        .sort()
}
/**
 * Extend given model with all specified one.
 * @param modelName - Name of model to extend.
 * @param models - Pool of models to extend from.
 * @param extendPropertyName - Property name which indicates model
 * inheritance.
 * @returns Given model in extended version.
 */
export const extendModel = (
    modelName: string,
    models: Mapping<Partial<Model>>,
    extendPropertyName: SpecialPropertyNames['extend'] = '_extends'
): Partial<Model> => {
    if (modelName === '_base')
        return models[modelName] as Model

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
            models[modelName] = extend(
                true,
                copy(extendModel(
                    modelNameToExtend, models, extendPropertyName
                )),
                models[modelName]
            )

        delete models[modelName][extendPropertyName]
    }

    return models[modelName] as Model
}
/**
 * Extend default specification with specific one.
 * @param modelConfiguration - Model specification object.
 * @returns Models with extended specific specifications.
 */
export const extendModels = (
    modelConfiguration: ModelConfiguration
): Models => {
    const specialNames = modelConfiguration.property.name.special
    const models: Models = {}

    const {typePattern} = modelConfiguration.property.name

    for (const modelName of Object.keys(modelConfiguration.entities)) {
        if (!(
            new RegExp(typePattern.public).test(modelName) ||
            (new RegExp(typePattern.private)).test(modelName)
        ))
            throw new Error(
                'Model names have to match ' +
                `"${typePattern.public}" or "${typePattern.private}"` +
                ` for private one (given name: "${modelName}").`
            )

        models[modelName] = extendModel(
            modelName, modelConfiguration.entities, specialNames.extend
        ) as Model
    }

    for (const model of Object.values(models))
        for (const [propertyName, property] of Object.entries(model))
            if (propertyName === specialNames.attachment) {
                const fileSpecifications =
                    property as Mapping<FileSpecification>
                for (const [type, value] of Object.entries(
                    fileSpecifications
                ))
                    fileSpecifications[type] = extend<FileSpecification>(
                        true,
                        copy(
                            modelConfiguration.property.defaultSpecification
                        ) as FileSpecification,
                        value
                    )
            } else if (!([
                specialNames.allowedRole,
                specialNames.constraint.execution,
                specialNames.constraint.expression,
                specialNames.extend,
                specialNames.maximumAggregatedSize,
                specialNames.minimumAggregatedSize,
                specialNames.oldType
            ] as Array<keyof BaseModel>).includes(
                propertyName as keyof BaseModel
            ))
                (
                    model[propertyName as keyof BaseModel] as
                        PropertySpecification
                ) =
                    extend(
                        true,
                        copy(modelConfiguration.property.defaultSpecification),
                        property as PropertySpecification
                    )

    return models
}
/**
 * Convert given roles to its normalized representation.
 * @param roles - Unstructured role's description.
 * @returns Normalized roles representation.
 */
export const normalizeAllowedRoles = (
    roles: AllowedRoles
): NormalizedAllowedRoles => {
    if (Array.isArray(roles))
        return {read: roles, write: roles}

    if (typeof roles === 'object') {
        const result: NormalizedAllowedRoles = {read: [], write: []}

        for (const type of Object.keys(result))
            if (Object.prototype.hasOwnProperty.call(roles, type))
                if (Array.isArray(roles[type as 'read' | 'write']))
                    result[type as 'read' | 'write'] =
                        roles[type as 'read' | 'write'] as Array<string>
                else
                    result[type as 'read' | 'write'] =
                        [roles[type as 'read' | 'write'] as string]

        return result
    }

    return {read: [roles], write: [roles]}
}
// endregion
