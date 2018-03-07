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

import type {
    /* eslint-disable no-unused-vars */
    Constraint,
    /* eslint-enable no-unused-vars */
    AllowedModelRolesMapping,
    Model,
    Models,
    NormalizedAllowedRoles,
    PropertySpecification,
    SecuritySettings,
    SimpleModelConfiguration,
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
        newDocument:PlainObject, oldDocument:?PlainObject,
        userContext:UserContext = {
            db: 'dummy',
            name: '"unknown"',
            roles: []
        /* eslint-disable no-unused-vars */
        }, securitySettings:SecuritySettings = {
            admins: {names: [], roles: []}, members: {names: [], roles: []}
        /* eslint-enable no-unused-vars */
        }, allowedModelRolesMapping:AllowedModelRolesMapping,
        idPropertyName:string, typePropertyName:string, read:boolean = false
    ):?true {
        /*
            NOTE: Special documents and like changes sequences are going
            through this function and should be ignored.
        */
        if (!newDocument.hasOwnProperty(typePropertyName))
            return true
        const allowedRoles:NormalizedAllowedRoles = {
            properties: {},
            read: ['_admin', 'readonlyadmin'],
            write: ['_admin']
        }
        if (
            newDocument.hasOwnProperty(idPropertyName) &&
            newDocument[idPropertyName].startsWith('_design/')
        )
            allowedRoles.read.push('readonlymember')
        let userRolesDescription:string = `Current user doesn't own any role`
        const operationType:string = read ? 'read': 'write'
        if (userContext) {
            if (!('name' in userContext))
                userContext.name = '"unknown"'
            if (
                allowedModelRolesMapping && typePropertyName &&
                newDocument.hasOwnProperty(typePropertyName) &&
                allowedModelRolesMapping.hasOwnProperty(
                    newDocument[typePropertyName])
            )
                for (const type:string in allowedRoles)
                    if (
                        allowedRoles.hasOwnProperty(type) &&
                        newDocument.hasOwnProperty(typePropertyName)
                    )
                        if (Array.isArray(allowedRoles[type]))
                            allowedRoles[type] = allowedRoles[type].concat(
                                allowedModelRolesMapping[newDocument[
                                    typePropertyName
                                ]][type])
                        else
                            allowedRoles[type] = allowedModelRolesMapping[
                                newDocument[typePropertyName]
                            ][type]
            if (userContext.roles.length) {
                // TODO check for each property recursively
                const relevantRoles:Array<string> = allowedRoles[operationType]
                for (const userRole:string of userContext.roles)
                    if (relevantRoles.includes(userRole))
                        return true
                // IgnoreTypeCheck
                userRolesDescription = `Current user "${userContext.name}" ` +
                    `owns the following roles: "` +
                    `${userContext.roles.join('", "')}".`
                //
            } else
                // IgnoreTypeCheck
                userRolesDescription = `Current user "${userContext.name}" ` +
                    `doesn't own any role`
        }
        /* eslint-disable no-throw-literal */
        throw {unauthorized:
            'Only users with a least on of these roles are allowed to ' +
            `perform requested ${operationType} action: "` +
            `${allowedRoles[operationType].join('", "')}". ` +
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
        // region ensure needed environment
        const now:Date = new Date()
        const nowUTCTimestamp:number = Date.UTC(
            now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
            now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(),
            now.getUTCMilliseconds()
        ) / 1000
        const specialNames:PlainObject =
            modelConfiguration.property.name.special
        const idName:string = specialNames.id
        const revisionName:string = specialNames.revision
        const typeName:string = specialNames.type
        let id:string = ''
        let revision:string = ''
        const setDocumentEnvironment:Function = ():void => {
            id = newDocument.hasOwnProperty(idName) ? newDocument[idName] : ''
            revision = newDocument.hasOwnProperty(revisionName) ?
                newDocument[revisionName] : ''
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
            ) && securitySettings[
                modelConfiguration.property.name.validatedDocumentsCache
            ].has(`${id}-${revision}`)
        ) {
            securitySettings[
                modelConfiguration.property.name.validatedDocumentsCache
            ].delete(`${id}-${revision}`)
            return newDocument
        }
        if (['latest', 'upsert'].includes(revision))
            if (oldDocument && oldDocument.hasOwnProperty(revisionName))
                revision = newDocument[revisionName] =
                    oldDocument[revisionName]
            else if (revision === 'latest')
                /* eslint-disable no-throw-literal */
                throw {
                    forbidden: 'Revision: No old document available to update.'
                }
                /* eslint-enable no-throw-literal */
            else
                delete newDocument[revisionName]
        let updateStrategy:string = modelConfiguration.updateStrategy
        if (newDocument.hasOwnProperty(specialNames.strategy)) {
            updateStrategy = newDocument[specialNames.strategy]
            delete newDocument[specialNames.strategy]
        }
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
        const attachmentWithPrefixExists:Function = (
            newDocument:PlainObject, namePrefix:string
        ):boolean => {
            if (newDocument.hasOwnProperty(specialNames.attachment)) {
                const name:string = getFilenameByPrefix(
                    newDocument[specialNames.attachment], namePrefix)
                if (name)
                    return newDocument[specialNames.attachment][
                        name
                    ].hasOwnProperty('stub') &&
                    newDocument[specialNames.attachment][
                        name
                    ].stub || newDocument[specialNames.attachment][
                        name
                    ].hasOwnProperty('data') &&
                    ![undefined, null].includes(
                        newDocument[specialNames.attachment][name].data)
            }
            return false
        }
        const checkDocument:Function = (
            newDocument:PlainObject, oldDocument:?PlainObject,
            parentNames:Array<string> = []
        ):PlainObject => {
            const pathDescription:string =
                parentNames.length ? ` in ${parentNames.join(' -> ')}` : ''
            let changedPath:Array<string> = []
            const checkModelType:Function = ():void => {
                // region check for model type
                if (!newDocument.hasOwnProperty(typeName))
                    /* eslint-disable no-throw-literal */
                    throw {
                        forbidden: 'Type: You have to specify a model type ' +
                            `via property "${typeName}"${pathDescription}.`
                    }
                    /* eslint-enable no-throw-literal */
                if (!(parentNames.length || (new RegExp(
                    modelConfiguration.property.name
                        .typeRegularExpressionPattern.public
                )).test(newDocument[typeName])))
                    /* eslint-disable no-throw-literal */
                    throw {
                        forbidden: 'TypeName: You have to specify a model ' +
                            'type which matches "' +
                            modelConfiguration.property.name
                                .typeRegularExpressionPattern.public +
                            `" as public type (given "` +
                            `${newDocument[typeName]}")${pathDescription}.`
                    }
                    /* eslint-enable no-throw-literal */
                if (!models.hasOwnProperty(newDocument[typeName]))
                    /* eslint-disable no-throw-literal */
                    throw {
                        forbidden: `Model: Given model "` +
                            `${newDocument[typeName]}" is not specified` +
                            `${pathDescription}.`
                    }
                    /* eslint-enable no-throw-literal */
                // endregion
            }
            checkModelType()
            let modelName:string = newDocument[typeName]
            const model:Model = models[modelName]
            let additionalPropertySpecification:?PlainObject = null
            if (model.hasOwnProperty(specialNames.additional) && model[
                specialNames.additional
            ])
                additionalPropertySpecification = model[
                    specialNames.additional]
            // region document specific functions
            const checkPropertyConstraints:Function = (
                newValue:any, name:string,
                propertySpecification:PropertySpecification, oldValue:?any,
                types:Array<string> = [
                    'constraintExecution', 'constraintExpression']
            ):void => {
                for (const type:string of types)
                    if (propertySpecification[type]) {
                        let hook:Function
                        const code:string = (
                            type.endsWith('Expression') ? 'return ' : ''
                        ) + propertySpecification[type].evaluation
                        const scope:Object = {
                            attachmentWithPrefixExists:
                                attachmentWithPrefixExists.bind(
                                    newDocument, newDocument),
                            checkDocument,
                            checkPropertyContent,
                            code,
                            getFilenameByPrefix,
                            idName,
                            model,
                            modelConfiguration,
                            modelName,
                            models,
                            name,
                            newDocument,
                            newValue,
                            now,
                            nowUTCTimestamp,
                            oldDocument,
                            oldValue,
                            parentNames,
                            pathDescription,
                            propertySpecification,
                            revisionName,
                            securitySettings,
                            serialize,
                            specialNames,
                            typeName,
                            userContext
                        }
                        // region compile
                        try {
                            // IgnoreTypeCheck
                            hook = new Function(...Object.keys(scope), code)
                        } catch (error) {
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden:
                                    `Compilation: Hook "${type}" has invalid` +
                                    ` code "${code}": "${serialize(error)}` +
                                    `"${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                        }
                        // endregion
                        let satisfied:boolean = false
                        // region run
                        try {
                            // IgnoreTypeCheck
                            satisfied = hook(...Object.values(scope))
                        } catch (error) {
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden:
                                    `Runtime: Hook "${type}" has throw an ` +
                                    `error with code "${code}": "` +
                                    `${serialize(error)}"${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                        }
                        // endregion
                        if (!satisfied)
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden: type.charAt(0).toUpperCase() +
                                type.substring(1) +
                                `: ` +
                                (propertySpecification[type].description ?
                                    // IgnoreTypeCheck
                                    new Function(
                                        ...Object.keys(scope), 'return ' +
                                            propertySpecification[type]
                                                .description.trim()
                                    )(...Object.values(scope)) :
                                    `Property "${name}" should ` +
                                `satisfy constraint "${code}" (given "` +
                                `${serialize(newValue)}")${pathDescription}.`)
                            }
                            /* eslint-enable no-throw-literal */
                    }
            }
            const checkPropertyContent:Function = (
                newValue:any, name:string,
                propertySpecification:PropertySpecification,
                oldValue:?any = null
            ):{changedPath:Array<string>;newValue:any;} => {
                let changedPath:Array<string> = []
                // region type
                const types:Array<any> = Array.isArray(
                    propertySpecification.type
                ) ? propertySpecification.type : [propertySpecification.type]
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
                for (const type:string of types)
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
                            const result:{
                                changedPath:Array<string>;newDocument:any
                            } = checkDocument(
                                newValue, oldValue, parentNames.concat(name))
                            if (result.changedPath.length)
                                changedPath = result.changedPath
                            newValue = result.newDocument
                            if (serialize(newValue) === serialize({}))
                                return {newValue: null, changedPath}
                            typeMatched = true
                            break
                        } else if (types.length === 1)
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden:
                                    `NestedType: Under key "${name}" isn't ` +
                                    `of type "${type}" (given "` +
                                    `${serialize(newValue)}" of type ` +
                                    `${typeof newValue})${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                    } else if (type === 'DateTime') {
                        const initialNewValue:any = newValue
                        if (
                            newValue !== null && typeof newValue !== 'number'
                        ) {
                            newValue = new Date(newValue)
                            /* eslint-enable no-throw-literal */
                            newValue = Date.UTC(
                                newValue.getUTCFullYear(),
                                newValue.getUTCMonth(), newValue.getUTCDate(),
                                newValue.getUTCHours(),
                                newValue.getUTCMinutes(),
                                newValue.getUTCSeconds(),
                                newValue.getUTCMilliseconds()
                            ) / 1000
                        }
                        if (typeof newValue !== 'number' || isNaN(newValue)) {
                            if (types.length === 1)
                                /* eslint-disable no-throw-literal */
                                throw {
                                    forbidden:
                                        `PropertyType: Property "${name}" ` +
                                        `isn't of (valid) type "DateTime" (` +
                                        `given "` +
                                        serialize(initialNewValue).replace(
                                            /^"/, ''
                                        ).replace(/"$/, '') +
                                        `" of type "` +
                                        `${typeof initialNewValue}")` +
                                        `${pathDescription}.`
                                }
                                /* eslint-enable no-throw-literal */
                        } else {
                            typeMatched = true
                            break
                        }
                    } else if ([
                        'boolean', 'integer', 'number', 'string'
                    ].includes(type))
                        if (
                            typeof newValue === 'number' && isNaN(newValue) ||
                            !(
                                type === 'integer' || typeof newValue === type
                            ) ||
                            type === 'integer' &&
                            parseInt(newValue) !== newValue
                        ) {
                            if (types.length === 1)
                                /* eslint-disable no-throw-literal */
                                throw {
                                    forbidden:
                                        `PropertyType: Property "${name}"` +
                                        ` isn't of (valid) type "${type}" (` +
                                        `given "${serialize(newValue)}" of ` +
                                        `type "${typeof newValue}")` +
                                        `${pathDescription}.`
                                }
                                /* eslint-enable no-throw-literal */
                        } else {
                            typeMatched = true
                            break
                        }
                    else if (typeof type === 'string' && type.startsWith(
                        'foreignKey:'
                    )) {
                        // IgnoreTypeCheck
                        const foreignKeyType:string = models[type.substring(
                            'foreignKey:'.length
                        )][idName].type
                        if (foreignKeyType === typeof newValue) {
                            typeMatched = true
                            break
                        } else if (types.length === 1)
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden:
                                    `PropertyType: Foreign key property "` +
                                    `${name}" isn't of type "` +
                                    `${foreignKeyType}" (given "` +
                                    `${serialize(newValue)}" of type "` +
                                    `${typeof newValue}")${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                    } else if (type === 'any' || serialize(
                        newValue
                    ) === serialize(type)) {
                        typeMatched = true
                        break
                    } else if (types.length === 1)
                        /* eslint-disable no-throw-literal */
                        throw {
                            forbidden:
                                `PropertyType: Property "${name}" isn't ` +
                                `value "${type}" (given "` +
                                serialize(newValue).replace(/^"/, '').replace(
                                    /"$/, ''
                                ) +
                                `" of type "${typeof newValue}")` +
                                `${pathDescription}.`
                        }
                        /* eslint-disable no-throw-literal */
                if (!typeMatched)
                    /* eslint-disable no-throw-literal */
                    throw {
                        forbidden:
                            'PropertyType: None of the specified types "' +
                            `${types.join('", "')}" for property "${name}" ` +
                            `matches value "` +
                            serialize(newValue).replace(/^"/, '').replace(
                                /"$/, ''
                            ) + `${newValue}" of type "${typeof newValue}")` +
                            `${pathDescription}.`
                    }
                    /* eslint-disable no-throw-literal */
                // endregion
                // region range
                if (typeof newValue === 'string') {
                    if (![undefined, null].includes(
                        propertySpecification.minimumLength
                    ) && newValue.length < propertySpecification.minimumLength)
                        /* eslint-disable no-throw-literal */
                        throw {
                            forbidden:
                                `MinimalLength: Property "${name}" must have` +
                                ' minimal length ' +
                                // IgnoreTypeCheck
                                `${propertySpecification.minimumLength} (` +
                                `given ${newValue} with length ` +
                                `${newValue.length})${pathDescription}.`
                        }
                        /* eslint-enable no-throw-literal */
                    if (![undefined, null].includes(
                        propertySpecification.maximumLength
                    ) && newValue.length > propertySpecification.maximumLength)
                        /* eslint-disable no-throw-literal */
                        throw {
                            forbidden:
                                `MaximalLength: Property "${name}" must have` +
                                ' maximal length ' +
                                // IgnoreTypeCheck
                                `${propertySpecification.maximumLength} (` +
                                `given ${newValue} with length ` +
                                `${newValue.length})${pathDescription}.`
                        }
                        /* eslint-enable no-throw-literal */
                }
                if (typeof newValue === 'number') {
                    if (![undefined, null].includes(
                        propertySpecification.minimum
                    ) && newValue < propertySpecification.minimum)
                        /* eslint-disable no-throw-literal */
                        throw {
                            forbidden:
                                `Minimum: Property "${name}" (type ` +
                                // IgnoreTypeCheck
                                `${propertySpecification.type}) must ` +
                                'satisfy a minimum of ' +
                                // IgnoreTypeCheck
                                `${propertySpecification.minimum} (` +
                                `given ${newValue} with length ` +
                                `${newValue.length})${pathDescription}.`
                        }
                        /* eslint-disable no-throw-literal */
                    if (![undefined, null].includes(
                        propertySpecification.maximum
                    ) && newValue > propertySpecification.maximum)
                        /* eslint-disable no-throw-literal */
                        throw {
                            forbidden:
                                `Maximum: Property "${name}" (type ` +
                                // IgnoreTypeCheck
                                `${propertySpecification.type}) must ` +
                                'satisfy a maximum of ' +
                                // IgnoreTypeCheck
                                `${propertySpecification.maximum} (` +
                                `given ${newValue} with length ` +
                                `${newValue.length}${pathDescription}.`
                        }
                        /* eslint-enable no-throw-literal */
                }
                // endregion
                // region selection
                if (propertySpecification.selection) {
                    const selection = Array.isArray(
                        propertySpecification.selection
                    ) ? propertySpecification.selection :
                        Object.values(propertySpecification.selection)
                    if (!selection.includes(newValue))
                        /* eslint-disable no-throw-literal */
                        throw {
                            forbidden:
                                `Selection: Property "${name}" (type ` +
                                // IgnoreTypeCheck
                                `${propertySpecification.type}) should be ` +
                                `one of "${selection.join('", "')}". But is ` +
                                `"${newValue}"${pathDescription}.`
                        }
                        /* eslint-enable no-throw-literal */
                }
                // endregion
                // region pattern
                if (!(
                    [undefined, null].includes(
                        propertySpecification.regularExpressionPattern
                    ) ||
                    new RegExp(
                        // IgnoreTypeCheck
                        propertySpecification.regularExpressionPattern
                    ).test(newValue)
                ))
                    /* eslint-disable no-throw-literal */
                    throw {
                        forbidden:
                            `PatternMatch: Property "${name}" should match ` +
                            'regular expression pattern ' +
                            // IgnoreTypeCheck
                            propertySpecification.regularExpressionPattern +
                            ` (given "${newValue}")${pathDescription}.`
                    }
                    /* eslint-enable no-throw-literal */
                else if (!(
                    [undefined, null].includes(
                        propertySpecification.invertedRegularExpressionPattern
                    ) ||
                    !(new RegExp(
                        // IgnoreTypeCheck
                        propertySpecification.invertedRegularExpressionPattern
                    )).test(newValue)
                ))
                    /* eslint-disable no-throw-literal */
                    throw {
                        forbidden:
                            `InvertedPatternMatch: Property "${name}" should` +
                            ' not match regular expression pattern ' +
                            // IgnoreTypeCheck
                            propertySpecification
                                .invertedRegularExpressionPattern +
                            ` (given "${newValue}")${pathDescription}.`
                    }
                    /* eslint-enable no-throw-literal */
                // endregion
                checkPropertyConstraints(
                    newValue, name, propertySpecification, oldValue)
                if (serialize(newValue) !== serialize(oldValue))
                    changedPath = parentNames.concat(name, 'value updated')
                return {newValue, changedPath}
            }
            // / region create hook
            const runCreatePropertyHook:Function = (
                propertySpecification:PropertySpecification,
                newDocument:PlainObject, oldDocument:PlainObject, name:string
            ):void => {
                if (!oldDocument)
                    for (const type:string of [
                        'onCreateExecution', 'onCreateExpression'
                    ])
                        if (propertySpecification[type]) {
                            let hook:Function
                            const scope:Object = {
                                attachmentWithPrefixExists:
                                    attachmentWithPrefixExists.bind(
                                        newDocument, newDocument),
                                checkDocument,
                                checkPropertyContent,
                                getFilenameByPrefix,
                                idName,
                                model,
                                modelConfiguration,
                                modelName,
                                models,
                                name,
                                newDocument,
                                now,
                                nowUTCTimestamp,
                                oldDocument,
                                propertySpecification,
                                revisionName,
                                securitySettings,
                                serialize,
                                specialNames,
                                typeName,
                                userContext
                            }
                            try {
                                // IgnoreTypeCheck
                                hook = new Function(...Object.keys(scope), (
                                    type.endsWith('Expression') ? 'return ' :
                                    ''
                                ) + propertySpecification[type].trim())
                            } catch (error) {
                                /* eslint-disable no-throw-literal */
                                throw {
                                    forbidden:
                                        `Compilation: Hook "${type}" has ` +
                                        'invalid code "' +
                                        `${propertySpecification[type]}" for` +
                                        ` property "${name}": ` +
                                        serialize(error) +
                                        `${pathDescription}.`
                                }
                                /* eslint-enable no-throw-literal */
                            }
                            let result:any
                            try {
                                result = hook(...Object.values(scope))
                            } catch (error) {
                                /* eslint-disable no-throw-literal */
                                throw {
                                    forbidden:
                                        `Runtime: Hook "${type}" has throw ` +
                                        'an error with code "' +
                                        `${propertySpecification[type]}" ` +
                                        `for property "${name}": ` +
                                        serialize(error) +
                                        `${pathDescription}.`
                                }
                                /* eslint-enable no-throw-literal */
                            }
                            if (![undefined, null].includes(result))
                                newDocument[name] = result
                        }
            }
            // / endregion
            // / region update hook
            const runUpdatePropertyHook:Function = (
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
                if (propertySpecification.emptyEqualsToNull && (
                    newDocument[name] === '' ||
                    Array.isArray(newDocument[name]) &&
                    newDocument[name].length === 0 ||
                    typeof newDocument[name] === 'object' &&
                    newDocument[name] !== null &&
                    Object.keys(newDocument).length === 0
                ))
                    newDocument[name] = null
                for (const type:string of [
                    'onUpdateExecution', 'onUpdateExpression'
                ])
                    if (propertySpecification[type]) {
                        let hook:Function
                        const scope:Object = {
                            attachmentWithPrefixExists:
                                attachmentWithPrefixExists.bind(
                                    newDocument, newDocument),
                            checkDocument,
                            checkPropertyContent,
                            getFilenameByPrefix,
                            idName,
                            model,
                            modelConfiguration,
                            modelName,
                            models,
                            name,
                            newDocument,
                            now,
                            nowUTCTimestamp,
                            oldDocument,
                            propertySpecification,
                            revisionName,
                            securitySettings,
                            serialize,
                            specialNames,
                            typeName,
                            userContext
                        }
                        try {
                            // IgnoreTypeCheck
                            hook = new Function(...Object.keys(scope), (
                                type.endsWith('Expression') ? 'return ' : ''
                            ) + propertySpecification[type].trim())
                        } catch (error) {
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden:
                                    `Compilation: Hook "${type}" has invalid` +
                                    ` code "${propertySpecification[type]}" ` +
                                    `for property "${name}": `+
                                    `${serialize(error)}${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                        }
                        try {
                            newDocument[name] = hook(...Object.values(scope))
                        } catch (error) {
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden:
                                    `Runtime: Hook "${type}" has throw an ` +
                                    'error with code "' +
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
            const specifiedPropertyNames:Array<string> = Object.keys(
                model
            ).filter((name:string):boolean => ![
                specialNames.additional,
                specialNames.allowedRole,
                specialNames.constraint.execution,
                specialNames.constraint.expression,
                specialNames.create.execution,
                specialNames.create.expression,
                specialNames.extend,
                specialNames.maximumAggregatedSize,
                specialNames.minimumAggregatedSize,
                specialNames.update.execution,
                specialNames.update.expression
            ].includes(name))
            // region run create document hook
            if (!oldDocument)
                for (const type:string of [
                    modelConfiguration.property.name.special.create.execution,
                    modelConfiguration.property.name.special.create.expression
                ])
                    if (model.hasOwnProperty(type) && model[type]) {
                        let hook:Function
                        const scope:Object = {
                            attachmentWithPrefixExists:
                                attachmentWithPrefixExists.bind(
                                    newDocument, newDocument),
                            checkDocument,
                            checkPropertyContent,
                            getFilenameByPrefix,
                            id,
                            idName,
                            model,
                            modelConfiguration,
                            modelName,
                            models,
                            newDocument,
                            now,
                            nowUTCTimestamp,
                            oldDocument,
                            revisionName,
                            securitySettings,
                            serialize,
                            specialNames,
                            typeName,
                            userContext
                        }
                        try {
                            // IgnoreTypeCheck
                            hook = new Function(...Object.keys(scope), (
                                type.endsWith('Expression') ? 'return ' : ''
                            // IgnoreTypeCheck
                            ) + model[type].trim())
                        } catch (error) {
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden:
                                    `Compilation: Hook "${type}" has invalid` +
                                    // IgnoreTypeCheck
                                    ` code "${model[type]}" for document "` +
                                    `${modelName}": ${serialize(error)}` +
                                    `${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                        }
                        let result:any
                        try {
                            result = hook(...Object.values(scope))
                        } catch (error) {
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden:
                                    `Runtime: Hook "${type}" has throw an ` +
                                    'error with code "' +
                                    // IgnoreTypeCheck
                                    `${model[type]}" for document "` +
                                    `${modelName}": ${serialize(error)}` +
                                    `${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                        }
                        if (![undefined, null].includes(result))
                            newDocument = result
                        checkModelType()
                        modelName = newDocument[typeName]
                        if (parentNames.length === 0)
                            setDocumentEnvironment()
                    }
            // endregion
            // region run update document hook
            for (const type:string of [
                modelConfiguration.property.name.special.update.execution,
                modelConfiguration.property.name.special.update.expression
            ])
                if (model.hasOwnProperty(type) && model[type]) {
                    let hook:Function
                    const scope:Object = {
                        attachmentWithPrefixExists:
                            attachmentWithPrefixExists.bind(
                                newDocument, newDocument),
                        checkDocument,
                        checkPropertyContent,
                        getFilenameByPrefix,
                        idName,
                        model,
                        modelConfiguration,
                        modelName,
                        models,
                        id,
                        newDocument,
                        now,
                        nowUTCTimestamp,
                        oldDocument,
                        revisionName,
                        securitySettings,
                        serialize,
                        specialNames,
                        typeName,
                        userContext
                    }
                    try {
                        // IgnoreTypeCheck
                        hook = new Function(...Object.keys(scope), (
                            type.endsWith('Expression') ? 'return ' : ''
                        // IgnoreTypeCheck
                        ) + model[type].trim())
                    } catch (error) {
                        /* eslint-disable no-throw-literal */
                        throw {
                            forbidden:
                                `Compilation: Hook "${type}" has invalid ` +
                                // IgnoreTypeCheck
                                ` code "${model[type]}" for document "` +
                                `${modelName}": ${serialize(error)}` +
                                `${pathDescription}.`
                        }
                        /* eslint-enable no-throw-literal */
                    }
                    let result:any
                    try {
                        result = hook(...Object.values(scope))
                    } catch (error) {
                        /* eslint-disable no-throw-literal */
                        throw {
                            forbidden:
                                `Runtime: Hook "${type}" has throw an error ` +
                                // IgnoreTypeCheck
                                `with code "${model[type]}" for document "` +
                                `${modelName}": ${serialize(error)}` +
                                `${pathDescription}.`
                        }
                        /* eslint-enable no-throw-literal */
                    }
                    if (![undefined, null].includes(result))
                        newDocument = result
                    checkModelType()
                    modelName = newDocument[typeName]
                    if (parentNames.length === 0)
                        setDocumentEnvironment()
                }
            // endregion
            for (const name:string of specifiedPropertyNames.concat(
                additionalPropertySpecification ? Object.keys(
                    newDocument
                ).filter((name:string):boolean =>
                    !specifiedPropertyNames.includes(name)
                ) : []
            ))
                // region run hooks and check for presence of needed data
                if (specialNames.attachment === name) {
                    for (const type:string in model[name])
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
                            const newFileNames:Array<string> = Object.keys(
                                newDocument[name]
                            ).filter((fileName:string):boolean => newDocument[
                                name
                            ][fileName].data !== null &&
                            new RegExp(type).test(fileName))
                            let oldFileNames:Array<string> = []
                            if (oldDocument)
                                oldFileNames = Object.keys(
                                    oldDocument[name]
                                ).filter((fileName:string):boolean => !(
                                    newDocument.hasOwnProperty(name) &&
                                    newDocument[name].hasOwnProperty(
                                        fileName) &&
                                    newDocument[name][fileName].hasOwnProperty(
                                        'data'
                                    ) &&
                                    newDocument[name][fileName].data === null
                                ) &&
                                // IgnoreTypeCheck
                                oldDocument[name][fileName] &&
                                oldDocument[name][fileName].data !== null &&
                                new RegExp(type).test(fileName))
                            for (const fileName:string of newFileNames)
                                runCreatePropertyHook(
                                    model[name][type], newDocument[name],
                                    oldDocument && oldDocument[
                                        name
                                    ] ? oldDocument[name] : null, fileName)
                            for (const fileName:string of newFileNames)
                                runUpdatePropertyHook(
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
                                        forbidden:
                                            'AttachmentMissing: Missing ' +
                                            `attachment for type "${type}"` +
                                            `${pathDescription}.`
                                    }
                                    /* eslint-enable no-throw-literal */
                                if (
                                    updateStrategy === 'fillUp' &&
                                    newFileNames.length === 0 &&
                                    oldFileNames.length > 0
                                )
                                    for (const fileName:string of oldFileNames)
                                        if (newDocument[name][
                                            fileName
                                        ] === null)
                                            changedPath = parentNames.concat(
                                                name, fileName, 'file removed')
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
                                            changedPath = parentNames.concat(
                                                name, type, 'add default file')
                                        }
                                } else if (updateStrategy === 'fillUp')
                                    for (const fileName:string of oldFileNames)
                                        newDocument[name][fileName] =
                                            // IgnoreTypeCheck
                                            oldDocument[name][fileName]
                        }
                } else {
                    const propertySpecification:PropertySpecification =
                        // IgnoreTypeCheck
                        specifiedPropertyNames.includes(name) ? model[name] :
                        additionalPropertySpecification
                    runCreatePropertyHook(
                        propertySpecification, newDocument, oldDocument, name)
                    runUpdatePropertyHook(
                        propertySpecification, newDocument, oldDocument, name)
                    if ([undefined, null].includes(
                        propertySpecification.default
                    )) {
                        if (!(propertySpecification.nullable || (
                            newDocument.hasOwnProperty(name) ||
                            oldDocument && oldDocument.hasOwnProperty(
                                name
                            ) && updateStrategy
                        )))
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden:
                                    'MissingProperty: Missing property "' +
                                    `${name}"${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
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
                for (const name:string in newDocument)
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
            // / endregion
            for (const name:string in newDocument)
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
                    let propertySpecification:?PropertySpecification
                    if (model.hasOwnProperty(name))
                        propertySpecification = model[name]
                    else if (additionalPropertySpecification)
                        propertySpecification = additionalPropertySpecification
                    else if (updateStrategy === 'migrate') {
                        delete newDocument[name]
                        changedPath = parentNames.concat(
                            name, 'migrate removed property')
                        continue
                    } else
                        /* eslint-disable no-throw-literal */
                        throw {
                            forbidden: 'Property: Given property "' +
                                `${name}" isn't specified in ` +
                                `model "${modelName}"${pathDescription}.`
                        }
                        /* eslint-enable no-throw-literal */
                    // NOTE: Only needed to avoid type check errors.
                    if (!propertySpecification)
                        continue
                    // region writable/mutable/nullable
                    const checkWriteableMutableNullable:Function = (
                        propertySpecification:PropertySpecification,
                        newDocument:PlainObject, oldDocument:?PlainObject,
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
                                    /* eslint-disable no-throw-literal */
                                    throw {
                                        forbidden:
                                            `Readonly: Property "${name}" is` +
                                            ` not writable (old document "` +
                                            `${serialize(oldDocument)}")` +
                                            `${pathDescription}.`
                                    }
                                    /* eslint-enable no-throw-literal */
                            else
                                /* eslint-disable no-throw-literal */
                                throw {
                                    forbidden:
                                        `Readonly: Property "${name}" is not` +
                                        ` writable${pathDescription}.`
                                }
                                /* eslint-enable no-throw-literal */
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
                                /* eslint-disable no-throw-literal */
                                throw {
                                    forbidden:
                                        `Immutable: Property "${name}" is ` +
                                        'not writable (old document "' +
                                        `${serialize(oldDocument)}")` +
                                        `${pathDescription}.`
                                }
                                /* eslint-enable no-throw-literal */
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
                    if (specialNames.attachment === name) {
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
                        propertySpecification.type.endsWith('[]') ||
                        Array.isArray(propertySpecification.type) &&
                        propertySpecification.type.length &&
                        Array.isArray(propertySpecification.type[0])
                    ) {
                        if (!Array.isArray(newDocument[name]))
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden:
                                    `PropertyType: Property "${name}" isn't ` +
                                    `of type "array -> ` +
                                    `${propertySpecification.type}" (given "` +
                                    `${serialize(newDocument[name])}")` +
                                    `${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                        else if (![undefined, null].includes(
                            propertySpecification.minimumNumber
                        ) && newDocument[name].length <
                            propertySpecification.minimumNumber
                        )
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden:
                                    `MinimumArrayLength: Property "${name}" ` +
                                    ` (array of length ` +
                                    `${newDocument[name].length}) doesn't ` +
                                    `fullfill minimum array length of ` +
                                    // IgnoreTypeCheck
                                    propertySpecification.minimumNumber +
                                    `${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                        else if (![undefined, null].includes(
                            propertySpecification.maximumNumber
                        ) && propertySpecification.maximumNumber <
                            newDocument[name].length
                        )
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden:
                                    `MaximumArrayLength: Property "${name}" ` +
                                    `(array of length ` +
                                    `${newDocument[name].length}) doesn't ` +
                                    `fullfill maximum array length of ` +
                                    // IgnoreTypeCheck
                                    propertySpecification.maximumNumber +
                                    `${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                        checkPropertyConstraints(
                            newDocument[name], name, propertySpecification,
                            oldDocument && oldDocument.hasOwnProperty(
                                name
                            ) && oldDocument[name] || undefined, [
                                'arrayConstraintExecution',
                                'arrayConstraintExpression'])
                        const propertySpecificationCopy:PropertySpecification =
                            {}
                        for (const key:string in propertySpecification)
                            if (propertySpecification.hasOwnProperty(key))
                                if (key === 'type')
                                    if (Array.isArray(propertySpecification[
                                        key
                                    ]))
                                        propertySpecificationCopy[
                                            key
                                        ] = propertySpecification[key][0]
                                    else
                                        propertySpecificationCopy[
                                            key
                                        // IgnoreTypeCheck
                                        ] = [propertySpecification[
                                            key
                                        ].substring(
                                            0,
                                            // IgnoreTypeCheck
                                            propertySpecification.type.length -
                                                '[]'.length)]
                                else
                                    propertySpecificationCopy[key] =
                                        propertySpecification[key]
                        /*
                            Derive nested missing explicit type definition if
                            possible.
                        */
                        if (
                            // IgnoreTypeCheck
                            typeof propertySpecificationCopy.type.length ===
                                1 &&
                            models.hasOwnProperty(
                            // IgnoreTypeCheck
                                propertySpecificationCopy.type[0])
                        )
                            for (const value:any of newDocument[name].slice())
                                if (
                                    typeof value === 'object' &&
                                    Object.getPrototypeOf(value) ===
                                        Object.prototype &&
                                    !value.hasOwnProperty(typeName)
                                )
                                    value[typeName] =
                                        // IgnoreTypeCheck
                                        propertySpecificationCopy.type[0]
                        let index:number = 0
                        for (const value:any of newDocument[name].slice()) {
                            newDocument[name][index] = checkPropertyContent(
                                value, `${index + 1}. value in ${name}`,
                                propertySpecificationCopy
                            ).newValue
                            if (value === null)
                                newDocument[name].splice(index, 1)
                            index += 1
                        }
                        if (!(
                            oldDocument &&
                            oldDocument.hasOwnProperty(name) &&
                            Array.isArray(oldDocument[name]) &&
                            oldDocument[name].length === newDocument[
                                name
                            ].length &&
                            serialize(oldDocument[name]) ===
                                serialize(newDocument[name])
                        ))
                            changedPath = parentNames.concat(
                                name, 'array updated')
                    } else {
                        const oldValue:any =
                            oldDocument && oldDocument.hasOwnProperty(
                                name
                            ) ? oldDocument[name] : null
                        const result:{
                            changedPath:Array<string>;newValue:any;
                        } = checkPropertyContent(
                            newDocument[name], name, propertySpecification,
                            oldValue)
                        newDocument[name] = result.newValue
                        if (result.changedPath.length)
                            changedPath = result.changedPath
                        if (newDocument[name] === null) {
                            if (oldValue !== null)
                                changedPath = parentNames.concat(
                                    name, 'property removed')
                            delete newDocument[name]
                        }
                    }
                }
            // / region constraint
            for (let type:string in specialNames.constraint)
                if (
                    specialNames.constraint.hasOwnProperty(type) &&
                    (type = specialNames.constraint[type]) &&
                    model.hasOwnProperty(type) &&
                    Array.isArray(model[type]) && model[type].length
                )
                    for (const constraint:Constraint of model[type]) {
                        let hook:Function
                        const code:string = ((
                            type === specialNames.constraint.expression
                        ) ? 'return ' : '') + constraint.evaluation.trim()
                        const scope:Object = {
                            attachmentWithPrefixExists:
                                attachmentWithPrefixExists.bind(
                                    newDocument, newDocument),
                            checkDocument,
                            checkPropertyContent,
                            code,
                            getFilenameByPrefix,
                            idName,
                            model,
                            modelConfiguration,
                            modelName,
                            models,
                            newDocument,
                            now,
                            nowUTCTimestamp,
                            oldDocument,
                            parentNames,
                            pathDescription,
                            revisionName,
                            securitySettings,
                            serialize,
                            specialNames,
                            typeName,
                            userContext
                        }
                        try {
                            // IgnoreTypeCheck
                            hook = new Function(...Object.keys(scope), code)
                        } catch (error) {
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden: `Compilation: Hook "${type}" has ` +
                                    `invalid code "${code}": "` +
                                    serialize(error) +
                                    `"${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                        }
                        let satisfied:boolean = false
                        try {
                            // IgnoreTypeCheck
                            satisfied = hook(...Object.values(scope))
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
                            throw {
                                forbidden: errorName.charAt(0).toUpperCase() +
                                `${errorName.substring(1)}: ` + (
                                    // IgnoreTypeCheck
                                    constraint.description ? new Function(
                                        ...Object.keys(scope),
                                        'return ' +
                                        constraint.description.trim()
                                    )(...Object.values(scope)) :
                                    `Model "${modelName}" should satisfy ` +
                                    `constraint "${code}" (given "` +
                                    `${serialize(newDocument)}")` +
                                    `${pathDescription}.`)
                            }
                            /* eslint-enable no-throw-literal */
                        }
                    }
            // / endregion
            // / region attachment
            if (newDocument.hasOwnProperty(specialNames.attachment)) {
                const newAttachments:PlainObject = newDocument[
                    specialNames.attachment]
                if (
                    typeof newAttachments !== 'object' ||
                    Object.getPrototypeOf(newAttachments) !== Object.prototype
                )
                    /* eslint-disable no-throw-literal */
                    throw {
                        forbidden: 'AttachmentType: given attachment has ' +
                            `invalid type${pathDescription}.`
                    }
                    /* eslint-enable no-throw-literal */
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
                        for (const fileName:string in oldAttachments)
                            if (oldAttachments.hasOwnProperty(fileName))
                                if (newAttachments.hasOwnProperty(fileName))
                                    if (
                                        newAttachments[fileName] === null ||
                                        newAttachments[
                                            fileName
                                        ].data === null ||
                                        newAttachments[
                                            fileName
                                        ].content_type ===
                                            oldAttachments[fileName]
                                                .content_type &&
                                        newAttachments[fileName].data ===
                                        oldAttachments[fileName].data
                                    ) {
                                        if (
                                            newAttachments[
                                                fileName
                                            ] === null ||
                                            newAttachments[
                                                fileName
                                            ].data === null
                                        )
                                            changedPath = parentNames.concat(
                                                specialNames.attachment,
                                                fileName, 'attachment removed')
                                        if (updateStrategy === 'incremental')
                                            delete newAttachments[fileName]
                                    } else
                                        changedPath = parentNames.concat(
                                            specialNames.attachment, fileName,
                                            'attachment updated')
                                else if (updateStrategy === 'fillUp')
                                    newAttachments[fileName] = oldAttachments[
                                        fileName]
                                else if (!updateStrategy)
                                    changedPath = parentNames.concat(
                                        specialNames.attachment, fileName,
                                        'attachment removed')
                }
                for (const fileName:string in newAttachments)
                    if (newAttachments.hasOwnProperty(fileName))
                        if ([undefined, null].includes(
                            newAttachments[fileName]
                        ) || newAttachments[fileName].data === null)
                            delete newAttachments[fileName]
                        else if (!(
                            oldAttachments &&
                            oldAttachments.hasOwnProperty(fileName) &&
                            newAttachments[fileName].content_type ===
                                oldAttachments[fileName].content_type &&
                            newAttachments[fileName].data ===
                                oldAttachments[fileName].data
                        ))
                            changedPath = parentNames.concat(
                                specialNames.attachment, fileName,
                                'attachment updated')
                // endregion
                if (Object.keys(newAttachments).length === 0)
                    delete newDocument[specialNames.attachment]
                const attachmentToTypeMapping:{[key:string]:Array<string>} = {}
                for (const type:string in model[specialNames.attachment])
                    if (model[specialNames.attachment].hasOwnProperty(type))
                        attachmentToTypeMapping[type] = []
                for (const name:string in newAttachments)
                    if (newAttachments.hasOwnProperty(name)) {
                        let matched:boolean = false
                        for (const type:string in model[
                            specialNames.attachment
                        ])
                            if ((new RegExp(type)).test(name)) {
                                attachmentToTypeMapping[type].push(name)
                                matched = true
                                break
                            }
                        if (!matched)
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden:
                                    'AttachmentTypeMatch: None of the ' +
                                    'specified attachment types ("' +
                                    Object.keys(model[
                                        specialNames.attachment
                                    ]).join('", "') + '") matches given one ' +
                                    `("${name}")${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                    }
                let sumOfAggregatedSizes:number = 0
                for (const type:string in attachmentToTypeMapping) {
                    if (!attachmentToTypeMapping.hasOwnProperty(type))
                        continue
                    const numberOfAttachments:number =
                        attachmentToTypeMapping[type].length
                    if (
                        model[specialNames.attachment][type].maximumNumber !==
                            null &&
                        numberOfAttachments > model[specialNames.attachment][
                            type
                        ].maximumNumber
                    )
                        /* eslint-disable no-throw-literal */
                        throw {
                            forbidden: 'AttachmentMaximum: given number of ' +
                                `attachments (${numberOfAttachments}) ` +
                                `doesn't satisfy specified maximum of ` +
                                model[specialNames.attachment][
                                    type
                                ].maximumNumber +
                                ` from type "${type}"${pathDescription}.`
                        }
                        /* eslint-enable no-throw-literal */
                    if (
                        !(
                            model[specialNames.attachment][type].nullable &&
                            numberOfAttachments === 0
                        ) &&
                        numberOfAttachments < model[specialNames.attachment][
                            type
                        ].minimumNumber
                    )
                        /* eslint-disable no-throw-literal */
                        throw {
                            forbidden: 'AttachmentMinimum: given number of ' +
                                `attachments (${numberOfAttachments}) ` +
                                `doesn't satisfy specified minimum of ` +
                                model[specialNames.attachment][
                                    type
                                ].minimumNumber +
                                ` from type "${type}"${pathDescription}.`
                        }
                        /* eslint-enable no-throw-literal */
                    let aggregatedSize:number = 0
                    for (const fileName:string of attachmentToTypeMapping[
                        type
                    ]) {
                        if (!(
                            [null, undefined].includes(model[
                                specialNames.attachment
                            ][type].regularExpressionPattern) ||
                            new RegExp(
                                model[specialNames.attachment][type]
                                    .regularExpressionPattern
                            ).test(fileName)
                        ))
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden:
                                    'AttachmentName: given attachment name "' +
                                    `${fileName}" doesn't satisfy specified ` +
                                    'regular expression pattern "' +
                                    model[specialNames.attachment][type]
                                        .regularExpressionPattern +
                                    `" from type "${type}"${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                        else if (!(
                            [null, undefined].includes(
                                model[specialNames.attachment][type]
                                    .invertedRegularExpressionPattern
                            ) ||
                            !(new RegExp(model[specialNames.attachment][
                                type
                            ].invertedRegularExpressionPattern)).test(fileName)
                        ))
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden:
                                    'InvertedAttachmentName: given ' +
                                    `attachment name "${fileName}" doesn't ` +
                                    'satisfy specified regular expression ' +
                                    'pattern "' +
                                    model[specialNames.attachment][type]
                                        .invertedRegularExpressionPattern +
                                    `" from type "${type}"${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                        else if (!(
                            [null, undefined].includes(
                                model[specialNames.attachment][type]
                                    .contentTypeRegularExpressionPattern
                            ) ||
                            newAttachments[fileName].hasOwnProperty(
                                'content_type'
                            ) &&
                            newAttachments[fileName].content_type &&
                            new RegExp(model[specialNames.attachment][type]
                                .contentTypeRegularExpressionPattern
                            ).test(newAttachments[fileName].content_type)
                        ))
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden:
                                    'AttachmentContentType: given attachment' +
                                    ' content type "' +
                                    newAttachments[fileName].content_type +
                                    `" doesn't satisfy specified regular` +
                                    ' expression pattern "' +
                                    model[specialNames.attachment][type]
                                        .contentTypeRegularExpressionPattern +
                                    `" from type "${type}"${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                        const pattern:?string = model[specialNames.attachment][
                            type
                        ].invertedContentTypeRegularExpressionPattern
                        if (!(
                            [null, undefined].includes(pattern) ||
                            newAttachments[fileName].hasOwnProperty(
                                'content_type'
                            ) &&
                            newAttachments[fileName].content_type &&
                            // IgnoreTypeCheck
                            !(new RegExp(pattern)).test(
                                newAttachments[fileName].content_type
                            )
                        ))
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden:
                                    'InvertedAttachmentContentType: given ' +
                                    'attachment content type "' +
                                    newAttachments[fileName].content_type +
                                    `" doesn't satisfy specified regular` +
                                    // IgnoreTypeCheck
                                    ` expression pattern "${pattern}" ` +
                                    `from type "${type}"${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                        let length:number = 0
                        if ('length' in newAttachments[fileName])
                            length = newAttachments[fileName].length
                        else if ('data' in newAttachments[fileName])
                            if (Buffer && 'byteLength' in Buffer)
                                length = Buffer.byteLength(
                                    newAttachments[fileName].data, 'base64')
                            else
                                length = newAttachments.data.length
                        if (
                            ![null, undefined].includes(
                                model[specialNames.attachment][type]
                                    .minimumSize
                            ) &&
                            model[specialNames.attachment][type].minimumSize >
                                length
                        )
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden:
                                    'AttachmentMinimumSize: given attachment' +
                                    ` size ${length} byte doesn't satisfy ` +
                                    'specified minimum  of ' +
                                    model[specialNames.attachment][type]
                                        .minimumSize +
                                    ` byte ${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                        else if (
                            ![null, undefined].includes(
                                model[specialNames.attachment][type]
                                    .maximumSize
                            ) &&
                            model[specialNames.attachment][type].maximumSize <
                                length
                        )
                            /* eslint-disable no-throw-literal */
                            throw {
                                forbidden:
                                    'AttachmentMaximumSize: given attachment' +
                                    ` size ${length} byte doesn't satisfy ` +
                                    'specified maximum of ' +
                                    model[specialNames.attachment][type]
                                        .maximumSize +
                                    ` byte ${pathDescription}.`
                            }
                            /* eslint-enable no-throw-literal */
                        aggregatedSize += length
                    }
                    if (
                        ![null, undefined].includes(
                            model[specialNames.attachment][type]
                                .minimumAggregatedSize
                        ) &&
                        model[specialNames.attachment][type]
                            .minimumAggregatedSize > aggregatedSize
                    )
                        /* eslint-disable no-throw-literal */
                        throw {
                            forbidden:
                                'AttachmentAggregatedMinimumSize: given ' +
                                ' aggregated size of attachments from type "' +
                                `${type}" ${aggregatedSize} byte doesn't ` +
                                'satisfy specified minimum of ' +
                                model[specialNames.attachment][type]
                                    .minimumAggregatedSize +
                                ` byte ${pathDescription}.`
                        }
                        /* eslint-enable no-throw-literal */
                    else if (
                        ![null, undefined].includes(model[
                            specialNames.attachment
                        ][type].maximumAggregatedSize) &&
                        model[specialNames.attachment][type]
                            .maximumAggregatedSize < aggregatedSize
                    )
                        /* eslint-disable no-throw-literal */
                        throw {
                            forbidden:
                                'AttachmentAggregatedMaximumSize: given ' +
                                ' aggregated size of attachments from type "' +
                                `${type}" ${aggregatedSize} byte doesn't ` +
                                'satisfy specified maximum of ' +
                                model[specialNames.attachment][type]
                                    .maximumAggregatedSize +
                                ` byte ${pathDescription}.`
                        }
                        /* eslint-enable no-throw-literal */
                    sumOfAggregatedSizes += aggregatedSize
                }
                if (
                    model.hasOwnProperty(specialNames.minimumAggregatedSize) &&
                    ![null, undefined].includes(model[
                        specialNames.minimumAggregatedSize
                    ]) &&
                    // IgnoreTypeCheck
                    model[specialNames.minimumAggregatedSize] >
                        sumOfAggregatedSizes
                )
                    /* eslint-disable no-throw-literal */
                    throw {
                        forbidden:
                            'AggregatedMinimumSize: given aggregated size ' +
                            `${sumOfAggregatedSizes} byte doesn't satisfy ` +
                            'specified minimum of ' +
                            // IgnoreTypeCheck
                            model[specialNames.minimumAggregatedSize] +
                            ` byte ${pathDescription}.`
                    }
                    /* eslint-enable no-throw-literal */
                else if (
                    model.hasOwnProperty(specialNames.maximumAggregatedSize) &&
                    ![null, undefined].includes(model[
                        specialNames.maximumAggregatedSize
                    ]) &&
                    // IgnoreTypeCheck
                    model[specialNames.maximumAggregatedSize] <
                    sumOfAggregatedSizes
                )
                    /* eslint-disable no-throw-literal */
                    throw {
                        forbidden:
                            'AggregatedMaximumSize: given aggregated size ' +
                            `${sumOfAggregatedSizes} byte doesn't satisfy ` +
                            'specified maximum of ' +
                                // IgnoreTypeCheck
                                model[specialNames.maximumAggregatedSize] +
                            ` byte ${pathDescription}.`
                    }
                    /* eslint-enable no-throw-literal */
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
                for (const name:string in oldDocument)
                    if (
                        oldDocument.hasOwnProperty(name) &&
                        !newDocument.hasOwnProperty(name)
                    )
                        changedPath = parentNames.concat(
                            name, 'migrate removed property')
            return {changedPath, newDocument}
        }
        // endregion
        const result:{
            changedPath:Array<string>;newDocument:PlainObject;
        } = checkDocument(newDocument, oldDocument)
        if (result.newDocument._deleted && !oldDocument || !(
            result.newDocument._deleted && oldDocument &&
            result.newDocument._deleted !== oldDocument._deleted ||
            result.changedPath.length
        ))
            /* eslint-disable no-throw-literal */
            throw {
                forbidden:
                    'NoChange: No new data given. new document: ' +
                    `${serialize(newDocument)}; old document: ` +
                    `${serialize(oldDocument)}.`
            }
            /* eslint-enable no-throw-literal */
        if (securitySettings.hasOwnProperty('checkedDocuments'))
            securitySettings[
                modelConfiguration.property.name.validatedDocumentsCache
            ].add(`${id}-${revision}`)
        else
            securitySettings[
                modelConfiguration.property.name.validatedDocumentsCache
            ] = new Set([`${id}-${revision}`])
        return result.newDocument
    }
}
export default DatabaseHelper
// region vim modline
// vim: set tabstop=4 shiftwidth=4 expandtab:
// vim: foldmethod=marker foldmarker=region,endregion:
// endregion
