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
import Tools from 'clientnode'
import type {PlainObject} from 'clientnode'
// NOTE: Remove when "fetch" is supported by node.
import fetch from 'node-fetch'
// NOTE: Only needed for debugging this file.
try {
    require('source-map-support/register')
} catch (error) {}

import type {
    AllowedModelRolesMapping, Model, ModelConfiguration, Models
} from './type'
// endregion
// NOTE: Remove when "fetch" is supported by node.
global.fetch = fetch
// region methods
/**
 * A dumm plugin interface with all available hooks.
 */
export default class Helper {
    /**
     * Updates/creates a design document in database with a validation function
     * set to given code.
     * @param databaseConnection - Database connection to use for document
     * updates.
     * @param documentName - Design document name.
     * @param documentData - Design document data.
     * @param description - Used to produce semantic logging messages.
     * @param libraries - Mapping of library names to their code as string.
     * @param log - Enables logging.
     * @returns Promise which will be resolved after given document has updated
     * successfully.
     */
    static async ensureValidationDocumentPresence(
        databaseConnection:Object, documentName:string,
        documentData:PlainObject, description:string,
        libraries:?{[key:string]:string} = null, log:boolean = true
    ):Promise<void> {
        const newDocument:{[key:string]:string} = Tools.extendObject({
            _id: `_design/${documentName}`, language: 'javascript'
        }, documentData)
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
                        `${description} not available: create new one.`)
                else
                    console.info(
                        `${description} couldn't be updated: "` +
                        `${Tools.representObject(error)}" create new one.`)
            try {
                await databaseConnection.put(newDocument)
                if (log)
                    console.info(`${description} installed/updated.`)
            } catch (error) {
                throw new Error(
                    `${description} couldn't be installed/updated: "` +
                    `${Tools.representObject(error)}".`)
            }
        }
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
        for (const modelName:string in models)
            if (models.hasOwnProperty(modelName) && models[
                modelName
            ].hasOwnProperty(allowedRoleName))
                if (Array.isArray(models[modelName][allowedRoleName]))
                    allowedModelRolesMapping[modelName] = {
                        read: models[modelName][allowedRoleName],
                        write: models[modelName][allowedRoleName]
                    }
                else if (typeof models[modelName][
                    allowedRoleName
                ] === 'object') {
                    allowedModelRolesMapping[modelName] = {read: [], write: []}
                    for (const type:string in allowedModelRolesMapping[
                        modelName
                    ])
                        if (allowedModelRolesMapping[modelName].hasOwnProperty(
                            type
                        ) && Array.isArray(models[modelName][allowedRoleName][
                            type
                        ]))
                            allowedModelRolesMapping[modelName][type] = models[
                                modelName
                            ][allowedRoleName][type]
                        else
                            allowedModelRolesMapping[modelName][type] = [
                                models[modelName][allowedRoleName][type]]
                } else
                    allowedModelRolesMapping[modelName] = {
                        read: [models[modelName][allowedRoleName]],
                        write: [models[modelName][allowedRoleName]]
                    }
        return allowedModelRolesMapping
    }
    // TODO test
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
        return Object.keys(model).filter((name:string):boolean => !(
            name.startsWith('_') ||
            modelConfiguration.property.name.reserved.concat(
                specialNames.deleted,
                specialNames.id,
                specialNames.revision,
                specialNames.type
            ).includes(name) ||
            model[name].type && model[name].type.endsWith('[]') ||
            modelConfiguration.entities.hasOwnProperty(model[name].type)
        )).concat(specialNames.id, specialNames.revision)
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
                // IgnoreTypeCheck
                models[modelName][extendPropertyName] = ['_base'].concat(
                    models[modelName][extendPropertyName])
            else
                // IgnoreTypeCheck
                models[modelName][extendPropertyName] = '_base'
        if (models[modelName].hasOwnProperty(extendPropertyName)) {
            // IgnoreTypeCheck
            for (const modelNameToExtend:string of [].concat(models[
                modelName
            ][extendPropertyName]))
                models[modelName] = Tools.extendObject(
                    true, {}, Helper.extendModel(
                        modelNameToExtend, models, extendPropertyName
                    ), models[modelName])
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
        const specialNames:PlainObject = modelConfiguration.property.name
            .special
        const models:Models = {}
        for (const modelName:string in modelConfiguration.entities)
            if (modelConfiguration.entities.hasOwnProperty(
                modelName
            )) {
                if (!((new RegExp(modelConfiguration.property.name
                    .typeRegularExpressionPattern.public
                )).test(modelName) || (new RegExp(
                    modelConfiguration.property.name
                        .typeRegularExpressionPattern.private
                )).test(modelName)))
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
        for (const modelName:string in models)
            if (models.hasOwnProperty(modelName))
                for (const propertyName:string in models[modelName])
                    if (models[modelName].hasOwnProperty(propertyName))
                        if (propertyName === specialNames.attachment) {
                            for (const type:string in models[modelName][
                                propertyName
                            ])
                                if (models[modelName][
                                    propertyName
                                ].hasOwnProperty(type))
                                    models[modelName][propertyName][
                                        type
                                    ] = Tools.extendObject(
                                        true, Tools.copyLimitedRecursively(
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
                            specialNames.minimumAggregatedSize
                        ].includes(propertyName))
                            models[modelName][
                                propertyName
                            ] = Tools.extendObject(
                                true, Tools.copyLimitedRecursively(
                                    modelConfiguration.property
                                        .defaultSpecification,
                                ), models[modelName][propertyName])
        return models
    }
    // endregion
}
// endregion
// region vim modline
// vim: set tabstop=4 shiftwidth=4 expandtab:
// vim: foldmethod=marker foldmarker=region,endregion:
// endregion
