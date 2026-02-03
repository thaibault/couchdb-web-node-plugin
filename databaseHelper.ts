// -*- coding: utf-8 -*-
/** @module databaseHelper */
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
    currentRequire,
    FirstParameter,
    Logger,
    Mapping,
    PlainObject,
    Primitive,
    ValueOf
} from 'clientnode'

import {
    AllowedModelRolesMapping,
    Attachment,
    BaseModel,
    BaseModelConfiguration,
    BasePropertySpecification,
    BasicScope,
    CheckedDocumentResult,
    CheckedPropertyResult,
    CommonScope,
    CompilationErrorData,
    Constraint,
    ConstraintKey,
    DatabaseError,
    DateRepresentationType,
    Document,
    DocumentContent,
    EmptyEvaluationErrorData,
    Evaluate,
    EvaluationError,
    EvaluationErrorData,
    EvaluationResult,
    FileSpecification,
    FullAttachment,
    Model,
    Models,
    NormalizedAllowedModelRoles,
    PartialFullDocument,
    PropertyScope,
    PropertySpecification,
    RuntimeErrorData,
    SecuritySettings,
    SelectionOption,
    SpecialPropertyNames,
    StubAttachment,
    TypeSpecification,
    UpdateStrategy,
    UserContext
} from './type'
// endregion
/**
 * WebNode plugin interface with all provided hooks.
 */
export const log = new Logger({name: 'web-node.couchdb.database'})
/**
 * Authorizes given document update against given mapping of allowed roles for
 * writing into corresponding model instances.
 * @param newDocument - Updated document.
 * @param oldDocument - If an existing document should be updated its given
 * here.
 * @param userContext - Contains meta information about currently acting user.
 * @param securitySettings - Database security settings.
 * @param allowedModelRolesMapping - Allowed roles for given models.
 * @param idPropertyName - Property name indicating the id field name.
 * @param typePropertyName - Property name indicating to which model a document
 * belongs to.
 * @param designDocumentNamePrefix - Document name prefix indicating a design
 * document.
 * @param read - Indicates whether a read or write of given document should be
 * authorized or not.
 * @param contextPath - Path of properties leading to current document.
 * @returns Throws an exception if authorisation is not accepted and "true"
 * otherwise.
 */
export const authorize = (
    newDocument: Partial<Document>,
    oldDocument: null | Partial<Document> = null,
    userContext: Partial<UserContext> = {},
    securitySettings: Partial<SecuritySettings> = {
        admins: {names: [], roles: []}, members: {names: [], roles: []}
    },
    allowedModelRolesMapping?: AllowedModelRolesMapping,
    idPropertyName = '_id',
    typePropertyName = '-type',
    designDocumentNamePrefix = '_design/',
    read = false,
    contextPath: Array<string> = []
): true => {
    const type: string | undefined =
        newDocument[typePropertyName] as string | undefined ??
        (oldDocument && oldDocument[typePropertyName]) as string
    /*
        NOTE: Special documents and change sequences are not checked further
        since there is no specified model.
        If no special document given but missing type property further
        validation will complain.
    */
    if (!type)
        return true

    const operationType = read ? 'read': 'write'

    // Define roles who are allowed to read and write everything.
    const allowedRoles: NormalizedAllowedModelRoles = {
        properties: {},

        read: ['_admin', 'readonlyadmin'],
        write: ['_admin']
    }

    // A "readonlymember" is allowed to read all but design documents.
    if (
        Object.prototype.hasOwnProperty.call(
            newDocument, idPropertyName
        ) &&
        (newDocument[idPropertyName] as string).startsWith(
            designDocumentNamePrefix
        )
    )
        allowedRoles.read.push('readonlymember')

    if (!('name' in userContext))
        userContext.name = '"unknown"'

    let userRolesDescription: string
    let relevantRoles: Array<string> = []
    let relatedContextPathDescription =
        `You are trying to ${operationType} object of type ${type}.`

    if (userContext.roles?.length) {
        const userRoles = userContext.roles
        // region determine model specific allowed roles
        if (
            allowedModelRolesMapping &&
            type &&
            Object.prototype.hasOwnProperty.call(
                allowedModelRolesMapping, type
            )
        ) {
            const allowedModelRoles: Partial<NormalizedAllowedModelRoles> =
                allowedModelRolesMapping[type]

            for (const operation of ['read', 'write'] as const)
                allowedRoles[operation] = allowedRoles[operation].concat(
                    allowedModelRoles[operation] || []
                )

            allowedRoles.properties =
                (allowedModelRoles as NormalizedAllowedModelRoles).properties
        }
        // endregion
        const baseRelevantRoles: Array<string> = allowedRoles[operationType]

        let authorized = true
        for (const [name, value] of Object.entries(newDocument)) {
            const localContextPath = contextPath.concat(name)
            relatedContextPathDescription =
                `You are trying to ${operationType} property ` +
                `"${localContextPath.join('.')}".`
            authorized = false

            if (
                value !== null &&
                typeof value === 'object' &&
                Object.prototype.hasOwnProperty.call(value, typePropertyName)
            ) {
                authorize(
                    value as Partial<Document>,
                    (
                        oldDocument &&
                        oldDocument[name] as null | Partial<Document> ||
                        null
                    ),
                    userContext,
                    securitySettings,
                    allowedModelRolesMapping,
                    idPropertyName,
                    typePropertyName,
                    designDocumentNamePrefix,
                    read,
                    localContextPath
                )
                authorized = true
            } else {
                relevantRoles = Object.prototype.hasOwnProperty.call(
                    allowedRoles.properties, name
                ) ?
                    allowedRoles.properties[name][operationType] :
                    baseRelevantRoles

                for (const userRole of userRoles)
                    if (relevantRoles.includes(userRole)) {
                        authorized = true
                        break
                    }
            }

            if (!authorized)
                break
        }

        if (authorized)
            return true

        userRolesDescription =
            `Current user "${userContext.name ?? 'unknown'}" owns the ` +
            `following roles: "${userContext.roles.join('", "')}"`
        //
    } else
        userRolesDescription =
            `Current user "${userContext.name ?? 'unknown'}" doesn't own any` +
            'role'

    /* eslint-disable @typescript-eslint/only-throw-error,no-throw-literal */
    throw {
        unauthorized:
            relatedContextPathDescription +
            ' Only users with a least one of these roles are allowed to ' +
            `perform requested ${operationType} action: "` +
            ([] as Array<string>)
                .concat(relevantRoles)
                .join('", "') +
            `". ${userRolesDescription}.`
    }
    /* eslint-enable @typescript-eslint/only-throw-error,no-throw-literal */
}
/**
 * Represents a design document validation function for given model
 * specification.
 * @param newDocument - Updated document.
 * @param oldDocument - If an existing document should be updated its given
 * here.
 * @param userContext - Contains meta information about currently acting user.
 * @param securitySettings - Database security settings.
 * @param modelConfiguration - Model configuration object.
 * @param models - Models specification object.
 * @param checkPublicModelType - Indicates whether to public model types only.
 * @param toJSON - JSON stringifier.
 * @param fromJSON - JSON parser.
 * @returns Modified given new document.
 */
export const validateDocumentUpdate = <
    ObjectType extends object = object,
    AttachmentType extends Attachment = Attachment,
    AdditionalSpecifications extends object = Mapping<unknown>,
    AdditionalPropertiesType = unknown
