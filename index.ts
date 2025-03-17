// #!/usr/bin/env babel-node
// -*- coding: utf-8 -*-
/** @module couchdb-web-node-plugin */
'use strict'
/* !
    region header
    [Project page](https://torben.website/couchdb-web-node-plugin)

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
    copy,
    debounce,
    File,
    format,
    globalContext,
    isDirectory,
    isFile,
    isObject,
    Mapping,
    NOOP,
    PlainObject,
    ProcessCloseReason,
    represent,
    Semaphore,
    timeout,
    UTILITY_SCOPE,
    walkDirectoryRecursively
} from 'clientnode'
import {promises as fileSystem} from 'fs'
import {basename, extname, resolve} from 'path'
import PouchDB from 'pouchdb-node'
import PouchDBFindPlugin from 'pouchdb-find'
import {PluginHandler, PluginPromises} from 'web-node/type'

import databaseHelper, {validateDocumentUpdate} from './databaseHelper'
import {
    bulkDocsFactory,
    determineAllowedModelRolesMapping,
    determineGenericIndexablePropertyNames,
    ensureValidationDocumentPresence,
    extendModels,
    getConnectorOptions,
    initializeConnection,
    mayStripRepresentation
} from './helper'
import {restart, start, stop} from './server'
import {
    ChangesResponseChange,
    ChangesStream,
    Connection,
    Constraint,
    DatabaseError,
    DeleteIndexOptions,
    Document,
    FullDocument,
    Index,
    Migrator,
    Models,
    PropertySpecification,
    Runner,
    Services,
    ServicesState,
    State
} from './type'
// endregion
/**
 * Launches an application server und triggers all some pluginable hooks on
 * an event.
 */
/**
 * Appends an application server to the web node services.
 * @param state - Application state.
 * @param state.configuration - Applications configuration.
 * @param state.configuration.couchdb - Plugins configuration.
 * @param state.services - Applications services.
 * @returns Promise resolving to nothing.
 */
export const preLoadService = async ({
    configuration: {couchdb: configuration}, services
}: ServicesState): Promise<void> => {
    if (!Object.prototype.hasOwnProperty.call(services, 'couchdb'))
        services.couchdb = {} as Services['couchdb']
    const {couchdb} = services

    if (!Object.prototype.hasOwnProperty.call(couchdb, 'connector')) {
        couchdb.connector = PouchDB
        // region
        /**
         * Retry conflicting document updates which where marked with revision
         * "upsert" as long as they go through.
         */
        couchdb.connector.plugin({
            bulkDocs: bulkDocsFactory(
                couchdb.connector.prototype.bulkDocs as Connection['bulkDocs'],
                configuration
            )
        })
        // endregion
        if (configuration.debug)
            couchdb.connector.debug.enable('*')

        couchdb.connector = couchdb.connector.plugin(PouchDBFindPlugin)
    }

    if (!Object.prototype.hasOwnProperty.call(couchdb, 'server')) {
        couchdb.server = {} as Services['couchdb']['server']
        // region search for binary file to start database server
        const triedPaths: Array<string> = []
        for (const runner of ([] as Array<Runner>).concat(
            configuration.binary.runner
        )) {
            for (const directoryPath of (
                ([] as Array<string>).concat(runner.location)
            )) {
                for (const name of (
                    ([] as Array<string>).concat(runner.name)
                )) {
                    const binaryFilePath: string =
                        resolve(directoryPath, name)
                    triedPaths.push(binaryFilePath)

                    if (await isFile(binaryFilePath)) {
                        runner.binaryFilePath = binaryFilePath
                        couchdb.server.runner = runner

                        break
                    }
                }

                if (Object.prototype.hasOwnProperty.call(
                    couchdb.server, 'runner'
                ))
                    break
            }

            if (Object.prototype.hasOwnProperty.call(
                couchdb.server, 'runner'
            ))
                break
        }

        if (!Object.prototype.hasOwnProperty.call(couchdb.server, 'runner'))
            throw new Error(
                'No binary file in one of the following locations found:' +
                ` "${triedPaths.join('", "')}".`
            )
        // endregion
    }

    const modelConfiguration = copy(configuration.model)
    delete (modelConfiguration.property as
        {defaultSpecification?: PropertySpecification}
    ).defaultSpecification
    delete (modelConfiguration as {entities?: Models}).entities
    const models = extendModels(configuration.model)

    couchdb.validateDocument = (
        document: FullDocument,
        options: {
            checkPublicModelType?: boolean
            type?: string
            oldDocument?: FullDocument
        }
    ): Error | true => {
        const oldDocument = copy(options.oldDocument ?? document)
        const checkPublicModelType = Boolean(options.checkPublicModelType)
        document = copy(document)

        document[configuration.model.property.name.special.strategy] =
            'migrate'

        if (options.type)
            document[modelConfiguration.property.name.special.type] =
                oldDocument[modelConfiguration.property.name.special.type] =
                options.type

        try {
            validateDocumentUpdate(
                /*
                    NOTE: Removed property marked with "null" will be removed
                    so final removing would be skipped if we do not use a copy
                    here.
                */
                document,
                /*
                    NOTE: During processing attachments sub object will be
                    manipulated so copying is needed to copy to avoid
                    unexpected behavior in this context.
                */
                oldDocument,
                {
                    db: configuration.databaseName,
                    name: configuration.admin.name,
                    roles: ['_admin']
                },
                // NOTE: We need a copy to ignore validated document caches.s
                copy(configuration.security[configuration.databaseName]),
                modelConfiguration,
                models,
                checkPublicModelType
            )
            return true
        } catch (error) {
            if (
                Object.prototype.hasOwnProperty.call(error, 'forbidden') &&
                (error as {forbidden: string}).forbidden.startsWith(
                    'NoChange:'
                )
            )
                return true

            return error as Error
        }
    }
}
/**
 * Start database's child process and return a Promise which observes this
 * service.
 * @param state - Application state.
 * @param state.configuration - Applications configuration.
 * @param state.services - Applications services.
 * @returns A mapping to promises which correspond to the plugin specific
 * continues services.
 */
