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
import {Mapping, Primitive, PlainObject} from 'clientnode/type'

import {
    AllowedModelRolesMapping,
    Attachments,
    BaseModelConfiguration,
    BasicScope,
    CheckedDocumentResult,
    CheckedPropertyResult,
    CommonScope,
    CompilationExceptionData,
    Constraint,
    ConstraintKey,
    DateRepresentationType,
    Document,
    DocumentContent,
    EmptyEvaluationExceptionData,
    Evaluate,
    EvaluationException,
    EvaluationResult,
    Exception,
    FileSpecification,
    FullAttachment,
    Model,
    Models,
    NormalizedAllowedModelRoles,
    PartialFullDocument,
    PropertyScope,
    PropertySpecification,
    RuntimeExceptionData,
    SecuritySettings,
    SelectionMapping,
    SpecialPropertyNames,
    StubAttachment,
    Type,
    UpdateStrategy,
    UserContext
} from './type'
// endregion
/**
 * A dumm plugin interface with all available hooks.
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
    static validateDocumentUpdate(
        this:void,
        newDocument:PartialFullDocument,
        oldDocument:PartialFullDocument|null,
        userContext:Partial<UserContext>,
        securitySettings:Partial<SecuritySettings>,
        modelConfiguration:BaseModelConfiguration,
        models:Models = {},
        toJSON?:(_value:unknown) => string
    ):PartialFullDocument {
        // region ensure needed environment
        const throwError = <DataType = Mapping<unknown>>(
            message:string,
            type = 'forbidden',
            additionalErrorData:Partial<DataType> = {}
        ):never => {
            const result:Exception<DataType> =
                {[type]: message, message, name: type} as Exception<DataType>
            for (const [name, data] of Object.entries(additionalErrorData))
                (result as Mapping<unknown>)[name] = data

            throw result
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

        const specialNames:SpecialPropertyNames =
            modelConfiguration.property.name.special
        const {id: idName, revision: revisionName, type: typeName} =
            specialNames

        if (oldDocument && oldDocument[typeName] && !newDocument[typeName])
            newDocument[typeName] = oldDocument[typeName]

        let id = ''
        let revision = ''
        const setDocumentEnvironment = ():void => {
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

        let updateStrategy:UpdateStrategy = modelConfiguration.updateStrategy
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
                    ![null, undefined].includes(
                        model[specialNames.oldType] as unknown as null
                    )
                )
                    for (const oldName of ([] as Array<string>).concat(
                        model[specialNames.oldType] as Array<string>
                    ))
                        oldModelMapping[oldName] = name
        /// endregion
        // endregion
        let serializeData:(_value:unknown) => string
        if (toJSON)
            serializeData = toJSON
        else if (
            JSON && Object.prototype.hasOwnProperty.call(JSON, 'stringify')
        )
            serializeData =
                (object:unknown):string => JSON.stringify(object, null, 4)
        else
            throwError('Needed "serializer" is not available.')

        const specialPropertyNames:Array<string> = [
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
        ):typeof NaN|null|number|string => {
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

            return value as typeof NaN|null|number|string
        }

        const fileNameMatchesModelType = (
            typeName:string, fileName:string, fileType:FileSpecification
        ):boolean => {
            if (fileType.fileName) {
                if (fileType.fileName.value)
                    return fileType.fileName.value === fileName

                if (fileType.fileName.regularExpressionPattern)
                    return (new RegExp(
                        fileType.fileName.regularExpressionPattern
                    )).test(fileName)
            }

            return typeName === fileName
        }

        const getFileNameByPrefix = (
            prefix?:string, attachments?:Attachments
        ):null|string => {
            if (!attachments)
                attachments = newDocument[specialNames.attachment]

            if (prefix) {
                for (const name of Object.keys(attachments!))
                    if (name.startsWith(prefix))
                        return name
            } else {
                const keys:Array<string> = Object.keys(attachments!)
                if (keys.length)
                    return keys[0]
            }

            return null
        }

        const attachmentWithPrefixExists = (namePrefix:string):boolean => {
            if (Object.prototype.hasOwnProperty.call(
                newDocument, specialNames.attachment
            )) {
                const attachments:Attachments =
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

        const evaluate = <Type = unknown, Scope = Mapping<unknown>>(
            givenExpression?:null|string,
            isEvaluation = false,
            givenScope:Scope = {} as Scope
        ):(
            EvaluationResult<
                Type|undefined, BasicScope<Type> & {code:string} & Scope
            > |
            void
        ) => {
            type CurrentScope = BasicScope<Type> & {code:string} & Scope

            const expression:string = determineTrimmedString(givenExpression)
            if (expression) {
                const code:string =
                    (isEvaluation ? 'return ' : '') + expression
                // region determine scope
                const scope:CurrentScope = {
                    ...basicScope,
                    code,
                    ...givenScope
                } as CurrentScope
                const scopeNames:Array<string> = Object.keys(scope)
                // endregion
                // region compile
                let templateFunction:Evaluate<Type|undefined>|undefined

                try {
                    /* eslint-disable @typescript-eslint/no-implied-eval */
                    templateFunction = new Function(...scopeNames, code) as
                        Evaluate<Type|undefined>
                    /* eslint-enable @typescript-eslint/no-implied-eval */
                } catch (error) {
                    throwError<CompilationExceptionData<CurrentScope>>(
                        serialize(error),
                        'compilation',
                        {code, error: error as Error, scope}
                    )
                }
                // endregion
                // region run
                const result:EvaluationResult<Type|undefined, CurrentScope> = {
                    code, result: undefined, scope
                }

                try {
                    result.result = templateFunction!(
                        ...scopeNames.map((name:string):unknown =>
                            scope[name as keyof typeof scope]
                        )
                    )
                } catch (error) {
                    throwError<RuntimeExceptionData<CurrentScope>>(
                        serialize(error),
                        'runtime',
                        {code, error: error as Error, scope}
                    )
                }

                return result
                // endregion
            }

            throwError<EmptyEvaluationExceptionData>(
                'No expression to evaluate provided.', 'empty'
            )
        }
        /// endregion
        const checkDocument = (
            newDocument:PartialFullDocument,
            oldDocument:null|PartialFullDocument,
            parentNames:Array<string> = []
        ):CheckedDocumentResult => {
            const pathDescription:string =
                parentNames.length ? ` in ${parentNames.join(' -> ')}` : ''
            let changedPath:Array<string> = []

            const checkModelType = ():void => {
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

            let modelName:string = newDocument[typeName] as string
            const model:Model = models[modelName]
            let additionalPropertySpecification:null|PropertySpecification =
                null
            if (
                Object.prototype.hasOwnProperty.call(
                    model, specialNames.additional
                ) &&
                model[specialNames.additional]
            )
                additionalPropertySpecification = model[
                    specialNames.additional
                ]
            // region document specific functions
            const checkPropertyConstraints = (
                newValue:unknown,
                name:string,
                propertySpecification:PropertySpecification,
                oldValue?:unknown,
                types:Array<ConstraintKey> = [
                    'constraintExecution', 'constraintExpression'
                ]
            ):void => {
                for (const type of types)
                    if (Object.prototype.hasOwnProperty.call(
                        propertySpecification, type
                    )) {
                        let result:(
                            EvaluationResult<
                                boolean|undefined, PropertyScope
                            > |
                            void
                        ) = undefined
                        try {
                            result = evaluate<boolean, PropertyScope>(
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
                            ):error is EvaluationException =>
                                Object.prototype.hasOwnProperty.call(
                                    error, 'compilation'
                                )
                            )(error))
                                throwError(
                                    `Compilation: Hook "${type}" has invalid` +
                                    ` code "${error.code}": "` +
                                    `${error.message}"${pathDescription}.`
                                )

                            if (((
                                error:unknown
                            ):error is EvaluationException =>
                                Object.prototype.hasOwnProperty.call(
                                    error, 'runtime'
                                )
                            )(error))
                                throwError(
                                    `Runtime: Hook "${type}" has throw an ` +
                                    `error with code "${error.code}": "` +
                                    `${error.message}"${pathDescription}.`
                                )

                            if (!Object.prototype.hasOwnProperty.call(
                                error, 'empty'
                            ))
                                throw error
                        }

                        if (!result?.result) {
                            const description:string = determineTrimmedString(
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
                                        ...Object.keys(result!.scope),
                                        `return ${description}`
                                    )(...Object.values(result!.scope) as
                                        Array<unknown>
                                    ) as string :
                                    `Property "${name}" should satisfy ` +
                                    `constraint "${result!.code}" (given "` +
                                    `${serialize(newValue)}")` +
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
            const checkPropertyContent = (
                newValue:unknown,
                name:string,
                propertySpecification:PropertySpecification,
                oldValue:unknown = null
            ):CheckedPropertyResult => {
                let changedPath:Array<string> = []
                // region type
                const types:Array<Type> = ([] as Array<Type>).concat(
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
                    (newValue as PartialFullDocument)[typeName] = types[0]
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
                            (newValue as PartialFullDocument)[typeName] !==
                                type &&
                            updateStrategy === 'migrate' &&
                            types.length === 1
                        ) {
                            /*
                                Derive nested (object based) maybe compatible
                                type definition. Nested types have to be
                                checked than.
                            */
                            (newValue as PartialFullDocument)[typeName] = type
                            changedPath = parentNames.concat(
                                name, 'migrate nested object type')
                        }
                        if (
                            typeof newValue === 'object' &&
                            Object.getPrototypeOf(newValue) ===
                                Object.prototype &&
                            Object.prototype.hasOwnProperty.call(
                                newValue, typeName
                            ) &&
                            (newValue as PartialFullDocument)[typeName] ===
                                type
                        ) {
                            const result:CheckedDocumentResult = checkDocument(
                                newValue as PartialFullDocument,
                                oldValue as null|PartialFullDocument,
                                parentNames.concat(name)
                            )
                            if (result.changedPath.length)
                                changedPath = result.changedPath
                            newValue = result.newDocument
                            if (serialize(newValue) === serialize({}))
                                return {newValue: null, changedPath}

                            typeMatched = true
                            break
                        } else if (types.length === 1)
                            throwError(
                                `NestedType: Under key "${name}" isn't of ` +
                                `type "${type}" (given "` +
                                `${serialize(newValue)}" of type ` +
                                `${typeof newValue})${pathDescription}.`
                            )
                    } else if (type === 'DateTime') {
                        const initialNewValue:unknown = newValue

                        newValue = normalizeDateTime(
                            newValue as DateRepresentationType
                        )

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
                                    `PropertyType: Property "${name}" isn't ` +
                                    'of (valid) type "DateTime" (given "' +
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
                                    `PropertyType: Property "${name}" isn't ` +
                                    'of (valid) type "${type}" (given "' +
                                    `${serialize(newValue)}" of type "` +
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
                                `PropertyType: Foreign key property "${name}` +
                                `" isn't of type "${foreignKeyType}" (given ` +
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
                            `PropertyType: Property "${name}" isn't value "` +
                            `${type}" (given "` +
                            serialize(newValue)
                                .replace(/^"/, '')
                                .replace(/"$/, '') +
                            `" of type "${typeof newValue}")` +
                            `${pathDescription}.`
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
                        `)${pathDescription}.`
                    )
                // endregion
                // region range
                if (typeof newValue === 'string') {
                    if (
                        ![null, undefined].includes(
                            propertySpecification.minimumLength as null
                        ) &&
                        newValue.length <
                            (propertySpecification.minimumLength as number)
                    )
                        throwError(
                            `MinimalLength: Property "${name}" must have ` +
                            'minimal length ' +
                            (propertySpecification.minimumLength as
                                unknown as
                                string
                            ) +
                            ` (given ${newValue} with length ` +
                            `i${newValue.length}) ${pathDescription}.`
                        )
                    if (
                        ![null, undefined].includes(
                            propertySpecification.maximumLength as null
                        ) &&
                        newValue.length >
                            (propertySpecification.maximumLength as number)
                    )
                        throwError(
                            `MaximalLength: Property "${name}" must have ` +
                            'maximal length ' +
                            (
                                propertySpecification.maximumLength as
                                    unknown as
                                    string
                            ) +
                            ` (given ${newValue} with length ` +
                            `${newValue.length})${pathDescription}.`
                        )
                }
                if (typeof newValue === 'number') {
                    if (
                        ![null, undefined].includes(
                            propertySpecification.minimum as null
                        ) &&
                        newValue < (propertySpecification.minimum as number)
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
                            ` (given ${newValue} is too low)` +
                            `${pathDescription}.`
                        )
                    if (
                        ![null, undefined].includes(
                            propertySpecification.maximum as null
                        ) &&
                        newValue > (propertySpecification.maximum as number)
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
                            ` (given ${newValue} is too high)` +
                            `${pathDescription}.`
                        )
                }
                // endregion
                // region selection
                if (propertySpecification.selection) {
                    let selection =
                        Array.isArray(propertySpecification.selection) ?
                            propertySpecification.selection.map(
                                (value:SelectionMapping|unknown):unknown =>
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
                            `Selection: Property "${name}" (type ` +
                            `${propertySpecification.type as string}) ` +
                            `should be one of "${selection.join('", "')}". ` +
                            `But is "${newValue as string}"${pathDescription}.`
                        )
                }
                // endregion
                // region pattern
                if (!(
                    [null, undefined].includes(
                        propertySpecification.regularExpressionPattern as null
                    ) ||
                    new RegExp(
                        propertySpecification.regularExpressionPattern as
                            string
                    ).test(newValue as string)
                ))
                    throwError(
                        `PatternMatch: Property "${name}" should match ` +
                        `regular expression pattern ` +
                        (
                            propertySpecification.regularExpressionPattern as
                                string
                        ) +
                        ` (given "${newValue as string}")${pathDescription}.`
                    )
                else if (!(
                    [null, undefined].includes(
                        propertySpecification
                            .invertedRegularExpressionPattern as null
                    ) ||
                    !(new RegExp(
                        propertySpecification
                            .invertedRegularExpressionPattern as string
                    )).test(newValue as string)
                ))
                    throwError(
                        `InvertedPatternMatch: Property "${name}" should ` +
                        'not match regular expression pattern ' +
                        (
                            propertySpecification
                                .invertedRegularExpressionPattern as
                                string
                        ) +
                        ` (given "${newValue as string}")${pathDescription}.`
                    )
                // endregion
                checkPropertyConstraints(
                    newValue, name, propertySpecification, oldValue
                )

                if (serialize(newValue) !== serialize(oldValue))
                    changedPath = parentNames.concat(name, 'value updated')

                return {newValue, changedPath}
            }
            const checkPropertyWriteableMutableNullable = (
                propertySpecification:PropertySpecification,
                newDocument:PartialFullDocument,
                oldDocument:PartialFullDocument|null,
                name:string,
                pathDescription:string
            ):boolean => {
                const value:unknown = newDocument[name]
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
                                `Readonly: Property "${name}" is not ` +
                                `writable (old document "` +
                                `${serialize(oldDocument)}")` +
                                `${pathDescription}.`
                            )
                    else
                        throwError(
                            `Readonly: Property "${name}" is not writable` +
                            `${pathDescription}.`
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
                            ).includes(name)
                        )
                            delete newDocument[name]

                        return true
                    } else if (updateStrategy !== 'migrate')
                        throwError(
                            `Immutable: Property "${name}" is not writable (` +
                            `old document "${serialize(oldDocument)}")` +
                            `${pathDescription}.`
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
                                name, 'delete property'
                            )

                        return true
                    } else
                        throwError(
                            `NotNull: Property "${name}" should not be "null` +
                            `"${pathDescription}.`
                        )
                // endregion
                return false
            }
            /// region create hook
            const runCreatePropertyHook = (
                propertySpecification:PropertySpecification,
                newDocument:Attachments|PartialFullDocument,
                oldDocument:Attachments|null|PartialFullDocument,
                name:string
            ):void => {
                type Type = (
                    Attachments[number] |
                    PlainObject<Primitive> |
                    Primitive |
                    (Primitive|PlainObject<Primitive>)[]
                )

                if (!oldDocument)
                    for (const type of [
                        'onCreateExecution', 'onCreateExpression'
                    ] as const)
                        if (Object.prototype.hasOwnProperty.call(
                            propertySpecification, type
                        )) {
                            let result:(
                                EvaluationResult<
                                    null|Type|undefined, PropertyScope
                                > |
                                void
                            ) = undefined
                            try {
                                result = evaluate<null|Type, PropertyScope>(
                                    propertySpecification[type],
                                    type.endsWith('Expression'),
                                    {
                                        checkPropertyContent,

                                        model,
                                        modelName,
                                        name,
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
                                ):error is EvaluationException =>
                                    Object.prototype.hasOwnProperty.call(
                                        error, 'compilation'
                                    )
                                )(error))
                                    throwError(
                                        `Compilation: Hook "${type}" has ` +
                                        `invalid code "${error.code}" for ` +
                                        `property "${name}": ` +
                                        `${error.message}${pathDescription}.`
                                    )

                                if (((
                                    error:unknown
                                ):error is EvaluationException =>
                                    Object.prototype.hasOwnProperty.call(
                                        error, 'runtime'
                                    )
                                )(error))
                                    throwError(
                                        `Runtime: Hook "${type}" has throw ` +
                                        `an error with code "${error.code}" ` +
                                        `for property "${name}": ` +
                                        `${error.message}${pathDescription}.`
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
                                newDocument[name] = result.result
                        }
            }
            /// endregion
            /// region update hook
            const runUpdatePropertyHook = (
                propertySpecification:PropertySpecification,
                newDocument:Attachments|PartialFullDocument,
                oldDocument:Attachments|null|PartialFullDocument,
                name:string
            ):void => {
                type Type = (
                    Attachments[number] |
                    PlainObject<Primitive> |
                    Primitive |
                    (Primitive|PlainObject<Primitive>)[]
                )

                if (!Object.prototype.hasOwnProperty.call(newDocument, name))
                    return

                if (
                    propertySpecification.trim &&
                    typeof newDocument[name] === 'string'
                )
                    newDocument[name] = (newDocument[name] as string).trim()
                if (
                    propertySpecification.emptyEqualsToNull &&
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
                    newDocument[name] = null
                for (const type of [
                    'onUpdateExecution', 'onUpdateExpression'
                ] as const)
                    if (Object.prototype.hasOwnProperty.call(
                        propertySpecification, type
                    ))
                        try {
                            newDocument[name] = evaluate<Type, PropertyScope>(
                                propertySpecification[type],
                                type.endsWith('Expression'),
                                {
                                    checkPropertyContent,

                                    model,
                                    modelName,
                                    name,
                                    type,

                                    newDocument,
                                    oldDocument,

                                    newValue: newDocument[name],
                                    oldValue: oldDocument && oldDocument[name],

                                    parentNames,
                                    pathDescription,

                                    propertySpecification
                                }
                            )!.result
                        } catch (error) {
                            if (((
                                error:unknown
                            ):error is EvaluationException =>
                                Object.prototype.hasOwnProperty.call(
                                    error, 'compilation'
                                )
                            )(error))
                                throwError(
                                    `Compilation: Hook "${type}" has invalid` +
                                    ` code "${error.code}" for property "` +
                                    `${name}": ${error.message}` +
                                    `${pathDescription}.`
                                )

                            if (((
                                error:unknown
                            ):error is EvaluationException =>
                                Object.prototype.hasOwnProperty.call(
                                    error, 'runtime'
                                )
                            )(error))
                                throwError(
                                    `Runtime: Hook "${type}" has throw an ` +
                                    `error with code "${error.code}" for ` +
                                    `property "${name}": ${error.message}` +
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
            const specifiedPropertyNames:Array<string> = Object.keys(model)
                .filter((name:string):boolean =>
                    !specialPropertyNames.includes(name)
                )
            // region migrate old model specific property names
            if (updateStrategy === 'migrate')
                for (const name of specifiedPropertyNames)
                    if (![null, undefined].includes(
                        model[name].oldName as null
                    ))
                        for (const oldName of ([] as Array<string>).concat(
                            model[name].oldName as Array<string>
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
                        let result:null|PartialFullDocument|undefined
                        try {
                            result = evaluate<
                                null|PartialFullDocument,
                                CommonScope<null|PartialFullDocument>
                            >(
                                model[type as '_createExpression'],
                                type.endsWith('Expression'),
                                {
                                    checkPropertyContent,

                                    model: model as
                                        Model<null|PartialFullDocument>,
                                    modelName,
                                    type,

                                    newDocument,
                                    oldDocument,

                                    parentNames,
                                    pathDescription
                                }
                            )!.result
                        } catch (error) {
                            if (((
                                error:unknown
                            ):error is EvaluationException =>
                                Object.prototype.hasOwnProperty.call(
                                    error, 'compilation'
                                )
                            )(error))
                                throwError(
                                    `Compilation: Hook "${type}" has invalid` +
                                    ` code "${error.code}" for document "` +
                                    `${modelName}": ${error.message}` +
                                    `${pathDescription}.`
                                )

                            if (((
                                error:unknown
                            ):error is EvaluationException =>
                                Object.prototype.hasOwnProperty.call(
                                    error, 'runtime'
                                )
                            )(error))
                                throwError(
                                    `Runtime: Hook "${type}" has throw an ` +
                                    `error with code "${error.code}" for ` +
                                    `document "${modelName}": ` +
                                    `${error.message}${pathDescription}.`
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
                    let result:null|PartialFullDocument|undefined
                    try {
                        result = evaluate<
                            null|PartialFullDocument,
                            CommonScope<null|PartialFullDocument>
                        >(
                            model[type as '_createExpression'],
                            type.endsWith('Expression'),
                            {
                                checkPropertyContent,

                                model:
                                    model as Model<null|PartialFullDocument>,
                                modelName,
                                type,

                                newDocument,
                                oldDocument,

                                parentNames,
                                pathDescription
                            }
                        )!.result
                    } catch (error) {
                        if (((error:unknown):error is EvaluationException =>
                            Object.prototype.hasOwnProperty.call(
                                error, 'compilation'
                            )
                        )(error))
                            throwError(
                                `Compilation: Hook "${type}" has invalid ` +
                                `code "${error.code}" for document "` +
                                `${modelName}": ${error.message}` +
                                `${pathDescription}.`
                            )

                        if (((error:unknown):error is EvaluationException =>
                            Object.prototype.hasOwnProperty.call(
                                error, 'runtime'
                            )
                        )(error))
                            throwError(
                                `Runtime: Hook "${type}" has throw an error ` +
                                `with code "${error.code}" for document "` +
                                `${modelName}": ${error.message}` +
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
            for (const name of specifiedPropertyNames.concat(
                additionalPropertySpecification ?
                    Object.keys(newDocument).filter((name:string):boolean =>
                        !specifiedPropertyNames.includes(name)
                    ) :
                    []
            ))
                // region run hooks and check for presence of needed data
                if (specialNames.attachment === name)
                    // region attachment
                    for (const [type, property] of Object.entries(
                        model[name]!
                    )) {
                        if (
                            !Object.prototype.hasOwnProperty.call(
                                newDocument, name
                            ) ||
                            newDocument[name] === null
                        )
                            newDocument[name] = {}

                        if (
                            oldDocument &&
                            !Object.prototype.hasOwnProperty.call(
                                oldDocument, name
                            )
                        )
                            oldDocument[name] = {}

                        const newFileNames:Array<string> =
                            Object.keys(newDocument[name] as Attachments)
                                .filter((fileName:string):boolean =>
                                    ((
                                        newDocument[name] as Attachments
                                    )[fileName] as FullAttachment).data !==
                                        null &&
                                    fileNameMatchesModelType(
                                        type, fileName, property
                                    )
                                )

                        const newAttachments:Attachments =
                            newDocument[name] as Attachments

                        let oldFileNames:Array<string> = []
                        if (oldDocument) {
                            const oldAttachments:Attachments =
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
                                        type, fileName, property
                                    ))
                                )
                        }

                        const propertySpecification:PropertySpecification =
                            property

                        for (const fileName of newFileNames)
                            runCreatePropertyHook(
                                propertySpecification,
                                newAttachments,
                                oldDocument && oldDocument[name] ?
                                    oldDocument[name]! :
                                    null,
                                fileName
                            )

                        for (const fileName of newFileNames)
                            runUpdatePropertyHook(
                                propertySpecification,
                                newAttachments,
                                oldDocument && oldDocument[name] ?
                                    oldDocument[name]! :
                                    null,
                                fileName
                            )

                        if ([null, undefined].includes(
                            propertySpecification.default as null
                        )) {
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
                                            object
                                )
                                    if (Object.prototype.hasOwnProperty.call(
                                        propertySpecification.default as
                                            object,
                                        fileName
                                    )) {
                                        newAttachments[fileName] = (
                                            propertySpecification.default as
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
                    const propertySpecification:PropertySpecification =
                        specifiedPropertyNames.includes(name) ?
                            model[name] :
                            additionalPropertySpecification as
                                PropertySpecification

                    runCreatePropertyHook(
                        propertySpecification, newDocument, oldDocument, name
                    )
                    runUpdatePropertyHook(
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
                                `MissingProperty: Missing property "${name}"` +
                                `${pathDescription}.`
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
                                    name, 'property removed')
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
                                    propertySpecification.default as Primitive
                                changedPath = parentNames.concat(
                                    name, 'migrate default value'
                                )
                            }
                        } else {
                            newDocument[name] =
                                propertySpecification.default as Primitive
                            changedPath =
                                changedPath.concat(name, 'add default value')
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
            for (const [name, newValue] of Object.entries(newDocument))
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
                    ).includes(name)
                ) {
                    let propertySpecification:PropertySpecification|undefined
                    if (Object.prototype.hasOwnProperty.call(model, name))
                        propertySpecification = model[name]
                    else if (additionalPropertySpecification)
                        propertySpecification = additionalPropertySpecification
                    else if (updateStrategy === 'migrate') {
                        delete newDocument[name]

                        changedPath = parentNames.concat(
                            name, 'migrate removed property'
                        )

                        continue
                    } else
                        throwError(
                            `Property: Given property "${name}" isn't ` +
                            `specified in model "${modelName}"` +
                            `${pathDescription}.`
                        )

                    // NOTE: Only needed to avoid type check errors.
                    if (!propertySpecification)
                        continue

                    // region check writable/mutable/nullable
                    if (specialNames.attachment === name) {
                        const attachments:Attachments = newValue as Attachments

                        for (const fileName in attachments)
                            if (Object.prototype.hasOwnProperty.call(
                                attachments, fileName
                            ))
                                for (const type in model[name])
                                    if (fileNameMatchesModelType(
                                        type, fileName, model[name]![type]
                                    )) {
                                        checkPropertyWriteableMutableNullable(
                                            model[name]![type as
                                                keyof PropertySpecification
                                            ],
                                            newDocument,
                                            oldDocument,
                                            fileName,
                                            pathDescription
                                        )

                                        break
                                    }

                        continue
                    } else if (checkPropertyWriteableMutableNullable(
                        propertySpecification,
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
                        const newProperty:Array<DocumentContent> =
                            newValue as Array<DocumentContent>
                        // region check arrays
                        if (!Array.isArray(newProperty))
                            throwError(
                                `PropertyType: Property "${name}" isn't of ` +
                                `type "array -> ` +
                                `${propertySpecification.type as string}" ` +
                                `(given "${serialize(newProperty)}")` +
                                `${pathDescription}.`
                            )
                        else if (
                            ![null, undefined].includes(
                                propertySpecification.minimumNumber as null
                            ) &&
                            (newProperty).length <
                                (propertySpecification.minimumNumber as number)
                        )
                            throwError(
                                `MinimumArrayLength: Property "${name}" (` +
                                `array of length ${newProperty.length}) ` +
                                `doesn't fullfill minimum array length of ` +
                                (
                                    propertySpecification.minimumNumber as
                                        unknown as
                                        string
                                ) +
                                `${pathDescription}.`
                            )
                        else if (
                            ![null, undefined].includes(
                                propertySpecification.maximumNumber as null
                            ) &&
                            (propertySpecification.maximumNumber as number) <
                                newProperty.length
                        )
                            throwError(
                                `MaximumArrayLength: Property "${name}" (` +
                                `array of length ${newProperty.length}) ` +
                                `doesn't fullfill maximum array length of ` +
                                (
                                    propertySpecification.maximumNumber as
                                        unknown as
                                        string
                                ) +
                                `${pathDescription}.`
                            )

                        checkPropertyConstraints(
                            newProperty,
                            name,
                            propertySpecification,
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
                        const propertySpecificationCopy:PropertySpecification =
                            {}
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
                                        key as keyof PropertySpecification
                                    ] as Primitive) = propertySpecification[
                                        key as keyof PropertySpecification
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
                            newProperty[index] = checkPropertyContent(
                                value,
                                `${index + 1}. value in ${name}`,
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
                            changedPath =
                                parentNames.concat(name, 'array updated')
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

                        const result:{
                            changedPath:Array<string>
                            newValue:unknown
                        } = checkPropertyContent(
                            newValue, name, propertySpecification, oldValue
                        )

                        newDocument[name] = result.newValue as PlainObject

                        if (result.changedPath.length)
                            changedPath = result.changedPath

                        /*
                            NOTE: Do not use "newValue" here since it was
                            overwritten recently.
                        */
                        if (newDocument[name] === null) {
                            if (oldValue !== null)
                                changedPath = parentNames.concat(
                                    name, 'property removed'
                                )

                            delete newDocument[name]
                        }
                    }
                }
            /// region constraint
            for (let type of Object.keys(specialNames.constraint))
                if (
                    (type = specialNames.constraint[
                        type as keyof SpecialPropertyNames['constraint']
                    ]) &&
                    Object.prototype.hasOwnProperty.call(model, type)
                )
                    for (const constraint of ([] as Array<Constraint>).concat(
                        model[type] as Array<Constraint>
                    )) {
                        let result:(
                            EvaluationResult<
                                boolean|undefined, CommonScope<boolean>
                            > |
                            void
                        ) = undefined
                        try {
                            result = evaluate<boolean, CommonScope<boolean>>(
                                constraint.evaluation,
                                type === specialNames.constraint.expression,
                                {
                                    checkPropertyContent,

                                    model: model as Model<boolean>,
                                    modelName,
                                    type,

                                    newDocument,
                                    oldDocument,

                                    parentNames,
                                    pathDescription
                                }
                            )
                        } catch (error) {
                            if (((
                                error:unknown
                            ):error is EvaluationException =>
                                Object.prototype.hasOwnProperty.call(
                                    error, 'compilation'
                                )
                            )(error))
                                throwError(
                                    `Compilation: Hook "${type}" has invalid` +
                                    ` code "${error.code}": "` +
                                    `${error.message}"${pathDescription}.`
                                )

                            if (((
                                error:unknown
                            ):error is EvaluationException =>
                                Object.prototype.hasOwnProperty.call(
                                    error, 'runtime'
                                )
                            )(error))
                                throwError(
                                    `Runtime: Hook "${type}" has thrown an ` +
                                    `error with code "${error.code}": ` +
                                    `${error.message}${pathDescription}.`
                                )

                            if (!Object.prototype.hasOwnProperty.call(
                                error, 'empty'
                            ))
                                throw error
                        }

                        if (!result?.result) {
                            const errorName:string = type.replace(
                                /^[^a-zA-Z]+/, ''
                            )

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
                                            ...Object.keys(result!.scope),
                                            'return ' +
                                            constraint.description.trim()
                                        )(...Object.values(result!.scope) as
                                            Array<unknown>
                                        ) as string :
                                        `Model "${modelName}" should satisfy` +
                                        ` constraint "${result!.code}" (` +
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
            /// endregion
            /// region attachment
            if (Object.prototype.hasOwnProperty.call(
                newDocument, specialNames.attachment
            )) {
                const newAttachments:Attachments =
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
                    oldAttachments = oldDocument[specialNames.attachment]!
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
                    const specification:FileSpecification =
                        model[specialNames.attachment]![type]

                    if (!Object.prototype.hasOwnProperty.call(
                        attachmentToTypeMapping, type
                    ))
                        continue

                    const numberOfAttachments:number =
                        attachmentToTypeMapping[type].length
                    if (
                        specification.maximumNumber !== null &&
                        numberOfAttachments >
                            (specification.maximumNumber as number)
                    )
                        throwError(
                            'AttachmentMaximum: given number of attachments ' +
                            `(${numberOfAttachments}) doesn't satisfy ` +
                            'specified maximum of ' +
                            (
                                specification.maximumNumber as
                                    unknown as
                                    string
                            ) +
                            ` from type "${type}"${pathDescription}.`
                        )

                    if (
                        !(
                            specification.nullable && numberOfAttachments === 0
                        ) &&
                        numberOfAttachments <
                            (specification.minimumNumber as number)
                    )
                        throwError(
                            'AttachmentMinimum: given number of attachments ' +
                            `(${numberOfAttachments}) doesn't satisfy ` +
                            'specified minimum of ' +
                            (
                                specification.minimumNumber as
                                    unknown as
                                    string
                            ) +
                            ` from type "${type}"${pathDescription}.`
                        )

                    let aggregatedSize = 0
                    for (const fileName of attachmentToTypeMapping[type]) {
                        if (
                            specification.fileName?.regularExpressionPattern &&
                            !new RegExp(
                                specification.fileName.regularExpressionPattern
                            ).test(fileName)
                        )
                            throwError(
                                'AttachmentName: given attachment name "' +
                                `${fileName}" doesn't satisfy specified ` +
                                'regular expression pattern "' +
                                specification.fileName
                                    .regularExpressionPattern +
                                `" from type "${type}"${pathDescription}.`
                            )
                        else if (
                            specification
                                .fileName?.invertedRegularExpressionPattern &&
                            new RegExp(
                                specification.fileName
                                    .invertedRegularExpressionPattern
                            ).test(fileName)
                        )
                            throwError(
                                'InvertedAttachmentName: given attachment ' +
                                `name "${fileName}" does satisfy specified ` +
                                'regular expression pattern "' +
                                specification.fileName
                                    .invertedRegularExpressionPattern +
                                `" from type "${type}"${pathDescription}.`
                            )
                        else if (!(
                            [null, undefined].includes(
                                specification
                                    .contentTypeRegularExpressionPattern as
                                        null
                            ) ||
                            newAttachments[fileName].content_type &&
                            new RegExp(
                                specification
                                    .contentTypeRegularExpressionPattern as
                                        string
                            )
                                .test(newAttachments[fileName].content_type)
                        ))
                            throwError(
                                'AttachmentContentType: given attachment ' +
                                'content type "' +
                                `${newAttachments[fileName].content_type}" ` +
                                `doesn't satisfy specified regular ` +
                                'expression pattern "' +
                                (
                                    specification
                                        .contentTypeRegularExpressionPattern as
                                        string
                                ) +
                                `" from type "${type}"${pathDescription}.`
                            )

                        const pattern:null|string|undefined = specification
                            .invertedContentTypeRegularExpressionPattern

                        if (!(
                            [null, undefined].includes(pattern as null) ||
                            newAttachments[fileName].content_type &&
                            !(new RegExp(pattern as string))
                                .test(newAttachments[fileName].content_type)
                        ))
                            throwError(
                                'InvertedAttachmentContentType: given ' +
                                'attachment content type "' +
                                `${newAttachments[fileName].content_type}" ` +
                                `does satisfy specified regular expression ` +
                                `pattern "${pattern as unknown as string}" ` +
                                `from type "${type}"${pathDescription}.`
                            )

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
                            ![null, undefined].includes(
                                specification.minimumSize as null
                            ) &&
                            (specification.minimumSize as number) > length
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
                            ![null, undefined].includes(
                                specification.maximumSize as null
                            ) &&
                            (specification.maximumSize as number) < length
                        )
                            throwError(
                                'AttachmentMaximumSize: given attachment ' +
                                `size ${length} byte doesn't satisfy ` +
                                'specified maximum of ' +
                                (
                                    specification.maximumSize as
                                        unknown as
                                        string
                                ) +
                                ` byte ${pathDescription}.`
                            )

                        aggregatedSize += length
                    }

                    if (
                        ![null, undefined].includes(
                            specification.minimumAggregatedSize as null
                        ) &&
                        (specification.minimumAggregatedSize as number) >
                            aggregatedSize
                    )
                        throwError(
                            'AttachmentAggregatedMinimumSize: given ' +
                            'aggregated size of attachments from type "' +
                            `${type}" ${aggregatedSize} byte doesn't ` +
                            'satisfy specified minimum of ' +
                            (
                                specification.minimumAggregatedSize as
                                    unknown as
                                    string
                            ) +
                            ` byte ${pathDescription}.`
                        )
                    else if (
                        ![null, undefined].includes(
                            specification.maximumAggregatedSize as null
                        ) &&
                        (specification.maximumAggregatedSize as number) <
                            aggregatedSize
                    )
                        throwError(
                            'AttachmentAggregatedMaximumSize: given ' +
                            'aggregated size of attachments from type "' +
                            `${type}" ${aggregatedSize} byte doesn't ` +
                            'satisfy specified maximum of ' +
                            (
                                specification.maximumAggregatedSize as
                                    unknown as
                                    string
                            ) +
                            ` byte ${pathDescription}.`
                        )

                    sumOfAggregatedSizes += aggregatedSize
                }

                if (
                    Object.prototype.hasOwnProperty.call(
                        model, specialNames.minimumAggregatedSize
                    ) &&
                    ![null, undefined].includes(
                        model[specialNames.minimumAggregatedSize] as
                            unknown as
                            null
                    ) &&
                    (model[specialNames.minimumAggregatedSize] as number) >
                        sumOfAggregatedSizes
                )
                    throwError(
                        'AggregatedMinimumSize: given aggregated size ' +
                        `${sumOfAggregatedSizes} byte doesn't satisfy ` +
                        'specified minimum of ' +
                        (
                            model[specialNames.minimumAggregatedSize] as
                                unknown as
                                string
                        ) +
                        ` byte ${pathDescription}.`
                    )
                else if (
                    ![null, undefined].includes(
                        model[specialNames.maximumAggregatedSize] as
                            unknown as null
                    ) &&
                    (model[specialNames.maximumAggregatedSize] as number) <
                        sumOfAggregatedSizes
                )
                    throwError(
                        'AggregatedMaximumSize: given aggregated size ' +
                        `${sumOfAggregatedSizes} byte doesn't satisfy ` +
                        'specified maximum of ' +
                        (
                            model[specialNames.maximumAggregatedSize] as
                                unknown as
                                string
                        ) +
                        ` byte ${pathDescription}.`
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
        const basicScope:BasicScope = {
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

        const result:CheckedDocumentResult =
            checkDocument(newDocument, oldDocument)
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