>(
        newDocument: PartialFullDocument<ObjectType, AdditionalPropertiesType>,
        oldDocument:(
            null | PartialFullDocument<ObjectType, AdditionalPropertiesType>
        ),
        userContext: Partial<UserContext>,
        securitySettings: Partial<SecuritySettings>,
        modelConfiguration: BaseModelConfiguration<
            ObjectType, AdditionalSpecifications
        >,
        models: Models<
            ObjectType,
            AttachmentType,
            AdditionalSpecifications,
            AdditionalPropertiesType
        > = {},
        checkPublicModelType = true,
        toJSON?: (value: unknown) => string,
        fromJSON?: (value: string) => unknown
    ): PartialFullDocument<ObjectType, AdditionalPropertiesType> => {
    // log.debug(`Got new document`, newDocument, 'to update', oldDocument)

    type Attachments = Mapping<AttachmentType | null>

    type PartialFullDocumentType = PartialFullDocument<
        ObjectType, AdditionalPropertiesType
    >

    type PropertyName = keyof PartialFullDocumentType
    type PropertyValue =
        AdditionalPropertiesType | AttachmentType | ValueOf<ObjectType> | null

    type BaseModelType = BaseModel<
        AttachmentType, AdditionalSpecifications, AdditionalPropertiesType
    >
    type ModelType = Model<
        ObjectType,
        AttachmentType,
        AdditionalSpecifications,
        AdditionalPropertiesType
    >

    // region ensure needed environment
    const throwError = <DataType = Mapping<unknown>>(
        message: string,
        type = 'forbidden',
        additionalErrorData: Partial<DataType> = {} as Partial<DataType>
    ): never => {
        /*
            eslint-disable no-throw-literal,@typescript-eslint/only-throw-error
        */
        throw {
            [type]: message,
            message,
            name: type,
            ...additionalErrorData
        }
        /*
            eslint-enable no-throw-literal,@typescript-eslint/only-throw-error
        */
    }

    const now = new Date()
    const nowUTCTimestamp: number = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        now.getUTCHours(),
        now.getUTCMinutes(),
        now.getUTCSeconds(),
        now.getUTCMilliseconds()
    ) / 1000
    const saveDateTimeAsNumber =
        !modelConfiguration.dateTimeFormat.startsWith('iso')

    const specialNames = modelConfiguration.property.name.special
    const {id: idName, revision: revisionName, type: typeName} =
        specialNames

    if (oldDocument && oldDocument[typeName] && !newDocument[typeName])
        newDocument[typeName] = oldDocument[typeName]

    let id = ''
    let revision = ''
    const setDocumentEnvironment = () => {
        id = Object.prototype.hasOwnProperty.call(newDocument, idName) ?
            newDocument[idName] as string :
            ''
        revision = Object.prototype.hasOwnProperty.call(
            newDocument, revisionName
        ) ?
            newDocument[revisionName] as string :
            ''
    }
    setDocumentEnvironment()

    /*
        NOTE: Needed to be able to validate user documents.

        if (
            newDocument.hasOwnProperty('type') &&
            newDocument.type === 'user' &&
            id.startsWith('org.couchdb.user:')
        )
            return newDocument
    */
    if (
        Object.prototype.hasOwnProperty.call(
            securitySettings,
            modelConfiguration.property.name.validatedDocumentsCache
        ) &&
        (
            securitySettings[
                modelConfiguration.property.name.validatedDocumentsCache as
                    keyof SecuritySettings
            ] as unknown as Set<string>
        ).has(`${id}-${revision}`)
    ) {
        (
            securitySettings[
                modelConfiguration.property.name.validatedDocumentsCache as
                    keyof SecuritySettings
            ] as unknown as Set<string>
        ).delete(`${id}-${revision}`)

        return newDocument
    }

    if (['0-latest', '0-upsert'].includes(revision))
        if (
            oldDocument &&
            Object.prototype.hasOwnProperty.call(oldDocument, revisionName)
        )
            revision =
                newDocument[revisionName] =
                oldDocument[revisionName] as string
        else if (revision === '0-latest')
            throwError('Revision: No old document available to update.')
        else
            delete (newDocument as Partial<Document>)[revisionName]

    /// region collect old model types to migrate.
    const oldModelMapping: Mapping = {}
    if (modelConfiguration.updateStrategy === 'migrate')
        for (const [name, model] of Object.entries(models))
            if (
                Object.prototype.hasOwnProperty.call(
                    model, specialNames.oldType
                ) &&
                model[specialNames.oldType]
            )
                for (const oldName of ([] as Array<string>).concat(
                    model[specialNames.oldType] as Array<string>
                ))
                    oldModelMapping[oldName] = name
    /// endregion

    let serializeData: (value: unknown) => string
    if (toJSON)
        serializeData = toJSON
    else if (
        typeof JSON !== 'undefined' &&
        Object.prototype.hasOwnProperty.call(JSON, 'stringify')
    )
        serializeData =
            (object: unknown): string => JSON.stringify(object, null, 4)
    else
        throwError('Needed json serializer is not available.')

    let parseJSON: (value: string) => unknown
    if (fromJSON)
        parseJSON = fromJSON
    else if (
        typeof JSON !== 'undefined' &&
        Object.prototype.hasOwnProperty.call(JSON, 'parse')
    )
        parseJSON =
            (object: string): unknown => JSON.parse(object)
    else
        throwError('Needed json parser is not available.')
    // endregion

    const specialPropertyNames: Array<keyof BaseModelType> = [
        specialNames.additional,

        specialNames.allowedRole,

        specialNames.constraint.execution,
        specialNames.constraint.expression,

        specialNames.create.execution,
        specialNames.create.expression,

        specialNames.extend,

        specialNames.maximumAggregatedSize,
        specialNames.minimumAggregatedSize,

        specialNames.oldType,

        specialNames.update.execution,
        specialNames.update.expression,

        specialNames.updateStrategy
    ]
    // region functions
    /// region generic functions
    const deepCopy =
        <Type>(data: Type): Type => parseJSON(serializeData(data)) as Type

    const originalNewDocument = deepCopy(newDocument)

    const determineTrimmedString = (value?: null | string): string => {
        if (typeof value === 'string')
            return value.trim()

        return ''
    }

    const evaluate = <Type, Scope>(
        givenExpression?: null | string,
        isEvaluation = false,
        givenScope = {} as Scope
    ): EvaluationResult<
        ObjectType,
        Type | undefined,
        PropertyName,
        AttachmentType,
        AdditionalSpecifications,
        AdditionalPropertiesType,
        typeof BASIC_SCOPE &
        {code: string} &
        Scope
    > => {
        type CurrentScope =
            typeof BASIC_SCOPE & {code: string} & Scope & {scope: CurrentScope}
        const scope = {...BASIC_SCOPE, code: '', ...givenScope} as CurrentScope
        scope.scope = scope

        const expression = determineTrimmedString(givenExpression)
        if (expression) {
            const code = (isEvaluation ? 'return ' : '') + expression
            // region determine scope
            scope.code = code
            const scopeNames: Array<string> = Object.keys(scope)
            // endregion
            // region compile
            let templateFunction:(
                Evaluate<Type | undefined, Array<unknown>> | undefined
            )

            try {
                /* eslint-disable @typescript-eslint/no-implied-eval */
                templateFunction = new Function(...scopeNames, code) as
                    Evaluate<Type | undefined, Array<unknown>>
                /* eslint-enable @typescript-eslint/no-implied-eval */
            } catch (error) {
                throwError<CompilationErrorData<CurrentScope>>(
                    serialize(error),
                    'compilation',
                    {code, error, scope}
                )
            }
            // endregion
            // region run
            const result: EvaluationResult<
                ObjectType,
                Type | undefined,
                PropertyName,
                AttachmentType,
                AdditionalSpecifications,
                AdditionalPropertiesType,
                CurrentScope
            > = {code, result: undefined, scope}

            try {
                // @ts-expect-error "templateFunction" can be not defined.
                result.result = templateFunction(
                    ...scopeNames.map((name: string): unknown =>
                        scope[name as keyof typeof scope]
                    )
                )
            } catch (error) {
                throwError<RuntimeErrorData<CurrentScope>>(
                    serialize(error),
                    'runtime',
                    {code, error: error as Error, scope}
                )
            }

            return result
            // endregion
        }

        throwError<EmptyEvaluationErrorData>(
            'No expression to evaluate provided.', 'empty'
        )

        return {code: scope.code, result: undefined, scope}
    }

    const fileNameMatchesModelType = (
        typeName: string,
        fileName: string,
        fileType: FileSpecification<
            AttachmentType, AdditionalSpecifications
        >
    ): boolean => {
        if (fileType.fileName) {
            if (fileType.fileName.value)
                return fileType.fileName.value === fileName

            if (fileType.fileName.pattern)
                return ([] as Array<RegExp | string>)
                    .concat(fileType.fileName.pattern)
                    .some((pattern) =>
                        new RegExp(pattern).test(fileName)
                    )
        }

        return typeName === fileName
    }

    const getDateTime = (value: number | string) =>
        typeof value === 'number' ? new Date(value * 1000) : new Date(value)

    const getFileNameByPrefix = (
        prefix?: string, attachments?: Attachments
    ): null | string => {
        if (!attachments)
            attachments =
                newDocument[specialNames.attachment] as Attachments

        if (prefix) {
            for (const name of Object.keys(attachments))
                if (name.startsWith(prefix))
                    return name
        } else {
            const keys: Array<string> = Object.keys(attachments)
            if (keys.length)
                return keys[0]
        }

        return null
    }

    const normalizeDateTime = (
        value: DateRepresentationType
    ): null | number | string => {
        if (saveDateTimeAsNumber) {
            if (value !== null && typeof value !== 'number') {
                value = new Date(value)
                value =
                    Date.UTC(
                        value.getUTCFullYear(),
                        value.getUTCMonth(),
                        value.getUTCDate(),
                        value.getUTCHours(),
                        value.getUTCMinutes(),
                        value.getUTCSeconds(),
                        value.getUTCMilliseconds()
                    ) /
                    1000
            }
        } else if (value !== null) {
            value = new Date(
                typeof value === 'number' && !isNaN(value) ?
                    value * 1000 :
                    value as Date | string
            )
            try {
                // Use ISO 8601 format to save date as string.
                value = value.toISOString()
            } catch {
                // Ignore exception.
            }
        }

        return value as null | number | string
    }

    const serialize = (value: unknown): string =>
        value instanceof Error ? String(value) : serializeData(value)
    /// endregion
    const isDefinedPropertyValue = (
        name: keyof ObjectType, document: PartialFullDocumentType = newDocument
    ) =>
        Object.prototype.hasOwnProperty.call(document, name) &&
        ![null, undefined].includes(document[name] as null)

    const getEffectiveValue = (
        name: string,
        localNewDocument: PartialFullDocumentType = originalNewDocument,
        localOldDocument: null | PartialFullDocumentType = oldDocument
    ) =>
        Object.prototype.hasOwnProperty.call(localNewDocument, name) ?
            localNewDocument[name] :
            (
                localOldDocument &&
                Object.prototype.hasOwnProperty.call(localOldDocument, name)
            ) ?
                localOldDocument[name] :
                null

    const attachmentWithPrefixExists = (
        namePrefix: string, document = newDocument
    ): boolean => {
        if (Object.prototype.hasOwnProperty.call(
            document, specialNames.attachment
        )) {
            const attachments =
                document[specialNames.attachment] as Attachments
            const name: null | string = getFileNameByPrefix(namePrefix)

            if (name) {
                const attachment = attachments[name]

                return (
                    Object.prototype.hasOwnProperty.call(attachment, 'stub') &&
                    (attachment as Partial<StubAttachment>).stub ||
                    Object.prototype.hasOwnProperty.call(attachment, 'data') &&
                    ![null, undefined].includes(
                        (attachment as FullAttachment).data as unknown as null
                    )
                )
            }
        }

        return false
    }

    const checkDocument = (
        localNewDocument: PartialFullDocumentType = newDocument,
        localOldDocument: null | PartialFullDocumentType = null,
        parentNames: Array<string> = [],
        updateStrategy: UpdateStrategy = modelConfiguration.updateStrategy
    ): CheckedDocumentResult<ObjectType, AdditionalPropertiesType> => {
        const pathDescription =
            parentNames.length ? ` in ${parentNames.join(' -> ')}` : ''
        let changedPath: Array<string> = []

        const checkModelType = () => {
            // region check for model type (optionally migrate them)
            if (!Object.prototype.hasOwnProperty.call(
                localNewDocument, typeName
            ))
                if (
                    localOldDocument &&
                    Object.prototype.hasOwnProperty.call(
                        localOldDocument, typeName
                    ) &&
                    ['fillUp', 'migrate'].includes(updateStrategy)
                )
                    localNewDocument[typeName] = localOldDocument[typeName]
                else
                    throwError(
                        'Type: You have to specify a model type via ' +
                        `property "${typeName}"${pathDescription}.`
                    )
            if (
                checkPublicModelType &&
                !(
                    parentNames.length ||
                    (new RegExp(
                        modelConfiguration.property.name.typePattern.public
                    )).test(localNewDocument[typeName] as string)
                )
            )
                throwError(
                    'TypeName: You have to specify a model type which ' +
                    'matches "' +
                    modelConfiguration.property.name.typePattern.public +
                    `" as public type (given "` +
                    `${localNewDocument[typeName] as string}")` +
                    `${pathDescription}.`
                )
            if (!Object.prototype.hasOwnProperty.call(
                models, localNewDocument[typeName] as string
            ))
                if (Object.prototype.hasOwnProperty.call(
                    oldModelMapping, localNewDocument[typeName] as string
                ))
                    localNewDocument[typeName] =
                        oldModelMapping[localNewDocument[typeName] as string]
                else
                    throwError(
                        'Model: Given model "' +
                        `${localNewDocument[typeName] as string}" is not ` +
                        `specified${pathDescription}.`
                    )
            // endregion
        }
        checkModelType()

        let modelName = localNewDocument[typeName] as string
        const model: ModelType = models[modelName]

        if (Object.prototype.hasOwnProperty.call(
            model, specialNames.updateStrategy
        ))
            updateStrategy =
                model[specialNames.updateStrategy] as UpdateStrategy
        if (Object.prototype.hasOwnProperty.call(
            newDocument, specialNames.updateStrategy
        )) {
            updateStrategy =
                localNewDocument[specialNames.updateStrategy] as UpdateStrategy
            delete localNewDocument[specialNames.updateStrategy]
        }

        let additionalPropertySpecification:(
            PropertySpecification<
                AdditionalPropertiesType, AdditionalSpecifications
            > |
            undefined
        ) = undefined
        if (
            Object.prototype.hasOwnProperty.call(
                model, specialNames.additional
            ) &&
            model[specialNames.additional]
        )
            additionalPropertySpecification =
                model[specialNames.additional] as AdditionalSpecifications
        // region document specific functions
        const checkPropertyConstraints = <Type extends PropertyValue>(
            newValue: Type,
            name: string,
            propertySpecification: PropertySpecification<
                Type, AdditionalSpecifications
            >,
            oldValue?: Type,
            types: Array<ConstraintKey> = [
                'constraintExecution', 'constraintExpression'
            ]
        ) => {
            const localUpdateStrategy: UpdateStrategy =
                propertySpecification.updateStrategy || updateStrategy

            for (const type of types)
                if (Object.prototype.hasOwnProperty.call(
                    propertySpecification, type
                )) {
                    type Scope = PropertyScope<
                        ObjectType,
                        Type,
                        PropertyValue,
                        AttachmentType,
                        AdditionalSpecifications,
                        AdditionalPropertiesType
                    >

                    let result:(
                        EvaluationResult<
                            ObjectType,
                            boolean | undefined,
                            PropertyValue,
                            AttachmentType,
                            AdditionalSpecifications,
                            AdditionalPropertiesType,
                            Scope
                        > |
                        undefined
                    ) = undefined
                    try {
                        result = evaluate<boolean, Scope>(
                            // @ts-expect-error "prop...S..[type]" is optional.
                            propertySpecification[type].evaluation,
                            type.endsWith('Expression'),
                            {
                                checkPropertyContent,

                                model,
                                modelName,
                                name,
                                type,

                                newDocument: localNewDocument,
                                newValue,
                                oldDocument: localOldDocument,
                                oldValue,

                                parentNames,
                                pathDescription,

                                propertySpecification,

                                updateStrategy: localUpdateStrategy
                            }
                        )
                    } catch (error) {
                        if (((
                            error: unknown
                        ): error is DatabaseError & EvaluationErrorData =>
                            Object.prototype.hasOwnProperty.call(
                                error, 'compilation'
                            )
                        )(error))
                            throwError(
                                `Compilation: Hook "${type}" has invalid` +
                                ` code "${error.code}": ` +
                                `"${error.message ?? 'unknown'}"` +
                                `${pathDescription}.`
                            )

                        if (((
                            error: unknown
                        ): error is DatabaseError & EvaluationErrorData =>
                            Object.prototype.hasOwnProperty.call(
                                error, 'runtime'
                            )
                        )(error))
                            throwError(
                                `Runtime: Hook "${type}" has throw an ` +
                                `error with code "${error.code}": ` +
                                `"${error.message ?? 'unknown'}"` +
                                `${pathDescription}.`
                            )

                        if (!Object.prototype.hasOwnProperty.call(
                            error, 'empty'
                        ))
                            throw error
                    }

                    if (result && !result.result) {
                        const description = determineTrimmedString(
                            propertySpecification[type]?.description
                        )

                        throwError(
                            type.charAt(0).toUpperCase() +
                            `${type.substring(1)}: ` +
                            (description ?
                                /*
                                    eslint-disable
                                    @typescript-eslint/no-implied-eval,
                                    @typescript-eslint/no-unsafe-call
                                */
                                new Function(
                                    ...Object.keys(result.scope),
                                    `return ${description}`
                                )(...Object.values(result.scope) as
                                    Array<unknown>
                                ) as string :
                                `Property "${name}" should satisfy ` +
                                `constraint "${result.code}" (given ` +
                                `"${serialize(newValue)}")${pathDescription}.`
                                /*
                                    eslint-enable
                                    @typescript-eslint/no-implied-eval,
                                    @typescript-eslint/no-unsafe-call
                                */
                            )
                        )
                    }
                }
        }
        const checkPropertyContent = <Type extends PropertyValue>(
            newValue: Type,
            name: string,
            propertySpecification: PropertySpecification<
                Type, AdditionalSpecifications
            >,
            oldValue?: Type
        ): CheckedPropertyResult<Type> => {
            const localUpdateStrategy: UpdateStrategy =
                propertySpecification.updateStrategy || updateStrategy

            let changedPath: Array<string> = []
            // region type
            const types = ([] as Array<TypeSpecification>).concat(
                propertySpecification.type ? propertySpecification.type : []
            )
            // Derive nested missing explicit type definition if possible.
            if (
                typeof newValue === 'object' &&
                Object.getPrototypeOf(newValue) === Object.prototype &&
                !Object.prototype.hasOwnProperty.call(newValue, typeName) &&
                types.length === 1 &&
                typeof types[0] === 'string' &&
                Object.prototype.hasOwnProperty.call(models, types[0])
            )
                (newValue as PartialFullDocumentType)[typeName] = types[0]
            let typeMatched = false
            for (const type of types)
                if (
                    typeof type === 'string' &&
                    Object.prototype.hasOwnProperty.call(models, type)
                ) {
                    if (
                        typeof newValue === 'object' &&
                        Object.getPrototypeOf(newValue) === Object.prototype &&
                        Object.prototype.hasOwnProperty.call(
                            newValue, typeName
                        ) &&
                        (newValue as PartialFullDocumentType)[typeName] !==
                            type &&
                        localUpdateStrategy === 'migrate' &&
                        types.length === 1
                    ) {
                        /*
                            Derive nested (object based) maybe compatible type
                            definition. Nested types have to be checked than.
                        */
                        (newValue as PartialFullDocumentType)[typeName] = type
                        changedPath = parentNames.concat(
                            name, 'migrate nested object type'
                        )
                    }
                    if (
                        typeof newValue === 'object' &&
                        Object.getPrototypeOf(newValue) === Object.prototype &&
                        Object.prototype.hasOwnProperty.call(
                            newValue, typeName
                        ) &&
                        (newValue as PartialFullDocumentType)[typeName] ===
                            type
                    ) {
                        const result = checkDocument(
                            newValue as PartialFullDocumentType,
                            oldValue as null | PartialFullDocumentType,
                            parentNames.concat(name),
                            localUpdateStrategy
                        )
                        if (result.changedPath.length)
                            changedPath = result.changedPath
                        newValue = result.newDocument as Type
                        if (serialize(newValue) === serialize({}))
                            return {newValue: undefined, changedPath}

                        typeMatched = true
                        break
                    } else if (types.length === 1)
                        throwError(
                            `NestedType: Under key "${name}" isn't of type ` +
                            `"${type}" (given "${serialize(newValue)}" of ` +
                            `type ${typeof newValue})${pathDescription}.`
                        )
                } else if (type === 'DateTime') {
                    const initialNewValue: unknown = newValue

                    newValue = normalizeDateTime(
                        newValue as DateRepresentationType
                    ) as Type

                    if (
                        saveDateTimeAsNumber &&
                        (typeof newValue !== 'number' || isNaN(newValue)) ||
                        !saveDateTimeAsNumber &&
                        typeof newValue !== 'string'
                    ) {
                        if (types.length === 1)
                            throwError(
                                `PropertyType: Property "${name}" isn't of ` +
                                `(valid) type "DateTime" (given "` +
                                (
                                    serialize(initialNewValue)
                                        .replace(/^"/, '')
                                        .replace(/"$/, '')
                                ) +
                                `" of type "${typeof initialNewValue}")` +
                                `${pathDescription}.`
                            )
                    } else {
                        typeMatched = true
                        break
                    }
                } else if (
                    typeof type === 'string' &&
                    ['boolean', 'integer', 'number', 'string'].includes(type)
                )
                    if (
                        typeof newValue === 'number' && isNaN(newValue) ||
                        !(type === 'integer' || typeof newValue === type) ||
                        type === 'integer' &&
                        parseInt(newValue as string, 10) !== newValue
                    ) {
                        if (types.length === 1)
                            throwError(
                                `PropertyType: Property "${name}" isn't of ` +
                                `(valid) type "${type}" (given ` +
                                `"${serialize(newValue)}" of type ` +
                                `"${typeof newValue}")${pathDescription}.`
                            )
                    } else {
                        typeMatched = true
                        break
                    }
                else if (
                    typeof type === 'string' && type.startsWith('foreignKey:')
                ) {
                    const foreignKeyType: string =
                        models[type.substring('foreignKey:'.length)][idName]
                            .type as string
                    if (foreignKeyType === typeof newValue) {
                        typeMatched = true
                        break
                    } else if (types.length === 1)
                        throwError(
                            `PropertyType: Foreign key property "${name}" ` +
                            `isn't of type "${foreignKeyType}" (given ` +
                            `"${serialize(newValue)}" of type ` +
                            `"${typeof newValue}")${pathDescription}.`
                        )
                } else if (
                    type === 'any' || serialize(newValue) === serialize(type)
                ) {
                    typeMatched = true
                    break
                } else if (types.length === 1)
                    throwError(
                        `PropertyType: Property "${name}" isn't value ` +
                        `"${String(type)}" (given "` +
                        serialize(newValue)
                            .replace(/^"/, '')
                            .replace(/"$/, '') +
                        `" of type "${typeof newValue}")${pathDescription}.`
                    )
            if (!typeMatched)
                throwError(
                    'PropertyType: None of the specified types "' +
                    `${types.join('", "')}" for property "${name}" ` +
                    `matches value "` +
                    serialize(newValue)
                        .replace(/^"/, '')
                        .replace(/"$/, '') +
                    `${newValue as string}" of type "${typeof newValue}"` +
                    `${pathDescription}.`
                )
            // endregion
            // region range
            if (typeof newValue === 'string') {
                if (
                    typeof propertySpecification.minimumLength === 'number' &&
                    newValue.length < propertySpecification.minimumLength
                )
                    throwError(
                        `MinimalLength: Property "${name}" must have ` +
                        'minimal length ' +
                        (propertySpecification.minimumLength as
                            unknown as
                            string
                        ) +
                        ` (given ${newValue as string} with length ` +
                        `${String((newValue as string).length)})` +
                        `${pathDescription}.`
                    )
                if (
                    typeof propertySpecification.maximumLength === 'number' &&
                    newValue.length > propertySpecification.maximumLength
                )
                    throwError(
                        `MaximalLength: Property "${name}" must have ` +
                        'maximal length ' +
                        (
                            propertySpecification.maximumLength as
                                unknown as
                                string
                        ) +
                        ` (given ${newValue as string} with length ` +
                        `${String((newValue as string).length)})` +
                        `${pathDescription}.`
                    )
            }
            if (typeof newValue === 'number') {
                if (
                    typeof propertySpecification.minimum === 'number' &&
                    newValue < propertySpecification.minimum
                )
                    throwError(
                        `Minimum: Property "${name}" (type ` +
                        `${propertySpecification.type as string}) must ` +
                        'satisfy a minimum of ' +
                        (
                            propertySpecification.minimum as
                                unknown as
                                string
                        ) +
                        ` (given ${String(newValue)} is too low)` +
                        `${pathDescription}.`
                    )
                if (
                    typeof propertySpecification.maximum === 'number' &&
                    newValue > propertySpecification.maximum
                )
                    throwError(
                        `Maximum: Property "${name}" (type ` +
                        `${propertySpecification.type as string}) must ` +
                        `satisfy a maximum of ` +
                        (
                            propertySpecification.maximum as
                                unknown as
                                string
                        ) +
                        ` (given ${String(newValue)} is too high)` +
                        `${pathDescription}.`
                    )
            }
            // endregion
            // region selection
            if (propertySpecification.selection) {
                let selection =
                    Array.isArray(propertySpecification.selection) ?
                        propertySpecification.selection.map(
                            (value: unknown): unknown =>
                                (
                                    value as SelectionOption | undefined
                                )?.value === undefined ?
                                    value :
                                    (value as SelectionOption).value
                        ) :
                        Object.keys(propertySpecification.selection)

                if (propertySpecification.type === 'DateTime')
                    selection =
                        (selection as Array<Date | null | number | string>)
                            .map(normalizeDateTime)

                if (!selection.includes(newValue))
                    throwError(
                        `Selection: Property "${name}" (type ` +
                        `${propertySpecification.type as string}) should be ` +
                        `one of "${selection.join('", "')}". But is ` +
                        `"${newValue as string}"${pathDescription}.`
                    )
            }
            // endregion
            // region pattern
            if (propertySpecification.pattern) {
                const patterns = (
                    [] as Array<RegExp | string>
                ).concat(propertySpecification.pattern)
                let matched = false
                for (const pattern of patterns)
                    if (new RegExp(pattern).test(newValue as string)) {
                        matched = true
                        break
                    }
                if (!matched)
                    throwError(
                        `PatternMatch: Property "${name}" should ` +
                        'match regular expression pattern ' +
                        `"${patterns.join('", "')}" (given ` +
                        `"${newValue as string}")${pathDescription}.`
                    )
            }
            if (propertySpecification.invertedPattern)
                for (const pattern of (
                    [] as Array<RegExp | string>
                ).concat(propertySpecification.invertedPattern))
                    if (new RegExp(pattern).test(newValue as string))
                        throwError(
                            `InvertedPatternMatch: Property "${name}" ` +
                            'should not match regular expression pattern ' +
                            `${String(pattern)} (given ` +
                            `"${String(newValue)}")${pathDescription}.`
                        )
            // endregion
            checkPropertyConstraints<Type>(
                newValue, name, propertySpecification, oldValue
            )

            if (serialize(newValue) !== serialize(oldValue))
                changedPath = parentNames.concat(name, 'value updated')

            return {newValue, changedPath}
        }
        const checkPropertyWriteableMutableNullable = <
            Type extends PropertyValue
        >(
                propertySpecification: BasePropertySpecification<
                    Type, AdditionalSpecifications
                >,
                newDocument: PartialFullDocumentType,
                oldDocument: null | PartialFullDocumentType,
                name: PropertyName,
                pathDescription: string
            ): boolean => {
            const localUpdateStrategy: UpdateStrategy =
                propertySpecification.updateStrategy || updateStrategy
            const value = newDocument[name] as Type
            // region writable
            if (!propertySpecification.writable)
                if (oldDocument)
                    if (
                        Object.prototype.hasOwnProperty.call(
                            oldDocument, name
                        ) &&
                        serialize(value) === serialize(oldDocument[name])
                    ) {
                        if (
                            name !== idName &&
                            localUpdateStrategy === 'incremental'
                        )
                            delete newDocument[name]

                        return true
                    } else
                        throwError(
                            `Readonly: Property ${String(name)}" is` +
                            'not writable (old document ' +
                            `"${serialize(oldDocument)}")${pathDescription}.`
                        )
                else
                    throwError(
                        `Readonly: Property "${String(name)}" is not ` +
                        `writable${pathDescription}.`
                    )
            // endregion
            // region mutable
            if (
                !propertySpecification.mutable &&
                oldDocument &&
                Object.prototype.hasOwnProperty.call(oldDocument, name)
            )
                if (serialize(value) === serialize(oldDocument[name])) {
                    if (
                        localUpdateStrategy === 'incremental' &&
                        !modelConfiguration.property.name.reserved.concat(
                            specialNames.deleted, idName, revisionName
                        ).includes(String(name))
                    )
                        delete newDocument[name]

                    return true
                } else if (localUpdateStrategy !== 'migrate')
                    throwError(
                        `Immutable: Property "${String(name)}" is not ` +
                        `writable (old document "${serialize(oldDocument)}")` +
                        `${pathDescription}.`
                    )
            // endregion
            // region nullable
            if (value === null)
                if (propertySpecification.nullable) {
                    if (
                        localUpdateStrategy !== 'incremental' ||
                        !oldDocument ||
                        oldDocument[name] === undefined
                    )
                        delete newDocument[name]

                    if (
                        oldDocument &&
                        Object.prototype.hasOwnProperty.call(oldDocument, name)
                    )
                        changedPath = parentNames.concat(
                            String(name), 'delete property'
                        )

                    return true
                } else
                    throwError(
                        `NotNull: Property "${String(name)}" should not be ` +
                        `"null"${pathDescription}.`
                    )
            // endregion
            return false
        }
        /// region create hook
        const runCreatePropertyHook = <Type extends PropertyValue>(
            propertySpecification: PropertySpecification<
                Type, AdditionalSpecifications
            >,
            newDocument: PartialFullDocumentType,
            oldDocument: null | PartialFullDocumentType,
            name: (keyof Attachments) | (keyof PartialFullDocumentType),
            attachmentsTarget?: Attachments
        ) => {
            const localUpdateStrategy =
                propertySpecification.updateStrategy || updateStrategy
            if (!oldDocument)
                for (const type of [
                    'onCreateExecution', 'onCreateExpression'
                ] as const)
                    if (Object.prototype.hasOwnProperty.call(
                        propertySpecification, type
                    )) {
                        type Scope = PropertyScope<
                            ObjectType,
                            null | Type | undefined,
                            PropertyValue,
                            AttachmentType,
                            AdditionalSpecifications,
                            AdditionalPropertiesType
                        >

                        let result:(
                            EvaluationResult<
                                PartialFullDocumentType,
                                null | Type | undefined,
                                PropertyValue,
                                AttachmentType,
                                AdditionalSpecifications,
                                AdditionalPropertiesType,
                                Scope
                            > |
                            undefined
                        ) = undefined

                        try {
                            result = evaluate<null | Type | undefined, Scope>(
                                propertySpecification[type],
                                type.endsWith('Expression'),
                                {
                                    attachmentsTarget,

                                    checkPropertyContent,

                                    model,
                                    modelName,
                                    name: String(name),
                                    type,

                                    newDocument,
                                    oldDocument,

                                    newValue: undefined,
                                    oldValue: undefined,

                                    parentNames,
                                    pathDescription,

                                    propertySpecification,

                                    updateStrategy: localUpdateStrategy
                                }
                            )
                        } catch (error) {
                            if (((error: unknown): error is EvaluationError =>
                                Object.prototype.hasOwnProperty.call(
                                    error, 'compilation'
                                )
                            )(error))
                                throwError(
                                    `Compilation: Hook "${type}" has ` +
                                    `invalid code "${error.code}" for ` +
                                    `property "${String(name)}": ` +
                                    `"${error.message ?? 'unknown'}"` +
                                    `${pathDescription}.`
                                )

                            if (((error: unknown): error is EvaluationError =>
                                Object.prototype.hasOwnProperty.call(
                                    error, 'runtime'
                                )
                            )(error))
                                throwError(
                                    `Runtime: Hook "${type}" has throw ` +
                                    `an error with code "${error.code}" for ` +
                                    `property "${String(name)}": ` +
                                    `"${error.message ?? 'unknown'}"` +
                                    `${pathDescription}.`
                                )

                            if (!Object.prototype.hasOwnProperty.call(
                                error, 'empty'
                            ))
                                throw error
                        }

                        if (
                            result &&
                            ![null, undefined].includes(result.result as null)
                        )
                            if (attachmentsTarget)
                                attachmentsTarget[name as keyof Attachments] =
                                    result.result as unknown as AttachmentType
                            else
                                (newDocument[name] as Type) =
                                    result.result as Type
                    }
        }
        /// endregion
        /// region update hook
        const runUpdatePropertyHook = <Type extends PropertyValue>(
            propertySpecification: PropertySpecification<
                Type, AdditionalSpecifications
            >,
            newDocument: PartialFullDocumentType,
            oldDocument: null | PartialFullDocumentType,
            name: (keyof Attachments) | (keyof PartialFullDocumentType),
            attachmentsTarget?: Attachments
        ) => {
            const localUpdateStrategy =
                propertySpecification.updateStrategy || updateStrategy

            if (!attachmentsTarget) {
                if (!Object.prototype.hasOwnProperty.call(newDocument, name))
                    return

                if (
                    propertySpecification.trim &&
                    typeof newDocument[name] === 'string'
                )
                    (newDocument[name] as string) =
                        (newDocument[name] as string).trim()

                if (
                    propertySpecification.emptyEqualsNull &&
                    (
                        newDocument[name] === '' ||
                        Array.isArray(newDocument[name]) &&
                        (
                            newDocument[name] as Array<DocumentContent>
                        ).length === 0 ||
                        newDocument[name] !== null &&
                        typeof newDocument[name] === 'object' &&
                        Object.keys(newDocument).length === 0
                    )
                )
                    (newDocument[name] as null) = null
            }

            for (const type of [
                'onUpdateExecution', 'onUpdateExpression'
            ] as const)
                if (Object.prototype.hasOwnProperty.call(
                    propertySpecification, type
                ))
                    try {
                        const result = evaluate<
                            Type,
                            PropertyScope<
                                ObjectType,
                                Type,
                                PropertyValue,
                                AttachmentType,
                                AdditionalSpecifications,
                                AdditionalPropertiesType
                            >
                        >(
                            propertySpecification[type],
                            type.endsWith('Expression'),
                            {
                                attachmentsTarget,

                                checkPropertyContent,

                                model,
                                modelName,
                                name: String(name),
                                type,

                                newDocument,
                                oldDocument,

                                newValue: newDocument[name] as Type,
                                oldValue:
                                    oldDocument &&
                                    oldDocument[name] as Type ||
                                    undefined,

                                parentNames,
                                pathDescription,

                                propertySpecification,

                                updateStrategy: localUpdateStrategy
                            }
                        )

                        if (attachmentsTarget)
                            attachmentsTarget[name as keyof Attachments] =
                                result.result as AttachmentType
                        else if (result.result !== undefined)
                            (newDocument[name] as Type) = result.result
                    } catch (error) {
                        if (((error: unknown): error is EvaluationError =>
                            Object.prototype.hasOwnProperty.call(
                                error, 'compilation'
                            )
                        )(error))
                            throwError(
                                `Compilation: Hook "${type}" has invalid ` +
                                `code "${error.code}" for property "` +
                                `${String(name)}": ` +
                                `"${error.message ?? 'unknown'}"` +
                                `${pathDescription}.`
                            )

                        if (((error: unknown): error is EvaluationError =>
                            Object.prototype.hasOwnProperty.call(
                                error, 'runtime'
                            )
                        )(error))
                            throwError(
                                `Runtime: Hook "${type}" has throw an error` +
                                ` with code "${error.code}" for property ` +
                                `"${String(name)}": ` +
                                `"${error.message ?? 'unknown'}"` +
                                `${pathDescription}.`
                            )

                        if (!Object.prototype.hasOwnProperty.call(
                            error, 'empty'
                        ))
                            throw error
                    }
        }
        /// endregion
        // endregion
        const specifiedPropertyNames = (
            Object.keys(model) as Array<keyof PartialFullDocumentType>
        )
            .filter((name) =>
                !specialPropertyNames.includes(
                    name as string as keyof BaseModelType
                )
            ) as Array<keyof ObjectType>
        // region migrate old model specific property names
        if (updateStrategy === 'migrate')
            for (const name of specifiedPropertyNames)
                if (model[name].oldName)
                    for (const oldName of (
                        [] as Array<keyof ObjectType>
                    ).concat(
                        model[name].oldName as Array<keyof ObjectType>
                    ))
                        if (Object.prototype.hasOwnProperty.call(
                            localNewDocument, oldName
                        )) {
                            localNewDocument[name] = localNewDocument[oldName]
                            delete localNewDocument[oldName]
                        }
        // endregion
        // region run create document hook
        if (!localOldDocument)
            for (const type of [
                specialNames.create.execution, specialNames.create.expression
            ])
                if (Object.prototype.hasOwnProperty.call(model, type)) {
                    let result: null | PartialFullDocumentType | undefined
                    try {
                        result = evaluate<
                            null | PartialFullDocumentType | undefined,
                            CommonScope<
                                ObjectType,
                                PropertyValue,
                                AttachmentType,
                                AdditionalSpecifications,
                                AdditionalPropertiesType
                            >
                        >(
                            model[type as '_createExpression'],
                            type.endsWith('Expression'),
                            {
                                checkPropertyContent,

                                model,
                                modelName,
                                type,

                                newDocument: localNewDocument,
                                oldDocument: localOldDocument,

                                parentNames,
                                pathDescription,

                                updateStrategy
                            }
                        ).result
                    } catch (error) {
                        if (((error: unknown): error is EvaluationError =>
                            Object.prototype.hasOwnProperty.call(
                                error, 'compilation'
                            )
                        )(error))
                            throwError(
                                `Compilation: Hook "${type}" has invalid ` +
                                `code "${error.code}" for document "` +
                                `${modelName}": ` +
                                `"${error.message ?? 'unknown'}"` +
                                `${pathDescription}.`
                            )

                        if (((error: unknown): error is EvaluationError =>
                            Object.prototype.hasOwnProperty.call(
                                error, 'runtime'
                            )
                        )(error))
                            throwError(
                                `Runtime: Hook "${type}" has throw an error` +
                                ` with code "${error.code}" for ` +
                                `document "${modelName}": ` +
                                `"${error.message ?? 'unknown'}"` +
                                `${pathDescription}.`
                            )

                        if (!Object.prototype.hasOwnProperty.call(
                            error, 'empty'
                        ))
                            throw error
                    }

                    if (![null, undefined].includes(result as null))
                        // @ts-expect-error Typescript cannot determine.
                        localNewDocument = result

                    checkModelType()

                    modelName = localNewDocument[typeName] as string

                    if (parentNames.length === 0)
                        setDocumentEnvironment()
                }
        // endregion
        // region run update document hook
        for (const type of [
            specialNames.update.execution, specialNames.update.expression
        ])
            if (Object.prototype.hasOwnProperty.call(model, type)) {
                let result: null | PartialFullDocumentType | undefined
                try {
                    result = evaluate<
                        null | PartialFullDocumentType,
                        CommonScope<
                            ObjectType,
                            PropertyValue,
                            AttachmentType,
                            AdditionalSpecifications,
                            AdditionalPropertiesType
                        >
                    >(
                        model[type as '_onUpdateExpression'],
                        type.endsWith('Expression'),
                        {
                            checkPropertyContent,

                            model,
                            modelName,
                            type,

                            newDocument: localNewDocument,
                            oldDocument: localOldDocument,

                            parentNames,
                            pathDescription,

                            updateStrategy
                        }
                    ).result
                } catch (error) {
                    if (((error: unknown): error is EvaluationError =>
                        Object.prototype.hasOwnProperty.call(
                            error, 'compilation'
                        )
                    )(error))
                        throwError(
                            `Compilation: Hook "${type}" has invalid ` +
                            `code "${error.code}" for document ` +
                            `"${modelName}": ` +
                            `"${error.message ?? 'unknown'}"` +
                            `${pathDescription}.`
                        )

                    if (((error: unknown): error is EvaluationError =>
                        Object.prototype.hasOwnProperty.call(error, 'runtime')
                    )(error))
                        throwError(
                            `Runtime: Hook "${type}" has throw an error ` +
                            `with code "${error.code}" for document ` +
                            `"${modelName}": ` +
                            `"${error.message ?? 'unknown'}"` +
                            `${pathDescription}.`
                        )

                    if (!Object.prototype.hasOwnProperty.call(
                        error, 'empty'
                    ))
                        throw error
                }

                if (![undefined, null].includes(result as null))
                    // @ts-expect-error Typescript cannot determine.
                    localNewDocument = result

                checkModelType()

                modelName = localNewDocument[typeName] as string

                if (parentNames.length === 0)
                    setDocumentEnvironment()
            }
        // endregion
        const additionalPropertyNames = additionalPropertySpecification ?
            (Object.keys(localNewDocument) as Array<keyof ObjectType>).filter(
                (name: keyof ObjectType): boolean =>
                    !specifiedPropertyNames.includes(name)
            ) :
            [] as Array<keyof ObjectType>
        for (const name of specifiedPropertyNames.concat(
            additionalPropertyNames
        ))
            // region run hooks and check for presence of needed data
            if (specialNames.attachment === name)
                // region attachment
                for (const [type, property] of Object.entries(
                    model[specialNames.attachment] as
                        FileSpecification<
                            AttachmentType, AdditionalSpecifications
                        >
                )) {
                    if (!localNewDocument[specialNames.attachment])
                        localNewDocument[specialNames.attachment] = {}

                    if (
                        localOldDocument &&
                        !Object.prototype.hasOwnProperty.call(
                            localOldDocument, name
                        )
                    )
                        localOldDocument[specialNames.attachment] = {}

                    const newAttachments =
                        localNewDocument[specialNames.attachment] as Attachments

                    const newFileNames: Array<keyof Attachments> =
                        Object.keys(newAttachments)
                            .filter((fileName: string): boolean =>
                                (
                                    newAttachments[fileName] as FullAttachment
                                ).data !== null &&
                                fileNameMatchesModelType(
                                    type,
                                    fileName,
                                    property as FileSpecification<
                                        AttachmentType,
                                        AdditionalSpecifications
                                    >
                                )
                            )

                    let oldFileNames: Array<string> = []
                    if (localOldDocument) {
                        const oldAttachments =
                            localOldDocument[name] as Attachments
                        oldFileNames = Object.keys(oldAttachments)
                            .filter((fileName: string): boolean =>
                                !(
                                    Object.prototype.hasOwnProperty.call(
                                        newAttachments, fileName
                                    ) &&
                                    Object.prototype.hasOwnProperty.call(
                                        newAttachments[fileName], 'data'
                                    ) &&
                                    (
                                        newAttachments[fileName] as
                                            FullAttachment
                                    ).data === null
                                ) &&
                                Boolean(oldAttachments[fileName]) &&
                                (
                                    Object.prototype.hasOwnProperty.call(
                                        oldAttachments[fileName], 'data'
                                    ) &&
                                    (oldAttachments[fileName] as
                                        FullAttachment
                                    ).data !== null ||
                                    Object.prototype.hasOwnProperty.call(
                                        oldAttachments[fileName], 'stub'
                                    ) &&
                                    Boolean((oldAttachments[fileName] as
                                        StubAttachment
                                    ).digest)
                                ) &&
                                fileNameMatchesModelType(
                                    type,
                                    fileName,
                                    property as FileSpecification<
                                        AttachmentType,
                                        AdditionalSpecifications
                                    >
                                )
                            )
                    }

                    const propertySpecification = property as
                        PropertySpecification<
                            AttachmentType, AdditionalSpecifications
                        >
                    updateStrategy =
                        propertySpecification.updateStrategy ||
                        updateStrategy

                    for (const fileName of newFileNames)
                        runCreatePropertyHook<AttachmentType>(
                            propertySpecification,
                            localNewDocument,
                            localOldDocument && localOldDocument[name] ?
                                localOldDocument[name] as
                                    PartialFullDocumentType :
                                null,
                            fileName,
                            newAttachments
                        )

                    for (const fileName of newFileNames)
                        runUpdatePropertyHook<AttachmentType>(
                            propertySpecification,
                            localNewDocument,
                            localOldDocument && localOldDocument[name] ?
                                localOldDocument[name] as
                                    PartialFullDocumentType :
                                null,
                            fileName,
                            newAttachments
                        )

                    if (typeof propertySpecification.default === 'undefined') {
                        if (!(
                            propertySpecification.nullable ||
                            newFileNames.length > 0 ||
                            oldFileNames.length > 0
                        ))
                            throwError(
                                'AttachmentMissing: Missing attachment for ' +
                                `type "${type}"${pathDescription}.`
                            )

                        if (
                            updateStrategy === 'fillUp' &&
                            newFileNames.length === 0 &&
                            oldFileNames.length > 0
                        )
                            for (const fileName of oldFileNames)
                                if (newAttachments[fileName] === null)
                                    changedPath = parentNames.concat(
                                        name, fileName, 'file removed'
                                    )
                                else
                                    // @ts-expect-error Existing old file name
                                    newAttachments[fileName] = ((
                                        localOldDocument
                                    )[name] as Attachments)[fileName]
                    } else if (newFileNames.length === 0)
                        if (oldFileNames.length === 0) {
                            for (
                                const fileName in propertySpecification.default
                            )
                                if (Object.prototype.hasOwnProperty.call(
                                    propertySpecification.default, fileName
                                )) {
                                    newAttachments[fileName] =
                                        propertySpecification.default[
                                            fileName
                                        ] as AttachmentType
                                    changedPath = parentNames.concat(
                                        name, type, 'add default file'
                                    )
                                }
                        } else if (updateStrategy === 'fillUp')
                            for (const fileName of oldFileNames)
                                // @ts-expect-error Existing old file name
                                newAttachments[fileName] = ((
                                    localOldDocument
                                )[name] as Attachments)[fileName]
                }
                // endregion
            else {
                const propertySpecification = (
                    specifiedPropertyNames.includes(name) ?
                        model[name] :
                        additionalPropertySpecification
                ) as PropertySpecification<
                    ValueOf<ObjectType>, AdditionalSpecifications
                >
                updateStrategy =
                    propertySpecification.updateStrategy || updateStrategy

                runCreatePropertyHook<ValueOf<ObjectType>>(
                    propertySpecification,
                    localNewDocument,
                    localOldDocument,
                    name
                )
                runUpdatePropertyHook<ValueOf<ObjectType>>(
                    propertySpecification,
                    localNewDocument,
                    localOldDocument,
                    name
                )

                if ([null, undefined].includes(
                    propertySpecification.default as null
                )) {
                    if (!(
                        propertySpecification.nullable ||
                        (
                            Object.prototype.hasOwnProperty.call(
                                localNewDocument, name
                            ) &&
                            localNewDocument[name] !== undefined ||
                            localOldDocument &&
                            Object.prototype.hasOwnProperty.call(
                                localOldDocument, name
                            ) &&
                            updateStrategy !== 'replace'
                        )
                    ))
                        throwError(
                            `MissingProperty: Missing property ` +
                            `"${String(name)}"${pathDescription}.`
                        )

                    if (
                        (
                            !Object.prototype.hasOwnProperty.call(
                                localNewDocument, name
                            ) ||
                            localNewDocument[name] === undefined
                        ) &&
                        localOldDocument &&
                        Object.prototype.hasOwnProperty.call(
                            localOldDocument, name
                        )
                    )
                        if (updateStrategy === 'fillUp')
                            localNewDocument[name] = localOldDocument[name]
                        else if (updateStrategy === 'replace')
                            changedPath = parentNames.concat(
                                String(name), 'property removed'
                            )
                } else if (!isDefinedPropertyValue(name, localNewDocument))
                    if (localOldDocument) {
                        if (
                            localNewDocument[name] !== null &&
                            updateStrategy === 'fillUp'
                        )
                            localNewDocument[name] = localOldDocument[name]
                        else if (updateStrategy === 'migrate') {
                            localNewDocument[name] =
                                propertySpecification.default as
                                    typeof localNewDocument[keyof ObjectType]
                            changedPath = parentNames.concat(
                                String(name), 'migrate default value'
                            )
                        }
                    } else {
                        localNewDocument[name] =
                            propertySpecification.default as
                                typeof localNewDocument[keyof ObjectType]

                        changedPath = changedPath.concat(
                            String(name), 'add default value'
                        )
                    }
            }
            // endregion

        // region check given data
        /// region remove new data which already exists
        if (localOldDocument && updateStrategy === 'incremental')
            for (const [name, value] of Object.entries(localNewDocument))
                if (
                    Object.prototype.hasOwnProperty.call(
                        localOldDocument, name
                    ) &&
                    !modelConfiguration.property.name.reserved.concat(
                        idName,
                        revisionName,
                        specialNames.conflict,
                        specialNames.deleted,
                        specialNames.deletedConflict,
                        specialNames.localSequence,
                        specialNames.revisions,
                        specialNames.revisionsInformation,
                        typeName
                    ).includes(name) &&
                    (
                        localOldDocument[name] === value ||
                        serialize(localOldDocument[name]) === serialize(value)
                    )
                )
                    delete localNewDocument[name]
        /// endregion
        for (const [name, newValue] of (
            Object.entries(localNewDocument) as
                Array<[keyof ObjectType, ValueOf<ObjectType>]>
        ))
            if (
                !modelConfiguration.property.name.reserved.concat(
                    revisionName,
                    specialNames.conflict,
                    specialNames.deleted,
                    specialNames.deletedConflict,
                    specialNames.localSequence,
                    specialNames.revisions,
                    specialNames.revisionsInformation,
                    specialNames.updateStrategy
                ).includes(name as keyof BaseModelType)
            ) {
                let propertySpecification:(
                    typeof model[keyof ObjectType] |
                    PropertySpecification<
                        AdditionalPropertiesType, AdditionalSpecifications
                    > |
                    undefined
                )
                if (Object.prototype.hasOwnProperty.call(model, name))
                    propertySpecification = model[name]
                else if (additionalPropertySpecification)
                    (propertySpecification as PropertySpecification<
                        AdditionalPropertiesType, AdditionalSpecifications
                    >) = additionalPropertySpecification
                else if (updateStrategy === 'migrate') {
                    delete localNewDocument[name]

                    changedPath = parentNames.concat(
                        String(name), 'migrate removed property'
                    )

                    continue
                } else
                    throwError(
                        `Property: Given property "${String(name)}" isn't ` +
                        `specified in model "${modelName}"${pathDescription}.`
                    )

                // NOTE: Only needed to avoid type check errors.
                if (!propertySpecification)
                    continue

                // region check writable/mutable/nullable
                if (specialNames.attachment === name) {
                    const attachments = newValue as Attachments

                    for (const fileName in attachments)
                        if (Object.prototype.hasOwnProperty.call(
                            attachments, fileName
                        ))
                            for (const type of Object.keys(model[name])) {
                                const file = (
                                    model[specialNames.attachment] as
                                        Attachments
                                )[type] as FileSpecification<
                                    AttachmentType, AdditionalSpecifications
                                >
                                if (fileNameMatchesModelType(
                                    type, fileName, file
                                )) {
                                    checkPropertyWriteableMutableNullable<
                                        AttachmentType | null
                                    >(
                                        file,
                                        localNewDocument,
                                        localOldDocument,
                                        fileName,
                                        pathDescription
                                    )

                                    break
                                }
                            }

                    continue
                } else if (checkPropertyWriteableMutableNullable<
                    AdditionalPropertiesType | ValueOf<ObjectType>
                >(
                    propertySpecification as PropertySpecification<
                        AdditionalPropertiesType, AdditionalSpecifications
                    >,
                    localNewDocument,
                    localOldDocument,
                    name,
                    pathDescription
                ))
                    continue
                // endregion
                const isArrayType = (
                    typeof propertySpecification.type === 'string' &&
                    propertySpecification.type.endsWith('[]') ||
                    Array.isArray(propertySpecification.type) &&
                    propertySpecification.type.length &&
                    Array.isArray(propertySpecification.type[0])
                )
                if (
                    isArrayType &&
                    ![null, undefined].includes(newValue as null)
                ) {
                    const newProperty = newValue as Array<DocumentContent>
                    // region check arrays
                    if (!Array.isArray(newProperty))
                        throwError(
                            `PropertyType: Property "${String(name)}" isn't ` +
                            `of type "array -> ` +
                            `${propertySpecification.type as string}" (given` +
                            `"${serialize(newProperty)}")${pathDescription}.`
                        )
                    else if (
                        typeof propertySpecification.minimumNumber ===
                            'number' &&
                        newProperty.length <
                            propertySpecification.minimumNumber
                    )
                        throwError(
                            `MinimumArrayLength: Property "${String(name)}" ` +
                            `(array of length ${String(newProperty.length)})` +
                            ` doesn't fulfill minimum array length of ` +
                            (
                                propertySpecification.minimumNumber as
                                    unknown as
                                    string
                            ) +
                            `${pathDescription}.`
                        )
                    else if (
                        typeof propertySpecification.maximumNumber ===
                            'number' &&
                        propertySpecification.maximumNumber <
                            newProperty.length
                    )
                        throwError(
                            `MaximumArrayLength: Property "${String(name)}" ` +
                            `(array of length ${String(newProperty.length)})` +
                            ` doesn't fulfill maximum array length of ` +
                            (
                                propertySpecification.maximumNumber as
                                    unknown as
                                    string
                            ) +
                            `${pathDescription}.`
                        )

                    checkPropertyConstraints<PropertyValue>(
                        newProperty as PropertyValue,
                        String(name),
                        propertySpecification as PropertySpecification<
                            AdditionalPropertiesType, AdditionalSpecifications
                        >,
                        localOldDocument &&
                        Object.prototype.hasOwnProperty.call(
                            localOldDocument, name
                        ) &&
                        localOldDocument[name] ||
                        undefined,
                        [
                            'arrayConstraintExecution',
                            'arrayConstraintExpression'
                        ]
                    )
                    /// region check/migrate array content
                    const propertySpecificationCopy =
                        {} as PropertySpecification<
                            ValueOf<ObjectType>, AdditionalSpecifications
                        >
                    for (const key in propertySpecification)
                        if (Object.prototype.hasOwnProperty.call(
                            propertySpecification, key
                        ))
                            if (key === 'type') {
                                const type =
                                    propertySpecification[key] as
                                        Array<string> | string
                                if (Array.isArray(propertySpecification[key]))
                                    propertySpecificationCopy[key] = (
                                        type as Array<string>
                                    )[0]
                                else
                                    propertySpecificationCopy[key] = [(
                                        type as string
                                    ).substring(0, type.length - '[]'.length)]
                            } else
                                (propertySpecificationCopy[
                                    key as keyof PropertySpecification<
                                        ValueOf<ObjectType>,
                                        AdditionalSpecifications
                                    >
                                ] as Primitive) = propertySpecification[
                                    key as keyof PropertySpecification<
                                        ValueOf<ObjectType>,
                                        AdditionalSpecifications
                                    >
                                ] as Primitive
                    //// region add missing array item types
                    /*
                        Derive nested missing explicit type definition if
                        possible. Objects in arrays without explicit type
                        definition will receive one.
                    */
                    if (
                        Array.isArray(propertySpecificationCopy.type) &&
                        propertySpecificationCopy.type.length === 1 &&
                        typeof propertySpecificationCopy.type[0] ===
                            'string' &&
                        Object.prototype.hasOwnProperty.call(
                            models, propertySpecificationCopy.type[0]
                        )
                    )
                        for (const value of newProperty.slice())
                            if (
                                typeof value === 'object' &&
                                Object.getPrototypeOf(value) ===
                                    Object.prototype &&
                                !Object.prototype.hasOwnProperty.call(
                                    value as PlainObject, typeName
                                )
                            )
                                (value as PlainObject)[typeName] =
                                    propertySpecificationCopy.type[0]
                    //// endregion
                    //// region check each array item
                    let index = 0
                    for (const value of newProperty.slice()) {
                        newProperty[index] = checkPropertyContent<
                            ValueOf<ObjectType>
                        >(
                            value as ValueOf<ObjectType>,
                            `${String(index + 1)}. value in ${String(name)}`,
                            propertySpecificationCopy,
                            undefined
                        ).newValue as DocumentContent
                        if ([null, undefined].includes(
                            newProperty[index] as null
                        ))
                            newProperty.splice(index, 1)

                        index += 1
                    }
                    //// endregion
                    if (!(
                        localOldDocument &&
                        Object.prototype.hasOwnProperty.call(
                            localOldDocument, name
                        ) &&
                        Array.isArray(localOldDocument[name]) &&
                        (
                            localOldDocument[name] as Array<DocumentContent>
                        ).length === newProperty.length &&
                        serialize(localOldDocument[name]) ===
                            serialize(newProperty)
                    ))
                        changedPath =
                            parentNames.concat(String(name), 'array updated')
                    /// endregion
                    // endregion
                } else {
                    const oldValue: unknown =
                        (
                            localOldDocument &&
                            Object.prototype.hasOwnProperty.call(
                                localOldDocument, name
                            )
                        ) ?
                            localOldDocument[name] :
                            undefined

                    const result = isArrayType ?
                        {newValue: null, changedPath: []} :
                        checkPropertyContent<ValueOf<ObjectType>>(
                            newValue,
                            String(name),
                            propertySpecification as PropertySpecification<
                                ValueOf<ObjectType>, AdditionalSpecifications
                            >,
                            oldValue as ValueOf<ObjectType>
                        )

                    localNewDocument[name] = result.newValue as
                        PartialFullDocumentType[keyof ObjectType]

                    if (result.changedPath.length)
                        changedPath = result.changedPath

                    // NOTE: Do not use "newValue" here anymore.
                    if (localNewDocument[name] === null)
                        if (oldValue === undefined) {
                            if (updateStrategy === 'fillUp')
                                delete localNewDocument[name]
                        } else
                            changedPath = parentNames.concat(
                                String(name), 'property removed'
                            )

                    if (
                        localNewDocument[name] === undefined &&
                        updateStrategy === 'incremental'
                    )
                        delete localNewDocument[name]
                }
            }
        /// region constraint
        for (const type of Object.keys(
            specialNames.constraint
        ) as Array<keyof SpecialPropertyNames['constraint']>) {
            const constraintName = specialNames.constraint[type]

            if (Object.prototype.hasOwnProperty.call(model, constraintName)) {
                const constraints = model[constraintName] as Array<Constraint>
                for (const constraint of ([] as Array<Constraint>).concat(
                    constraints
                )) {
                    type Scope = CommonScope<
                        ObjectType,
                        PropertyValue,
                        AttachmentType,
                        AdditionalSpecifications,
                        AdditionalPropertiesType
                    >

                    let result: (
                        EvaluationResult<
                            ObjectType,
                            boolean | undefined,
                            PropertyValue,
                            AttachmentType,
                            AdditionalSpecifications,
                            AdditionalPropertiesType,
                            Scope
                        > |
                        undefined
                        ) = undefined
                    try {
                        result = evaluate<boolean, Scope>(
                            constraint.evaluation,
                            constraintName ===
                            specialNames.constraint.expression,
                            {
                                checkPropertyContent,

                                model,
                                modelName,
                                type: constraintName,

                                newDocument: localNewDocument,
                                oldDocument: localOldDocument,

                                parentNames,
                                pathDescription,

                                updateStrategy
                            }
                        )
                    } catch (error) {
                        if (((error: unknown): error is EvaluationError =>
                            Object.prototype.hasOwnProperty.call(
                                error, 'compilation'
                            )
                        )(error))
                            throwError(
                                `Compilation: Hook "${constraintName}" has ` +
                                `invalid code "${error.code}": ` +
                                `"${error.message ?? 'unknown'}"` +
                                `${pathDescription}.`
                            )

                        if (((error: unknown): error is EvaluationError =>
                            Object.prototype.hasOwnProperty.call(
                                error, 'runtime'
                            )
                        )(error))
                            throwError(
                                `Runtime: Hook "${constraintName}" ` +
                                `has thrown an error with code ` +
                                `"${error.code}": ` +
                                `"${error.message ?? 'unknown'}"` +
                                `${pathDescription}.`
                            )

                        if (!Object.prototype.hasOwnProperty.call(
                            error, 'empty'
                        ))
                            throw error
                    }

                    if (result && !result.result) {
                        const errorName =
                            constraintName.replace(/^[^a-zA-Z]+/, '')

                        throwError(
                            errorName.charAt(0).toUpperCase() +
                            `${errorName.substring(1)}: ` +
                            (
                                constraint.description ?
                                    /*
                                        eslint-disable
                                        @typescript-eslint/no-implied-eval,
                                        @typescript-eslint/no-unsafe-call
                                    */
                                    new Function(
                                        ...Object.keys(result.scope),
                                        'return ' +
                                        constraint.description.trim()
                                    )(...Object.values(result.scope) as
                                        Array<unknown>
                                    ) as string :
                                    `Model "${modelName}" should satisfy ` +
                                    `constraint "${result.code}" (given ` +
                                    `"${serialize(localNewDocument)}")` +
                                    `${pathDescription}.`
                                /*
                                    eslint-enable
                                    @typescript-eslint/no-implied-eval,
                                    @typescript-eslint/no-unsafe-call
                                */
                            )
                        )
                    }
                }
            }
        }
        /// endregion
        /// region attachment
        if (Object.prototype.hasOwnProperty.call(
            localNewDocument, specialNames.attachment
        )) {
            const newAttachments =
                localNewDocument[specialNames.attachment] as Attachments

            if (
                typeof newAttachments !== 'object' ||
                Object.getPrototypeOf(newAttachments) !== Object.prototype
            )
                throwError(
                    'AttachmentType: given attachment has invalid type' +
                    `${pathDescription}.`
                )

            // region migrate old attachments
            let oldAttachments: Attachments | null = null
            if (
                localOldDocument &&
                Object.prototype.hasOwnProperty.call(
                    localOldDocument, specialNames.attachment
                )
            ) {
                oldAttachments = localOldDocument[specialNames.attachment] as
                    Attachments | null
                if (
                    oldAttachments !== null &&
                    typeof oldAttachments === 'object'
                )
                    for (const [fileName, oldAttachment] of Object.entries(
                        oldAttachments
                    ))
                        if (
                            oldAttachment &&
                            Object.prototype.hasOwnProperty.call(
                                newAttachments, fileName
                            )
                        ) {
                            const newAttachment = newAttachments[fileName]

                            if (
                                newAttachment === null ||
                                (newAttachment as FullAttachment).data ===
                                    null ||
                                newAttachment.content_type ===
                                    oldAttachment.content_type &&
                                (
                                    (
                                        newAttachment as FullAttachment
                                    ).data === (
                                        oldAttachment as FullAttachment
                                    ).data ||
                                    (
                                        newAttachment as StubAttachment
                                    ).digest === (
                                        oldAttachment as StubAttachment
                                    ).digest
                                )
                            ) {
                                if (
                                    newAttachment === null ||
                                    (
                                        newAttachment as FullAttachment
                                    ).data === null
                                )
                                    changedPath = parentNames.concat(
                                        specialNames.attachment,
                                        fileName,
                                        'attachment removed'
                                    )

                                if (updateStrategy === 'incremental')
                                    delete newAttachments[fileName]
                            } else
                                changedPath = parentNames.concat(
                                    specialNames.attachment,
                                    fileName,
                                    'attachment updated'
                                )
                        } else if (updateStrategy === 'fillUp')
                            newAttachments[fileName] = oldAttachment
                        else if (updateStrategy === 'replace')
                            changedPath = parentNames.concat(
                                specialNames.attachment,
                                fileName,
                                'attachment removed'
                            )
            }

            for (const [fileName, newAttachment] of Object.entries(
                newAttachments
            )) {
                if (!newAttachment)
                    break

                if ((newAttachment as unknown as FullAttachment).data === null)
                    delete newAttachments[fileName]
                else if (!(
                    oldAttachments &&
                    Object.prototype.hasOwnProperty.call(
                        oldAttachments, fileName
                    ) &&
                    newAttachment.content_type ===
                    oldAttachments[fileName]?.content_type &&
                    (
                        (newAttachment as FullAttachment).data === (
                            oldAttachments[fileName] as FullAttachment
                        ).data ||
                        (newAttachment as StubAttachment).digest === (
                            oldAttachments[fileName] as StubAttachment
                        ).digest
                    )
                ))
                    changedPath = parentNames.concat(
                        specialNames.attachment,
                        fileName,
                        'attachment updated'
                    )
            }
            // endregion
            if (Object.keys(newAttachments).length === 0)
                delete localNewDocument[specialNames.attachment]

            const attachmentModel =
                model[specialNames.attachment] as Mapping<
                    FileSpecification<AttachmentType, AdditionalSpecifications
                >>

            const attachmentToTypeMapping: Mapping<Array<string>> = {}
            for (const type of Object.keys(attachmentModel))
                attachmentToTypeMapping[type] = []

            for (const name of Object.keys(newAttachments)) {
                let matched = false

                for (const [type, specification] of Object.entries(
                    attachmentModel
                ))
                    if (fileNameMatchesModelType(type, name, specification)) {
                        attachmentToTypeMapping[type].push(name)

                        matched = true

                        break
                    }

                if (!matched)
                    throwError(
                        'AttachmentTypeMatch: None of the specified ' +
                        'attachment types ("' +
                        Object.keys(attachmentModel).join('", "') +
                        `") matches given one ("${name}")${pathDescription}.`
                    )
            }

            let sumOfAggregatedSizes = 0
            for (const type of Object.keys(attachmentToTypeMapping)) {
                const specification: FileSpecification<
                    AttachmentType, AdditionalSpecifications
                > = attachmentModel[type]

                if (!Object.prototype.hasOwnProperty.call(
                    attachmentToTypeMapping, type
                ))
                    continue

                const numberOfAttachments =
                    attachmentToTypeMapping[type].length
                if (
                    typeof specification.maximumNumber === 'number' &&
                    numberOfAttachments > specification.maximumNumber
                )
                    throwError(
                        'AttachmentMaximum: given number of attachments ' +
                        `(${String(numberOfAttachments)}) doesn't satisfy ` +
                        'specified maximum of ' +
                        `${String(specification.maximumNumber)} from type ` +
                        `"${type}"${pathDescription}.`
                    )

                if (
                    !(
                        specification.nullable && numberOfAttachments === 0
                    ) &&
                    typeof specification.minimumNumber === 'number' &&
                    numberOfAttachments < specification.minimumNumber
                )
                    throwError(
                        'AttachmentMinimum: given number of attachments ' +
                        `(${String(numberOfAttachments)}) doesn't satisfy ` +
                        'specified minimum of ' +
                        `${String(specification.minimumNumber)} from type ` +
                        `"${type}"${pathDescription}.`
                    )

                let aggregatedSize = 0
                for (const fileName of attachmentToTypeMapping[type]) {
                    if (specification.fileName?.pattern) {
                        const patterns = (
                            [] as Array<RegExp | string>
                        ).concat(specification.fileName.pattern)
                        let matched = false
                        for (const pattern of patterns)
                            if (new RegExp(pattern).test(fileName)) {
                                matched = true
                                break
                            }
                        if (!matched)
                            throwError(
                                'AttachmentName: given attachment name ' +
                                `"${fileName}" doesn't satisfy one of ` +
                                'specified regular expression patterns ' +
                                `"${patterns.join('", "')}" from type ` +
                                `"${type}"${pathDescription}.`
                            )
                    }

                    if (specification.fileName?.invertedPattern)
                        for (const pattern of (
                            [] as Array<RegExp | string>
                        ).concat(specification.fileName.invertedPattern))
                            if (new RegExp(pattern).test(fileName))
                                throwError(
                                    'InvertedAttachmentName: given ' +
                                    `attachment name "${fileName}" does ` +
                                    `satisfy specified regular ` +
                                    `expression pattern "` +
                                    `${pattern.toString()}" from type ` +
                                    `"${type}"${pathDescription}.`
                                )

                    if (newAttachments[fileName]?.content_type) {
                        if (specification.contentTypePattern) {
                            const patterns = (
                                [] as Array<RegExp | string>
                            ).concat(specification.contentTypePattern)
                            let matched = false
                            for (const pattern of patterns)
                                if (new RegExp(pattern).test(
                                    newAttachments[fileName].content_type
                                )) {
                                    matched = true
                                    break
                                }
                            if (!matched)
                                throwError(
                                    'AttachmentContentType: given ' +
                                    'attachment content type "' +
                                    newAttachments[fileName].content_type +
                                    `" doesn't satisfy specified regular` +
                                    ' expression pattern ' +
                                    `"${patterns.join('", "')}" from type ` +
                                    `"${type}"${pathDescription}.`
                                )
                        }

                        const invertedPatterns =
                            specification.invertedContentTypePattern

                        if (invertedPatterns)
                            for (const pattern of (
                                [] as Array<RegExp | string>
                            ).concat(invertedPatterns))
                                if (new RegExp(pattern).test(
                                    newAttachments[fileName].content_type
                                ))
                                    throwError(
                                        'InvertedAttachmentContentType: ' +
                                        'given attachment content type "' +
                                        newAttachments[fileName].content_type +
                                        '" does satisfy specified regular ' +
                                        'expression pattern ' +
                                        `"${pattern.toString()}" from type ` +
                                        `"${type}"${pathDescription}.`
                                    )
                    }

                    let length = 0
                    if (
                        newAttachments[fileName] &&
                        'length' in newAttachments[fileName]
                    )
                        length = (
                            newAttachments[fileName] as StubAttachment
                        ).length
                    else if (
                        newAttachments[fileName] &&
                        'data' in newAttachments[fileName]
                    )
                        if (
                            typeof Buffer !== 'undefined' &&
                            'byteLength' in Buffer
                        )
                            length = Buffer.byteLength(
                                (newAttachments[fileName] as
                                    FullAttachment
                                ).data as FirstParameter<
                                    typeof Buffer['byteLength']
                                >,
                                'base64'
                            )
                        else
                            length = ((
                                newAttachments[fileName] as FullAttachment
                            ).data as Buffer).length

                    if (
                        typeof specification.minimumSize === 'number' &&
                        specification.minimumSize > length
                    )
                        throwError(
                            'AttachmentMinimumSize: given attachment ' +
                            `size ${String(length)} byte doesn't satisfy ` +
                            'specified minimum of ' +
                            `${String(specification.minimumSize)} byte ` +
                            `${pathDescription}.`
                        )
                    else if (
                        typeof specification.maximumSize === 'number' &&
                        specification.maximumSize < length
                    )
                        throwError(
                            'AttachmentMaximumSize: given attachment ' +
                            `size ${String(length)} byte doesn't satisfy ` +
                            'specified maximum of ' +
                            `${String(specification.maximumSize)} byte ` +
                            `${pathDescription}.`
                        )

                    aggregatedSize += length
                }

                if (
                    typeof specification.minimumAggregatedSize === 'number' &&
                    specification.minimumAggregatedSize > aggregatedSize
                )
                    throwError(
                        'AttachmentAggregatedMinimumSize: given ' +
                        'aggregated size of attachments from type ' +
                        `"${type}" ${String(aggregatedSize)} byte doesn't ` +
                        'satisfy specified minimum of ' +
                        `${String(specification.minimumAggregatedSize)} byte` +
                        ` ${pathDescription}.`
                    )
                else if (
                    typeof specification.maximumAggregatedSize === 'number' &&
                    specification.maximumAggregatedSize < aggregatedSize
                )
                    throwError(
                        'AttachmentAggregatedMaximumSize: given ' +
                        `aggregated size of attachments from type "${type}" ` +
                        `${String(aggregatedSize)} byte doesn't satisfy ` +
                        `specified maximum of ` +
                        `${String(specification.maximumAggregatedSize)} byte` +
                        ` ${pathDescription}.`
                    )

                sumOfAggregatedSizes += aggregatedSize
            }

            if (
                (model[specialNames.minimumAggregatedSize] ?? 0) >
                    sumOfAggregatedSizes
            )
                throwError(
                    'AggregatedMinimumSize: given aggregated size ' +
                    `${String(sumOfAggregatedSizes)} byte doesn't satisfy ` +
                    'specified minimum of ' +
                    `${String(model[specialNames.minimumAggregatedSize])} ` +
                    `byte ${pathDescription}.`
                )
            else if (
                (model[specialNames.maximumAggregatedSize] ?? Infinity) <
                    sumOfAggregatedSizes
            )
                throwError(
                    'AggregatedMaximumSize: given aggregated size ' +
                    `${String(sumOfAggregatedSizes)} byte doesn't satisfy ` +
                    'specified maximum of ' +
                    `${String(model[specialNames.maximumAggregatedSize])} ` +
                    `byte ${pathDescription}.`
                )
        }
        /// endregion
        // endregion
        if (
            localOldDocument &&
            Object.prototype.hasOwnProperty.call(
                localOldDocument, specialNames.attachment
            ) &&
            Object.keys(
                localOldDocument[specialNames.attachment] as Attachments
            ).length === 0
        )
            delete localOldDocument[specialNames.attachment]

        if (localOldDocument) {
            // region fill up old additional properties if desired
            if (
                additionalPropertySpecification &&
                (
                    additionalPropertySpecification.updateStrategy ||
                    updateStrategy
                ) === 'fillUp'
            )
                for (const name of Object.keys(localOldDocument))
                    if (!Object.prototype.hasOwnProperty.call(
                        localNewDocument, name
                    ))
                        (
                            localNewDocument as
                                Mapping<AdditionalPropertiesType>
                        )[name] = localOldDocument[name]
            // endregion
            if (changedPath.length === 0 && updateStrategy === 'migrate')
                for (const name of Object.keys(localOldDocument))
                    if (!Object.prototype.hasOwnProperty.call(
                        localNewDocument, name
                    ))
                        changedPath = parentNames.concat(
                            name, 'migrate removed property'
                        )
        }

        return {changedPath, newDocument: localNewDocument}
    }
    // endregion
    const BASIC_SCOPE: BasicScope<
        ObjectType,
        AttachmentType,
        AdditionalSpecifications,
        AdditionalPropertiesType
    > = {
        attachmentWithPrefixExists,
        checkDocument,
        deepCopy,
        getDateTime,
        getEffectiveValue,
        getFileNameByPrefix,
        isDefinedPropertyValue,
        require: currentRequire,
        serialize,

        id,
        revision,

        idName,
        revisionName,
        specialNames,
        typeName,

        modelConfiguration,
        models,

        now,
        nowUTCTimestamp,

        securitySettings,

        userContext,

        originalNewDocument
    }

    const newAttachments =
        newDocument[specialNames.attachment] as Attachments
    // region migrate attachment content types
    if (newDocument[specialNames.attachment])
        for (const attachment of Object.values(newAttachments))
            if (attachment?.contentType) {
                // eslint-disable-next-line camelcase
                attachment.content_type = attachment.contentType
                delete attachment.contentType
            }
    // endregion
    const result = checkDocument(newDocument, oldDocument)

    // region check if changes happened
    if (
        result.newDocument._deleted &&
        !oldDocument ||
        !(
            result.newDocument._deleted &&
            result.newDocument._deleted !== oldDocument?._deleted ||
            result.changedPath.length
        )
    )
        throwError(
            'NoChange: No new data given. new document: ' +
            `${serialize(newDocument)}; old document: ` +
            `${serialize(oldDocument)}.`
        )
    // endregion
    // region add metadata to security object for further processing
    if (Object.prototype.hasOwnProperty.call(
        securitySettings,
        modelConfiguration.property.name.validatedDocumentsCache
    ))
        (securitySettings[
            modelConfiguration.property.name.validatedDocumentsCache as
                keyof SecuritySettings
        ] as Set<string>).add(`${id}-${revision}`)
    else
        (securitySettings[
            modelConfiguration.property.name.validatedDocumentsCache as
                keyof SecuritySettings
        ] as Set<string>) = new Set([`${id}-${revision}`])
    // endregion

    // log.debug('Determined new document:', result.newDocument)

    return result.newDocument
}

export const databaseHelper = module.exports
export default databaseHelper