export const loadService = async (
    {configuration, services}: State
): Promise<PluginPromises> => {
    if (!globalContext.fetch)
        throw new Error('Missing fetch implementation.')

    let promise: null | Promise<ProcessCloseReason> = null
    const {couchdb} = services

    if (Object.prototype.hasOwnProperty.call(couchdb.server, 'runner')) {
        await start(services, configuration)

        couchdb.server.restart = restart
        couchdb.server.start = start
        couchdb.server.stop = stop

        promise = new Promise<ProcessCloseReason>((
            resolve: (value: ProcessCloseReason) => void,
            reject: (reason: ProcessCloseReason) => void
        ): void => {
            // NOTE: These callbacks can be reassigned during server restart.
            couchdb.server.resolve = resolve
            couchdb.server.reject = reject
        })
    }

    if (Object.prototype.hasOwnProperty.call(couchdb, 'connection'))
        return {couchdb: promise}

    const urlPrefix = format(configuration.couchdb.url, '')
    const authorizationHeader = {
        Authorization:
            'Basic ' +
            Buffer.from(
                `${configuration.couchdb.admin.name}:` +
                configuration.couchdb.admin.password,
                'binary'
            ).toString('base64')
    }
    const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json'
    }
    // region ensure presence of global admin user
    if (configuration.couchdb.ensureAdminPresence) {
        const unauthenticatedUserDatabaseConnection: Connection =
            new couchdb.connector(
                `${urlPrefix}/_users`, getConnectorOptions(configuration)
            )

        try {
            // NOTE: We check if we are in admin party mode.
            await unauthenticatedUserDatabaseConnection.allDocs()

            console.info(
                'No admin user available. Automatically creating admin user ' +
                `"${configuration.couchdb.admin.name}".`
            )

            await globalContext.fetch(
                `${urlPrefix}/` +
                `${couchdb.server.runner.adminUserConfigurationPath}/` +
                configuration.couchdb.admin.name,
                {
                    body: `"${configuration.couchdb.admin.password}"`,
                    method: 'PUT'
                }
            )
        } catch (error) {
            if ((error as DatabaseError).name === 'unauthorized') {
                const authenticatedUserDatabaseConnection: Connection =
                    new couchdb.connector(
                        `${urlPrefix}/_users`,
                        {
                            ...getConnectorOptions(configuration),
                            auth: {
                                username: configuration.couchdb.admin.name,
                                password: configuration.couchdb.admin.password
                            }
                        }
                    )

                try {
                    await authenticatedUserDatabaseConnection.allDocs()
                } catch (error) {
                    console.error(
                        `Can't login as existing admin user ` +
                        `"${configuration.couchdb.admin.name}": ` +
                        represent(error)
                    )
                } finally {
                    void authenticatedUserDatabaseConnection.close()
                }
            } else
                console.error(
                    `Can't create new admin user "` +
                    `${configuration.couchdb.admin.name}": ${represent(error)}`
                )
        } finally {
            void unauthenticatedUserDatabaseConnection.close()
        }
    }
    // endregion
    // region ensure presence of regular users
    if (configuration.couchdb.ensureUserPresence) {
        const userDatabaseConnection: Connection =
            new couchdb.connector(
                `${urlPrefix}/_users`,
                {
                    ...getConnectorOptions(configuration),
                    auth: {
                        username: configuration.couchdb.admin.name,
                        password: configuration.couchdb.admin.password
                    }
                }
            )

        for (const [name, userConfiguration] of Object.entries(
            configuration.couchdb.users
        ))
            try {
                await userDatabaseConnection.get(`org.couchdb.user:${name}`)
            } catch (error) {
                if ((error as { error: string }).error === 'not_found') {
                    console.info(`Create missing database user "${name}".`)

                    try {
                        await userDatabaseConnection.put({
                            [
                            configuration.couchdb.model.property.name
                                .special.id
                            ]: `org.couchdb.user:${name}`,
                            name,
                            password: userConfiguration.password,
                            roles: userConfiguration.roles,
                            type: 'user'
                        })
                    } catch (error) {
                        throw new Error(
                            `Couldn't create missing user "${name}":` +
                            ` ${represent(error)}`
                        )
                    }
                } else
                    throw new Error(
                        `Couldn't check for presence of user ` +
                        `"${name}": ${represent(error)}`
                    )
            } finally {
                void userDatabaseConnection.close()
            }
    }
    // endregion
    // region apply database/rest api configuration
    if (configuration.couchdb.model.updateConfiguration)
        for (const prefix of configuration.couchdb.backend.prefixes)
            for (
                const subPath in configuration.couchdb.backend.configuration
            )
                if (Object.prototype.hasOwnProperty.call(
                    configuration.couchdb.backend.configuration, subPath
                )) {
                    const fullPath =
                        `/${prefix}${prefix.trim() ? '/' : ''}${subPath}`
                    const url = `${urlPrefix}${fullPath}`

                    const value: unknown =
                        configuration.couchdb.backend.configuration[subPath]

                    let response: Response | undefined
                    try {
                        response = await globalContext.fetch(
                            url, {headers: authorizationHeader}
                        )
                    } catch (error) {
                        console.warn(
                            `Configuration "${fullPath}" (with desired ` +
                            `value [${represent(value)}]) couldn't be ` +
                            `determined: ${represent(error)}`
                        )
                    }

                    if (response)
                        if (response.ok) {
                            let changeNeeded = true
                            if (typeof response.text === 'function')
                                try {
                                    changeNeeded = (
                                        value === await response[
                                            typeof value === 'string' ?
                                                'text' :
                                                'json'
                                        ]()
                                    )
                                } catch (error) {
                                    console.warn(
                                        'Error checking curent value of ' +
                                        `"${fullPath}" to be ` +
                                        `[${represent(value)}]: ` +
                                        represent(error)
                                    )
                                }

                            if (changeNeeded)
                                try {
                                    await globalContext.fetch(
                                        url,
                                        {
                                            body:
                                                '"' +
                                                (configuration.couchdb
                                                    .backend.configuration[
                                                        subPath
                                                    ] as string
                                                ) +
                                                '"',
                                            method: 'PUT'
                                        }
                                    )
                                } catch (error) {
                                    console.error(
                                        `Configuration "${fullPath}" ` +
                                        `couldn't be applied to ` +
                                        `[${represent(value)}]: ` +
                                        represent(error)
                                    )
                                }
                            else
                                console.info(
                                    `Configuration "${fullPath}" is ` +
                                    'already set to desired value ' +
                                    `[${represent(value)}].`
                                )
                        } else
                            console.info(
                                `Configuration "${fullPath}" does not ` +
                                `exist (desired value ` +
                                `[${represent(value)}]). Response code is ` +
                                `${String(response.status)}.`
                            )
                }
    // endregion
    await initializeConnection(services, configuration)

    // region ensure presence of database security settings
    if (configuration.couchdb.ensureSecuritySettingsPresence) {
        const securityConfigurations = configuration.couchdb.security
        for (const [databaseName, securityObject] of Object.entries(
            securityConfigurations
        )) {
            if (databaseName === '_default')
                continue

            const fullSecurityObject = securityObject
            if (databaseName !== '_users') {
                if (!fullSecurityObject.admins)
                    fullSecurityObject.admins = {names: [], roles: []}

                if (securityConfigurations._default.admins) {
                    if (securityConfigurations._default.admins.names)
                        fullSecurityObject.admins.names =
                            securityConfigurations._default.admins.names.concat(
                                fullSecurityObject.admins.names ?? []
                            )
                    if (securityConfigurations._default.admins.roles)
                        fullSecurityObject.admins.roles =
                            securityConfigurations._default.admins.roles.concat(
                                fullSecurityObject.admins.roles ?? []
                            )
                }

                if (!fullSecurityObject.members)
                    fullSecurityObject.members = {names: [], roles: []}

                if (securityConfigurations._default.members) {
                    if (securityConfigurations._default.members.names)
                        fullSecurityObject.members.names =
                            securityConfigurations._default.members.names
                                .concat(fullSecurityObject.members.names ?? [])
                    if (securityConfigurations._default.members.roles)
                        fullSecurityObject.members.roles =
                            securityConfigurations._default.members.roles
                                .concat(fullSecurityObject.members.roles ?? [])
                }
            }

            console.info(
                `Apply security settings for database "${databaseName}":`,
                represent(fullSecurityObject)
            )

            try {
                /*
                    NOTE: As a needed side effect:
                    This clears preexisting document references in

                    "securitySettings[
                        configuration.couchdb.model.property.name
                            .validatedDocumentsCache
                    ]".
                */
                const response = await globalContext.fetch(
                    `${urlPrefix}/${databaseName}/_security`,
                    {
                        body: JSON.stringify(fullSecurityObject),
                        headers: {...headers, ...authorizationHeader},
                        method: 'PUT'
                    }
                )

                if (!response.ok)
                    throw new Error(response.statusText)
            } catch (error) {
                console.error(
                    `Security object for database "${databaseName}" couldn't` +
                    ` be applied:`,
                    represent(error)
                )
            }
        }
    }
    // endregion
    const modelConfiguration = copy(configuration.couchdb.model)

    delete (modelConfiguration.property as
        {defaultSpecification?: PropertySpecification}
    ).defaultSpecification
    delete (modelConfiguration as {entities?: Models}).entities

    const specialNames = modelConfiguration.property.name.special
    const {id: idName, revision: revisionName, type: typeName} =
        specialNames

    const models = extendModels(configuration.couchdb.model)
    if (configuration.couchdb.model.updateValidation) {
        // NOTE: We import pre-transpiled javascript code here.
        const databaseHelperCode: string = await fileSystem.readFile(
            eval(`require.resolve('./databaseHelper')`) as string,
            {encoding: configuration.core.encoding, flag: 'r'}
        )
        // region generate/update authentication/validation code
        for (const type of [
            {
                description: 'Model specification',
                methodName: 'validateDocumentUpdate',
                name: 'validation',
                serializedParameter:
                    `${JSON.stringify(modelConfiguration)}, ` +
                    JSON.stringify(models)
            },
            {
                description: 'Authorisation',
                methodName: 'authenticate',
                name: 'authentication',
                serializedParameter:
                    JSON.stringify(determineAllowedModelRolesMapping(
                        configuration.couchdb.model
                    )) +
                    `, '${idName}', '${typeName}', '` +
                    specialNames.designDocumentNamePrefix +
                    `'`
            }
        ] as const) {
            /*
                NOTE: This code should be widely supported since no transpiler
                can interact here easily.
            */
            const code: string = 'function(...parameters) {\n' +
                `    return require('helper').${type.methodName}` +
                    `(...parameters.concat([${type.serializedParameter}]` +
                    '))\n' +
                '}'

            try {
                /* eslint-disable @typescript-eslint/no-implied-eval */
                new Function(`return ${code}`)
                /* eslint-enable @typescript-eslint/no-implied-eval */
            } catch (error) {
                throw new Error(
                    `Generated ${type.name} code "${code}" doesn't compile:` +
                    ` ${represent(error)}`
                )
            }

            if (configuration.core.debug)
                console.debug(`${type.name} code: \n\n"${code}" integrated.`)

            await ensureValidationDocumentPresence(
                couchdb.connection,
                type.name,
                {
                    helper: databaseHelperCode,
                    // eslint-disable-next-line camelcase
                    validate_doc_update: code
                },
                type.description,
                true,
                idName,
                revisionName,
                specialNames.designDocumentNamePrefix
            )
        }
        // endregion
        // region check if all constraint descriptions compile
        for (const [modelName, model] of Object.entries(models))
            for (const [name, specification] of Object.entries(model))
                if (([
                    specialNames.constraint.execution,
                    specialNames.constraint.expression
                ] as Array<string>).includes(name)) {
                    for (const constraint of (
                        [] as Array<Constraint>
                    ).concat(specification as unknown as Array<Constraint>))
                        if (constraint.description)
                            /*
                                eslint-disable
                                @typescript-eslint/no-implied-eval
                            */
                            try {
                                new Function(
                                    `return ${constraint.description}`
                                )
                            } catch (error) {
                                throw new Error(
                                    `Specified constraint description "` +
                                    `${constraint.description}" for model ` +
                                    `"${modelName}" doesn't compile: ` +
                                    represent(error)
                                )
                            }
                            /*
                                eslint-enable
                                @typescript-eslint/no-implied-eval
                            */
                } else
                    for (const type of [
                        'conflictingConstraintExpression',
                        'conflictingConstraintExecution',
                        'constraintExpression',
                        'constraintExecution'
                    ] as const)
                        if (isObject(specification)) {
                            const constraint:(Constraint | null | undefined) =
                                (specification as PropertySpecification)[
                                    type
                                ]

                            /*
                                eslint-disable
                                @typescript-eslint/no-implied-eval
                            */
                            if (constraint?.description)
                                try {
                                    new Function(constraint.description)
                                } catch (error) {
                                    throw new Error(
                                        'Specified constraint ' +
                                        'description "' +
                                        constraint.description +
                                        `" for model "${modelName}" in ` +
                                        `property "${name}" as "${type}"` +
                                        ' doesn\'t compile: ' +
                                        represent(error)
                                    )
                                }
                            /*
                                eslint-enable
                                @typescript-eslint/no-implied-eval
                            */
                        }
        // endregion
    }
    // region run auto-migration
    if (configuration.couchdb.model.autoMigrationPath) {
        const migrators: Mapping<Migrator> = {}
        if (await isDirectory(resolve(
            configuration.couchdb.model.autoMigrationPath
        )))
            for (const file of await walkDirectoryRecursively(
                resolve(configuration.couchdb.model.autoMigrationPath),
                configuration.couchdb.debug ?
                    NOOP :
                    (file: File) =>
                        !['debug', 'deprecated'].includes(file.name)
            )) {
                const extension = extname(file.name)
                const name = basename(file.name, extension)

                if (extension === '.json') {
                    let documents: Array<Document>
                    try {
                        documents = ([] as Array<Document>).concat(
                            JSON.parse(await fileSystem.readFile(
                                file.path,
                                {
                                    encoding: configuration.core.encoding,
                                    flag: 'r'
                                }
                            )) as Document
                        )
                    } catch (error) {
                        throw new Error(
                            `Parsing document "${file.path}" to include ` +
                            'by automigration of has failed: ' +
                            represent(error)
                        )
                    }

                    if (documents.length === 1) {
                        if (!documents[0][idName])
                            documents[0][idName] = name
                        if (!documents[0][revisionName])
                            documents[0][revisionName] = '0-upsert'
                    }

                    for (const document of documents) {
                        try {
                            await couchdb.connection.put(document)
                        } catch (error) {
                            if ((
                                error as {forbidden?: string}
                            ).forbidden?.startsWith('NoChange:'))
                                console.info(
                                    `Including document "${document[idName]}"`,
                                    'of type',
                                    `"${document[typeName] as string}" hasn't`,
                                    'changed existing document.'
                                )
                            throw new Error(
                                `Migrating document ` +
                                `"${document[idName]}" of type ` +
                                `"${document[typeName] as string}" has ` +
                                `failed: ${represent(error)}`
                            )
                        }

                        console.info(
                            `Including document "${document[idName]}" of`,
                            `type "${document[typeName] as string}" was`,
                            'successful.'
                        )
                    }
                } else if (['.js'].includes(extname(file.name)))
                    // region collect script migrators
                    migrators[file.path] = (
                        eval(`require('${file.path}')`) as
                            {default: Migrator}
                    ).default
                    // endregion
                else if (['.mjs'].includes(extname(file.name)))
                    // region collect module migrators
                    migrators[file.path] = (
                        (await eval(`import('${file.path}')`)) as
                            {default: Migrator}
                    ).default
                    // endregion
            }
        // region ensure all constraints to have a consistent initial state
        for (const retrievedDocument of (
            await couchdb.connection.allDocs<PlainObject>({
                // eslint-disable-next-line camelcase
                include_docs: true
            })
        ).rows)
            if (!(
                typeof retrievedDocument.id === 'string' &&
                retrievedDocument.id.startsWith(
                    configuration.couchdb.model.property.name.special
                        .designDocumentNamePrefix
                )
            )) {
                const document = retrievedDocument.doc as FullDocument
                let newDocument: FullDocument = copy(document)
                newDocument[
                    configuration.couchdb.model.property.name.special.strategy
                ] = 'migrate'

                for (const name of Object.keys(migrators).sort()) {
                    let result: Document | null = null
                    try {
                        result = migrators[name](
                            newDocument as Document,
                            {
                                ...UTILITY_SCOPE,

                                configuration,

                                databaseHelper,

                                idName,
                                typeName,

                                migrators,
                                models,
                                modelConfiguration,

                                selfFilePath: name,

                                services
                            }
                        )
                    } catch (error) {
                        throw new Error(
                            `Running migrater "${name}" in document ` +
                            mayStripRepresentation(
                                document,
                                configuration.couchdb
                                    .maximumRepresentationTryLength,
                                configuration.couchdb
                                    .maximumRepresentationLength
                            ) +
                            `" failed: ${represent(error)}`
                        )
                    }

                    if (result) {
                        newDocument = result as FullDocument

                        console.info(
                            `Running migrater "${name}" for document`,
                            `"${newDocument[idName]}" (of type`,
                            `"${newDocument[typeName]}") was successful.`
                        )
                    }
                }
                /*
                    Auto migration can:

                    - Remove not specified old properties.
                    - Add properties whose are missing and a default value is
                      specified.
                    - Trim existing strings if newly specified.
                    - Remove property values if there values equals to an empty
                      instance and the "emptyEqualsNull" property is specified
                      as positive.
                    - Rename custom type properties if new specified model
                      provided is a super set of existing properties.
                    - TODO: Renames property names if "oldPropertyName" is
                      provided in model specification.
                */
                const result = couchdb.validateDocument(
                    newDocument,
                    {checkPublicModelType: true, oldDocument: document}
                )
                if (result !== true)
                    if (Object.prototype.hasOwnProperty.call(
                        result, 'forbidden'
                    ))
                        console.warn(
                            `Document "` +
                            mayStripRepresentation(
                                document,
                                configuration.couchdb
                                    .maximumRepresentationTryLength,
                                configuration.couchdb
                                    .maximumRepresentationLength
                            ) +
                            `" doesn't satisfy its schema (and can not be`,
                            `migrated automatically): ${represent(result)}`
                        )
                    else
                        throw result

                try {
                    await couchdb.connection.put(newDocument)
                } catch (error) {
                    throw new Error(
                        `Replacing auto migrated document ` +
                        `"${newDocument[idName]}" has failed: ` +
                        represent(error)
                    )
                }

                console.info(
                    `Auto migrating document "${newDocument[idName]}" was`,
                    'successful.'
                )
            }
        // endregion
    }
    // endregion
    // region create/remove needed/unneeded generic indexes
    const genericIndexes: Array<Index> = (
        await couchdb.connection.getIndexes()
    ).indexes
        .filter((index) => index.name.endsWith('-GenericIndex'))

    if (
        configuration.couchdb.createGenericFlatIndex &&
        (
            configuration.couchdb.model.autoMigrationPath ||
            genericIndexes.length === 0
        )
    ) {
        for (const [modelName, model] of Object.entries(models))
            if ((new RegExp(
                configuration.couchdb.model.property.name.typePattern.public
            )).test(modelName)) {
                await couchdb.connection.createIndex({index: {
                    ddoc: `${modelName}-GenericIndex`,
                    fields: [typeName],
                    name: `${modelName}-GenericIndex`
                }})

                for (
                    const propertyName of
                    determineGenericIndexablePropertyNames(
                        configuration.couchdb.model, model
                    )
                ) {
                    const name = `${modelName}-${propertyName}-GenericIndex`
                    let foundPosition = -1
                    let position = 0

                    for (const index of genericIndexes) {
                        if (index.name === name) {
                            foundPosition = position

                            break
                        }

                        position += 1
                    }

                    if (foundPosition === -1)
                        await couchdb.connection.createIndex({
                            index: {
                                ddoc: name,
                                fields: [typeName, propertyName],
                                name
                            }
                        })
                    else
                        genericIndexes.slice(position, 1)
                }
            }

        for (const index of genericIndexes) {
            let exists = false
            for (const [modelName, model] of Object.entries(models))
                if (index.name.startsWith(`${modelName}-`)) {
                    for (
                        const name of
                        determineGenericIndexablePropertyNames(
                            configuration.couchdb.model, model
                        )
                    )
                        if ([
                            `${modelName}-${name}-GenericIndex`,
                            `${modelName}-GenericIndex`
                        ].includes(index.name))
                            exists = true

                    break
                }

            if (!exists)
                await couchdb.connection.deleteIndex(
                    index as DeleteIndexOptions
                )
        }
    }
    // endregion
    // TODO check conflicting constraints and mark them if necessary (check
    // how couchdb deals with "id" conflicts)
    // region initial compaction
    if (configuration.couchdb.model.triggerInitialCompaction)
        try {
            await couchdb.connection.compact()
        } catch (error) {
            console.warn(
                `Initial database compaction has failed: ${represent(error)}`
            )
        }
    // endregion
    return {couchdb: promise}
}
/**
 * Add database event listener to auto restart database server on unexpected
 * server issues.
 * @param state - Application state.
 * @returns Promise resolving to nothing.
 */
