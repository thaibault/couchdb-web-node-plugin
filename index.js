// @flow
// #!/usr/bin/env node
// -*- coding: utf-8 -*-
/** @module databaseWebNodePlugin */
'use strict'
/* !
    region header
    [Project page](http://torben.website/databaseWebNodePlugin)

    Copyright Torben Sickert (info["~at~"]torben.website) 16.12.2012

    License
    -------

    This library written by Torben Sickert stand under a creative commons
    naming 3.0 unported license.
    See http://creativecommons.org/licenses/by/3.0/deed.de
    endregion
*/
// region  imports
import {spawn as spawnChildProcess} from 'child_process'
import Tools from 'clientnode'
import type {PlainObject} from 'clientnode'
import PouchDB from 'pouchdb'
// NOTE: Only needed for debugging this file.
try {
    require('source-map-support/register')
} catch (error) {}
import type {Configuration, Services} from 'web-node/type'

import Helper from './helper'
import type {ModelConfiguration, Models} from './type'
// endregion
// region plugins/classes
/**
 * Launches an application server und triggers all some pluginable hooks on
 * an event.
 */
export default class Database {
    /**
     * Application will be closed soon.
     * @param services - An object with stored service instances.
     * @returns Given object of services.
     */
    static exit(services:Services):Services {
        services.database.connection.close()
        return services
    }
    /**
     * Appends an application server to the web node services.
     * @param services - An object with stored service instances.
     * @param configuration - Mutable by plugins extended configuration object.
     * @returns Given and extended object of services.
     */
    static async preLoadService(
        services:Services, configuration:Configuration
    ):Services {
        if (!services.hasOwnProperty('database'))
            services.database = {}
        if (!services.database.hasOwnProperty('serverProcess')) {
            // region start database server
            services.database.serverProcess = spawnChildProcess(
                'pouchdb-server', [
                    '--port', `${configuration.database.port}`,
                    '--dir', configuration.database.path,
                    '--config', configuration.database.configFilePath
                ], {
                    cwd: process.cwd(),
                    env: process.env,
                    shell: true,
                    stdio: 'inherit'
                })
            for (const closeEventName:string of Tools.closeEventNames)
                services.database.serverProcess.on(
                    closeEventName, Tools.getProcessCloseHandler(
                        Tools.noop, Tools.noop, closeEventName))
            await Tools.checkReachability(
                Tools.stringFormat(configuration.database.url, ''), true)
            // endregion
        }
        if (services.database.hasOwnProperty('connection'))
            return services
        // region ensure presence of global admin user
        const unauthenticatedUserDatabaseConnection:PouchDB = new PouchDB(
            `${Tools.stringFormat(configuration.database.url, '')}/_users`)
        try {
            await unauthenticatedUserDatabaseConnection.allDocs()
            console.info(
                'No admin user available. Automatically creating admin user "' +
                `${configuration.database.user.name}".`)
            await fetch(
                `${Tools.stringFormat(configuration.database.url, '')}/` +
                `_config/admins/${configuration.database.user.name}`,
                {
                    method: 'PUT',
                    body: `"${configuration.database.user.password}"`
                })
        } catch (error) {
            if (error.hasOwnProperty('name') && error.name === 'unauthorized') {
                const authenticatedUserDatabaseConnection = new PouchDB(
                    Tools.stringFormat(
                        configuration.database.url,
                        `${configuration.database.user.name}:` +
                        `${configuration.database.user.password}@`
                    ) + '/_users')
                try {
                    await authenticatedUserDatabaseConnection.allDocs()
                } catch (error) {
                    console.error(
                        `Can't login as existing admin user "` +
                        `${configuration.database.user.name}": "` +
                        `${Tools.representObject(error)}".`)
                } finally {
                    authenticatedUserDatabaseConnection.close()
                }
            } else
                console.error(
                    `Can't create new admin user "` +
                    `${configuration.database.user.name}": "` +
                    `${Tools.representObject(error)}".`)
        } finally {
            unauthenticatedUserDatabaseConnection.close()
        }
        // endregion
        // region apply database/rest api configuration
        for (const configurationPath:string in configuration.database)
            if (configuration.database.hasOwnProperty(
                configurationPath
            ) && configurationPath.includes('/'))
                try {
                    await fetch(Tools.stringFormat(
                        configuration.database.url,
                        `${configuration.database.user.name}:` +
                        `${configuration.database.user.password}@`
                    ) + `/_config/${configurationPath}`, {
                        method: 'PUT',
                        body: `"${configuration.database[configurationPath]}"`
                    })
                } catch (error) {
                    console.error(
                        `Configuration "${configurationPath}" couldn't be ` +
                        'applied to "' +
                        `${configuration.database[configurationPath]}": ` +
                        Tools.representObject(error))
                }
        // endregion
        services.database.connection = new PouchDB(Tools.stringFormat(
            configuration.database.url,
            `${configuration.database.user.name}:` +
            `${configuration.database.user.password}@`
        ) + `/${configuration.name}`)
        // region ensure presence of database security settings
        try {
            /*
                NOTE: As a needed side effect: This clears preexisting document
                references in "securitySettings[
                    configuration.modelConfiguration.specialPropertyNames
                        .validatedDocumentsCache]".
            */
            await fetch(Tools.stringFormat(
                configuration.database.url,
                `${configuration.database.user.name}:` +
                `${configuration.database.user.password}@`
            ) + `/${configuration.name}/_security`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(configuration.database.security)
            })
        } catch (error) {
            console.error(
                `Security object couldn't be applied.: ` +
                Tools.representObject(error))
        }
        // endregion
        const modelConfiguration:ModelConfiguration =
            Tools.copyLimitedRecursively(configuration.modelConfiguration)
        delete modelConfiguration.default
        delete modelConfiguration.models
        const models:Models = Helper.extendModels(
            configuration.modelConfiguration)
        // region generate/update authentication/validation code
        let validationCode = Helper.validateDocumentUpdate.toString()
        validationCode = 'function(\n' +
            '    newDocument, oldDocument, userContext, securitySettings\n' +
            ')\n {\n' +
            `const models = ${JSON.stringify(models)}\n` +
            `const modelConfiguration = ` +
            `${JSON.stringify(modelConfiguration)}\n` +
            validationCode.substring(
                validationCode.indexOf('{') + 1,
                validationCode.lastIndexOf('}')
            ).trim().replace(/^ {12}/gm, '') +
            '\n}'
        if (configuration.debug)
            console.info(
                'Specification \n\n"' +
                Tools.representObject(configuration.modelConfiguration) +
                `" has generated validation code: \n\n"${validationCode}".`)
        await Helper.ensureValidationDocumentPresence(
            services.database.connection, 'validation', validationCode,
            'Model specification')
        let authenticationCode = Helper.authenticate.toString()
        authenticationCode = 'function(\n' +
            '    newDocument, oldDocument, userContext, securitySettings\n' +
            ')\n {\n' +
            'const allowedModelRolesMapping = ' +
            JSON.stringify(Helper.determineAllowedModelRolesMapping(
                configuration.modelConfiguration
            )) + '\n' +
            `const typePropertyName = '` +
            `${configuration.modelConfiguration.specialPropertyNames.type}'` +
            `\n` + authenticationCode.substring(
                authenticationCode.indexOf('{') + 1,
                authenticationCode.lastIndexOf('}')
            ).trim().replace(/^ {12}/gm, '') +
            '\n}'
        if (configuration.debug)
            console.info(
                `Authentication code "${authenticationCode}" generated.`)
        await Helper.ensureValidationDocumentPresence(
            services.database.connection, 'authentication', authenticationCode,
            'Authentication logic')
        // endregion
        // region ensure all constraints to have a consistent initial state
        // TODO run migrations scripts if there exists some.
        for (const document:PlainObject of (
            await services.database.connection.allDocs({
                /* eslint-disable camelcase */
                include_docs: true
                /* eslint-enable camelcase */
            })
        ).rows)
            if (!(typeof document.id === 'string' && document.id.startsWith(
                '_design/'
            ))) {
                let newDocument:?PlainObject = null
                const migrationModelConfiguration:ModelConfiguration =
                    Tools.copyLimitedRecursively(modelConfiguration)
                // NOTE: Will remove not specified properties.
                migrationModelConfiguration.updateStrategy = 'migrate'
                try {
                    newDocument = Helper.validateDocumentUpdate(
                        document, null, {}, Tools.copyLimitedRecursively(
                            configuration.database.security
                        ), models, migrationModelConfiguration)
                } catch (error) {
                    throw new Error(
                        `Document "${Tools.representObject(document)}" ` +
                        `doesn't satisfy its schema: ` +
                        Tools.representObject(error))
                }
                /*
                    NOTE: If a property is missing and a default one could be
                    applied we have an auto migration for that case.
                */
                if (newDocument !== document)
                    services.database.connection.put(newDocument)
            }
        // TODO check conflicting constraints and mark if necessary (check how
        // couchdb deals with "id" conflicts)
        // endregion
        return services
    }
}
// endregion
// region vim modline
// vim: set tabstop=4 shiftwidth=4 expandtab:
// vim: foldmethod=marker foldmarker=region,endregion:
// endregion
