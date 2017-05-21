// @flow
// -*- coding: utf-8 -*-
'use strict'
/* !
    region header
    Copyright Torben Sickert (info["~at~"]torben.website) 16.12.2012

    License
    -------

    This library written by Torben Sickert stand under a creative commons naming
    3.0 unported license. see http://creativecommons.org/licenses/by/3.0/deed.de
    endregion
*/
// region imports
// NOTE: Only needed for debugging this file.
import type {PlainObject} from 'clientnode'
try {
    require('source-map-support/register')
} catch (error) {}

// NOTE: Remove when "fetch" is supported by node.
import type {
    Constraint, AllowedModelRolesMapping, Model, Models, PropertySpecification,
    SecuritySettings, SimpleModelConfiguration, UserContext
} from './type'
// endregion
/**
 * A dumm plugin interface with all available hooks.
 */
export default class DatabaseHelper {
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
     * @param typePropertyName - Property name indicating to which model a
     * document belongs to.
     */
    static authenticate(
        newDocument:PlainObject, oldDocument:?PlainObject,
        userContext:UserContext = {
            db: 'dummy',
            name: '"unknown"',
            roles: []
        }, securitySettings:SecuritySettings = {
            admins: {names: [], roles: []}, members: {names: [], roles: []}
        }, allowedModelRolesMapping:AllowedModelRolesMapping,
        typePropertyName:string
    ):?true {
        let allowedRoles:Array<string> = ['_admin']
        let userRolesDescription:string = `Current user doesn't own any role`
        if (userContext) {
            if (!('name' in userContext))
                userContext.name = '"unknown"'
            if (
                allowedModelRolesMapping && typePropertyName &&
                newDocument.hasOwnProperty(typePropertyName) &&
                allowedModelRolesMapping.hasOwnProperty(
                    newDocument[typePropertyName])
            )
                allowedRoles = allowedRoles.concat(
                    allowedModelRolesMapping[newDocument[typePropertyName]])
            if (userContext.roles.length) {
                for (const userRole:string of userContext.roles)
                    if (allowedRoles.includes(userRole))
                        return true
                // IgnoreTypeCheck
                userRolesDescription = `Current user ${userContext.name} ` +
                    `owns the following roles: ` +
                    userContext.roles.join('", "')
            } else
                // IgnoreTypeCheck
                userRolesDescription = `Current user ${userContext.name} ` +
                    `doesn't own any role`
        }
        /* eslint-disable no-throw-literal */
        throw {unauthorized:
            'Only users with a least on of these roles are allowed to ' +
            `perform requested action: "${allowedRoles.join('", "')}". ` +
            `${userRolesDescription}.`}
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
        newDocument:PlainObject, oldDocument:?PlainObject,
        userContext:UserContext = {
            db: 'dummy',
            name: 'admin',
            roles: ['_admin']
        }, securitySettings:SecuritySettings = {
            admins: {names: [], roles: []}, members: {names: [], roles: []}
        }, models:Models, modelConfiguration:SimpleModelConfiguration,
        toJSON:?Function = null
    ):PlainObject {
        const now:Date = new Date()
        const nowUTCTimestamp:number = Date.UTC(
            now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
            now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(),
            now.getUTCMilliseconds())
        // region ensure needed environment
        /*
            NOTE: Needed if we are able to validate users table.

            if (
                newDocument.hasOwnProperty('type') &&
                newDocument.type === 'user' &&
                newDocument.hasOwnProperty('_id') &&
                newDocument._id.startsWith('org.couchdb.user:')
            )
                return newDocument
        */
        if (securitySettings.hasOwnProperty(
            modelConfiguration.property.name.special.validatedDocumentsCache
        ) && securitySettings[
            modelConfiguration.property.name.special.validatedDocumentsCache
        ].has(`${newDocument._id}-${newDocument._rev}`)) {
            securitySettings[modelConfiguration.property.name.special
                .validatedDocumentsCache
            ].delete(`${newDocument._id}-${newDocument._rev}`)
            return newDocument
        }
        if (newDocument.hasOwnProperty('_rev') && [
            'latest', 'upsert'
        ].includes(newDocument._rev))
            if (oldDocument && oldDocument.hasOwnProperty('_rev'))
                newDocument._rev = oldDocument._rev
            else if (newDocument._rev === 'latest')
                /* eslint-disable no-throw-literal */
                throw {
                    forbidden: 'Revision: No old document available to update.'
                }
                /* eslint-enable no-throw-literal */
            else
                delete newDocument._rev
        let serialize:(value:any) => string
        if (toJSON)
            serialize = toJSON
        else if (JSON && JSON.hasOwnProperty('stringify'))
            serialize = (object:any):string => JSON.stringify(object, null, 4)
        else
            throw new Error('Needed "serialize" function is not available.')
        // endregion
        // region functions
        const getFilenameByPrefix:Function = (
            attachments:PlainObject, prefix:?string
        ):?string => {
            if (prefix) {
                for (const name:string in attachments)
                    if (attachments.hasOwnProperty(name) && name.startsWith(
                        prefix
                    ))
                        return name
            } else {
                const keys:Array<string> = Object.keys(attachments)
                if (keys.length)
                    return keys[0]
            }
            return null
        }
        const checkDocument:Function = (
            newDocument:PlainObject, oldDocument:?PlainObject,
            parentNames:Array<string> = []
        ):PlainObject => {
            const pathDescription:string =
                parentNames.length ? ` in ${parentNames.join(' -> ')}` : ''
            let somethingChanged:boolean = false
            // region check for model type
            if (!newDocument.hasOwnProperty(
                modelConfiguration.property.name.special.type
            ))
                /* eslint-disable no-throw-literal */
                throw {
                    forbidden: 'Type: You have to specify a model type via ' +
                        `property "` +
                        `${modelConfiguration.property.name.special.type}"` +
                        `${pathDescription}.`
                }
                /* eslint-enable no-throw-literal */
            if (!(parentNames.length || (new RegExp(
                modelConfiguration.property.name.special
                    .typeNameRegularExpressionPattern.public
            )).test(newDocument[modelConfiguration.property.name.special.type])
            ))
                /* eslint-disable no-throw-literal */
                throw {
                    forbidden: 'TypeName: You have to specify a model type ' +
                        'which matches "' +
                            modelConfiguration.property.name.special
                            .typeNameRegularExpressionPattern.public +
                        '" as public type (given "' + newDocument[
                            modelConfiguration.property.name.special.type
                        ] + `")${pathDescription}.`
                }
                /* eslint-enable no-throw-literal */
            if (!models.hasOwnProperty(newDocument[
                modelConfiguration.property.name.special.type
            ]))
                /* eslint-disable no-throw-literal */
                throw {
                    forbidden: 'Model: Given model "' + newDocument[
                        modelConfiguration.property.name.special.type
                    ] + `" is not specified${pathDescription}.`
                }
                /* eslint-enable no-throw-literal */
            // endregion
            const modelName:string = newDocument[
                modelConfiguration.property.name.special.type]
            const model:Model = models[modelName]
            // region document specific functions
            const checkPropertyConstraints:Function = (
                newValue:any, name:string,
                propertySpecification:PropertySpecification, oldValue:?any,
                types:Array<string> = [
                    'constraintExpression', 'constraintExecution']
            ):void => {
                const propertyConstraintParameterNames:Array<string> = [
                    'checkDocument', 'checkPropertyContent', 'code', 'model',
                    'modelConfiguration', 'modelName', 'models', 'name',
                    'newDocument', 'newValue', 'oldDocument', 'oldValue',
                    'propertySpecification', 'securitySettings', 'serialize',
                    'userContext', 'parentNames', 'pathDescription', 'now',
                    'nowUTCTimestamp', 'getFilenameByPrefix'
                ]
                for (const type:string of types)
                    if (propertySpecification[type]) {
                        let hook:Function
                        const code:string = (type.endsWith(
                            'Expression'
                        ) ? 'return ' : '') + propertySpecification[
                            type
                        ].evaluation
                        const values:Array<any> = [
                            checkDocument, checkPropertyContent, code, model,
                            modelConfiguration, modelName, models, name,
                            newDocument, newValue, oldDocument, oldValue,
                            propertySpecification, securitySettings, serialize,
                            userContext, parentNames, pathDescription, now,
                            nowUTCTimestamp, getFilenameByPrefix
                        ]
                        // region compile
                        try {
                            hook = new Function(
                                // IgnoreTypeCheck
                                ...propertyConstraintParameterNames.concat(
                                    code))
                        } catch (error) {
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden: `Compilation: Hook "${type}" has ` +
                                    `invalid code "${code}": "` + serialize(
                                        error
                                    ) + `"${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                        }
                        // endregion
                        let satisfied:boolean = false
                        // region run
                        try {
                            // IgnoreTypeCheck
                            satisfied = hook(...values)
                        } catch (error) {
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden: `Runtime: Hook "${type}" has ` +
                                    `throw an error with code "${code}": "` +
                                    `${serialize(error)}"${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                        }
                        // endregion
                        if (!satisfied)
                            /* eslint-disable no-throw-literal */
                            throw {forbidden: type.charAt(0).toUpperCase(
                            ) + type.substring(1) + `: ` + ((
                                propertySpecification[type].description
                            // IgnoreTypeCheck
                            ) ? (new Function(
                                ...propertyConstraintParameterNames.concat(
                                    'return ' +
                                        propertySpecification[type].description
                                )
                            ))(...values) : `Property "${name}" should ` +
                            `satisfy constraint "${code}" (given "` +
                            `${serialize(newValue)}")${pathDescription}.`)}
                            /* eslint-enable no-throw-literal */
                    }
            }
            const checkPropertyContent:Function = (
                newValue:any, name:string,
                propertySpecification:PropertySpecification,
                oldValue:?any = null
            ):{newValue:any;somethingChanged:boolean;} => {
                let somethingChanged:boolean = false
                // region type
                if (propertySpecification.type === 'DateTime') {
                    const initialNewValue:any = newValue
                    if (newValue !== null && typeof newValue !== 'number') {
                        newValue = new Date(newValue)
                        newValue = Date.UTC(
                            newValue.getUTCFullYear(), newValue.getUTCMonth(),
                            newValue.getUTCDate(), newValue.getUTCHours(),
                            newValue.getUTCMinutes(), newValue.getUTCSeconds(),
                            newValue.getUTCMilliseconds())
                    }
                    if (typeof newValue !== 'number' || isNaN(newValue))
                        /* eslint-disable no-throw-literal */
                        throw {
                            forbidden: `PropertyType: Property "${name}" ` +
                                `isn't of type "DateTime" (given "` +
                                `${serialize(initialNewValue)}" of type "` +
                                `${typeof newValue}")${pathDescription}.`
                        }
                        /* eslint-enable no-throw-literal */
                } else if (models.hasOwnProperty(propertySpecification.type))
                    if (typeof newValue === 'object' && Object.getPrototypeOf(
                        newValue
                    ) === Object.prototype) {
                        const result:{
                            newDocument:any, somethingChanged:boolean
                        } = checkDocument(
                            newValue, oldValue, parentNames.concat(name))
                        if (result.somethingChanged)
                            somethingChanged = true
                        newValue = result.newDocument
                        if (serialize(newValue) === serialize({}))
                            return {newValue: null, somethingChanged}
                    } else
                        /* eslint-disable no-throw-literal */
                        throw {
                            forbidden: 'NestedModel: Under key "${name}" ' +
                                `isn't "${propertySpecification.type}" ` +
                                `(given "${serialize(newValue)}")` +
                                `${pathDescription}.`
                        }
                        /* eslint-enable no-throw-literal */
                else if (['boolean', 'integer', 'number', 'string'].includes(
                    propertySpecification.type
                )) {
                    if (!(
                        propertySpecification.type === 'integer' ||
                        typeof newValue === propertySpecification.type
                    ) || propertySpecification.type === 'integer' && parseInt(
                        newValue
                    ) !== newValue)
                        /* eslint-disable no-throw-literal */
                        throw {
                            forbidden: `PropertyType: Property "${name}" ` +
                                `isn't of type "` +
                                `${propertySpecification.type}" (given "` +
                                `${serialize(newValue)}" of type "` +
                                `${typeof newValue}")${pathDescription}.`
                        }
                        /* eslint-enable no-throw-literal */
                } else if (
                    typeof propertySpecification.type === 'string' &&
                    propertySpecification.type.startsWith('foreignKey:')
                ) {
                    const foreignKeyType:string = models[
                        propertySpecification.type.substring(
                            'foreignKey:'.length
                        )]._id.type
                    if (foreignKeyType !== typeof newValue)
                        /* eslint-disable no-throw-literal */
                        throw {
                            forbidden: `PropertyType: Foreign key property "` +
                                `${name}" isn't of type "${foreignKeyType}" ` +
                                `(given "${serialize(newValue)}" of type "` +
                                `${typeof newValue}")${pathDescription}.`
                        }
                        /* eslint-enable no-throw-literal */
                } else if (serialize(newValue) !== serialize(
                    propertySpecification.type
                ))
                    /* eslint-disable no-throw-literal */
                    throw {
                        forbidden: `PropertyType: Property "${name}" isn't ` +
                            `value "${propertySpecification.type}" (given "` +
                            `${serialize(newValue)}" of type "` +
                            `${typeof newValue}")${pathDescription}.`
                    }
                    /* eslint-disable no-throw-literal */
                // endregion
                // region range
                if (![undefined, null].includes(propertySpecification.minimum))
                    if (propertySpecification.type === 'string') {
                        if (newValue.length < propertySpecification.minimum)
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden: `MinimalLength: Property "${name}` +
                                    '" (type string) should have minimal ' +
                                    `length ${propertySpecification.minimum}` +
                                    `${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                    } else if (['number', 'integer', 'DateTime'].includes(
                        propertySpecification.type
                    ) && newValue < propertySpecification.minimum)
                        /* eslint-disable no-throw-literal */
                        throw {
                            forbidden: `Minimum: Property "${name}" (type ` +
                                `${propertySpecification.type}) should ` +
                                `satisfy a minimum of ` +
                                `${propertySpecification.minimum}` +
                                `${pathDescription}.`
                        }
                        /* eslint-disable no-throw-literal */
                if (![undefined, null].includes(propertySpecification.maximum))
                    if (propertySpecification.type === 'string') {
                        if (newValue.length > propertySpecification.maximum)
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden: `MaximalLength: Property "${name}` +
                                    ' (type string) should have maximal ' +
                                    // IgnoreTypeCheck
                                    `length ${propertySpecification.maximum}` +
                                    `${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                    } else if (['number', 'integer', 'DateTime'].includes(
                        propertySpecification.type
                    ) && newValue > propertySpecification.maximum)
                        /* eslint-enable no-throw-literal */
                        throw {
                            forbidden: `Maximum: Property "${name}" (type ` +
                                `${propertySpecification.type}) should ` +
                                `satisfy a maximum of ` +
                                // IgnoreTypeCheck
                                propertySpecification.maximum +
                                `${pathDescription}.`
                        }
                        /* eslint-disable no-throw-literal */
                // endregion
                // region selection
                if (
                    propertySpecification.selection &&
                    !propertySpecification.selection.includes(newValue)
                )
                    /* eslint-enable no-throw-literal */
                    throw {
                        forbidden: `Selection: Property "${name}" (type ` +
                            `${propertySpecification.type}) should be one of` +
                            ' "' +
                            propertySpecification.selection.join('", "') +
                            `". But is "${newValue}"${pathDescription}.`
                    }
                    /* eslint-disable no-throw-literal */
                // endregion
                // region pattern
                if (!([undefined, null].includes(
                    propertySpecification.regularExpressionPattern
                ) || (new RegExp(
                    // IgnoreTypeCheck
                    propertySpecification.regularExpressionPattern
                )).test(newValue)))
                    /* eslint-enable no-throw-literal */
                    throw {
                        forbidden: `PatternMatch: Property "${name}" should ` +
                            'match regular expression pattern ' +
                            // IgnoreTypeCheck
                            propertySpecification.regularExpressionPattern +
                            ` (given "${newValue}")${pathDescription}.`
                    }
                    /* eslint-disable no-throw-literal */
                // endregion
                checkPropertyConstraints(
                    newValue, name, propertySpecification, oldValue)
                if (serialize(newValue) !== serialize(oldValue))
                    somethingChanged = true
                return {newValue, somethingChanged}
            }
            // / region create hook
            const runCreateHook:Function = (
                propertySpecification:PropertySpecification,
                newDocument:PlainObject, oldDocument:PlainObject, name:string
            ):void => {
                if (!oldDocument)
                    for (const type:string of [
                        'onCreateExpression', 'onCreateExecution'
                    ])
                        if (propertySpecification[type]) {
                            let hook:Function
                            try {
                                hook = new Function(
                                    'newDocument', 'oldDocument',
                                    'userContext', 'securitySettings',
                                    'name', 'models', 'modelConfiguration',
                                    'serialize', 'modelName', 'model',
                                    'propertySpecification', 'now',
                                    'nowUTCTimestamp', 'getFilenameByPrefix', (
                                        type.endsWith('Expression') ?
                                        'return ' : ''
                                    ) + propertySpecification[type])
                            } catch (error) {
                                /* eslint-disable no-throw-literal */
                                throw {
                                    forbidden: `Compilation: Hook "${type}" ` +
                                        'has invalid code "' +
                                        `${propertySpecification[type]}" for` +
                                        ` property "${name}": ` + serialize(
                                            error
                                        ) + `${pathDescription}.`
                                }
                                /* eslint-enable no-throw-literal */
                            }
                            let result:any
                            try {
                                result = hook(
                                    newDocument, oldDocument, userContext,
                                    securitySettings, name, models,
                                    modelConfiguration, serialize, modelName,
                                    model, propertySpecification, now,
                                    nowUTCTimestamp, getFilenameByPrefix)
                            } catch (error) {
                                /* eslint-disable no-throw-literal */
                                throw {
                                    forbidden: `Runtime: Hook "${type}" has ` +
                                        'throw an error with code "' +
                                        `${propertySpecification[type]}" ` +
                                        `for property "${name}": ` + serialize(
                                            error
                                        ) + `${pathDescription}.`
                                }
                                /* eslint-enable no-throw-literal */
                            }
                            if (![undefined, null].includes(result))
                                newDocument[name] = result
                        }
            }
            // / endregion
            // / region update hook
            const runUpdateHook:Function = (
                propertySpecification:PropertySpecification,
                newDocument:PlainObject, oldDocument:PlainObject, name:string
            ):void => {
                if (!newDocument.hasOwnProperty(name))
                    return
                if (
                    propertySpecification.trim &&
                    typeof newDocument[name] === 'string'
                )
                    newDocument[name] = newDocument[name].trim()
                for (const type:string of [
                    'onUpdateExpression', 'onUpdateExecution'
                ])
                    if (propertySpecification[type]) {
                        let hook:Function
                        try {
                            hook = new Function(
                                'newDocument', 'oldDocument', 'userContext',
                                'securitySettings', 'name', 'models',
                                'modelConfiguration', 'serialize', 'modelName',
                                'model', 'checkDocument',
                                'checkPropertyContent',
                                'propertySpecification', 'now',
                                'nowUTCTimestamp', 'getFilenameByPrefix', (
                                    type.endsWith(
                                        'Expression'
                                    ) ? 'return ' : '') +
                                    propertySpecification[type])
                        } catch (error) {
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden: `Compilation: Hook "${type}" has ` +
                                    `invalid code "` +
                                    `${propertySpecification[type]}" for ` +
                                    `property "${name}": ${serialize(error)}` +
                                    `${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                        }
                        try {
                            newDocument[name] = hook(
                                newDocument, oldDocument, userContext,
                                securitySettings, name, models,
                                modelConfiguration, serialize, modelName,
                                model, checkDocument, checkPropertyContent,
                                propertySpecification, now, nowUTCTimestamp,
                                getFilenameByPrefix)
                        } catch (error) {
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden: `Runtime: Hook "${type}" has ` +
                                    'throw an error with code "' +
                                    `${propertySpecification[type]}" for ` +
                                    `property "${name}": ${serialize(error)}` +
                                    `${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                        }
                    }
            }
            // / endregion
            // endregion
            for (const name:string in model)
                if (model.hasOwnProperty(name) && ![
                    modelConfiguration.property.name.special.allowedRole,
                    modelConfiguration.property.name.special.constraint
                        .expression,
                    modelConfiguration.property.name.special.constraint
                        .execution
                ].includes(name))
                    // region run hooks and check for presence of needed data
                    if (
                        modelConfiguration.property.name.special.attachment
                        === name
                    ) {
                        for (const type:string in model[name]) {
                            if (!newDocument.hasOwnProperty(
                                name
                            ) || newDocument[name] === null)
                                newDocument[name] = {}
                            if (oldDocument && !oldDocument.hasOwnProperty(
                                name
                            ))
                                oldDocument[name] = {}
                            const newFileNames:Array<string> = Object.keys(
                                newDocument[name]
                            ).filter((fileName:string):boolean => newDocument[
                                name
                            ][fileName].data !== null && (new RegExp(
                                type
                            )).test(fileName))
                            let oldFileNames:Array<string> = []
                            if (oldDocument)
                                oldFileNames = Object.keys(
                                    oldDocument[name]
                                ).filter((fileName:string):boolean =>
                                    newDocument[name][fileName] && newDocument[
                                        name
                                    ][fileName].data !== null && (new RegExp(
                                        type
                                    )).test(fileName))
                            for (const fileName:string of newFileNames)
                                runCreateHook(
                                    model[name][type], newDocument[name],
                                    oldDocument && oldDocument[
                                        name
                                    ] ? oldDocument[name] : null, fileName)
                            for (const fileName:string of newFileNames)
                                runUpdateHook(
                                    model[name][type], newDocument[name],
                                    oldDocument && oldDocument[
                                        name
                                    ] ? oldDocument[name] : null, fileName)
                            if ([undefined, null].includes(
                                model[name][type].default
                            )) {
                                if (!(model[name][type].nullable || (
                                    newFileNames.length > 0 ||
                                    oldFileNames.length > 0
                                )))
                                    /* eslint-disable no-throw-literal */
                                    throw {
                                        forbidden: 'MissingAttachment: ' +
                                            'Missing attachment for type "' +
                                            `${type}"${pathDescription}.`
                                    }
                                    /* eslint-enable no-throw-literal */
                                if (
                                    modelConfiguration.updateStrategy ===
                                        'fillUp' &&
                                    newFileNames.length === 0 &&
                                    oldFileNames.length > 0
                                )
                                    for (const fileName:string of oldFileNames)
                                        if (newDocument[name][
                                            fileName
                                        ] === null)
                                            somethingChanged = true
                                        else
                                            newDocument[name][fileName] =
                                                // IgnoreTypeCheck
                                                oldDocument[name][fileName]
                            } else if (newFileNames.length === 0)
                                if (oldFileNames.length === 0) {
                                    for (const fileName:string in model[name][
                                        type
                                    ].default)
                                        if (model[name][
                                            type
                                        ].default.hasOwnProperty(fileName)) {
                                            newDocument[name][fileName] =
                                                model[name][type].default[
                                                    fileName]
                                            somethingChanged = true
                                        }
                                } else if (
                                    modelConfiguration.updateStrategy ===
                                        'fillUp'
                                )
                                    for (const fileName:string of oldFileNames)
                                        newDocument[name][fileName] =
                                            // IgnoreTypeCheck
                                            oldDocument[name][fileName]
                        }
                    } else {
                        runCreateHook(
                            model[name], newDocument, oldDocument, name)
                        runUpdateHook(
                            model[name], newDocument, oldDocument, name)
                        if ([undefined, null].includes(model[name].default)) {
                            if (!(model[name].nullable || (
                                newDocument.hasOwnProperty(name) ||
                                oldDocument && oldDocument.hasOwnProperty(name)
                            )))
                                /* eslint-disable no-throw-literal */
                                throw {
                                    forbidden: 'MissingProperty: Missing ' +
                                        `property "${name}"${pathDescription}.`
                                }
                                /* eslint-enable no-throw-literal */
                            if (!newDocument.hasOwnProperty(
                                name
                            ) && oldDocument && oldDocument.hasOwnProperty(
                                name
                            ) && modelConfiguration.updateStrategy === 'fillUp'
                            )
                                newDocument[name] = oldDocument[name]
                        } else if (!newDocument.hasOwnProperty(
                            name
                        ) || newDocument[name] === null)
                            if (!oldDocument) {
                                newDocument[name] = model[name].default
                                somethingChanged = true
                            } else if (
                                modelConfiguration.updateStrategy
                                    === 'fillUp'
                            )
                                if (oldDocument.hasOwnProperty(name))
                                    newDocument[name] = oldDocument[name]
                                else {
                                    newDocument[name] = model[name].default
                                    somethingChanged = true
                                }
                    }
                    // endregion
            // region check given data
            if (
                oldDocument &&
                modelConfiguration.updateStrategy === 'incremental'
            )
                // region remove new data which already exists
                for (const name:string in newDocument)
                    if (
                        newDocument.hasOwnProperty(name) &&
                        oldDocument.hasOwnProperty(name) &&
                        !modelConfiguration.property.name.reserved.concat(
                            modelConfiguration.property.name.special.deleted,
                            modelConfiguration.property.name.special.id,
                            modelConfiguration.property.name.special.revision,
                            modelConfiguration.property.name.special.type
                        ).includes(name) && (
                            oldDocument[name] === newDocument[name] ||
                            serialize(
                                oldDocument[name]
                            ) === serialize(newDocument[name])
                        )
                    ) {
                        delete newDocument[name]
                        continue
                    }
                // endregion
            for (const name:string in newDocument)
                if (newDocument.hasOwnProperty(
                    name
                ) && !modelConfiguration.property.name.reserved.concat(
                    modelConfiguration.property.name.special.deleted,
                    modelConfiguration.property.name.special.id,
                    modelConfiguration.property.name.special.revision,
                    // NOTE: This property is integrated automatically.
                    modelConfiguration.property.name.special.revisions
                ).includes(name)) {
                    if ([
                        modelConfiguration.property.name.special.allowedRole,
                        modelConfiguration.property.name.special.constraint
                            .execution,
                        modelConfiguration.property.name.special.constraint
                            .expression,
                        modelConfiguration.property.name.special.extend,
                        modelConfiguration.property.name.special
                            .validatedDocumentsCache
                    ].includes(name))
                        /* eslint-disable no-throw-literal */
                        throw {
                            forbidden: 'Invalid: Given property name "' +
                                `${name}" isn't allowed as property name` +
                                `${pathDescription}.`
                        }
                        /* eslint-enable no-throw-literal */
                    if (!model.hasOwnProperty(name))
                        if (modelConfiguration.updateStrategy === 'migrate') {
                            delete newDocument[name]
                            somethingChanged = true
                            continue
                        } else
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden: 'Property: Given property "' +
                                    `${name}" isn't specified in ` +
                                    `model "${modelName}"${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                    const propertySpecification:PropertySpecification = model[
                        name]
                    // region writable/mutable/nullable
                    const checkWriteableMutableNullable:Function = (
                        propertySpecification:PropertySpecification,
                        newDocument:PlainObject, oldDocument:?PlainObject,
                        name:string
                    ):boolean => {
                        // region writable
                        if (!propertySpecification.writable)
                            if (oldDocument)
                                if (oldDocument.hasOwnProperty(
                                    name
                                ) && serialize(
                                    newDocument[name]
                                ) === serialize(oldDocument[name])) {
                                    if (
                                        name !== '_id' &&
                                        modelConfiguration.updateStrategy ===
                                            'incremental'
                                    ) {
                                        delete newDocument[name]
                                        somethingChanged = true
                                    }
                                    return true
                                } else
                                    /* eslint-disable no-throw-literal */
                                    throw {
                                        forbidden: 'Readonly: Property "' +
                                            `${name}" is not writable (old ` +
                                            `document "` +
                                            `${serialize(oldDocument)}")` +
                                            `${pathDescription}.`
                                    }
                                    /* eslint-enable no-throw-literal */
                            else
                                /* eslint-disable no-throw-literal */
                                throw {
                                    forbidden: `Readonly: Property "${name}"` +
                                    `is not writable${pathDescription}.`
                                }
                                /* eslint-enable no-throw-literal */
                        // endregion
                        // region mutable
                        if (
                            !propertySpecification.mutable && oldDocument &&
                            oldDocument.hasOwnProperty(name)
                        )
                            if (serialize(newDocument[name]) === serialize(
                                oldDocument[name]
                            )) {
                                if (
                                    modelConfiguration.updateStrategy ===
                                        'incremental' &&
                                    !modelConfiguration.property.name.reserved
                                    .concat(
                                        modelConfiguration.property.name
                                            .special.deleted,
                                        modelConfiguration.property.name
                                            .special.id,
                                        modelConfiguration.property.name
                                            .special.revision
                                    ).includes(name)
                                ) {
                                    delete newDocument[name]
                                    somethingChanged = true
                                }
                                return true
                            } else
                                /* eslint-disable no-throw-literal */
                                throw {
                                    forbidden: `Immutable: Property "${name}` +
                                        '" is not writable (old document "' +
                                        `${serialize(oldDocument)}")` +
                                        `${pathDescription}.`
                                }
                                /* eslint-enable no-throw-literal */
                        // endregion
                        // region nullable
                        if (newDocument[name] === null)
                            if (propertySpecification.nullable) {
                                delete newDocument[name]
                                if (oldDocument && oldDocument.hasOwnProperty(
                                    name
                                ))
                                    somethingChanged = true
                                return true
                            } else
                                /* eslint-disable no-throw-literal */
                                throw {
                                    forbidden: `NotNull: Property "${name}" ` +
                                        'should not by "null"' +
                                        `${pathDescription}.`
                                }
                                /* eslint-enable no-throw-literal */
                        // endregion
                        return false
                    }
                    if (
                        modelConfiguration.property.name.special.attachment
                        === name
                    ) {
                        for (const fileName:string in newDocument[name])
                            if (newDocument[name].hasOwnProperty(fileName))
                                for (const type:string in model[name])
                                    if (
                                        model[name].hasOwnProperty(type) &&
                                        (new RegExp(type)).test(fileName)
                                    ) {
                                        checkWriteableMutableNullable(
                                            model[name][type], newDocument,
                                            oldDocument, fileName)
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
                        propertySpecification.type.endsWith('[]')
                    ) {
                        if (!Array.isArray(newDocument[name]))
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden: `PropertyType: Property "${name}"` +
                                    ` isn't of type "array -> ` +
                                    `${propertySpecification.type}" (given "` +
                                    `${serialize(newDocument[name])}")` +
                                    `${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                        if (propertySpecification.hasOwnProperty(
                            'minimumLength'
                        ) && newDocument[name].length <
                            propertySpecification.minimumLength
                        )
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden: `MinimumArrayLength: Property "` +
                                    `${name}" (array of length ` +
                                    `${newDocument[name].length}) doesn't ` +
                                    `fullfill minimum array length of ` +
                                    // IgnoreTypeCheck
                                    propertySpecification.minimumLength +
                                    `${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                        else if (propertySpecification.hasOwnProperty(
                            'maximumLength'
                        ) && propertySpecification.maximumLength <
                            newDocument[name].length
                        )
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden: `MaximumArrayLength: Property "` +
                                    `${name}" (array of length ` +
                                    `${newDocument[name].length}) doesn't ` +
                                    `fullfill maximum array length of ` +
                                    // IgnoreTypeCheck
                                    propertySpecification.maximumLength +
                                    `${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                        checkPropertyConstraints(
                            newDocument[name], name, propertySpecification,
                            oldDocument && oldDocument.hasOwnProperty(
                                name
                            ) && oldDocument[name] || undefined, [
                                'arrayConstraintExpression',
                                'arrayConstraintExecution'])
                        // IgnoreTypeCheck
                        const propertySpecificationCopy:PropertySpecification =
                            {}
                        for (const key:string in propertySpecification)
                            if (propertySpecification.hasOwnProperty(key))
                                if (key === 'type')
                                    propertySpecificationCopy[key] =
                                        propertySpecification[key].substring(
                                            0,
                                            propertySpecification.type.length -
                                                '[]'.length)
                                else
                                    propertySpecificationCopy[key] =
                                        propertySpecification[key]
                        let index:number = 0
                        for (const value:any of newDocument[name].slice()) {
                            newDocument[name][index] = checkPropertyContent(
                                value, `${index + 1}. value in ${name}`,
                                propertySpecificationCopy
                            ).newValue
                            if (newDocument[name][index] === null)
                                newDocument[name].splice(index, 1)
                            if (!(oldDocument && oldDocument.hasOwnProperty(
                                name
                            ) && Array.isArray(
                                oldDocument[name]
                            ) && oldDocument[name].length > index &&
                            serialize(oldDocument[name][index]) === serialize(
                                oldDocument[name][index]
                            )))
                                somethingChanged = true
                            index += 1
                        }
                    } else {
                        const oldValue:any =
                            oldDocument && oldDocument.hasOwnProperty(
                                name
                            ) ? oldDocument[name] : null
                        const result:{
                            newValue:any;
                            somethingChanged:boolean;
                        } = checkPropertyContent(
                            newDocument[name], name, propertySpecification,
                            oldValue)
                        newDocument[name] = result.newValue
                        if (result.somethingChanged)
                            somethingChanged = true
                        if (newDocument[name] === null) {
                            if (oldValue !== null)
                                somethingChanged = true
                            delete newDocument[name]
                        }
                    }
                }
            // / region constraint
            const constraintParameterNames:Array<string> = [
                'checkDocument', 'checkPropertyContent', 'code', 'model',
                'modelConfiguration', 'modelName', 'models', 'newDocument',
                'oldDocument', 'securitySettings', 'serialize', 'userContext',
                'parentNames', 'pathDescription', 'now', 'nowUTCTimestamp',
                'getFilenameByPrefix'
            ]
            for (
                let type:string in
                modelConfiguration.property.name.special.constraint
            )
                if (
                    modelConfiguration.property.name.special.constraint
                        .hasOwnProperty(type) &&
                    (type = modelConfiguration.property.name.special
                        .constraint[type]) &&
                    model.hasOwnProperty(type) &&
                    Array.isArray(model[type]) && model[type].length
                )
                    for (const constraint:Constraint of model[type]) {
                        let hook:Function
                        const code:string = ((
                            type === modelConfiguration.property.name.special
                                .constraint.expression
                        ) ? 'return ' : '') + constraint.evaluation
                        const values:Array<any> = [
                            checkDocument, checkPropertyContent, code, model,
                            modelConfiguration, modelName, models, newDocument,
                            oldDocument, securitySettings, serialize,
                            userContext, parentNames, pathDescription, now,
                            nowUTCTimestamp, getFilenameByPrefix
                        ]
                        try {
                            hook = new Function(
                                // IgnoreTypeCheck
                                ...constraintParameterNames.concat(code))
                        } catch (error) {
                            /* eslint-enable no-throw-literal */
                            throw {
                                forbidden: `Compilation: Hook "${type}" has ` +
                                    `invalid code "${code}": "` + serialize(
                                        error
                                    ) + `"${pathDescription}.`
                            }
                            /* eslint-disable no-throw-literal */
                        }
                        let satisfied:boolean = false
                        try {
                            // IgnoreTypeCheck
                            satisfied = hook(...values)
                        } catch (error) {
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden: `Runtime: Hook "${type}" has ` +
                                    `thrown an error with code "${code}": ` +
                                    `${serialize(error)}${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                        }
                        if (!satisfied) {
                            const errorName:string = type.replace(
                                /^[^a-zA-Z]+/, '')
                            /* eslint-disable no-throw-literal */
                            throw {forbidden: errorName.charAt(0).toUpperCase(
                            ) + `${errorName.substring(1)}: ` + (
                                // IgnoreTypeCheck
                                constraint.description ? (new Function(
                                    ...constraintParameterNames.concat(
                                        `return ${constraint.description}`)
                                ))(...values) : `Model "${modelName}" should ` +
                                `satisfy constraint "${code}" (given "` +
                                `${serialize(newDocument)}")` +
                                `${pathDescription}.`)}
                            /* eslint-enable no-throw-literal */
                        }
                    }
            // / endregion
            // / region attachment
            const name:string = modelConfiguration.property.name.special
                .attachment
            if (newDocument.hasOwnProperty(name)) {
                const newAttachments:PlainObject = newDocument[name]
                if (
                    typeof newAttachments !== 'object' ||
                    Object.getPrototypeOf(newAttachments) !== Object.prototype
                )
                    /* eslint-disable no-throw-literal */
                    throw {
                        forbidden: 'AttachmentPresence: given ' +
                            `attachment has invalid type${pathDescription}.`
                    }
                    /* eslint-enable no-throw-literal */
                // region migrate old attachments
                if (oldDocument && oldDocument.hasOwnProperty(name)) {
                    const oldAttachments:any = oldDocument[name]
                    if (
                        oldAttachments !== null &&
                        typeof oldAttachments === 'object' &&
                        Object.getPrototypeOf(
                            oldAttachments
                        ) === Object.prototype
                    )
                        for (const fileName:string in oldAttachments)
                            if (oldAttachments.hasOwnProperty(fileName))
                                if (newAttachments.hasOwnProperty(fileName))
                                    if (
                                        newAttachments[fileName] === null ||
                                        newAttachments[
                                            fileName
                                        ].data === null || newAttachments[
                                            fileName
                                        ].content_type === oldAttachments[
                                            fileName
                                        ].content_type &&
                                        newAttachments[fileName].data ===
                                        oldAttachments[fileName].data
                                    ) {
                                        if (
                                            modelConfiguration
                                                .updateStrategy ===
                                            'incremental'
                                        )
                                            delete newAttachments[fileName]
                                    } else
                                        somethingChanged = true
                                else if (
                                    modelConfiguration.updateStrategy ===
                                        'fillUp'
                                )
                                    newAttachments[fileName] = oldAttachments[
                                        fileName]
                                else if (!modelConfiguration.updateStrategy)
                                    somethingChanged = true
                }
                for (const fileName:string in newAttachments)
                    if (newAttachments.hasOwnProperty(fileName) && ([
                        undefined, null
                    ].includes(
                        newAttachments[fileName]
                    ) || newAttachments[fileName].data === null))
                        delete newAttachments[fileName]
                // endregion
                if (Object.keys(newAttachments).length === 0)
                    delete newDocument[name]
                const attachmentToTypeMapping:{[key:string]:Array<string>} = {}
                for (const type:string in model[name])
                    if (model[name].hasOwnProperty(type))
                        attachmentToTypeMapping[type] = []
                for (const attachmentName:string in newAttachments)
                    if (newAttachments.hasOwnProperty(attachmentName)) {
                        let matched:boolean = false
                        for (const type:string in model[name])
                            if ((new RegExp(type)).test(attachmentName)) {
                                attachmentToTypeMapping[type].push(
                                    attachmentName)
                                matched = true
                                break
                            }
                        if (!matched)
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden: 'AttachmentTypeMatch: None of the' +
                                    ' specified attachment types ("' +
                                    Object.keys(model[name]).join('", "') +
                                    '") matches given one ("' +
                                    `${attachmentName}")${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                    }
                for (const type:string in attachmentToTypeMapping) {
                    if (!attachmentToTypeMapping.hasOwnProperty(type))
                        continue
                    const numberOfAttachments:number =
                        attachmentToTypeMapping[type].length
                    if (
                        model[name][type].maximum !== null &&
                        numberOfAttachments > model[name][type].maximum
                    )
                        /* eslint-disable no-throw-literal */
                        throw {
                            forbidden: 'AttachmentMaximum: given number of ' +
                                `attachments (${numberOfAttachments}) ` +
                                `doesn't satisfy specified maximum of ` +
                                `${model[name][type].maximum} from type "` +
                                `${type}"${pathDescription}.`
                        }
                        /* eslint-enable no-throw-literal */
                    if (!(
                        model[name][type].nullable && numberOfAttachments === 0
                    ) && numberOfAttachments < model[name][type].minimum)
                        /* eslint-disable no-throw-literal */
                        throw {
                            forbidden: 'AttachmentMinimum: given number of ' +
                                `attachments (${numberOfAttachments}) ` +
                                `doesn't satisfy specified minimum of ` +
                                `${model[name][type].minimum} from type "` +
                                `${type}"${pathDescription}.`
                        }
                        /* eslint-enable no-throw-literal */
                    for (const fileName:string of attachmentToTypeMapping[
                        type
                    ]) {
                        if (!([null, undefined].includes(
                            model[name][type].regularExpressionPattern
                        ) || (new RegExp(
                            model[name][type].regularExpressionPattern
                        )).test(fileName)))
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden: 'AttachmentName: given ' +
                                    `attachment name "${fileName}" ` +
                                    `doesn't satisfy specified regular ` +
                                    'expression pattern "' + model[name][
                                        type
                                    ].regularExpressionPattern + '" from ' +
                                    `type "${type}"${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                        if (!([null, undefined].includes(model[name][
                            type
                        ].contentTypeRegularExpressionPattern) ||
                        newAttachments[fileName].hasOwnProperty(
                            'content_type'
                        ) && newAttachments[fileName].content_type && (
                            new RegExp(model[name][
                                type
                            ].contentTypeRegularExpressionPattern)
                        ).test(newAttachments[fileName].content_type)))
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden: 'AttachmentContentType: given' +
                                    ' attachment content type "' +
                                    newAttachments[fileName].content_type +
                                    `" doesn't satisfy specified regular` +
                                    ' expression pattern "' + model[name][
                                        type
                                    ].regularExpressionPattern + '" from ' +
                                    `type "${type}"${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                    }
                }
            }
            // / endregion
            // endregion
            return {newDocument, somethingChanged}
        }
        // endregion
        const result:{
            newDocument:PlainObject;
            somethingChanged:boolean;
        } = checkDocument(newDocument, oldDocument)
        if (!result.somethingChanged)
            /* eslint-disable no-throw-literal */
            throw {
                forbidden: 'NoChange: No new data given. new document: ' +
                    `${serialize(newDocument)}; old document: ` +
                    `${serialize(oldDocument)}.`
            }
            /* eslint-enable no-throw-literal */
        if (securitySettings.hasOwnProperty('checkedDocuments'))
            securitySettings[modelConfiguration.property.name.special
                .validatedDocumentsCache
            ].add(`${newDocument._id}-${newDocument._rev}`)
        else
            securitySettings[modelConfiguration.property.name.special
                .validatedDocumentsCache
            ] = new Set([`${newDocument._id}-${newDocument._rev}`])
        return result.newDocument
    }
}
// region vim modline
// vim: set tabstop=4 shiftwidth=4 expandtab:
// vim: foldmethod=marker foldmarker=region,endregion:
// endregion
