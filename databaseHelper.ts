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
import {Mapping, Primitive, PlainObject, ValueOf} from 'clientnode/type'

import {
    AllowedModelRolesMapping,
    Attachment,
    BaseModel,
    BaseModelConfiguration,
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
    SelectionMapping,
    SpecialPropertyNames,
    StubAttachment,
    Type as TypeNames,
    UserContext
} from './type'
// endregion
/**
 * WebNode plugin interface with all provided hooks.
 */
export class DatabaseHelper {
    /**
     * Authenticates given document update against given mapping of allowed
     * roles for writing into corresponding model instances.
     * @param newDocument - Updated document.
     * @param oldDocument - If an existing document should be updated its given
     * here.
     *
     * @param userContext - Contains meta information about currently acting
     * user.
     * @param _securitySettings - Database security settings.
     * @param allowedModelRolesMapping - Allowed roles for given models.
     *
     * @param idPropertyName - Property name indicating the id field name.
     * @param typePropertyName - Property name indicating to which model a
     * document belongs to.
     * @param designDocumentNamePrefix - Document name prefix indicating a
     * design document.
     *
     * @param read - Indicates whether a read or write of given document should
     * be authorized or not.
     *
     * @returns Throws an exception if authorisation is not accepted and "true"
     * otherwise.
     */
    static authenticate(
        this:void,
        newDocument:Partial<Document>,
        oldDocument:null|Partial<Document> = null,
        userContext:Partial<UserContext> = {},
        _securitySettings:Partial<SecuritySettings> = {
            admins: {names: [], roles: []}, members: {names: [], roles: []}
        },
        allowedModelRolesMapping?:AllowedModelRolesMapping,
        idPropertyName = '_id',
        typePropertyName = '-type',
        designDocumentNamePrefix = '_design/',
        read = false
    ):true {
        const type:string|undefined =
            newDocument[typePropertyName] as string ??
            (oldDocument && oldDocument[typePropertyName]) as string
        /*
            NOTE: Special documents and change sequences are not checked
            further since their is no specified model.
            If non special document given but missing type property further
            validation will complain.
        */
        if (!type)
            return true

        const operationType:'read'|'write' = read ? 'read': 'write'

        // Define roles who are allowed to read and write everything.
        const allowedRoles:NormalizedAllowedModelRoles = {
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

        let userRolesDescription = `Current user doesn't own any role`

        if (userContext) {
            if (!('name' in userContext))
                userContext.name = '"unknown"'

            if (userContext.roles?.length) {
                // region determine model specific allowed roles
                if (
                    allowedModelRolesMapping &&
                    type &&
                    Object.prototype.hasOwnProperty.call(
                        allowedModelRolesMapping, type
                    )
                ) {
                    const allowedModelRoles:NormalizedAllowedModelRoles =
                        allowedModelRolesMapping[type]

                    for (const operation of ['read', 'write'] as const)
                        allowedRoles[operation] =
                            allowedRoles[operation].concat(
                                allowedModelRoles[operation] || []
                            )

                    allowedRoles.properties = allowedModelRoles.properties
                }
                // endregion
                // TODO check for each property recursively
                const relevantRoles:Array<string> = allowedRoles[operationType]
                for (const userRole of userContext.roles)
                    if (relevantRoles.includes(userRole))
                        return true

                userRolesDescription = `Current user "${userContext.name!}" ` +
                    `owns the following roles: "` +
                    `${userContext.roles.join('", "')}"`
                //
            } else
                userRolesDescription =
                    `Current user "${userContext.name!}" doesn't own any role`
        }

        /* eslint-disable no-throw-literal */
        throw {
            unauthorized:
                'Only users with a least on of these roles are allowed to ' +
                `perform requested ${operationType} action: "` +
                ([] as Array<string>)
                    .concat(allowedRoles[operationType])
                    .join('", "') +
                `". ${userRolesDescription}.`
        }
        /* eslint-enable no-throw-literal */
    }
    /**
     * Represents a design document validation function for given model
     * specification.
     * @param newDocument - Updated document.
     * @param oldDocument - If an existing document should be updated its given
     * here.
     * @param userContext - Contains meta information about currently acting
     * user.
     * @param securitySettings - Database security settings.
     * @param modelConfiguration - Model configuration object.
     * @param models - Models specification object.
     * @param toJSON - JSON stringifier.
     *
     * @returns Modified given new document.
     */
    static validateDocumentUpdate<
        ObjectType extends object = object,
        AttachmentType extends Attachment = Attachment,
        AdditionalSpecifications extends object = Mapping<unknown>,
        AdditionalPropertiesType = unknown
    >(
        this:void,
        newDocument:PartialFullDocument<ObjectType, AdditionalPropertiesType>,
        oldDocument:(
            null|PartialFullDocument<ObjectType, AdditionalPropertiesType>
        ),
        userContext:Partial<UserContext>,
        securitySettings:Partial<SecuritySettings>,
        modelConfiguration:BaseModelConfiguration<
            ObjectType, AdditionalSpecifications
        >,
        models:Models<
            ObjectType,
            AttachmentType,
            AdditionalSpecifications,
            AdditionalPropertiesType
        > = {},
        toJSON?:(value:unknown) => string
    ):PartialFullDocument<ObjectType, AdditionalPropertiesType> {
        type Attachments = Mapping<AttachmentType>

        type PartialFullDocumentType = PartialFullDocument<
            ObjectType, AdditionalPropertiesType
        >

        type PropertyName = keyof PartialFullDocumentType
        type PropertyValue =
            AdditionalPropertiesType|AttachmentType|ValueOf<ObjectType>

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
            message:string,
            type = 'forbidden',
            additionalErrorData:Partial<DataType> = {} as Partial<DataType>
        ):never => {
            // eslint-disable-next-line no-throw-literal
            throw {
                [type]: message,
                message,
                name: type,
                ...additionalErrorData
            }
        }

        const now = new Date()
        const nowUTCTimestamp:number = Date.UTC(
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
                newDocument[idName]! :
                ''
            revision = Object.prototype.hasOwnProperty.call(
                newDocument, revisionName
            ) ?
                newDocument[revisionName]! :
                ''
        }
        setDocumentEnvironment()

        /*
            NOTE: Needed if we are able to validate users table.

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

        if (['latest', 'upsert'].includes(revision))
            if (
                oldDocument &&
                Object.prototype.hasOwnProperty.call(oldDocument, revisionName)
            )
                revision =
                    newDocument[revisionName] =
                    oldDocument[revisionName]!
            else if (revision === 'latest')
                throwError('Revision: No old document available to update.')
            else
                delete (newDocument as Partial<Document>)[revisionName]

        let updateStrategy = modelConfiguration.updateStrategy
        if (Object.prototype.hasOwnProperty.call(
            newDocument, specialNames.strategy
        )) {
            updateStrategy = newDocument[specialNames.strategy]!
            delete newDocument[specialNames.strategy]
        }
        /// region collect old model types to migrate.
        const oldModelMapping:Mapping = {}
        if (updateStrategy === 'migrate')
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
        // endregion
        let serializeData:(value:unknown) => string
        if (toJSON)
            serializeData = toJSON
        else if (
            JSON && Object.prototype.hasOwnProperty.call(JSON, 'stringify')
        )
            serializeData =
                (object:unknown):string => JSON.stringify(object, null, 4)
        else
            throwError('Needed "serializer" is not available.')

        const specialPropertyNames:Array<keyof BaseModelType> = [
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
            specialNames.update.expression
        ]
        // region functions
        /// region generic functions
        const serialize = (value:unknown):string =>
            value instanceof Error ?
                `${value as unknown as string}` :
                serializeData(value)

        const determineTrimmedString = (value?:null|string):string => {
            if (typeof value === 'string')
                return value.trim()

            return ''
        }

        const normalizeDateTime = (
            value:DateRepresentationType
        ):null|number|string => {
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
                        value as Date|string
                )
                try {
                    // Use ISO 8601 format to save date as string.
                    value = value.toISOString()
                } catch (error) {
                    // Ignore exception.
                }
            }

            return value as null|number|string
        }

        const fileNameMatchesModelType = (
            typeName:string,
            fileName:string,
            fileType:FileSpecification<
                AttachmentType, AdditionalSpecifications
            >
        ):boolean => {
            if (fileType.fileName) {
                if (fileType.fileName.value)
                    return fileType.fileName.value === fileName

                if (fileType.fileName.regularExpressionPattern)
                    return ([] as Array<RegExp|string>)
                        .concat(fileType.fileName.regularExpressionPattern)
                        .some((pattern) =>
                            new RegExp(pattern).test(fileName)
                        )
            }

            return typeName === fileName
        }

        const getFileNameByPrefix = (
            prefix?:string, attachments?:Attachments
        ):null|string => {
            if (!attachments)
                attachments =
                    newDocument[specialNames.attachment] as Attachments

            if (prefix) {
                for (const name of Object.keys(attachments))
                    if (name.startsWith(prefix))
                        return name
            } else {
                const keys:Array<string> = Object.keys(attachments)
                if (keys.length)
                    return keys[0]
            }

            return null
        }

        const attachmentWithPrefixExists = (namePrefix:string):boolean => {
            if (Object.prototype.hasOwnProperty.call(
                newDocument, specialNames.attachment
            )) {
                const attachments =
                    newDocument[specialNames.attachment] as Attachments
                const name:null|string = getFileNameByPrefix(namePrefix)

                if (name)
                    return (
                        Object.prototype.hasOwnProperty.call(
                            attachments[name], 'stub'
                        ) &&
                        (attachments[name] as StubAttachment).stub ||
                        Object.prototype.hasOwnProperty.call(
                            attachments[name], 'data'
                        ) &&
                        ![null, undefined].includes(
                            (attachments[name] as FullAttachment).data as
                                unknown as
                                null
                        )
                    )
            }

            return false
        }

        const evaluate = <Type, Scope>(
            givenExpression?:null|string,
            isEvaluation = false,
            givenScope = {} as Scope
        ):(
            EvaluationResult<
                ObjectType,
                Type|undefined,
                PropertyName,
                AttachmentType,
                AdditionalSpecifications,
                AdditionalPropertiesType,
                typeof basicScope &
                {code:string} &
                Scope
            > |
            void
        ) => {
            type CurrentScope = typeof basicScope & {code:string} & Scope

            const expression = determineTrimmedString(givenExpression)
            if (expression) {
                const code = (isEvaluation ? 'return ' : '') + expression
                // region determine scope
                const scope = {
                    ...basicScope,
                    code,
                    ...givenScope
                } as CurrentScope
                const scopeNames:Array<string> = Object.keys(scope)
                // endregion
                // region compile
                let templateFunction:(
                    Evaluate<Type|undefined, Array<unknown>>|undefined
                )

                try {
                    /* eslint-disable @typescript-eslint/no-implied-eval */
                    templateFunction = new Function(...scopeNames, code) as
                        Evaluate<Type|undefined, Array<unknown>>
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
                const result:EvaluationResult<
                    ObjectType,
                    Type|undefined,
                    PropertyName,
                    AttachmentType,
                    AdditionalSpecifications,
                    AdditionalPropertiesType,
                    CurrentScope
                > = {code, result: undefined, scope}

                try {
                    result.result = templateFunction!(
                        ...scopeNames.map((name:string):unknown =>
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
        }
        /// endregion
        const checkDocument = (
            newDocument:PartialFullDocumentType,
            oldDocument:null|PartialFullDocumentType,
            parentNames:Array<string> = []
        ):CheckedDocumentResult<ObjectType, AdditionalPropertiesType> => {
            const pathDescription =
                parentNames.length ? ` in ${parentNames.join(' -> ')}` : ''
            let changedPath:Array<string> = []

            const checkModelType = () => {
                // region check for model type (optionally migrate them)
                if (!Object.prototype.hasOwnProperty.call(
                    newDocument, typeName
                ))
                    if (
                        oldDocument &&
                        Object.prototype.hasOwnProperty.call(
                            oldDocument, typeName
                        ) &&
                        ['fillUp', 'migrate'].includes(updateStrategy)
                    )
                        newDocument[typeName] = oldDocument[typeName]
                    else
                        throwError(
                            'Type: You have to specify a model type via ' +
                            `property "${typeName}"${pathDescription}.`
                        )
                if (!(
                    parentNames.length ||
                    (new RegExp(
                        modelConfiguration.property.name
                            .typeRegularExpressionPattern.public
                    )).test(newDocument[typeName] as string)
                ))
                    throwError(
                        'TypeName: You have to specify a model type which ' +
                        'matches "' +
                        modelConfiguration.property.name
                            .typeRegularExpressionPattern.public +
                        `" as public type (given "` +
                        `${newDocument[typeName] as string}")` +
                        `${pathDescription}.`
                    )
                if (!Object.prototype.hasOwnProperty.call(
                    models, newDocument[typeName] as string
                ))
                    if (Object.prototype.hasOwnProperty.call(
                        oldModelMapping, newDocument[typeName] as string
                    ))
                        newDocument[typeName] =
                            oldModelMapping[newDocument[typeName] as string]
                    else
                        throwError(
                            'Model: Given model "' +
                            `${newDocument[typeName] as string}" is not ` +
                            `specified${pathDescription}.`
                        )
                // endregion
            }
            checkModelType()

            let modelName = newDocument[typeName] as string
            const model:ModelType = models[modelName]
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
                newValue:Type,
                name:string,
                propertySpecification:PropertySpecification<
                    Type, AdditionalSpecifications
                >,
                oldValue?:Type,
                types:Array<ConstraintKey> = [
                    'constraintExecution', 'constraintExpression'
                ]
            ) => {
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
                                boolean|undefined,
                                PropertyValue,
                                AttachmentType,
                                AdditionalSpecifications,
                                AdditionalPropertiesType,
                                Scope
                            > |
                            void
                        ) = undefined
                        try {
                            result = evaluate<boolean, Scope>(
                                propertySpecification[type]!.evaluation,
                                type.endsWith('Expression'),
                                {
                                    checkPropertyContent,

                                    model,
                                    modelName,
                                    name,
                                    type,

                                    newDocument,
                                    newValue,
                                    oldDocument,
                                    oldValue,

                                    parentNames,
                                    pathDescription,

                                    propertySpecification
                                }
                            )
                        } catch (error) {
                            if (((
                                error:unknown
                            ):error is DatabaseError & EvaluationErrorData =>
                                Object.prototype.hasOwnProperty.call(
                                    error, 'compilation'
                                )
                            )(error))
                                throwError(
                                    `Compilation: Hook "${type}" has invalid` +
                                    ` code "${error.code}": "` +
                                    `${error.message!}"${pathDescription}.`
                                )

                            if (((
                                error:unknown
                            ):error is DatabaseError & EvaluationErrorData =>
                                Object.prototype.hasOwnProperty.call(
                                    error, 'runtime'
                                )
                            )(error))
                                throwError(
                                    `Runtime: Hook "${type}" has throw an ` +
                                    `error with code "${error.code}": "` +
                                    `${error.message!}"${pathDescription}.`
                                )

                            if (!Object.prototype.hasOwnProperty.call(
                                error, 'empty'
                            ))
                                throw error
                        }

                        if (result && !result.result) {
                            const description = determineTrimmedString(
                                propertySpecification[type]!.description
                            )

                            throwError(
                                type.charAt(0).toUpperCase() +
                                `${type.substring(1)}: ` +
                                (description ?
                                    /*
                                        eslint-disable
                                        @typescript-eslint/no-implied-eval
                                    */
                                    new Function(
                                        ...Object.keys(result.scope),
                                        `return ${description}`
                                    )(...Object.values(result.scope) as
                                        Array<unknown>
                                    ) as string :
                                    `Property "${String(name)}" should ` +
                                    `satisfy constraint "${result.code}" (` +
                                    `given "${serialize(newValue)}")` +
                                    `${pathDescription}.`
                                    /*
                                        eslint-enable
                                        @typescript-eslint/no-implied-eval
                                    */
                                )
                            )
                        }
                    }
            }
            const checkPropertyContent = <Type extends PropertyValue>(
                newValue:Type,
                name:string,
                propertySpecification:PropertySpecification<
                    Type, AdditionalSpecifications
                >,
                oldValue?:Type
            ):CheckedPropertyResult<Type> => {
                let changedPath:Array<string> = []
                // region type
                const types = ([] as Array<TypeNames>).concat(
                    propertySpecification.type ?
                        propertySpecification.type :
                        []
                )
                // Derive nested missing explicit type definition if possible.
                if (
                    typeof newValue === 'object' &&
                    Object.getPrototypeOf(newValue) === Object.prototype &&
                    !Object.prototype.hasOwnProperty.call(
                        newValue, typeName
                    ) &&
                    types.length === 1 &&
                    Object.prototype.hasOwnProperty.call(models, types[0])
                )
                    (newValue as PartialFullDocumentType)[typeName] = types[0]
                let typeMatched = false
                for (const type of types)
                    if (Object.prototype.hasOwnProperty.call(models, type)) {
                        if (
                            typeof newValue === 'object' &&
                            Object.getPrototypeOf(newValue) ===
                                Object.prototype &&
                            Object.prototype.hasOwnProperty.call(
                                newValue, typeName
                            ) &&
                            (newValue as PartialFullDocumentType)[typeName] !==
                                type &&
                            updateStrategy === 'migrate' &&
                            types.length === 1
                        ) {
                            /*
                                Derive nested (object based) maybe compatible
                                type definition. Nested types have to be
                                checked than.
                            */
                            (newValue as PartialFullDocumentType)[typeName] =
                                type
                            changedPath = parentNames.concat(
                                String(name), 'migrate nested object type')
                        }
                        if (
                            typeof newValue === 'object' &&
                            Object.getPrototypeOf(newValue) ===
                                Object.prototype &&
                            Object.prototype.hasOwnProperty.call(
                                newValue, typeName
                            ) &&
                            (newValue as PartialFullDocumentType)[typeName] ===
                                type
                        ) {
                            const result = checkDocument(
                                newValue as PartialFullDocumentType,
                                oldValue as null|PartialFullDocumentType,
                                parentNames.concat(String(name))
                            )
                            if (result.changedPath.length)
                                changedPath = result.changedPath
                            newValue = result.newDocument as Type
                            if (serialize(newValue) === serialize({}))
                                return {newValue: null, changedPath}

                            typeMatched = true
                            break
                        } else if (types.length === 1)
                            throwError(
                                `NestedType: Under key "${String(name)}" ` +
                                `isn't of type "${type}" (given "` +
                                `${serialize(newValue)}" of type ` +
                                `${typeof newValue})${pathDescription}.`
                            )
                    } else if (type === 'DateTime') {
                        const initialNewValue:unknown = newValue

                        newValue = normalizeDateTime(
                            newValue as DateRepresentationType
                        ) as Type

                        if (
                            saveDateTimeAsNumber &&
                            (
                                typeof newValue !== 'number' ||
                                isNaN(newValue)
                            ) ||
                            !saveDateTimeAsNumber &&
                            typeof newValue !== 'string'
                        ) {
                            if (types.length === 1)
                                throwError(
                                    `PropertyType: Property "${String(name)}"` +
                                    `isn't of (valid) type "DateTime" (given` +
                                    '"' +
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
                    } else if ([
                        'boolean', 'integer', 'number', 'string'
                    ].includes(type))
                        if (
                            typeof newValue === 'number' &&
                            isNaN(newValue) ||
                            !(
                                type === 'integer' || typeof newValue === type
                            ) ||
                            type === 'integer' &&
                            parseInt(newValue as string, 10) !== newValue
                        ) {
                            if (types.length === 1)
                                throwError(
                                    `PropertyType: Property "${String(name)}"` +
                                    ` isn't of (valid) type "${type}" (given` +
                                    ` "${serialize(newValue)}" of type "` +
                                    `${typeof newValue}")${pathDescription}.`
                                )
                        } else {
                            typeMatched = true
                            break
                        }
                    else if (
                        typeof type === 'string' &&
                        type.startsWith('foreignKey:')
                    ) {
                        const foreignKeyType:string =
                            models[type.substring('foreignKey:'.length)][
                                idName
                            ].type as string
                        if (foreignKeyType === typeof newValue) {
                            typeMatched = true
                            break
                        } else if (types.length === 1)
                            throwError(
                                `PropertyType: Foreign key ` +
                                `property "${String(name)}" isn't of type ` +
                                `"${foreignKeyType}" (given ` +
                                `"${serialize(newValue)}" of type "` +
                                `${typeof newValue}")${pathDescription}.`
                            )
                    } else if (
                        type === 'any' ||
                        serialize(newValue) === serialize(type)
                    ) {
                        typeMatched = true
                        break
                    } else if (types.length === 1)
                        throwError(
                            `PropertyType: Property "` +
                            `${String(name)}" isn't value "${type}" (given "` +
                            serialize(newValue)
                                .replace(/^"/, '')
                                .replace(/"$/, '') +
                            `" of type "${typeof newValue}")` +
                            `${pathDescription}.`
                        )
                if (!typeMatched)
                    throwError(
                        'PropertyType: None of the specified types "' +
                        `${types.join('", "')}" for property "` +
                        `${String(name)}" matches value "` +
                        serialize(newValue)
                            .replace(/^"/, '')
                            .replace(/"$/, '') +
                        `${newValue as string}" of type "${typeof newValue}"` +
                        `)${pathDescription}.`
                    )
                // endregion
                // region range
                if (typeof newValue === 'string') {
                    if (
                        typeof propertySpecification.minimumLength ===
                            'number' &&
                        newValue.length < propertySpecification.minimumLength
                    )
                        throwError(
                            `MinimalLength: Property "` +
                            `${String(name)}" must have minimal length ` +
                            (propertySpecification.minimumLength as
                                unknown as
                                string
                            ) +
                            ` (given ${newValue as string} with length ` +
                            `i${(newValue as string).length}) ` +
                            `${pathDescription}.`
                        )
                    if (
                        typeof propertySpecification.maximumLength ===
                            'number' &&
                        newValue.length > propertySpecification.maximumLength
                    )
                        throwError(
                            `MaximalLength: Property "` +
                            `${String(name)}" must have maximal length ` +
                            (
                                propertySpecification.maximumLength as
                                    unknown as
                                    string
                            ) +
                            ` (given ${newValue as string} with length ` +
                            `${(newValue as string).length})` +
                            `${pathDescription}.`
                        )
                }
                if (typeof newValue === 'number') {
                    if (
                        typeof propertySpecification.minimum === 'number' &&
                        newValue < propertySpecification.minimum
                    )
                        throwError(
                            `Minimum: Property "${String(name)}" (type ` +
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
                            `Maximum: Property "${String(name)}" (type ` +
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
                                (value:unknown):unknown =>
                                    (value as SelectionMapping)?.value ===
                                        undefined ?
                                        value :
                                        (value as SelectionMapping).value
                            ) :
                            Object.keys(propertySpecification.selection)

                    if (propertySpecification.type === 'DateTime')
                        selection =
                            (selection as Array<Date|null|number|string>)
                                .map(normalizeDateTime)

                    if (!selection.includes(newValue))
                        throwError(
                            `Selection: Property "${String(name)}" (type ` +
                            `${propertySpecification.type as string}) ` +
                            `should be one of "${selection.join('", "')}". ` +
                            `But is "${newValue as string}"${pathDescription}.`
                        )
                }
                // endregion
                // region pattern
                if (propertySpecification.regularExpressionPattern) {
                    const patterns = (
                        [] as Array<RegExp | string>
                    ).concat(propertySpecification.regularExpressionPattern)
                    let matched = false
                    for (const pattern of patterns)
                        if (new RegExp(pattern).test(newValue as string)) {
                            matched = true
                            break
                        }
                    if (!matched)
                        throwError(
                            `PatternMatch: Property "${String(name)}" should ` +
                            'match one regular expression pattern ' +
                            `"${patterns.join('", "')}" (given ` +
                            `"${newValue as string}")${pathDescription}.`
                        )
                }
                if (propertySpecification.invertedRegularExpressionPattern)
                    for (const pattern of (
                        [] as Array<RegExp|string>
                    ).concat(
                        propertySpecification.invertedRegularExpressionPattern
                    ))
                        if (new RegExp(pattern).test(newValue as string))
                            throwError(
                                'InvertedPatternMatch: Property ' +
                                `"${String(name)}" should not match regular ` +
                                `expression pattern ${pattern} (given ` +
                                `"${newValue as string}")${pathDescription}.`
                            )
                // endregion
                checkPropertyConstraints<Type>(
                    newValue, name, propertySpecification, oldValue
                )

                if (serialize(newValue) !== serialize(oldValue))
                    changedPath =
                        parentNames.concat(String(name), 'value updated')

                return {newValue, changedPath}
            }
            const checkPropertyWriteableMutableNullable = <
                Type extends PropertyValue
            >(
                    propertySpecification:PropertySpecification<
                        Type, AdditionalSpecifications
                    >,
                    newDocument:PartialFullDocumentType,
                    oldDocument:null|PartialFullDocumentType,
                    name:PropertyName,
                    pathDescription:string
                ):boolean => {
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
                                updateStrategy === 'incremental'
                            )
                                delete newDocument[name]

                            return true
                        } else
                            throwError(
                                `Readonly: Property "` +
                                `${String(name)}" is not writable (old ` +
                                `document "${serialize(oldDocument)}")` +
                                `${pathDescription}.`
                            )
                    else
                        throwError(
                            `Readonly: Property "${String(name)}" `+
                            `is not writable${pathDescription}.`
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
                            updateStrategy === 'incremental' &&
                            !modelConfiguration.property.name.reserved.concat(
                                specialNames.deleted, idName, revisionName
                            ).includes(String(name))
                        )
                            delete newDocument[name]

                        return true
                    } else if (updateStrategy !== 'migrate')
                        throwError(
                            `Immutable: Property "${String(name)}"` +
                            `is not writable (old document "` +
                            `${serialize(oldDocument)}")${pathDescription}.`
                        )
                // endregion
                // region nullable
                if (value === null)
                    if (propertySpecification.nullable) {
                        delete newDocument[name]

                        if (
                            oldDocument &&
                            Object.prototype.hasOwnProperty.call(
                                oldDocument, name
                            )
                        )
                            changedPath = parentNames.concat(
                                String(name), 'delete property'
                            )

                        return true
                    } else
                        throwError(
                            `NotNull: Property "${String(name)}" ` +
                            `should not be "null"${pathDescription}.`
                        )
                // endregion
                return false
            }
            /// region create hook
            const runCreatePropertyHook = <Type extends PropertyValue>(
                propertySpecification:PropertySpecification<
                    Type, AdditionalSpecifications
                >,
                newDocument:PartialFullDocumentType,
                oldDocument:null|PartialFullDocumentType,
                name:(keyof Attachments)|(keyof PartialFullDocumentType),
                attachmentsTarget?:Attachments
            ) => {
                if (!oldDocument)
                    for (const type of [
                        'onCreateExecution', 'onCreateExpression'
                    ] as const)
                        if (Object.prototype.hasOwnProperty.call(
                            propertySpecification, type
                        )) {
                            type Scope = PropertyScope<
                                ObjectType,
                                null|Type|undefined,
                                PropertyValue,
                                AttachmentType,
                                AdditionalSpecifications,
                                AdditionalPropertiesType
                            >

                            let result:(
                                EvaluationResult<
                                    PartialFullDocumentType,
                                    null|Type|undefined,
                                    PropertyValue,
                                    AttachmentType,
                                    AdditionalSpecifications,
                                    AdditionalPropertiesType,
                                    Scope
                                > |
                                void
                            ) = undefined

                            try {
                                result = evaluate<null|Type|undefined, Scope>(
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

                                        propertySpecification
                                    }
                                )
                            } catch (error) {
                                if (((
                                    error:unknown
                                ):error is EvaluationError =>
                                    Object.prototype.hasOwnProperty.call(
                                        error, 'compilation'
                                    )
                                )(error))
                                    throwError(
                                        `Compilation: Hook "${type}" has ` +
                                        `invalid code "${error.code}" for ` +
                                        `property "${String(name)}": ` +
                                        `${error.message!}${pathDescription}.`
                                    )

                                if (((
                                    error:unknown
                                ):error is EvaluationError =>
                                    Object.prototype.hasOwnProperty.call(
                                        error, 'runtime'
                                    )
                                )(error))
                                    throwError(
                                        `Runtime: Hook "${type}" has throw ` +
                                        `an error with code "${error.code}" ` +
                                        `for property "${String(name)}": ` +
                                        `${error.message!}${pathDescription}.`
                                    )

                                if (!Object.prototype.hasOwnProperty.call(
                                    error, 'empty'
                                ))
                                    throw error
                            }

                            if (
                                result &&
                                ![null, undefined].includes(
                                    result.result as null
                                )
                            )
                                if (attachmentsTarget)
                                    attachmentsTarget[
                                        name as keyof Attachments
                                    ] = result.result as
                                        unknown as
                                        AttachmentType
                                else
                                    (newDocument[name] as Type) =
                                        result.result!
                        }
            }
            /// endregion
            /// region update hook
            const runUpdatePropertyHook = <Type extends PropertyValue>(
                propertySpecification:PropertySpecification<
                    Type, AdditionalSpecifications
                >,
                newDocument:PartialFullDocumentType,
                oldDocument:null|PartialFullDocumentType,
                name:(keyof Attachments)|(keyof PartialFullDocumentType),
                attachmentsTarget?:Attachments
            ) => {
                if (!attachmentsTarget) {
                    if (!Object.prototype.hasOwnProperty.call(
                        newDocument, name
                    ))
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

                                    propertySpecification
                                }
                            )!

                            if (attachmentsTarget)
                                attachmentsTarget[name as keyof Attachments] =
                                    result.result as unknown as AttachmentType
                            else
                                (newDocument[name] as Type) = result.result!
                        } catch (error) {
                            if (((
                                error:unknown
                            ):error is EvaluationError =>
                                Object.prototype.hasOwnProperty.call(
                                    error, 'compilation'
                                )
                            )(error))
                                throwError(
                                    `Compilation: Hook "${type}" has invalid` +
                                    ` code "${error.code}" for property "` +
                                    `${String(name)}": ${error.message!}` +
                                    `${pathDescription}.`
                                )

                            if (((
                                error:unknown
                            ):error is EvaluationError =>
                                Object.prototype.hasOwnProperty.call(
                                    error, 'runtime'
                                )
                            )(error))
                                throwError(
                                    `Runtime: Hook "${type}" has throw an ` +
                                    `error with code "${error.code}" for ` +
                                    `property "${String(name)}": ` +
                                    `${error.message!}${pathDescription}.`
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
                                newDocument, oldName
                            )) {
                                newDocument[name] = newDocument[oldName]
                                delete newDocument[oldName]
                            }
            // endregion
            // region run create document hook
            if (!oldDocument)
                for (const type of [
                    specialNames.create.execution,
                    specialNames.create.expression
                ])
                    if (Object.prototype.hasOwnProperty.call(model, type)) {
                        let result:null|PartialFullDocumentType|undefined
                        try {
                            result = evaluate<
                                null|PartialFullDocumentType|undefined,
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

                                    newDocument,
                                    oldDocument,

                                    parentNames,
                                    pathDescription
                                }
                            )!.result
                        } catch (error) {
                            if (((error:unknown):error is EvaluationError =>
                                Object.prototype.hasOwnProperty.call(
                                    error, 'compilation'
                                )
                            )(error))
                                throwError(
                                    `Compilation: Hook "${type}" has invalid` +
                                    ` code "${error.code}" for document "` +
                                    `${modelName}": ${error.message!}` +
                                    `${pathDescription}.`
                                )

                            if (((error:unknown):error is EvaluationError =>
                                Object.prototype.hasOwnProperty.call(
                                    error, 'runtime'
                                )
                            )(error))
                                throwError(
                                    `Runtime: Hook "${type}" has throw an ` +
                                    `error with code "${error.code}" for ` +
                                    `document "${modelName}": ` +
                                    `${error.message!}${pathDescription}.`
                                )

                            if (!Object.prototype.hasOwnProperty.call(
                                error, 'empty'
                            ))
                                throw error
                        }

                        if (![null, undefined].includes(result as null))
                            newDocument = result!

                        checkModelType()

                        modelName = newDocument[typeName]!

                        if (parentNames.length === 0)
                            setDocumentEnvironment()
                    }
            // endregion
            // region run update document hook
            for (const type of [
                specialNames.update.execution, specialNames.update.expression
            ])
                if (Object.prototype.hasOwnProperty.call(model, type)) {
                    let result:null|PartialFullDocumentType|undefined
                    try {
                        result = evaluate<
                            null|PartialFullDocumentType,
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

                                newDocument,
                                oldDocument,

                                parentNames,
                                pathDescription
                            }
                        )!.result
                    } catch (error) {
                        if (((error:unknown):error is EvaluationError =>
                            Object.prototype.hasOwnProperty.call(
                                error, 'compilation'
                            )
                        )(error))
                            throwError(
                                `Compilation: Hook "${type}" has invalid ` +
                                `code "${error.code}" for document "` +
                                `${modelName}": ${error.message!}` +
                                `${pathDescription}.`
                            )

                        if (((error:unknown):error is EvaluationError =>
                            Object.prototype.hasOwnProperty.call(
                                error, 'runtime'
                            )
                        )(error))
                            throwError(
                                `Runtime: Hook "${type}" has throw an error ` +
                                `with code "${error.code}" for document "` +
                                `${modelName}": ${error.message!}` +
                                `${pathDescription}.`
                            )

                        if (!Object.prototype.hasOwnProperty.call(
                            error, 'empty'
                        ))
                            throw error
                    }

                    if (![undefined, null].includes(result as null))
                        newDocument = result!

                    checkModelType()

                    modelName = newDocument[typeName]!

                    if (parentNames.length === 0)
                        setDocumentEnvironment()
                }
            // endregion
            const additionalPropertyNames = additionalPropertySpecification ?
                (Object.keys(newDocument) as
                    Array<keyof ObjectType>
                ).filter((name:keyof ObjectType):boolean =>
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
                        if (
                            !Object.prototype.hasOwnProperty.call(
                                newDocument, name
                            ) ||
                            newDocument[specialNames.attachment] === null
                        )
                            newDocument[specialNames.attachment] = {}

                        if (
                            oldDocument &&
                            !Object.prototype.hasOwnProperty.call(
                                oldDocument, name
                            )
                        )
                            oldDocument[specialNames.attachment] = {}

                        const newFileNames:Array<keyof Attachments> =
                            Object.keys(newDocument[specialNames.attachment]!)
                                .filter((fileName:string):boolean =>
                                    ((
                                        newDocument[specialNames.attachment]
                                    )![fileName] as FullAttachment).data !==
                                        null &&
                                    fileNameMatchesModelType(
                                        type,
                                        fileName,
                                        property as FileSpecification<
                                            AttachmentType,
                                            AdditionalSpecifications
                                        >
                                    )
                                )

                        const newAttachments =
                            newDocument[specialNames.attachment] as Attachments

                        let oldFileNames:Array<string> = []
                        if (oldDocument) {
                            const oldAttachments =
                                oldDocument[name] as Attachments
                            oldFileNames = Object.keys(oldAttachments)
                                .filter((fileName:string):boolean =>
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
                                        (oldAttachments[fileName] as
                                            StubAttachment
                                        ).stub &&
                                        Boolean((oldAttachments[fileName] as
                                            StubAttachment
                                        ).digest)
                                    ) &&
                                    Boolean(fileNameMatchesModelType(
                                        type,
                                        fileName,
                                        property as FileSpecification<
                                            AttachmentType,
                                            AdditionalSpecifications
                                        >
                                    ))
                                )
                        }

                        const propertySpecification = property as
                            PropertySpecification<
                                AttachmentType, AdditionalSpecifications
                            >

                        for (const fileName of newFileNames)
                            runCreatePropertyHook<AttachmentType>(
                                propertySpecification,
                                newDocument,
                                oldDocument && oldDocument[name] ?
                                    oldDocument[name]! :
                                    null,
                                fileName,
                                newAttachments
                            )

                        for (const fileName of newFileNames)
                            runUpdatePropertyHook<AttachmentType>(
                                propertySpecification,
                                newDocument,
                                oldDocument && oldDocument[name] ?
                                    oldDocument[name]! :
                                    null,
                                fileName,
                                newAttachments
                            )

                        if (
                            typeof propertySpecification.default ===
                                'undefined'
                        ) {
                            if (!(
                                propertySpecification.nullable ||
                                newFileNames.length > 0 ||
                                oldFileNames.length > 0
                            ))
                                throwError(
                                    'AttachmentMissing: Missing attachment ' +
                                    `for type "${type}"${pathDescription}.`
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
                                        newAttachments[fileName] = ((
                                            oldDocument
                                        )![name] as Attachments)[fileName]
                        } else if (newFileNames.length === 0)
                            if (oldFileNames.length === 0) {
                                for (
                                    const fileName in
                                        propertySpecification.default as
                                            unknown as
                                            object
                                )
                                    if (Object.prototype.hasOwnProperty.call(
                                        propertySpecification.default as
                                            unknown as
                                            object,
                                        fileName
                                    )) {
                                        newAttachments[fileName] = (
                                            propertySpecification.default as
                                                unknown as
                                                Attachments
                                        )[fileName]
                                        changedPath = parentNames.concat(
                                            name, type, 'add default file'
                                        )
                                    }
                            } else if (updateStrategy === 'fillUp')
                                for (const fileName of oldFileNames)
                                    newAttachments[fileName] = ((
                                        oldDocument
                                    )![name] as Attachments)[fileName]
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

                    runCreatePropertyHook<ValueOf<ObjectType>>(
                        propertySpecification, newDocument, oldDocument, name
                    )
                    runUpdatePropertyHook<ValueOf<ObjectType>>(
                        propertySpecification, newDocument, oldDocument, name
                    )

                    if ([null, undefined].includes(
                        propertySpecification.default as null
                    )) {
                        if (!(
                            propertySpecification.nullable ||
                            (
                                Object.prototype.hasOwnProperty.call(
                                    newDocument, name
                                ) ||
                                oldDocument &&
                                Object.prototype.hasOwnProperty.call(
                                    oldDocument, name
                                ) &&
                                updateStrategy
                            )
                        ))
                            throwError(
                                `MissingProperty: Missing property ` +
                                `"${String(name)}"${pathDescription}.`
                            )

                        if (
                            !Object.prototype.hasOwnProperty.call(
                                newDocument, name
                            ) &&
                            oldDocument &&
                            Object.prototype.hasOwnProperty.call(
                                oldDocument, name
                            )
                        )
                            if (updateStrategy === 'fillUp')
                                newDocument[name] = oldDocument[name]
                            else if (!updateStrategy)
                                changedPath = parentNames.concat(
                                    String(name), 'property removed'
                                )
                    } else if (
                        !Object.prototype.hasOwnProperty.call(
                            newDocument, name
                        ) ||
                        newDocument[name] === null
                    )
                        if (
                            oldDocument &&
                            Object.prototype.hasOwnProperty.call(
                                oldDocument, name
                            )
                        ) {
                            if (updateStrategy === 'fillUp')
                                newDocument[name] = oldDocument[name]
                            else if (updateStrategy === 'migrate') {
                                newDocument[name] =
                                    propertySpecification.default as
                                        typeof newDocument[keyof ObjectType]
                                changedPath = parentNames.concat(
                                    String(name), 'migrate default value'
                                )
                            }
                        } else {
                            newDocument[name] =
                                propertySpecification.default as
                                    typeof newDocument[keyof ObjectType]
                            changedPath = changedPath.concat(
                                String(name), 'add default value'
                            )
                        }
                }
                // endregion
            // region check given data
            /// region remove new data which already exists
            if (oldDocument && updateStrategy === 'incremental')
                for (const [name, value] of Object.entries(newDocument))
                    if (
                        Object.prototype.hasOwnProperty.call(
                            oldDocument, name
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
                            oldDocument[name] === value ||
                            serialize(oldDocument[name]) === serialize(value)
                        )
                    )
                        delete newDocument[name]
            /// endregion
            for (const [name, newValue] of (
                Object.entries(newDocument) as
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
                        specialNames.strategy
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
                        >) = additionalPropertySpecification!
                    else if (updateStrategy === 'migrate') {
                        delete newDocument[name]

                        changedPath = parentNames.concat(
                            String(name), 'migrate removed property'
                        )

                        continue
                    } else
                        throwError(
                            `Property: Given property "${String(name)}" ` +
                            `isn't specified in model "${modelName}"` +
                            `${pathDescription}.`
                        )

                    // NOTE: Only needed to avoid type check errors.
                    if (!propertySpecification)
                        continue

                    // region check writable/mutable/nullable
                    if (specialNames.attachment === name) {
                        const attachments =
                            newValue as Attachments

                        for (const fileName in attachments)
                            if (Object.prototype.hasOwnProperty.call(
                                attachments, fileName
                            ))
                                for (const type in model[name])
                                    if (fileNameMatchesModelType(
                                        type,
                                        fileName,
                                        model[specialNames.attachment]![type]
                                    )) {
                                        checkPropertyWriteableMutableNullable<
                                            AttachmentType
                                        >(
                                            model[specialNames.attachment]![
                                                type
                                            ],
                                            newDocument,
                                            oldDocument,
                                            fileName,
                                            pathDescription
                                        )

                                        break
                                    }

                        continue
                    } else if (checkPropertyWriteableMutableNullable<
                        AdditionalPropertiesType|ValueOf<ObjectType>
                    >(
                        propertySpecification as PropertySpecification<
                            AdditionalPropertiesType, AdditionalSpecifications
                        >,
                        newDocument,
                        oldDocument,
                        name,
                        pathDescription
                    ))
                        continue
                    // endregion
                    if (
                        typeof propertySpecification.type === 'string' &&
                        propertySpecification.type.endsWith('[]') ||
                        Array.isArray(propertySpecification.type) &&
                        propertySpecification.type.length &&
                        Array.isArray(propertySpecification.type[0])
                    ) {
                        const newProperty = newValue as Array<DocumentContent>
                        // region check arrays
                        if (!Array.isArray(newProperty))
                            throwError(
                                `PropertyType: Property "${String(name)}" ` +
                                `isn't of type "array -> ` +
                                `${propertySpecification.type as string}" ` +
                                `(given "${serialize(newProperty)}")` +
                                `${pathDescription}.`
                            )
                        else if (
                            typeof propertySpecification.minimumNumber ===
                                'number' &&
                            (newProperty).length <
                                propertySpecification.minimumNumber
                        )
                            throwError(
                                `MinimumArrayLength: Property ` +
                                `"${String(name)}" (array of length ` +
                                `${newProperty.length}) doesn't fullfill ` +
                                `minimum array length of ` +
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
                                `MaximumArrayLength: Property ` +
                                `"${String(name)}" (array of length ` +
                                `${newProperty.length}) doesn't fullfill ` +
                                `maximum array length of ` +
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
                                AdditionalPropertiesType,
                                AdditionalSpecifications
                            >,
                            oldDocument &&
                            Object.prototype.hasOwnProperty.call(
                                oldDocument, name
                            ) &&
                            oldDocument[name] ||
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
                                if (key === 'type')
                                    if (Array.isArray(propertySpecification[
                                        key
                                    ]))
                                        propertySpecificationCopy[key] = (
                                            propertySpecification[key] as
                                                Array<string>
                                        )[0]
                                    else
                                        propertySpecificationCopy[key] = [(
                                            propertySpecification[key] as
                                                string
                                        ).substring(
                                            0,
                                            propertySpecification.type
                                                .length -
                                                '[]'.length
                                        )]
                                else
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
                            propertySpecificationCopy.type?.length === 1 &&
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
                                `${index + 1}. value in ${String(name)}`,
                                propertySpecificationCopy
                            ).newValue as DocumentContent
                            if (value === null)
                                newProperty.splice(index, 1)

                            index += 1
                        }
                        //// endregion
                        if (!(
                            oldDocument &&
                            Object.prototype.hasOwnProperty.call(
                                oldDocument, name
                            ) &&
                            Array.isArray(oldDocument[name]) &&
                            (
                                oldDocument[name] as Array<DocumentContent>
                            ).length === newProperty.length &&
                            serialize(oldDocument[name]) ===
                                serialize(newProperty)
                        ))
                            changedPath = parentNames.concat(
                                String(name), 'array updated'
                            )
                        /// endregion
                        // endregion
                    } else {
                        const oldValue:unknown =
                            (
                                oldDocument &&
                                Object.prototype.hasOwnProperty.call(
                                    oldDocument, name
                                )
                            ) ?
                                oldDocument[name] :
                                null

                        const result =
                            checkPropertyContent<ValueOf<ObjectType>>(
                                newValue,
                                String(name),
                                propertySpecification as PropertySpecification<
                                    ValueOf<ObjectType>,
                                    AdditionalSpecifications
                                >,
                                oldValue as ValueOf<ObjectType>
                            )

                        newDocument[name] = result.newValue as
                            PartialFullDocumentType[keyof ObjectType]

                        if (result.changedPath.length)
                            changedPath = result.changedPath

                        /*
                            NOTE: Do not use "newValue" here since it was
                            overwritten recently.
                        */
                        if (newDocument[name] === null) {
                            if (oldValue !== null)
                                changedPath = parentNames.concat(
                                    String(name), 'property removed'
                                )

                            delete newDocument[name]
                        }
                    }
                }
            /// region constraint
            for (const type of Object.keys(
                specialNames.constraint
            ) as Array<keyof SpecialPropertyNames['constraint']>) {
                const constraintName = specialNames.constraint[type]

                if (Object.prototype.hasOwnProperty.call(model, constraintName))
                    for (const constraint of ([] as Array<Constraint>).concat(
                        model[constraintName]!
                    )) {
                        type Scope = CommonScope<
                            ObjectType,
                            PropertyValue,
                            AttachmentType,
                            AdditionalSpecifications,
                            AdditionalPropertiesType
                        >

                        let result:(
                            EvaluationResult<
                                ObjectType,
                                boolean|undefined,
                                PropertyValue,
                                AttachmentType,
                                AdditionalSpecifications,
                                AdditionalPropertiesType,
                                Scope
                            > |
                            void
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

                                    newDocument,
                                    oldDocument,

                                    parentNames,
                                    pathDescription
                                }
                            )
                        } catch (error) {
                            if (((error:unknown):error is EvaluationError =>
                                Object.prototype.hasOwnProperty.call(
                                    error, 'compilation'
                                )
                            )(error))
                                throwError(
                                    `Compilation: Hook "${constraintName}" ` +
                                    `has invalid code "${error.code}": "` +
                                    `${error.message!}"${pathDescription}.`
                                )

                            if (((error:unknown):error is EvaluationError =>
                                Object.prototype.hasOwnProperty.call(
                                    error, 'runtime'
                                )
                            )(error))
                                throwError(
                                    `Runtime: Hook "${constraintName}" ` +
                                    `has thrown an error with code ` +
                                    `"${error.code}": ` +
                                    `${error.message!}${pathDescription}.`
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
                                            @typescript-eslint/no-implied-eval
                                        */
                                        new Function(
                                            ...Object.keys(result.scope),
                                            'return ' +
                                            constraint.description.trim()
                                        )(...Object.values(result.scope) as
                                            Array<unknown>
                                        ) as string :
                                        `Model "${modelName}" should satisfy` +
                                        ` constraint "${result.code}" (` +
                                        `given "${serialize(newDocument)}")` +
                                        `${pathDescription}.`
                                    /*
                                        eslint-enable
                                        @typescript-eslint/no-implied-eval
                                    */
                                )
                            )
                        }
                    }
            }
            /// endregion
            /// region attachment
            if (Object.prototype.hasOwnProperty.call(
                newDocument, specialNames.attachment
            )) {
                const newAttachments =
                    newDocument[specialNames.attachment] as Attachments

                if (
                    typeof newAttachments !== 'object' ||
                    Object.getPrototypeOf(newAttachments) !== Object.prototype
                )
                    throwError(
                        'AttachmentType: given attachment has invalid type' +
                        `${pathDescription}.`
                    )

                // region migrate old attachments
                let oldAttachments:Attachments|null = null
                if (
                    oldDocument &&
                    Object.prototype.hasOwnProperty.call(
                        oldDocument, specialNames.attachment
                    )
                ) {
                    oldAttachments =
                        oldDocument[specialNames.attachment] as Attachments
                    if (
                        oldAttachments !== null &&
                        typeof oldAttachments === 'object'
                    )
                        for (const [fileName, oldAttachment] of Object.entries(
                            oldAttachments
                        ))
                            if (Object.prototype.hasOwnProperty.call(
                                newAttachments, fileName
                            )) {
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
                            else if (!updateStrategy)
                                changedPath = parentNames.concat(
                                    specialNames.attachment,
                                    fileName,
                                    'attachment removed'
                                )
                }

                for (const [fileName, newAttachment] of Object.entries(
                    newAttachments
                ))
                    if (
                        [null, undefined].includes(
                            newAttachment as unknown as null
                        ) ||
                        (newAttachment as FullAttachment).data === null
                    )
                        delete newAttachments[fileName]
                    else if (!(
                        oldAttachments &&
                        Object.prototype.hasOwnProperty.call(
                            oldAttachments, fileName
                        ) &&
                        newAttachment.content_type ===
                            oldAttachments[fileName].content_type &&
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
                // endregion
                if (Object.keys(newAttachments).length === 0)
                    delete newDocument[specialNames.attachment]

                const attachmentToTypeMapping:Mapping<Array<string>> = {}
                for (const type of Object.keys(
                    model[specialNames.attachment]!
                ))
                    attachmentToTypeMapping[type] = []

                for (const name of Object.keys(newAttachments)) {
                    let matched = false

                    for (const [type, specification] of Object.entries(
                        model[specialNames.attachment]!
                    ))
                        if (fileNameMatchesModelType(
                            type, name, specification
                        )) {
                            attachmentToTypeMapping[type].push(name)

                            matched = true

                            break
                        }

                    if (!matched)
                        throwError(
                            'AttachmentTypeMatch: None of the specified ' +
                            'attachment types ("' +
                            Object.keys(model[specialNames.attachment]!)
                                .join('", "') +
                            `") matches given one ("${name}")` +
                            `${pathDescription}.`
                        )
                }

                let sumOfAggregatedSizes = 0
                for (const type of Object.keys(attachmentToTypeMapping)) {
                    const specification:FileSpecification<
                        AttachmentType, AdditionalSpecifications
                    > = model[specialNames.attachment]![type]

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
                            `(${numberOfAttachments}) doesn't satisfy ` +
                            'specified maximum of ' +
                            `${specification.maximumNumber} from type ` +
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
                            `(${numberOfAttachments}) doesn't satisfy ` +
                            'specified minimum of ' +
                            `${specification.minimumNumber} from type ` +
                            `"${type}"${pathDescription}.`
                        )

                    let aggregatedSize = 0
                    for (const fileName of attachmentToTypeMapping[type]) {
                        if (specification.fileName?.regularExpressionPattern) {
                            const patterns = (
                                [] as Array<RegExp | string>
                            ).concat(
                                specification.fileName.regularExpressionPattern
                            )
                            let matched = false
                            for (const pattern of patterns)
                                if (new RegExp(pattern).test(fileName)) {
                                    matched = true
                                    break
                                }
                            if (!matched)
                                throwError(
                                    'AttachmentName: given attachment ' +
                                    `name "${fileName}" doesn't satisfy ` +
                                    'one of specified regular expression ' +
                                    `patterns "${patterns.join('", "')}" ` +
                                    `from type "${type}"${pathDescription}.`
                                )
                        }

                        if (
                            specification
                                .fileName?.invertedRegularExpressionPattern
                        )
                            for (const pattern of (
                                [] as Array<RegExp|string>
                            ).concat(
                                specification.fileName
                                    .invertedRegularExpressionPattern
                            ))
                                if (new RegExp(pattern).test(fileName))
                                    throwError(
                                        'InvertedAttachmentName: given ' +
                                        `attachment name "${fileName}" does ` +
                                        `satisfy specified regular ` +
                                        `expression pattern "` +
                                        `${pattern.toString()}" from type ` +
                                        `"${type}"${pathDescription}.`
                                    )

                        if (newAttachments[fileName].content_type) {
                            if (
                                specification
                                    .contentTypeRegularExpressionPattern
                            ) {
                                const patterns = (
                                    [] as Array<RegExp | string>
                                ).concat(
                                    specification
                                        .contentTypeRegularExpressionPattern
                                )
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
                                        `"${patterns.join('", "')}" from ` +
                                        `type "${type}"${pathDescription}.`
                                    )
                            }

                            const invertedPatterns =
                                specification
                                    .invertedContentTypeRegularExpressionPattern

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
                                            newAttachments[fileName]
                                                .content_type +
                                            '" does satisfy specified ' +
                                            'regular expression pattern ' +
                                            `"${pattern.toString()}" from ` +
                                            `type "${type}"${pathDescription}.`
                                        )
                        }

                        let length = 0
                        if ('length' in newAttachments[fileName])
                            length = (
                                newAttachments[fileName] as StubAttachment
                            ).length
                        else if ('data' in newAttachments[fileName])
                            if (Buffer && 'byteLength' in Buffer)
                                length = Buffer.byteLength(
                                    (newAttachments[fileName] as
                                        FullAttachment
                                    ).data as Buffer,
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
                                `size ${length} byte doesn't satisfy ` +
                                'specified minimum of ' +
                                (
                                    specification.minimumSize as
                                        unknown as
                                        string
                                ) +
                                ` byte ${pathDescription}.`
                            )
                        else if (
                            typeof specification.maximumSize === 'number' &&
                            specification.maximumSize < length
                        )
                            throwError(
                                'AttachmentMaximumSize: given attachment ' +
                                `size ${length} byte doesn't satisfy ` +
                                'specified maximum of ' +
                                `${specification.maximumSize} byte ` +
                                `${pathDescription}.`
                            )

                        aggregatedSize += length
                    }

                    if (
                        typeof specification.minimumAggregatedSize ===
                            'number' &&
                        specification.minimumAggregatedSize > aggregatedSize
                    )
                        throwError(
                            'AttachmentAggregatedMinimumSize: given ' +
                            'aggregated size of attachments from type "' +
                            `${type}" ${aggregatedSize} byte doesn't ` +
                            'satisfy specified minimum of ' +
                            `${specification.minimumAggregatedSize} byte ` +
                            `${pathDescription}.`
                        )
                    else if (
                        typeof specification.maximumAggregatedSize ===
                            'number' &&
                        specification.maximumAggregatedSize < aggregatedSize
                    )
                        throwError(
                            'AttachmentAggregatedMaximumSize: given ' +
                            'aggregated size of attachments from type "' +
                            `${type}" ${aggregatedSize} byte doesn't ` +
                            'satisfy specified maximum of ' +
                            `${specification.maximumAggregatedSize} byte ` +
                            `${pathDescription}.`
                        )

                    sumOfAggregatedSizes += aggregatedSize
                }

                if (
                    Object.prototype.hasOwnProperty.call(
                        model, specialNames.minimumAggregatedSize
                    ) &&
                    typeof model[specialNames.minimumAggregatedSize] ===
                        'number' &&
                    model[specialNames.minimumAggregatedSize]! >
                        sumOfAggregatedSizes
                )
                    throwError(
                        'AggregatedMinimumSize: given aggregated size ' +
                        `${sumOfAggregatedSizes} byte doesn't satisfy ` +
                        'specified minimum of ' +
                        `${model[specialNames.minimumAggregatedSize]} byte ` +
                        `${pathDescription}.`
                    )
                else if (
                    typeof model[specialNames.maximumAggregatedSize] ===
                        'number' &&
                    model[specialNames.maximumAggregatedSize]! <
                        sumOfAggregatedSizes
                )
                    throwError(
                        'AggregatedMaximumSize: given aggregated size ' +
                        `${sumOfAggregatedSizes} byte doesn't satisfy ` +
                        'specified maximum of ' +
                        `${model[specialNames.maximumAggregatedSize]} byte ` +
                        `${pathDescription}.`
                    )
            }
            /// endregion
            // endregion
            if (
                oldDocument &&
                Object.prototype.hasOwnProperty.call(
                    oldDocument, specialNames.attachment
                ) &&
                Object.keys(
                    oldDocument[specialNames.attachment] as Attachments
                ).length === 0
            )
                delete oldDocument[specialNames.attachment]

            if (
                changedPath.length === 0 &&
                oldDocument &&
                updateStrategy === 'migrate'
            )
                for (const name of Object.keys(oldDocument))
                    if (!Object.prototype.hasOwnProperty.call(
                        newDocument, name
                    ))
                        changedPath = parentNames.concat(
                            name, 'migrate removed property'
                        )

            return {changedPath, newDocument}
        }
        // endregion
        const basicScope:BasicScope<
            ObjectType,
            AttachmentType,
            AdditionalSpecifications,
            AdditionalPropertiesType
        > = {
            attachmentWithPrefixExists,
            checkDocument,
            getFileNameByPrefix,
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

            userContext
        }

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
        // region add meta data to security object for further processing
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
        return result.newDocument
    }
}
export default DatabaseHelper
// region vim modline
// vim: set tabstop=4 shiftwidth=4 expandtab:
// vim: foldmethod=marker foldmarker=region,endregion:
// endregion
