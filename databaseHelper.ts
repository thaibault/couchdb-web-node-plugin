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
import {Mapping, ProcedureFunction} from 'clientnode/type'

import {
    AllowedModelRolesMapping,
    Attachments,
    BaseModelConfiguration,
    CheckedDocumentResult,
    Constraint,
    Document,
    EvaluationResult,
    FullAttachment,
    Model,
    Models,
    NormalizedAllowedRoles,
    PropertySpecification,
    SecuritySettings,
    SpecialPropertyNames,
    StubAttachment,
    Type,
    TypeSpecification,
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
     * @param userContext - Contains meta information about currently acting
     * user.
     * @param securitySettings - Database security settings.
     * @param allowedModelRolesMapping - Allowed roles for given models.
     * @param idPropertyName - Property name indicating the id field name.
     * @param typePropertyName - Property name indicating to which model a
     * document belongs to.
     * @param read - Indicates whether a read or write of given document should
     * be authorized or not.
     * @returns Throws an exception if authorisation is not accepted and "true"
     * otherwise.
     */
    static authenticate(
        newDocument:Document,
        oldDocument:Document|null = null,
        userContext:UserContext = {
            db: 'dummy',
            name: '"unknown"',
            roles: []
        },
        securitySettings:SecuritySettings = {
            admins: {names: [], roles: []}, members: {names: [], roles: []}
        },
        allowedModelRolesMapping?:AllowedModelRolesMapping,
        idPropertyName:string = '_id',
        typePropertyName:string = '-type',
        designDocumentNamePrefix:string = '_design/',
        read = false
    ):true {
        /*
            NOTE: Special documents and like changes sequences are going
            through this function and should be ignored.
        */
        if (!newDocument.hasOwnProperty(typePropertyName))
            return true
        const allowedRoles:NormalizedAllowedRoles & {
            properties:AllowedModelRolesMapping;
        } = {
            properties: {},
            read: ['_admin', 'readonlyadmin'],
            write: ['_admin']
        }
        if (
            newDocument.hasOwnProperty(idPropertyName) &&
            (newDocument[idPropertyName] as string).startsWith(
                designDocumentNamePrefix
            )
        )
            allowedRoles.read.push('readonlymember')
        let userRolesDescription:string = `Current user doesn't own any role`
        const operationType:'read'|'write' = read ? 'read': 'write'
        if (userContext) {
            if (!('name' in userContext))
                userContext.name = '"unknown"'
            if (userContext.roles.length) {
                // region determine model specific allowed roles
                if (
                    allowedModelRolesMapping &&
                    typePropertyName &&
                    newDocument.hasOwnProperty(typePropertyName) &&
                    allowedModelRolesMapping.hasOwnProperty(
                        newDocument[typePropertyName] as string
                    )
                )
                    for (const type in allowedRoles)
                        if (
                            allowedRoles.hasOwnProperty(type) &&
                            newDocument.hasOwnProperty(typePropertyName)
                        )
                            if (['read', 'write'].includes(type))
                                (
                                    allowedRoles[
                                        type as keyof NormalizedAllowedRoles
                                    ] as Array<string>
                                ) = (
                                    allowedRoles[
                                        type as keyof NormalizedAllowedRoles
                                    ] as Array<string>
                                ).concat(
                                    allowedModelRolesMapping[
                                        newDocument[typePropertyName] as
                                            keyof AllowedModelRolesMapping
                                    ][type as keyof NormalizedAllowedRoles] as
                                        Array<string> ||
                                    []
                                )
                            else if (allowedModelRolesMapping[
                                newDocument[typePropertyName] as
                                    keyof AllowedModelRolesMapping
                            ].hasOwnProperty(type))
                                allowedRoles.properties =
                                    allowedModelRolesMapping[
                                        newDocument[typePropertyName] as
                                            keyof AllowedModelRolesMapping
                                    ].properties as AllowedModelRolesMapping
                // endregion
                // TODO check for each property recursively
                const relevantRoles:Array<string> = allowedRoles[operationType]
                for (const userRole of userContext.roles)
                    if (relevantRoles.includes(userRole))
                        return true
                userRolesDescription = `Current user "${userContext.name}" ` +
                    `owns the following roles: "` +
                    `${userContext.roles.join('", "')}".`
                //
            } else
                userRolesDescription =
                    `Current user "${userContext.name}" doesn't own any role`
        }
        /* eslint-disable no-throw-literal */
        throw {
            unauthorized:
                'Only users with a least on of these roles are allowed to ' +
                `perform requested ${operationType} action: "` +
                `${allowedRoles[operationType].join('", "')}". ` +
                `${userRolesDescription}.`
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
     * @param models - Models specification object.
     * @param modelConfiguration - Model configuration object.
     * @param toJSON - JSON stringifier.
     * @returns Modified given new document.
     */
    static validateDocumentUpdate(
        newDocument:Document,
        oldDocument:Document|null,
        userContext:UserContext,
        securitySettings:SecuritySettings,
        modelConfiguration:BaseModelConfiguration,
        models:Models = {},
        toJSON?:(value:any) => string
    ):Document {
        // region ensure needed environment
        const throwError:Function = (
            message:string,
            type:string = 'forbidden',
            additionalErrorData:object = {}
        ):never => {
            const result = {[type]: message}
            for (const name in additionalErrorData)
                if (additionalErrorData.hasOwnProperty(name))
                    result[name] = additionalErrorData[name as keyof object]
            throw result
        }
        const now:Date = new Date()
        const nowUTCTimestamp:number = Date.UTC(
            now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
            now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(),
            now.getUTCMilliseconds()
        ) / 1000
        const specialNames:SpecialPropertyNames =
            modelConfiguration.property.name.special
        const idName:string = specialNames.id
        const revisionName:string = specialNames.revision
        const typeName:string = specialNames.type
        let id:string = ''
        let revision:string = ''
        const setDocumentEnvironment:ProcedureFunction = ():void => {
            id = newDocument.hasOwnProperty(idName) ?
                newDocument[idName] as string :
                ''
            revision = newDocument.hasOwnProperty(revisionName) ?
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
            securitySettings.hasOwnProperty(
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
            if (oldDocument && oldDocument.hasOwnProperty(revisionName))
                revision =
                    newDocument[revisionName] =
                    oldDocument[revisionName] as string
            else if (revision === 'latest')
                throwError('Revision: No old document available to update.')
            else
                delete newDocument[revisionName]
        let updateStrategy:string = modelConfiguration.updateStrategy
        if (newDocument.hasOwnProperty(specialNames.strategy)) {
            updateStrategy = newDocument[specialNames.strategy] as string
            delete newDocument[specialNames.strategy]
        }
        let serialize:(value:any) => string = (value:any) => `${value}`
        if (toJSON)
            serialize = toJSON
        else if (JSON && JSON.hasOwnProperty('stringify'))
            serialize = (object:any):string => JSON.stringify(object, null, 4)
        else
            throwError('Needed "serialize" function is not available.')
        // / region collect old model types to migrate.
        const oldModelMapping:Mapping = {}
        if (updateStrategy === 'migrate')
            for (const name in models)
                if (
                    models.hasOwnProperty(name) &&
                    models[name].hasOwnProperty(specialNames.oldType) &&
                    ![null, undefined].includes(
                        models[name][specialNames.oldType] as unknown as null
                    )
                )
                    for (const oldName of ([] as Array<string>).concat(
                        models[name][specialNames.oldType] as Array<string>
                    ))
                        oldModelMapping[oldName] = name
        // / endregion
        // endregion
        // region functions
        const determineTrimmedString:Function = (
            value?:null|string
        ):string => {
            if (typeof value === 'string')
                return value.trim()
            return ''
        }
        const getFilenameByPrefix:Function = (
            attachments:Attachments, prefix?:string
        ):null|string => {
            if (prefix) {
                for (const name in attachments)
                    if (
                        attachments.hasOwnProperty(name) &&
                        name.startsWith(prefix)
                    )
                        return name
            } else {
                const keys:Array<string> = Object.keys(attachments)
                if (keys.length)
                    return keys[0]
            }
            return null
        }
        const attachmentWithPrefixExists:Function = (
            namePrefix:string
        ):boolean => {
            if (newDocument.hasOwnProperty(specialNames.attachment)) {
                const attachments:Attachments =
                    newDocument[specialNames.attachment] as Attachments
                const name:string = getFilenameByPrefix(
                    attachments, namePrefix
                )
                if (name)
                    return (
                        attachments[name].hasOwnProperty('stub') &&
                        (attachments[name] as StubAttachment).stub ||
                        attachments[name].hasOwnProperty('data') &&
                        ![null, undefined].includes(
                            (attachments[name] as FullAttachment).data as
                                unknown as null
                        )
                    )
            }
            return false
        }
        const evaluate:Function = (
            givenExpression?:null|string,
            isEvaluation:boolean = false,
            givenScope:object = {}
        ):EvaluationResult|void => {
            const expression:string = determineTrimmedString(givenExpression)
            if (expression) {
                const code:string =
                    (isEvaluation ? 'return ' : '') + expression
                // region determine scope
                const scope:object = {
                    attachmentWithPrefixExists,
                    checkDocument,
                    code,
                    getFilenameByPrefix,
                    idName,
                    modelConfiguration,
                    models,
                    now,
                    nowUTCTimestamp,
                    revisionName,
                    securitySettings,
                    serialize,
                    specialNames,
                    typeName,
                    userContext
                }
                for (const name in givenScope)
                    if (givenScope.hasOwnProperty(name))
                        scope[name as keyof object] =
                            givenScope[name as keyof object]
                // endregion
                // region compile
                let callable:Function|undefined
                try {
                    callable = new Function(...Object.keys(scope), code)
                } catch (error) {
                    const message:string = serialize(error)
                    throwError(
                        message, 'compilation', {code, error, message, scope}
                    )
                }
                // endregion
                // region run
                const result:EvaluationResult = {
                    code,
                    result: undefined,
                    scope
                }
                try {
                    result.result =
                        (callable as Function)(...Object.values(scope))
                } catch (error) {
                    const message:string = serialize(error)
                    throwError(
                        serialize(error),
                        'runtime',
                        {code, error, message, scope}
                    )
                }
                return result
                // endregion
            }
            throwError('No expression to evaluate provided.', 'empty')
        }
        const checkDocument:Function = (
            newDocument:Document,
            oldDocument:Document|null,
            parentNames:Array<string> = []
        ):CheckedDocumentResult => {
            const pathDescription:string =
                parentNames.length ? ` in ${parentNames.join(' -> ')}` : ''
            let changedPath:Array<string> = []
            const checkModelType:Function = ():void => {
                // region check for model type (optionally migrate them)
                if (!newDocument.hasOwnProperty(typeName))
                    if (
                        oldDocument &&
                        oldDocument.hasOwnProperty(typeName) &&
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
                        'TypeName: You have to specify a model type ' +
                        'which matches "' +
                        modelConfiguration.property.name
                            .typeRegularExpressionPattern.public +
                        `" as public type (given "${newDocument[typeName]}")` +
                        `${pathDescription}.`
                    )
                if (!models.hasOwnProperty(newDocument[typeName] as string))
                    if (oldModelMapping.hasOwnProperty(
                        newDocument[typeName] as string
                    ))
                        newDocument[typeName] =
                            oldModelMapping[newDocument[typeName] as string]
                    else
                        throwError(
                            `Model: Given model "${newDocument[typeName]}" ` +
                            ` is not specified${pathDescription}.`
                        )
                // endregion
            }
            checkModelType()
            let modelName:string = newDocument[typeName] as string
            const model:Model = models[modelName]
            let additionalPropertySpecification:null|PropertySpecification =
                null
            if (
                model.hasOwnProperty(specialNames.additional) &&
                model[specialNames.additional]
            )
                additionalPropertySpecification = model[
                    specialNames.additional
                ]
            // region document specific functions
            const checkPropertyConstraints:Function = (
                newValue:any,
                name:string,
                propertySpecification:PropertySpecification,
                oldValue?:any,
                types:Array<string> = [
                    'constraintExecution', 'constraintExpression'
                ]
            ):void => {
                for (const type of types)
                    if (propertySpecification.hasOwnProperty(type)) {
                        let result:EvaluationResult<boolean>
                        try {
                            result = evaluate(
                                propertySpecification[
                                    type as keyof PropertySpecification
                                ].evaluation,
                                type.endsWith('Expression'),
                                {
                                    checkPropertyContent,
                                    code: propertySpecification[
                                        type as keyof PropertySpecification
                                    ].evaluation,
                                    model,
                                    modelName,
                                    name,
                                    newDocument,
                                    newValue,
                                    oldDocument,
                                    oldValue,
                                    parentNames,
                                    pathDescription,
                                    propertySpecification,
                                    type
                                }
                            )
                        } catch (error) {
                            if (error.hasOwnProperty('compilation'))
                                throwError(
                                    `Compilation: Hook "${type}" has invalid` +
                                    ` code "${error.code}": "` +
                                    `${error.message}"${pathDescription}.`
                                )
                            if (error.hasOwnProperty('runtime'))
                                throwError(
                                    `Runtime: Hook "${type}" has throw an ` +
                                    `error with code "${error.code}": "` +
                                    `${error.message}"${pathDescription}.`
                                )
                            if (!error.hasOwnProperty('empty'))
                                throw error
                        }
                        if (!result!.result) {
                            const description:string = determineTrimmedString(
                                propertySpecification[
                                    type as keyof PropertySpecification
                                ].description
                            )
                            throwError(
                                type.charAt(0).toUpperCase() +
                                `${type.substring(1)}: ` +
                                (description ?
                                    new Function(
                                        ...Object.keys(result!.scope),
                                        `return ${description}`
                                    )(...Object.values(result!.scope)) :
                                    `Property "${name}" should satisfy ` +
                                    `constraint "${result!.code}" (given "` +
                                    `${serialize(newValue)}")` +
                                    `${pathDescription}.`
                                )
                            )
                        }
                    }
            }
            const checkPropertyContent:Function = (
                newValue:any,
                name:string,
                propertySpecification:PropertySpecification,
                oldValue:any = null
            ):{changedPath:Array<string>;newValue:any} => {
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
                    !newValue.hasOwnProperty(typeName) &&
                    types.length === 1 &&
                    models.hasOwnProperty(types[0])
                )
                    newValue[typeName] = types[0]
                let typeMatched:boolean = false
                for (const type of types)
                    if (models.hasOwnProperty(type)) {
                        if (
                            typeof newValue === 'object' &&
                            Object.getPrototypeOf(newValue) ===
                                Object.prototype &&
                            newValue.hasOwnProperty(typeName) &&
                            newValue[typeName] !== type &&
                            updateStrategy === 'migrate' &&
                            types.length === 1
                        ) {
                            /*
                                Derive nested (object based) maybe compatible
                                type definition. Nested types have to be
                                checked than.
                            */
                            newValue[typeName] = type
                            changedPath = parentNames.concat(
                                name, 'migrate nested object type')
                        }
                        if (
                            typeof newValue === 'object' &&
                            Object.getPrototypeOf(newValue) ===
                                Object.prototype &&
                            newValue.hasOwnProperty(typeName) &&
                            newValue[typeName] === type
                        ) {
                            const result:CheckedDocumentResult = checkDocument(
                                newValue, oldValue, parentNames.concat(name)
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
                        const initialNewValue:any = newValue
                        if (
                            newValue !== null && typeof newValue !== 'number'
                        ) {
                            newValue = new Date(newValue)
                            newValue = Date.UTC(
                                newValue.getUTCFullYear(),
                                newValue.getUTCMonth(),
                                newValue.getUTCDate(),
                                newValue.getUTCHours(),
                                newValue.getUTCMinutes(),
                                newValue.getUTCSeconds(),
                                newValue.getUTCMilliseconds()
                            ) / 1000
                        }
                        if (typeof newValue !== 'number' || isNaN(newValue)) {
                            if (types.length === 1)
                                throwError(
                                    `PropertyType: Property "${name}" isn't ` +
                                    'of (valid) type "DateTime" (given "' +
                                    serialize(initialNewValue).replace(
                                        /^"/, ''
                                    ).replace(/"$/, '') +
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
                            parseInt(newValue, 10) !== newValue
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
                        `${newValue}" of type "${typeof newValue}")` +
                        `${pathDescription}.`
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
                            `${propertySpecification.minimumLength} (given ` +
                            `${newValue} with length ${newValue.length})` +
                            `${pathDescription}.`
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
                            `${propertySpecification.maximumLength} (given ` +
                            `${newValue} with length ${newValue.length})` +
                            `${pathDescription}.`
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
                            `${propertySpecification.type}) must satisfy a ` +
                            `minimum of ${propertySpecification.minimum} (` +
                            `given ${newValue} is too low)${pathDescription}.`
                        )
                    if (
                        ![null, undefined].includes(
                            propertySpecification.maximum as null
                        ) &&
                        newValue > (propertySpecification.maximum as number)
                    )
                        throwError(
                            `Maximum: Property "${name}" (type ` +
                            `${propertySpecification.type}) must satisfy a ` +
                            `maximum of ${propertySpecification.maximum} (` +
                            `given ${newValue} is too high)${pathDescription}.`
                        )
                }
                // endregion
                // region selection
                if (propertySpecification.selection) {
                    const selection = Array.isArray(
                        propertySpecification.selection
                    ) ?
                        propertySpecification.selection :
                        Object.values(propertySpecification.selection)
                    if (!selection.includes(newValue))
                        throwError(
                            `Selection: Property "${name}" (type ` +
                            `${propertySpecification.type}) should be one of` +
                            ` "${selection.join('", "')}". But is "` +
                            `${newValue}"${pathDescription}.`
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
                    ).test(newValue)
                ))
                    throwError(
                        `PatternMatch: Property "${name}" should match ` +
                        'regular expression pattern ' +
                        propertySpecification.regularExpressionPattern +
                        ` (given "${newValue}")${pathDescription}.`
                    )
                else if (!(
                    [null, undefined].includes(
                        propertySpecification
                            .invertedRegularExpressionPattern as null
                    ) ||
                    !(new RegExp(
                        propertySpecification
                            .invertedRegularExpressionPattern as string
                    )).test(newValue)
                ))
                    throwError(
                        `InvertedPatternMatch: Property "${name}" should ` +
                        'not match regular expression pattern ' +
                        propertySpecification
                            .invertedRegularExpressionPattern +
                        ` (given "${newValue}")${pathDescription}.`
                    )
                // endregion
                checkPropertyConstraints(
                    newValue, name, propertySpecification, oldValue
                )
                if (serialize(newValue) !== serialize(oldValue))
                    changedPath = parentNames.concat(name, 'value updated')
                return {newValue, changedPath}
            }
            // / region create hook
            const runCreatePropertyHook:Function = (
                propertySpecification:PropertySpecification,
                newDocument:Document,
                oldDocument:Document|null,
                name:string
            ):void => {
                if (!oldDocument)
                    for (const type of [
                        'onCreateExecution', 'onCreateExpression'
                    ])
                        if (propertySpecification.hasOwnProperty(type)) {
                            let result:EvaluationResult
                            try {
                                result = evaluate(
                                    propertySpecification[
                                        type as keyof PropertySpecification
                                    ],
                                    type.endsWith('Expression'),
                                    {
                                        checkPropertyContent,
                                        code: propertySpecification[
                                            type as keyof PropertySpecification
                                        ],
                                        model,
                                        modelName,
                                        name,
                                        newDocument,
                                        oldDocument,
                                        propertySpecification,
                                        type
                                    }
                                )
                            } catch (error) {
                                if (error.hasOwnProperty('compilation'))
                                    throwError(
                                        `Compilation: Hook "${type}" has ` +
                                        `invalid code "${error.code}" for ` +
                                        `property "${name}": ` +
                                        `${error.message}${pathDescription}.`
                                    )
                                if (error.hasOwnProperty('runtime'))
                                    throwError(
                                        `Runtime: Hook "${type}" has throw ` +
                                        `an error with code "${error.code}" ` +
                                        `for property "${name}": ` +
                                        `${error.message}${pathDescription}.`
                                    )
                                if (!error.hasOwnProperty('empty'))
                                    throw error
                            }
                            if (![null, undefined].includes(result!.result))
                                newDocument[name] = result!.result
                        }
            }
            // / endregion
            // / region update hook
            const runUpdatePropertyHook:Function = (
                propertySpecification:PropertySpecification,
                newDocument:Document,
                oldDocument:Document,
                name:string
            ):void => {
                if (!newDocument.hasOwnProperty(name))
                    return
                if (
                    propertySpecification.trim &&
                    typeof newDocument[name] === 'string'
                )
                    newDocument[name] = (newDocument[name] as string).trim()
                if (propertySpecification.emptyEqualsToNull && (
                    newDocument[name] === '' ||
                    Array.isArray(newDocument[name]) &&
                    (newDocument[name] as Array<object>).length === 0 ||
                    typeof newDocument[name] === 'object' &&
                    newDocument[name] !== null &&
                    Object.keys(newDocument).length === 0
                ))
                    newDocument[name] = null
                for (const type of ['onUpdateExecution', 'onUpdateExpression'])
                    if (propertySpecification.hasOwnProperty(type))
                        try {
                            newDocument[name] = evaluate(
                                propertySpecification[
                                    type as keyof PropertySpecification
                                ],
                                type.endsWith('Expression'),
                                {
                                    checkPropertyContent,
                                    code: propertySpecification[
                                        type as keyof PropertySpecification
                                    ],
                                    modelName,
                                    name,
                                    newDocument,
                                    oldDocument,
                                    parentNames,
                                    pathDescription,
                                    propertySpecification,
                                    type
                                }
                            ).result
                        } catch (error) {
                            if (error.hasOwnProperty('compilation'))
                                throwError(
                                    `Compilation: Hook "${type}" has invalid` +
                                    ` code "${error.code}" for property "` +
                                    `${name}": ${error.message}` +
                                    `${pathDescription}.`
                                )
                            if (error.hasOwnProperty('runtime'))
                                throwError(
                                    `Runtime: Hook "${type}" has throw an ` +
                                    `error with code "${error.code}" for ` +
                                    `property "${name}": ${error.message}` +
                                    `${pathDescription}.`
                                )
                            if (!error.hasOwnProperty('empty'))
                                throw error
                        }
            }
            // / endregion
            // endregion
            const specifiedPropertyNames:Array<string> = Object.keys(model)
                .filter((name:string):boolean => ![
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
                ].includes(name))
            // region migrate old model specific property names
            if (updateStrategy === 'migrate')
                for (const name of specifiedPropertyNames)
                    if (![null, undefined].includes(
                        model[name].oldName as null
                    ))
                        for (const oldName of ([] as Array<string>).concat(
                            model[name].oldName as Array<string>
                        ))
                            if (newDocument.hasOwnProperty(oldName)) {
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
                    if (model.hasOwnProperty(type)) {
                        let result:Document|null|undefined
                        try {
                            result = evaluate(
                                model[type],
                                type.endsWith('Expression'),
                                {
                                    checkPropertyContent,
                                    code: model[type],
                                    id,
                                    model,
                                    modelName,
                                    newDocument,
                                    oldDocument,
                                    parentNames,
                                    pathDescription,
                                    type
                                }
                            ).result
                        } catch (error) {
                            if (error.hasOwnProperty('compilation'))
                                throwError(
                                    `Compilation: Hook "${type}" has invalid` +
                                    ` code "${error.code}" for document "` +
                                    `${modelName}": ${error.message}` +
                                    `${pathDescription}.`
                                )
                            if (error.hasOwnProperty('runtime'))
                                throwError(
                                    `Runtime: Hook "${type}" has throw an ` +
                                    `error with code "${error.code}" for ` +
                                    `document "${modelName}": ` +
                                    `${error.message}${pathDescription}.`
                                )
                            if (!error.hasOwnProperty('empty'))
                                throw error
                        }
                        if (![null, undefined].includes(result as null))
                            newDocument = result as Document
                        checkModelType()
                        modelName = newDocument[typeName] as string
                        if (parentNames.length === 0)
                            setDocumentEnvironment()
                    }
            // endregion
            // region run update document hook
            for (const type of [
                specialNames.update.execution, specialNames.update.expression
            ])
                if (model.hasOwnProperty(type)) {
                    let result:Document|null|undefined
                    try {
                        result = evaluate(
                            model[type],
                            type.endsWith('Expression'),
                            {
                                checkPropertyContent,
                                code: model[type],
                                id,
                                model,
                                modelName,
                                newDocument,
                                oldDocument,
                                parentNames,
                                pathDescription,
                                type
                            }
                        ).result
                    } catch (error) {
                        if (error.hasOwnProperty('compilation'))
                            throwError(
                                `Compilation: Hook "${type}" has invalid ` +
                                `code "${error.code}" for document "` +
                                `${modelName}": ${error.message}` +
                                `${pathDescription}.`
                            )
                        if (error.hasOwnProperty('runtime'))
                            throwError(
                                `Runtime: Hook "${type}" has throw an error ` +
                                `with code "${error.code}" for document "` +
                                `${modelName}": ${error.message}` +
                                `${pathDescription}.`
                            )
                        if (!error.hasOwnProperty('empty'))
                            throw error
                    }
                    if (![undefined, null].includes(result as null))
                        newDocument = result as Document
                    checkModelType()
                    modelName = newDocument[typeName] as string
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
                if (specialNames.attachment === name) {
                    // region attachment
                    for (const type in model[name])
                        if (model[name].hasOwnProperty(type)) {
                            if (
                                !newDocument.hasOwnProperty(name) ||
                                newDocument[name] === null
                            )
                                newDocument[name] = {}
                            if (
                                oldDocument &&
                                !oldDocument.hasOwnProperty(name)
                            )
                                oldDocument[name] = {}
                            const newFileNames:Array<string> =
                                Object.keys(
                                    newDocument[name] as Attachments
                                ).filter((fileName:string):boolean =>
                                    ((
                                        newDocument[name] as Attachments
                                    )[fileName] as FullAttachment).data !==
                                        null &&
                                    new RegExp(type).test(fileName)
                                )
                            let oldFileNames:Array<string> = []
                            if (oldDocument) {
                                const oldAttachments:Attachments =
                                    oldDocument[name] as Attachments
                                const newAttachments:Attachments =
                                    newDocument[name] as Attachments
                                oldFileNames = Object.keys(oldAttachments)
                                    .filter((fileName:string):boolean =>
                                        !(
                                            newAttachments.hasOwnProperty(
                                                fileName
                                            ) &&
                                            newAttachments[fileName]
                                                .hasOwnProperty('data') &&
                                            (
                                                newAttachments[fileName] as
                                                    FullAttachment
                                            ).data === null
                                        ) &&
                                        oldAttachments[fileName] &&
                                        oldAttachments[fileName]
                                            .hasOwnProperty('data') &&
                                        (
                                            oldAttachments[fileName] as
                                                FullAttachment
                                        ).data !== null &&
                                        new RegExp(type).test(fileName)
                                )
                            }
                            const propertySpecification:PropertySpecification =
                                model[name][
                                    type as keyof PropertySpecification
                                ]
                            for (const fileName of newFileNames)
                                runCreatePropertyHook(
                                    propertySpecification,
                                    newDocument[name],
                                    oldDocument && oldDocument[name] ?
                                        oldDocument[name] :
                                        null,
                                    fileName
                                )
                            for (const fileName of newFileNames)
                                runUpdatePropertyHook(
                                    propertySpecification,
                                    newDocument[name],
                                    oldDocument && oldDocument[name] ?
                                        oldDocument[name] :
                                        null,
                                    fileName
                                )
                            if ([null, undefined].includes(
                                propertySpecification.default
                            )) {
                                if (!(
                                    propertySpecification.nullable ||
                                    newFileNames.length > 0 ||
                                    oldFileNames.length > 0
                                ))
                                    throwError(
                                        'AttachmentMissing: Missing ' +
                                        `attachment for type "${type}"` +
                                        `${pathDescription}.`
                                    )
                                if (
                                    updateStrategy === 'fillUp' &&
                                    newFileNames.length === 0 &&
                                    oldFileNames.length > 0
                                )
                                    for (const fileName of oldFileNames)
                                        if (
                                            newDocument[name][fileName] ===
                                                null
                                        )
                                            changedPath = parentNames.concat(
                                                name, fileName, 'file removed'
                                            )
                                        else
                                            newDocument[name][fileName] = (
                                                oldDocument as Document
                                            )[name][fileName]
                            } else if (newFileNames.length === 0)
                                if (oldFileNames.length === 0) {
                                    for (
                                        const fileName in
                                            propertySpecification.default
                                    )
                                        if (
                                            propertySpecification.default
                                                .hasOwnProperty(fileName)
                                        ) {
                                            newDocument[name][fileName] =
                                                propertySpecification.default[
                                                    fileName
                                                ]
                                            changedPath = parentNames.concat(
                                                name, type, 'add default file'
                                            )
                                        }
                                } else if (updateStrategy === 'fillUp')
                                    for (const fileName of oldFileNames)
                                        newDocument[name][fileName] = (
                                            oldDocument as Document
                                        )[name][fileName]
                        }
                    // endregion
                } else {
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
                        propertySpecification.default
                    )) {
                        if (
                            !(propertySpecification.nullable || (
                                newDocument.hasOwnProperty(name) ||
                                oldDocument &&
                                oldDocument.hasOwnProperty(name) &&
                                updateStrategy
                            ))
                        )
                            throwError(
                                `MissingProperty: Missing property "${name}"` +
                                `${pathDescription}.`
                            )
                        if (
                            !newDocument.hasOwnProperty(name) &&
                            oldDocument &&
                            oldDocument.hasOwnProperty(name)
                        )
                            if (updateStrategy === 'fillUp')
                                newDocument[name] = oldDocument[name]
                            else if (!updateStrategy)
                                changedPath = parentNames.concat(
                                    name, 'property removed')
                    } else if (
                        !newDocument.hasOwnProperty(name) ||
                        newDocument[name] === null
                    )
                        if (oldDocument && oldDocument.hasOwnProperty(name)) {
                            if (updateStrategy === 'fillUp')
                                newDocument[name] = oldDocument[name]
                            else if (updateStrategy === 'migrate') {
                                newDocument[name] =
                                    propertySpecification.default
                                changedPath = parentNames.concat(
                                    name, 'migrate default value')
                            }
                        } else {
                            newDocument[name] = propertySpecification.default
                            changedPath = changedPath.concat(
                                name, 'add default value')
                        }
                }
                // endregion
            // region check given data
            // / region remove new data which already exists
            if (oldDocument && updateStrategy === 'incremental')
                for (const name in newDocument)
                    if (
                        newDocument.hasOwnProperty(name) &&
                        oldDocument.hasOwnProperty(name) &&
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
                            oldDocument[name] === newDocument[name] ||
                            serialize(oldDocument[name]) ===
                                serialize(newDocument[name])
                        )
                    ) {
                        delete newDocument[name]
                        continue
                    }
            // / endregion
            for (const name in newDocument)
                if (
                    newDocument.hasOwnProperty(name) &&
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
                    if (model.hasOwnProperty(name))
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
                    // region writable/mutable/nullable
                    const checkWriteableMutableNullable:Function = (
                        propertySpecification:PropertySpecification,
                        newDocument:Document,
                        oldDocument:Document|null,
                        name:string
                    ):boolean => {
                        // region writable
                        if (!propertySpecification.writable)
                            if (oldDocument)
                                if (
                                    oldDocument.hasOwnProperty(name) &&
                                    serialize(newDocument[name]) ===
                                        serialize(oldDocument[name])
                                ) {
                                    if (
                                        name !== idName &&
                                        updateStrategy === 'incremental'
                                    )
                                        delete newDocument[name]
                                    return true
                                } else
                                    throwError(
                                        `Readonly: Property "${name}" is not` +
                                        ` writable (old document "` +
                                        `${serialize(oldDocument)}")` +
                                        `${pathDescription}.`
                                    )
                            else
                                throwError(
                                    `Readonly: Property "${name}" is not ` +
                                    `writable${pathDescription}.`
                                )
                        // endregion
                        // region mutable
                        if (
                            !propertySpecification.mutable &&
                            oldDocument &&
                            oldDocument.hasOwnProperty(name)
                        )
                            if (serialize(newDocument[name]) === serialize(
                                oldDocument[name]
                            )) {
                                if (
                                    updateStrategy === 'incremental' &&
                                    !modelConfiguration.property.name.reserved
                                        .concat(
                                            specialNames.deleted, idName,
                                            revisionName
                                        ).includes(name)
                                )
                                    delete newDocument[name]
                                return true
                            } else if (updateStrategy !== 'migrate')
                                throwError(
                                    `Immutable: Property "${name}" is not ` +
                                    'writable (old document "' +
                                    `${serialize(oldDocument)}")` +
                                    `${pathDescription}.`
                                )
                        // endregion
                        // region nullable
                        if (newDocument[name] === null)
                            if (propertySpecification.nullable) {
                                delete newDocument[name]
                                if (
                                    oldDocument &&
                                    oldDocument.hasOwnProperty(name)
                                )
                                    changedPath = parentNames.concat(
                                        name, 'delete property')
                                return true
                            } else
                                throwError(
                                    `NotNull: Property "${name}" should not ` +
                                    `by "null"${pathDescription}.`
                                )
                        // endregion
                        return false
                    }
                    if (specialNames.attachment === name) {
                        for (const fileName in newDocument[name])
                            if (newDocument[name].hasOwnProperty(fileName))
                                for (const type in model[name])
                                    if (
                                        model[name].hasOwnProperty(type) &&
                                        (new RegExp(type)).test(fileName)
                                    ) {
                                        checkWriteableMutableNullable(
                                            model[name][type as
                                                keyof PropertySpecification
                                            ],
                                            newDocument,
                                            oldDocument,
                                            fileName
                                        )
                                        break
                                    }
                        continue
                    } else if (checkWriteableMutableNullable(
                        propertySpecification, newDocument, oldDocument, name
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
                        // region check arrays
                        if (!Array.isArray(newDocument[name]))
                            throwError(
                                `PropertyType: Property "${name}" isn't of ` +
                                `type "array -> ` +
                                `${propertySpecification.type}" (given "` +
                                `${serialize(newDocument[name])}")` +
                                `${pathDescription}.`
                            )
                        else if (
                            ![null, undefined].includes(
                                propertySpecification.minimumNumber as null
                            ) &&
                            newDocument[name].length <
                                (propertySpecification.minimumNumber as number)
                        )
                            throwError(
                                `MinimumArrayLength: Property "${name}" (` +
                                `array of length ${newDocument[name].length}` +
                                `) doesn't fullfill minimum array length of ` +
                                propertySpecification.minimumNumber +
                                `${pathDescription}.`
                            )
                        else if (
                            ![null, undefined].includes(
                                propertySpecification.maximumNumber as null
                            ) &&
                            (propertySpecification.maximumNumber as number) <
                                newDocument[name].length
                        )
                            throwError(
                                `MaximumArrayLength: Property "${name}" (` +
                                `array of length ${newDocument[name].length}` +
                                `) doesn't fullfill maximum array length of ` +
                                propertySpecification.maximumNumber +
                                `${pathDescription}.`
                            )
                        checkPropertyConstraints(
                            newDocument[name],
                            name,
                            propertySpecification,
                            oldDocument &&
                            oldDocument.hasOwnProperty(name) &&
                            oldDocument[name] ||
                            undefined,
                            [
                                'arrayConstraintExecution',
                                'arrayConstraintExpression'
                            ]
                        )
                        // / region check/migrate array content
                        const propertySpecificationCopy:PropertySpecification =
                            {}
                        for (const key in propertySpecification)
                            if (propertySpecification.hasOwnProperty(key))
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
                                    propertySpecificationCopy[
                                        key as keyof PropertySpecification
                                    ] = propertySpecification[
                                        key as keyof PropertySpecification
                                    ]
                        // // region add missing array item types
                        /*
                            Derive nested missing explicit type definition if
                            possible. Objects in arrays without explicit type
                            definition will receive one.
                        */
                        if (
                            propertySpecificationCopy.type &&
                            propertySpecificationCopy.type.length === 1 &&
                            models.hasOwnProperty(
                                propertySpecificationCopy.type[0]
                            )
                        )
                            for (const value of newDocument[name].slice())
                                if (
                                    typeof value === 'object' &&
                                    Object.getPrototypeOf(value) ===
                                        Object.prototype &&
                                    !value.hasOwnProperty(typeName)
                                )
                                    value[typeName] =
                                        propertySpecificationCopy.type[0]
                        // // endregion
                        // // region check each array item
                        let index:number = 0
                        for (const value of newDocument[name].slice()) {
                            newDocument[name][index] = checkPropertyContent(
                                value,
                                `${index + 1}. value in ${name}`,
                                propertySpecificationCopy
                            ).newValue
                            if (value === null)
                                newDocument[name].splice(index, 1)
                            index += 1
                        }
                        // // endregion
                        if (!(
                            oldDocument &&
                            oldDocument.hasOwnProperty(name) &&
                            Array.isArray(oldDocument[name]) &&
                            oldDocument[name].length ===
                                newDocument[name].length &&
                            serialize(oldDocument[name]) ===
                                serialize(newDocument[name])
                        ))
                            changedPath = parentNames.concat(
                                name, 'array updated'
                            )
                        // / endregion
                        // endregion
                    } else {
                        const oldValue:any =
                            oldDocument &&
                            oldDocument.hasOwnProperty(name) ?
                                oldDocument[name] :
                                null
                        const result:{
                            changedPath:Array<string>;newValue:any;
                        } = checkPropertyContent(
                            newDocument[name],
                            name,
                            propertySpecification,
                            oldValue
                        )
                        newDocument[name] = result.newValue
                        if (result.changedPath.length)
                            changedPath = result.changedPath
                        if (newDocument[name] === null) {
                            if (oldValue !== null)
                                changedPath = parentNames.concat(
                                    name, 'property removed'
                                )
                            delete newDocument[name]
                        }
                    }
                }
            // / region constraint
            for (let type in specialNames.constraint)
                if (
                    specialNames.constraint.hasOwnProperty(type) &&
                    (type = specialNames.constraint[
                        type as keyof SpecialPropertyNames['constraint']]
                    ) &&
                    model.hasOwnProperty(type)
                )
                    for (const constraint of ([] as Array<Constraint>).concat(
                        model[type as keyof Model] as Array<Constraint>
                    )) {
                        let result:EvaluationResult<boolean>
                        try {
                            result = evaluate(
                                constraint.evaluation,
                                type === specialNames.constraint.expression,
                                {
                                    checkPropertyContent,
                                    code: constraint.evaluation,
                                    model,
                                    modelName,
                                    newDocument,
                                    oldDocument,
                                    parentNames,
                                    pathDescription,
                                    type
                                }
                            )
                        } catch (error) {
                            if (error.hasOwnProperty('compilation'))
                                throwError(
                                    `Compilation: Hook "${type}" has invalid` +
                                    ` code "${error.code}": "` +
                                    `${error.message}"${pathDescription}.`
                                )
                            if (error.hasOwnProperty('runtime'))
                                throwError(
                                    `Runtime: Hook "${type}" has thrown an ` +
                                    `error with code "${error.code}": ` +
                                    `${error.message}${pathDescription}.`
                                )
                            if (!error.hasOwnProperty('empty'))
                                throw error
                        }
                        if (!result!.result) {
                            const errorName:string = type.replace(
                                /^[^a-zA-Z]+/, ''
                            )
                            throwError(
                                errorName.charAt(0).toUpperCase() +
                                `${errorName.substring(1)}: ` +
                                (
                                    constraint.description ?
                                        new Function(
                                            ...Object.keys(result!.scope),
                                            'return ' +
                                            constraint.description.trim()
                                        )(...Object.values(result!.scope)) :
                                        `Model "${modelName}" should satisfy` +
                                        ` constraint "${result!.code}" (given` +
                                        ` "${serialize(newDocument)}")` +
                                        `${pathDescription}.`
                                )
                            )
                        }
                    }
            // / endregion
            // / region attachment
            if (newDocument.hasOwnProperty(specialNames.attachment)) {
                const newAttachments:Attachments =
                    newDocument[specialNames.attachment]
                if (
                    typeof newAttachments !== 'object' ||
                    Object.getPrototypeOf(newAttachments) !== Object.prototype
                )
                    throwError(
                        'AttachmentType: given attachment has invalid type' +
                        `${pathDescription}.`
                    )
                // region migrate old attachments
                let oldAttachments:any = null
                if (
                    oldDocument &&
                    oldDocument.hasOwnProperty(specialNames.attachment)
                ) {
                    oldAttachments = oldDocument[specialNames.attachment]
                    if (
                        oldAttachments !== null &&
                        typeof oldAttachments === 'object'
                    )
                        for (const fileName in oldAttachments)
                            if (oldAttachments.hasOwnProperty(fileName))
                                if (newAttachments.hasOwnProperty(fileName))
                                    if (
                                        newAttachments[fileName] === null ||
                                        (newAttachments[fileName] as
                                            FullAttachment
                                        ).data === null ||
                                        newAttachments[fileName]
                                            .content_type ===
                                                oldAttachments[fileName]
                                                    .content_type &&
                                        (newAttachments[fileName] as
                                            FullAttachment
                                        ).data === (oldAttachments[fileName] as
                                            FullAttachment
                                        ).data
                                    ) {
                                        if (
                                            newAttachments[fileName] ===
                                                null ||
                                            (newAttachments[fileName] as
                                                FullAttachment
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
                                else if (updateStrategy === 'fillUp')
                                    newAttachments[fileName] =
                                        oldAttachments[fileName]
                                else if (!updateStrategy)
                                    changedPath = parentNames.concat(
                                        specialNames.attachment,
                                        fileName,
                                        'attachment removed'
                                    )
                }
                for (const fileName in newAttachments)
                    if (newAttachments.hasOwnProperty(fileName))
                        if (
                            [null, undefined].includes(
                                newAttachments[fileName] as unknown as null
                            ) ||
                            (
                                newAttachments[fileName] as FullAttachment
                            ).data === null
                        )
                            delete newAttachments[fileName]
                        else if (!(
                            oldAttachments &&
                            oldAttachments.hasOwnProperty(fileName) &&
                            newAttachments[fileName].content_type ===
                                oldAttachments[fileName].content_type &&
                            (
                                newAttachments[fileName] as FullAttachment
                            ).data === (
                                oldAttachments[fileName] as FullAttachment
                            ).data
                        ))
                            changedPath = parentNames.concat(
                                specialNames.attachment,
                                fileName,
                                'attachment updated'
                            )
                // endregion
                if (Object.keys(newAttachments).length === 0)
                    delete newDocument[specialNames.attachment]
                const attachmentToTypeMapping:{[key:string]:Array<string>} = {}
                for (const type in model[specialNames.attachment])
                    if (model[specialNames.attachment].hasOwnProperty(type))
                        attachmentToTypeMapping[type] = []
                for (const name in newAttachments)
                    if (newAttachments.hasOwnProperty(name)) {
                        let matched:boolean = false
                        for (const type in model[specialNames.attachment])
                            if ((new RegExp(type)).test(name)) {
                                attachmentToTypeMapping[type].push(name)
                                matched = true
                                break
                            }
                        if (!matched)
                            throwError(
                                'AttachmentTypeMatch: None of the specified ' +
                                'attachment types ("' +
                                Object.keys(model[specialNames.attachment])
                                    .join('", "') +
                                `") matches given one ("${name}")` +
                                `${pathDescription}.`
                            )
                    }
                let sumOfAggregatedSizes:number = 0
                for (const type in attachmentToTypeMapping) {
                    const specification:PropertySpecification =
                        model[specialNames.attachment][
                            type as keyof PropertySpecification
                        ]
                    if (!attachmentToTypeMapping.hasOwnProperty(type))
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
                            `${specification.maximumNumber} from type "` +
                            `${type}"${pathDescription}.`
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
                            `${specification.minimumNumber} from type "` +
                            `${type}"${pathDescription}.`
                        )
                    let aggregatedSize:number = 0
                    for (const fileName of attachmentToTypeMapping[type]) {
                        if (!(
                            [null, undefined].includes(
                                specification.regularExpressionPattern as null
                            ) ||
                            new RegExp(
                                specification.regularExpressionPattern as
                                    string
                            ).test(fileName)
                        ))
                            throwError(
                                'AttachmentName: given attachment name "' +
                                `${fileName}" doesn't satisfy specified ` +
                                'regular expression pattern "' +
                                specification.regularExpressionPattern +
                                `" from type "${type}"${pathDescription}.`
                            )
                        else if (!(
                            [null, undefined].includes(
                                specification
                                    .invertedRegularExpressionPattern as null
                            ) ||
                            !(new RegExp(
                                specification
                                    .invertedRegularExpressionPattern as string
                            )).test(fileName)
                        ))
                            throwError(
                                'InvertedAttachmentName: given attachment ' +
                                `name "${fileName}" doesn't satisfy ` +
                                'specified regular expression pattern "' +
                                specification
                                    .invertedRegularExpressionPattern +
                                `" from type "${type}"${pathDescription}.`
                            )
                        else if (!(
                            [null, undefined].includes(
                                specification
                                    .contentTypeRegularExpressionPattern as
                                        null
                            ) ||
                            newAttachments[fileName].hasOwnProperty(
                                'content_type'
                            ) &&
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
                                specification
                                    .contentTypeRegularExpressionPattern +
                                `" from type "${type}"${pathDescription}.`
                            )
                        const pattern:null|string|undefined = specification
                            .invertedContentTypeRegularExpressionPattern
                        if (!(
                            [null, undefined].includes(pattern as null) ||
                            newAttachments[fileName].hasOwnProperty(
                                'content_type'
                            ) &&
                            newAttachments[fileName].content_type &&
                            !(new RegExp(pattern as string))
                                .test(newAttachments[fileName].content_type)
                        ))
                            throwError(
                                'InvertedAttachmentContentType: given ' +
                                'attachment content type "' +
                                `${newAttachments[fileName].content_type}" ` +
                                `doesn't satisfy specified regular ` +
                                `expression pattern "${pattern}" from type "` +
                                `${type}"${pathDescription}.`
                            )
                        let length:number = 0
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
                                'specified minimum  of ' +
                                `${specification.minimumSize} byte ` +
                                `${pathDescription}.`
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
                                `${specification.maximumSize} byte ` +
                                `${pathDescription}.`
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
                            `${specification.minimumAggregatedSize} byte ` +
                            `${pathDescription}.`
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
                            `${specification.maximumAggregatedSize} byte ` +
                            `${pathDescription}.`
                        )
                    sumOfAggregatedSizes += aggregatedSize
                }
                if (
                    model.hasOwnProperty(specialNames.minimumAggregatedSize) &&
                    ![null, undefined].includes(
                        model[specialNames.minimumAggregatedSize] as
                            unknown as null
                    ) &&
                    (model[specialNames.minimumAggregatedSize] as number) >
                        sumOfAggregatedSizes
                )
                    throwError(
                        'AggregatedMinimumSize: given aggregated size ' +
                        `${sumOfAggregatedSizes} byte doesn't satisfy ` +
                        'specified minimum of ' +
                        model[specialNames.minimumAggregatedSize] +
                        ` byte ${pathDescription}.`
                    )
                else if (
                    model.hasOwnProperty(specialNames.maximumAggregatedSize) &&
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
                        `${model[specialNames.maximumAggregatedSize]} byte ` +
                        `${pathDescription}.`
                    )
            }
            // / endregion
            // endregion
            if (
                oldDocument &&
                oldDocument.hasOwnProperty(specialNames.attachment) &&
                Object.keys(oldDocument[specialNames.attachment]).length === 0
            )
                delete oldDocument[specialNames.attachment]
            if (
                changedPath.length === 0 &&
                oldDocument &&
                updateStrategy === 'migrate'
            )
                for (const name in oldDocument)
                    if (
                        oldDocument.hasOwnProperty(name) &&
                        !newDocument.hasOwnProperty(name)
                    )
                        changedPath = parentNames.concat(
                            name, 'migrate removed property'
                        )
            return {changedPath, newDocument}
        }
        // endregion
        const result:CheckedDocumentResult =
            checkDocument(newDocument, oldDocument)
        if (
            result.newDocument._deleted &&
            !oldDocument ||
            !(
                result.newDocument._deleted &&
                oldDocument &&
                result.newDocument._deleted !== oldDocument._deleted ||
                result.changedPath.length
            )
        )
            throwError(
                'NoChange: No new data given. new document: ' +
                `${serialize(newDocument)}; old document: ` +
                `${serialize(oldDocument)}.`
            )
        if (securitySettings.hasOwnProperty(
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
        return result.newDocument
    }
}
export default DatabaseHelper
// region vim modline
// vim: set tabstop=4 shiftwidth=4 expandtab:
// vim: foldmethod=marker foldmarker=region,endregion:
// endregion
