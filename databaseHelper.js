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
        userContext:?UserContext, securitySettings:?SecuritySettings,
        allowedModelRolesMapping:AllowedModelRolesMapping,
        typePropertyName:string
    ):?true {
        let allowedRoles:Array<string> = ['_admin']
        if (userContext) {
            if (
                allowedModelRolesMapping && typePropertyName &&
                newDocument.hasOwnProperty(typePropertyName) &&
                allowedModelRolesMapping.hasOwnProperty(
                    newDocument[typePropertyName])
            )
                allowedRoles = allowedRoles.concat(
                    allowedModelRolesMapping[newDocument[typePropertyName]])
            for (const userRole:string of userContext.roles)
                if (allowedRoles.includes(userRole))
                    return true
        }
        /* eslint-disable no-throw-literal */
        throw {unauthorized:
            'Only users with a least on of these roles are allowed to ' +
            `perform requested action: "${allowedRoles.join('", "')}".`}
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
        // region ensure needed environment
        if (
            newDocument.hasOwnProperty('_deleted') && newDocument._deleted ||
            newDocument.hasOwnProperty('type') &&
            newDocument.type === 'users' &&
            newDocument.hasOwnProperty('_id') &&
            newDocument._id.startsWith('org.couchdb.user:')
        )
            return newDocument
        if (securitySettings.hasOwnProperty(
            modelConfiguration.specialPropertyNames.validatedDocumentsCache
        ) && securitySettings[
            modelConfiguration.specialPropertyNames.validatedDocumentsCache
        ].has(
            `${newDocument._id}-${newDocument._rev}`
        )) {
            securitySettings[
                modelConfiguration.specialPropertyNames.validatedDocumentsCache
            ].delete(`${newDocument._id}-${newDocument._rev}`)
            return newDocument
        }
        if (newDocument.hasOwnProperty(
            '_rev'
        ) && newDocument._rev === 'latest')
            if (oldDocument && oldDocument.hasOwnProperty('_rev'))
                newDocument._rev = oldDocument._rev
            else
                /* eslint-disable no-throw-literal */
                throw {
                    forbidden: 'Revision: No old document to update available.'
                }
                /* eslint-enable no-throw-literal */
        let serialize:(value:any) => string
        if (toJSON)
            serialize = toJSON
        else if (JSON && JSON.hasOwnProperty('stringify'))
            serialize = (object:Object):string => JSON.stringify(
                object, null, 4)
        else
            throw new Error('Needed "serialize" function is not available.')
        // endregion
        const checkDocument:Function = (
            newDocument:PlainObject, oldDocument:?PlainObject,
            nested:boolean = false
        ):PlainObject => {
            // region check for model type
            if (!newDocument.hasOwnProperty(
                modelConfiguration.specialPropertyNames.type
            ))
                /* eslint-disable no-throw-literal */
                throw {
                    forbidden: 'Type: You have to specify a model type via ' +
                        `property "` +
                        `${modelConfiguration.specialPropertyNames.type}".`
                }
                /* eslint-enable no-throw-literal */
            if (!(nested || (new RegExp(
                modelConfiguration.specialPropertyNames
                    .typeNameRegularExpressionPattern.public
            )).test(newDocument[modelConfiguration.specialPropertyNames.type]))
            )
                /* eslint-disable no-throw-literal */
                throw {
                    forbidden: 'TypeName: You have to specify a model type ' +
                        'which matches "' +
                            modelConfiguration.specialPropertyNames
                            .typeNameRegularExpressionPattern.public +
                        '" as public type (given "' + newDocument[
                            modelConfiguration.specialPropertyNames.type
                        ] + '").'
                }
                /* eslint-enable no-throw-literal */
            if (!models.hasOwnProperty(
                newDocument[modelConfiguration.specialPropertyNames.type]
            ))
                /* eslint-disable no-throw-literal */
                throw {
                    forbidden: 'Model: Given model "' + newDocument[
                        modelConfiguration.specialPropertyNames.type
                    ] + '" is not specified.'
                }
                /* eslint-enable no-throw-literal */
            // endregion
            const modelName:string = newDocument[
                modelConfiguration.specialPropertyNames.type]
            const model:Model = models[modelName]
            // region functions
            const checkPropertyContent:Function = (
                newValue:any, name:string,
                propertySpecification:PropertySpecification, oldValue:?any
            ):any => {
                // region type
                if (propertySpecification.type === 'DateTime') {
                    const initialNewValue:any = newValue
                    if (newValue !== null)
                        newValue = (new Date(newValue)).getTime()
                    if (typeof newValue !== 'number' || isNaN(newValue))
                        /* eslint-disable no-throw-literal */
                        throw {
                            forbidden: `PropertyType: Property "${name}" ` +
                                `isn't of type "DateTime" (given "` +
                                `${serialize(initialNewValue)}").`
                        }
                        /* eslint-enable no-throw-literal */
                } else if (models.hasOwnProperty(propertySpecification.type))
                    if (typeof newValue === 'object' && Object.getPrototypeOf(
                        newValue
                    // IgnoreTypeCheck
                    ) === Object.prototype) {
                        newValue = checkDocument(newValue, oldValue, true)
                        if (serialize(newValue) === serialize({}))
                            return null
                    } else
                        /* eslint-disable no-throw-literal */
                        throw {
                            forbidden: 'NestedModel: Under key "${name}" ' +
                                `isn't "${propertySpecification.type}" ` +
                                `(given "${serialize(newValue)}").`
                        }
                        /* eslint-enable no-throw-literal */
                else if (['string', 'number', 'boolean'].includes(
                    propertySpecification.type
                )) {
                    if (typeof newValue !== propertySpecification.type)
                        /* eslint-disable no-throw-literal */
                        throw {
                            forbidden: `PropertyType: Property "${name}" ` +
                                `isn't of type "` +
                                `${propertySpecification.type}" (given "` +
                                `${serialize(newValue)}").`
                        }
                        /* eslint-enable no-throw-literal */
                } else if (newValue !== propertySpecification.type)
                    /* eslint-disable no-throw-literal */
                    throw {
                        forbidden: `PropertyType: Property "${name}" isn't ` +
                            `value "${propertySpecification.type}" (given "` +
                            `${serialize(newValue)}").`
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
                                    `length ${propertySpecification.minimum}.`
                            }
                            /* eslint-enable no-throw-literal */
                    } else if ([
                        'number', 'integer', 'float', 'DateTime'
                    ].includes(propertySpecification.type) &&
                    newValue < propertySpecification.minimum)
                        /* eslint-disable no-throw-literal */
                        throw {
                            forbidden: `Minimum: Property "${name}" (type ` +
                                `${propertySpecification.type}) should ` +
                                `satisfy a minimum of ` +
                                `${propertySpecification.minimum}.`
                        }
                        /* eslint-disable no-throw-literal */
                if (![undefined, null].includes(propertySpecification.maximum))
                    if (propertySpecification.type === 'string') {
                        if (newValue.length > propertySpecification.maximum)
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden: `MaximalLength: Property "${name}` +
                                    ' (type string) should have maximal ' +
                                    `length ${propertySpecification.maximum}.`
                            }
                            /* eslint-enable no-throw-literal */
                    } else if ([
                        'number', 'integer', 'float', 'DateTime'
                    ].includes(
                        propertySpecification.type
                    ) && newValue > propertySpecification.maximum)
                        /* eslint-enable no-throw-literal */
                        throw {
                            forbidden: `Maximum: Property "${name}" (type ` +
                                `${propertySpecification.type}) should ` +
                                `satisfy a maximum of ` +
                                `${propertySpecification.maximum}.`
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
                            '"' +
                            propertySpecification.selection.join('", "') +
                            `". But is "${newValue}".`
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
                            ` (given "${newValue}").`
                    }
                    /* eslint-disable no-throw-literal */
                // endregion
                // region property constraint
                const propertyConstraintParameterNames:Array<string> = [
                    'checkDocument', 'checkPropertyContent', 'code', 'model',
                    'modelConfiguration', 'modelName', 'models', 'name',
                    'newDocument', 'newValue', 'oldDocument', 'oldValue',
                    'propertySpecification', 'securitySettings', 'serialize',
                    'userContext'
                ]
                for (const type:string of [
                    'constraintExpression', 'constraintExecution'
                ])
                    if (propertySpecification[type]) {
                        let hook:Function
                        const code:string = (type.endsWith(
                            'Expression'
                        ) ? 'return ' : ''
                        ) + propertySpecification[type].evaluation
                        const values:Array<any> = [
                            checkDocument, checkPropertyContent, code, model,
                            modelConfiguration, modelName, models, name,
                            newDocument, newValue, oldDocument, oldValue,
                            propertySpecification, securitySettings, serialize,
                            userContext
                        ]
                        try {
                            hook = new Function(
                                // IgnoreTypeCheck
                                ...propertyConstraintParameterNames.concat(
                                    code))
                        } catch (error) {
                            /* eslint-enable no-throw-literal */
                            throw {
                                forbidden: `Compilation: Hook "${type}" has ` +
                                    `invalid code "${code}": "` + serialize(
                                        error
                                    ) + '".'
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
                                    `throw an error with code "${code}": "` +
                                    `${serialize(error)}".`
                            }
                            /* eslint-enable no-throw-literal */
                        }
                        if (!satisfied)
                            /* eslint-disable no-throw-literal */
                            throw {forbidden: type.charAt(0).toUpperCase(
                            ) + type.substring(1) + `: ` + ((
                                propertySpecification[type].description
                            // IgnoreTypeCheck
                            ) ? (new Function(
                                ...propertyConstraintParameterNames.concat(
                                    propertySpecification[type].description)
                            ))(...values) : `Property "${name}` +
                            `" should satisfy constraint "${code}" (given "` +
                            `${serialize(newValue)}").`)}
                            /* eslint-enable no-throw-literal */
                    }
                // endregion
                return newValue
            }
            // / region create hook
            const runCreateHook:Function = (
                propertySpecification:PropertySpecification,
                newDocument:PlainObject, oldDocument:PlainObject, name:string
            ):any => {
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
                                    'propertySpecification', (
                                        type.endsWith('Expression') ?
                                        'return ' : ''
                                    ) + propertySpecification[type])
                            } catch (error) {
                                /* eslint-disable no-throw-literal */
                                throw {
                                    forbidden: `Compilation: Hook "${type}" ` +
                                        'has invalid code "' +
                                        `${propertySpecification[type]}" for` +
                                        ` property "${name}": ` +
                                        serialize(error)
                                }
                                /* eslint-enable no-throw-literal */
                            }
                            try {
                                newDocument[name] = hook(
                                    newDocument, oldDocument, userContext,
                                    securitySettings, name, models,
                                    modelConfiguration, serialize, modelName,
                                    model, propertySpecification)
                            } catch (error) {
                                /* eslint-disable no-throw-literal */
                                throw {
                                    forbidden: `Runtime: Hook "${type}" has ` +
                                        'throw an error with code "' +
                                        `${propertySpecification[type]}" ` +
                                        `for property "${name}": ` +
                                        serialize(error)
                                }
                                /* eslint-enable no-throw-literal */
                            }
                        }
            }
            // / endregion
            // / region update hook
            const runUpdateHook:Function = (
                propertySpecification:PropertySpecification,
                newDocument:PlainObject, oldDocument:PlainObject, name:string
            ):any => {
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
                                'propertySpecification', (type.endsWith(
                                    'Expression'
                                ) ? 'return ' : '') +
                                propertySpecification[type])
                        } catch (error) {
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden: `Compilation: Hook "${type}" has ` +
                                    `invalid code "` +
                                    `${propertySpecification[type]}" for ` +
                                    `property "${name}": ${serialize(error)}`
                            }
                            /* eslint-enable no-throw-literal */
                        }
                        try {
                            newDocument[name] = hook(
                                newDocument, oldDocument, userContext,
                                securitySettings, name, models,
                                modelConfiguration, serialize, modelName,
                                model, checkDocument, checkPropertyContent,
                                propertySpecification)
                        } catch (error) {
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden: `Runtime: Hook "${type}" has ` +
                                    'throw an error with code "' +
                                    `${propertySpecification[type]}" for ` +
                                    `property "${name}": ${serialize(error)}`
                            }
                            /* eslint-enable no-throw-literal */
                        }
                    }
            }
            // / endregion
            // endregion
            for (const name:string in model)
                if (model.hasOwnProperty(name) && ![
                    modelConfiguration.specialPropertyNames.allowedRoles,
                    modelConfiguration.specialPropertyNames.constraints
                        .expression,
                    modelConfiguration.specialPropertyNames.constraints
                        .execution
                ].includes(name))
                    // region run hooks and check for presence of needed data
                    if (
                        modelConfiguration.specialPropertyNames.attachments ===
                        name
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
                            const filter:Function = (new RegExp('')).test.bind(
                                new RegExp(type))
                            const newFileNames:Array<string> = Object.keys(
                                newDocument[name]
                            ).filter(filter)
                            let oldFileNames:Array<string> = []
                            if (oldDocument)
                                oldFileNames = Object.keys(
                                    oldDocument[name]
                                ).filter(filter)
                            for (const fileName:string of newFileNames)
                                runCreateHook(
                                    model[name][type], newDocument[name],
                                    oldDocument && oldDocument[name], fileName)
                            for (const fileName:string of newFileNames)
                                runUpdateHook(
                                    model[name][type], newDocument[name],
                                    oldDocument && oldDocument[name], fileName)
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
                                            `${type}".`
                                    }
                                    /* eslint-enable no-throw-literal */
                                if (
                                    modelConfiguration.updateStrategy ===
                                    'fillUp' &&
                                    newFileNames.length === 0 &&
                                    oldFileNames.length > 0
                                )
                                    for (const fileName:string of oldFileNames)
                                        newDocument[name][fileName] =
                                            // IgnoreTypeCheck
                                            oldDocument[name][fileName]
                            } else if (newFileNames.length === 0)
                                if (
                                    modelConfiguration.updateStrategy ===
                                    'fillUp'
                                ) {
                                    if (oldFileNames.length > 0)
                                        for (
                                            const fileName:string of
                                            oldFileNames
                                        )
                                            newDocument[name][fileName] =
                                                // IgnoreTypeCheck
                                                oldDocument[name][fileName]
                                    else
                                        for (const fileName:string in model[
                                            name
                                        ][type].default)
                                            if (model[name][
                                                type
                                            ].default.hasOwnProperty(fileName))
                                                newDocument[name][fileName] =
                                                    model[name][type].default[
                                                        fileName]
                                } else if (
                                    modelConfiguration.updateStrategy ===
                                        'migrate' ||
                                    oldFileNames.length === 0
                                )
                                    for (const fileName:string in model[name][
                                        type
                                    ].default)
                                        if (model[name][
                                            type
                                        ].default.hasOwnProperty(fileName))
                                            newDocument[name][fileName] =
                                                model[name][type].default[
                                                    fileName]
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
                                        `property "${name}".`
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
                            if (modelConfiguration.updateStrategy === 'fillUp')
                                if (oldDocument)
                                    newDocument[name] = oldDocument[name]
                                else
                                    newDocument[name] = model[name].default
                            else if (
                                modelConfiguration.updateStrategy ===
                                    'migrate' ||
                                !oldDocument
                            )
                                newDocument[name] = model[name].default
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
                        name !== modelConfiguration.specialPropertyNames.type &&
                        oldDocument.hasOwnProperty(name) &&
                        !modelConfiguration.reservedPropertyNames.includes(
                            name
                        ) && (
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
                ) && !modelConfiguration.reservedPropertyNames.includes(
                    name
                )) {
                    if (!model.hasOwnProperty(name))
                        if (modelConfiguration.updateStrategy === 'migrate') {
                            delete newDocument[name]
                            continue
                        } else
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden: 'Property: Given property "' +
                                    `${name}" isn't specified in ` +
                                    `model "${modelName}".`
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
                                    )
                                        delete newDocument[name]
                                    return true
                                } else
                                    /* eslint-disable no-throw-literal */
                                    throw {
                                        forbidden: 'Readonly: Property "' +
                                            `${name}" is not writable (old ` +
                                            `document "` +
                                            `${serialize(oldDocument)}").`
                                    }
                                    /* eslint-enable no-throw-literal */
                            else
                                /* eslint-disable no-throw-literal */
                                throw {
                                    forbidden: `Readonly: Property "${name}"` +
                                    ' is not writable.'
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
                                    !modelConfiguration.reservedPropertyNames
                                        .includes(name)
                                )
                                    delete newDocument[name]
                                return true
                            } else
                                /* eslint-disable no-throw-literal */
                                throw {
                                    forbidden: `Immutable: Property "${name}` +
                                        '" is not writable (old document "' +
                                        `${serialize(oldDocument)}").`
                                }
                                /* eslint-enable no-throw-literal */
                        // endregion
                        // region nullable
                        if (newDocument[name] === null)
                            if (propertySpecification.nullable) {
                                delete newDocument[name]
                                return true
                            } else
                                /* eslint-disable no-throw-literal */
                                throw {
                                    forbidden: `NotNull: Property "${name}" ` +
                                        'should not by "null".'
                                }
                                /* eslint-enable no-throw-literal */
                        // endregion
                        return false
                    }
                    if (
                        modelConfiguration.specialPropertyNames.attachments ===
                        name
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
                                forbidden: 'PropertyType: Property "' +
                                    `${name}" isn't of type "array -> ` +
                                    `${propertySpecification.type}" (given "` +
                                    `${serialize(newDocument[name])}").`
                            }
                            /* eslint-enable no-throw-literal */
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
                                propertySpecificationCopy)
                            if (newDocument[name][index] === null)
                                newDocument[name].splice(index, 1)
                            index += 1
                        }
                    } else {
                        newDocument[name] = checkPropertyContent(
                            newDocument[name], name, propertySpecification,
                            oldDocument && oldDocument.hasOwnProperty(
                                name
                            ) && oldDocument[name] || undefined)
                        if (newDocument[name] === null)
                            delete newDocument[name]
                    }
                }
            // / region constraint
            const constraintParameterNames:Array<string> = [
                'checkDocument', 'checkPropertyContent', 'code', 'model',
                'modelConfiguration', 'modelName', 'models', 'newDocument',
                'oldDocument', 'securitySettings', 'serialize', 'userContext'
            ]
            for (
                let type:string in
                modelConfiguration.specialPropertyNames.constraints
            )
                if (
                    modelConfiguration.specialPropertyNames.constraints
                        .hasOwnProperty(type) &&
                    (type = modelConfiguration.specialPropertyNames
                        .constraints[type]) &&
                    model.hasOwnProperty(type) &&
                    Array.isArray(model[type]) && model[type].length
                )
                    for (const constraint:Constraint of model[type]) {
                        let hook:Function
                        const code:string = ((
                            type === modelConfiguration.specialPropertyNames
                                .constraints.expression
                        ) ? 'return ' : '') + constraint.evaluation
                        const values:Array<any> = [
                            checkDocument, checkPropertyContent, code, model,
                            modelConfiguration, modelName, models, newDocument,
                            oldDocument, securitySettings, serialize,
                            userContext
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
                                    ) + '".'
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
                                    serialize(error)
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
                                `${serialize(newDocument)}").`)}
                            /* eslint-enable no-throw-literal */
                        }
                    }
            // / endregion
            // / region attachments
            const name:string = modelConfiguration.specialPropertyNames
                .attachments
            if (newDocument.hasOwnProperty(name)) {
                const newAttachments:PlainObject = newDocument[name]
                if (
                    typeof newAttachments !== 'object' ||
                    // IgnoreTypeCheck
                    Object.getPrototypeOf(newAttachments) !== Object.prototype
                )
                    /* eslint-disable no-throw-literal */
                    throw {
                        forbidden: 'AttachmentPresence: given ' +
                            'attachment has invalid type.'
                    }
                    /* eslint-enable no-throw-literal */
                // region migrate old attachments
                if (oldDocument && oldDocument.hasOwnProperty(
                    name
                ) && modelConfiguration.updateStrategy) {
                    const oldAttachments:any = oldDocument[name]
                    if (
                        oldAttachments !== null &&
                        typeof oldAttachments === 'object' &&
                        Object.getPrototypeOf(
                            oldAttachments
                        // IgnoreTypeCheck
                        ) === Object.prototype
                    )
                        for (const fileName:string in oldAttachments)
                            if (oldAttachments.hasOwnProperty(fileName))
                                if (
                                    modelConfiguration.updateStrategy ===
                                        'fillUp' &&
                                    !newAttachments.hasOwnProperty(fileName)
                                )
                                    newAttachments[fileName] = oldAttachments[
                                        fileName]
                                else if (
                                    modelConfiguration.updateStrategy ===
                                        'incremental' &&
                                    newAttachments.hasOwnProperty(fileName) &&
                                    (
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
                                    )
                                )
                                    delete newAttachments[fileName]
                }
                for (const fileName:string in newAttachments)
                    if (newAttachments.hasOwnProperty(fileName) && ([
                        undefined, null
                    ].includes(newAttachments[fileName]) ||
                    newAttachments[fileName].data === null))
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
                                    `${attachmentName}").`
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
                                `${type}".`
                        }
                        /* eslint-enable no-throw-literal */
                    if (!(
                        model[name][type].nullable && numberOfAttachments === 0
                    ) && model[name][type].minimum !== null &&
                    numberOfAttachments < model[name][type].minimum)
                        /* eslint-disable no-throw-literal */
                        throw {
                            forbidden: 'AttachmentMinimum: given number of ' +
                                `attachments (${numberOfAttachments}) ` +
                                `doesn't satisfy specified minimum of ` +
                                `${model[name][type].minimum} from type "` +
                                `${type}".`
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
                                    `type "${type}".`
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
                                    `type "${type}".`
                            }
                            /* eslint-enable no-throw-literal */
                    }
                }
            }
            // / endregion
            // endregion
            return newDocument
        }
        newDocument = checkDocument(newDocument, oldDocument)
        if (securitySettings.hasOwnProperty('checkedDocuments'))
            securitySettings[
                modelConfiguration.specialPropertyNames.validatedDocumentsCache
            ].add(`${newDocument._id}-${newDocument._rev}`)
        else
            securitySettings[
                modelConfiguration.specialPropertyNames.validatedDocumentsCache
            ] = new Set([`${newDocument._id}-${newDocument._rev}`])
        return newDocument
    }
}
// region vim modline
// vim: set tabstop=4 shiftwidth=4 expandtab:
// vim: foldmethod=marker foldmarker=region,endregion:
// endregion