export const postLoadService = (state: State): Promise<void> => {
    const {configuration: {couchdb: configuration}, pluginAPI, services} =
        state
    const {couchdb} = services
    // region register database changes stream
    /*
        Maximum time one request could take + number of retries plus there
        waiting times.
    */
    let numberOfErrorsThrough = 0
    let periodToClearNumberOfErrorsInSeconds =
        configuration.changesStreamReinitializer.retries *
        31
    for (
        let count = 0;
        count <= configuration.changesStreamReinitializer.retries;
        count += 1
    )
        periodToClearNumberOfErrorsInSeconds += Math.min(
            configuration.changesStreamReinitializer
                .retryWaitingFactorInSeconds **
            count,
            configuration.changesStreamReinitializer
                .maxmumRetryWaitingTimeInSeconds
        )

    setInterval(
        () => {
            if (numberOfErrorsThrough > 0) {
                console.info(
                    'No additional errors (initially got',
                    `${String(numberOfErrorsThrough)} errors through)`,
                    'occurred during observing changes stream for',
                    String(periodToClearNumberOfErrorsInSeconds),
                    'seconds. Clearing saved number of errors through.'
                )
                numberOfErrorsThrough = 0
            }
        },
        periodToClearNumberOfErrorsInSeconds * 1000
    )
    /*
        NOTE: Use this code to test changes stream reinitialisation and
        database server restarts. Play with length of interval to trigger error
        events.
    */
    /*
    setInterval(
        () => {
            couchdb.changesStream.emit('error', {test: 2})
        },
        6 * 1000
    )
    */
    const initialize = debounce(async (): Promise<void> => {
        if (couchdb.changesStream as unknown as boolean)
            couchdb.changesStream.cancel()

        const changesConfiguration = configuration.changesStream
        if (couchdb.lastChangesSequenceIdentifier !== undefined)
            changesConfiguration.since = couchdb.lastChangesSequenceIdentifier

        console.info(
            'Initialize changes stream since',
            `"${String(changesConfiguration.since)}".`
        )

        couchdb.changesStream =
            couchdb.connection.changes(changesConfiguration)

        void couchdb.changesStream.on(
            'error',
            async (error: DatabaseError): Promise<void> => {
                numberOfErrorsThrough += 1
                if (
                    numberOfErrorsThrough >
                    configuration.changesStreamReinitializer.retries
                ) {
                    console.warn(
                        'Observing changes feed throws an error for',
                        `${String(numberOfErrorsThrough)} times through:`,
                        `${represent(error)} Restarting database server and`,
                        'reinitialize changes stream...'
                    )

                    numberOfErrorsThrough = 0
                    couchdb.changesStream.cancel()

                    await couchdb.server.restart(state)
                } else {
                    const waitingTimeInSeconds =
                        Math.min(
                            configuration.changesStreamReinitializer
                                .retryWaitingFactorInSeconds **
                            numberOfErrorsThrough,
                            configuration.changesStreamReinitializer
                                .maxmumRetryWaitingTimeInSeconds
                        )

                    console.warn(
                        'Observing changes feed throws an error for',
                        `${String(numberOfErrorsThrough)} of`,
                        String(
                            configuration.changesStreamReinitializer.retries
                        ),
                        `allowed times through: ${represent(error)}`,
                        'Reinitializing changes stream in',
                        `${String(waitingTimeInSeconds)} seconds...`
                    )

                    await timeout(1000 * waitingTimeInSeconds)
                }

                void initialize()
            }
        )

        await pluginAPI.callStack<State<ChangesStream>>({
            ...state,
            data: couchdb.changesStream,
            hook: 'couchdbInitializeChangesStream'
        })

        console.info('Changes stream initialized.')

        const semaphore = new Semaphore(
            configuration.numberOfParallelChangesRunner
        )
        void couchdb.changesStream.on(
            'change',
            async (changes: ChangesResponseChange) => {
                numberOfErrorsThrough = 0

                try {
                    await semaphore.acquire()
                    await pluginAPI.callStack<State<ChangesResponseChange>>({
                        ...state, data: changes, hook: 'couchdbChange'
                    })
                    couchdb.lastChangesSequenceIdentifier = changes.seq
                } catch (error) {
                    console.error(
                        'An error occurred during on change database hook:',
                        error
                    )
                } finally {
                    semaphore.release()
                }
            }
        )
    })

    if (configuration.attachAutoRestarter)
        void initialize()
    // endregion
    return Promise.resolve()
}
/**
 * Triggered when application will be closed soon.
 * @param state - Application state.
 * @param state.configuration - Applications configuration.
 * @param state.services - Applications services.
 * @returns Promise resolving to nothing.
 */
export const shouldExit = async (
    {configuration, services}: State
): Promise<void> => {
    await stop(services, configuration)

    delete (services as {couchdb?: Services['couchdb']}).couchdb

    const logFilePath = 'log.txt'
    if (await isFile(logFilePath))
        await fileSystem.unlink(logFilePath)
}

export const database = module.exports satisfies PluginHandler
export default database
