// #!/usr/bin/env babel-node
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
import {copy, Mapping} from 'clientnode'
import PouchDB from 'pouchdb-core'
import PouchDBHTTPAdapter from 'pouchdb-adapter-http'
import PouchDBAuthenticationPlugin from 'pouchdb-authentication'
import PouchDBFindPlugin from 'pouchdb-find'
import {pluginAPI} from 'web-node'
import webNodePackageConfiguration from 'web-node/package.json'

import {describe, expect, jest, test} from '@jest/globals'

import {getConnectorOptions, getEffectiveURL, waitWithTimeout} from '../helper'
import {
    loadService, postLoadService, preLoadService, shouldExit
} from '../index'
import expressUtilities from '../loadExpress'
import packageConfiguration from '../package.json'
import {
    Configuration,
    LocalDatabaseConfiguration, Model, ServicePromises, Services, State
} from '../type'
import {Express} from 'express-serve-static-core'
// endregion
jest.setTimeout(
    packageConfiguration.webNode.couchdb.closeTimeoutInSeconds * 1000
)

describe('index', (): void => {
    // region prepare environment
    const configuration = {
        ...copy(webNodePackageConfiguration.webNode),
        ...copy(packageConfiguration.webNode)
    } as
        unknown as
        Configuration
    const config = configuration.couchdb

    config.closeTimeoutInSeconds = 10
    config.connector.fetch.timeout = config.closeTimeoutInSeconds * 1000
    config.databaseName = 'index-test'
    config.security[config.databaseName] = {
        members: {
            names: ['test'],
            roles: ['users']
        }
    }
    config.users[config.databaseName] = {
        name: 'test',
        password: 'test',
        roles: ['users']
    }
    config.runner.variants[2].configuration = {
        adapter: 'memory',
        logPath: '/dev/null',
        // eslint-disable-next-line camelcase
        skip_setup: true
    } as LocalDatabaseConfiguration
    config.attachAutoRestarter = false
    ;(config.model.entities.TestModel as Model) = {
        writableProperty: {
            allowedRoles: {
                read: ['users'],
                write: ['users']
            }
        }
    } as unknown as Model
    ;(config.model.entities.SensibelTestModel as Model) = {
        readonlyProperty: {
            allowedRoles: {
                read: ['users'],
                write: []
            },
            default: 'readonlyValue'
        },
        secureProperty: {
            allowedRoles: {
                read: ['admin'],
                write: []
            },
            default: 'secureValue'
        },
        writableProperty: {
            allowedRoles: {
                read: ['users'],
                write: ['users']
            }
        }
    } as unknown as Model

    const {id: idName, revision: revisionName, type: typeName} =
        config.model.property.name.special
    // endregion
    // region tests
    test('preLoadService', async (): Promise<void> => {
        const services: Services = {} as Services

        await expect(preLoadService({
            configuration,
            data: undefined,
            hook: 'preLoadService',
            pluginAPI,
            plugins: [],
            services
        }))
            .resolves
            .toBeUndefined()
        expect(services).toHaveProperty('couchdb.validateDocument')
    })
    test('loadService', (): Promise<void> =>
        expect(loadService({
            configuration,
            data: undefined,
            hook: 'loadService',
            pluginAPI,
            plugins: [],
            servicePromises: {} as ServicePromises,
            services: {couchdb: {
                connection: null, server: {}
            } as unknown as Services['couchdb']}
        })).resolves.toStrictEqual({couchdb: null})
    )
    test('postLoadService', (): Promise<void> =>
        expect(postLoadService({
            configuration,
            data: undefined,
            hook: 'postLoadService',
            pluginAPI,
            plugins: [],
            servicePromises: {} as ServicePromises,
            services: {couchdb: {
                connection: null, server: {}
            } as unknown as Services['couchdb']}
        })).resolves.toBeUndefined()
    )
    test(
        'shouldExit',
        async (): Promise<void> => {
            let testValue = 0
            const services: Services = {couchdb: {
                connection: {close: () => {
                    testValue += 1
                }},
                server: {
                    process: {close: () => {
                        testValue += 1
                    }},
                    runner: {
                        packages: [] as Array<string>
                    }
                }
            } as Services['couchdb']}

            await expect(shouldExit({
                configuration,
                data: undefined,
                hook: 'shouldExit',
                pluginAPI,
                plugins: [],
                servicePromises: {} as ServicePromises,
                services
            })).resolves.toBeUndefined()
            expect(services).toStrictEqual({})
            expect(testValue).toStrictEqual(2)
        },
        60 * 1000
    )
    test.only('authorized rest api', async (): Promise<void> => {
        const services: Services = {} as Services

        const state = {
            configuration,
            data: undefined,
            pluginAPI,
            plugins: [],
            services
        } as unknown as State

        state.hook = 'preLoadService'
        await expect(preLoadService(state)).resolves.toBeUndefined()

        if (global.COUCHDB_WEBNODE_PLUGIN_EXPRESS_INSTANCES) {
            state.services.couchdb.server.expressInstance =
                global.COUCHDB_WEBNODE_PLUGIN_EXPRESS_INSTANCES.express as
                    Express
            state.services.couchdb.server.expressPouchDBInstance =
                global.COUCHDB_WEBNODE_PLUGIN_EXPRESS_INSTANCES.pouchDB as
                    Express
        }

        state.hook = 'loadService'
        await expect(loadService(state, expressUtilities))
            .resolves.toHaveProperty('couchdb')

        global.COUCHDB_WEBNODE_PLUGIN_EXPRESS_INSTANCES = {
            express: state.services.couchdb.server.expressInstance,
            pouchDB: state.services.couchdb.server.expressPouchDBInstance
        }

        // region initialize test client connection
        const pouchDB = PouchDB
            .plugin(PouchDBAuthenticationPlugin)
            .plugin(PouchDBFindPlugin)
            .plugin(PouchDBHTTPAdapter)
        const client = new pouchDB(
            getEffectiveURL(config),
            {
                ...getConnectorOptions(config.connector),
                auth: {
                    username: config.users[config.databaseName].name,
                    password: config.users[config.databaseName].password
                }
            }
        )
        // endregion
        try {
            const data: Mapping =
                {[typeName]: 'TestModel', writableProperty: 'test'}
            const {id, rev: revision} = await client.post(data)
            // const {id, rev: revision} = await client.post(sensibelData)
            const sensibelData: Mapping =
                {[typeName]: 'SensibelTestModel', writableProperty: 'test'}
            const {id: sensibelID, rev: sensibelRevision} =
                await client.post(sensibelData)
            // region test reading properties
            /// region id
            await expect(client.get(id))
                .resolves.toHaveProperty('writableProperty')
            await expect(client.get(sensibelID))
                .rejects.toHaveProperty('error', 'unauthorized')
            /// endregion
            /// region find
            const fetchResult = (await client.find({
                fields: ['readonlyProperty', 'writableProperty'],
                selector: {[idName]: sensibelID}
            })).docs[0]
            expect(fetchResult)
                .toHaveProperty('readonlyProperty', 'readonlyValue')
            expect(fetchResult)
                .toHaveProperty('writableProperty', 'test')

            await expect(client.find({
                fields: ['secureProperty'], selector: {[idName]: sensibelID}
            })).rejects.toHaveProperty('error', 'unauthorized')
            /// endregion
            /// region allDocs
            await expect(client.allDocs()).resolves.toBeDefined()

            // eslint-disable-next-line camelcase
            await expect(client.allDocs({include_docs: true}))
                .rejects.toHaveProperty('error', 'unauthorized')
            /// endregion
            /// region changes
            const {results: validResults} = await client.changes({since: 0})
            expect(validResults[validResults.length - 1])
                .not.toHaveProperty('error')

            const {results: invalidResults} =
                // eslint-disable-next-line camelcase
                await client.changes({include_docs: true, since: 0})
            expect(invalidResults[invalidResults.length - 1])
                .toHaveProperty('error.error', 'unauthorized')

            const validChangesStream = client.changes({live: true, since: 0})
            await validChangesStream.on('change', (change): void => {
                if (change.id === sensibelID) {
                    expect(change).not.toHaveProperty('error')
                    validChangesStream.cancel()
                }
            })
            const invalidChangesStream =
                // eslint-disable-next-line camelcase
                client.changes({include_docs: true, live: true, since: 0})
            await invalidChangesStream.on('change', (change): void => {
                if (change.id === sensibelID) {
                    expect(change).toHaveProperty('error')
                    invalidChangesStream.cancel()
                }
            })
            /// endregion
            // endregion
            // region test writing properties
            /// region post
            sensibelData.readonlyProperty = 'notAllowedChangedValue'

            await expect(client.post(sensibelData))
                .rejects.toHaveProperty('error', 'unauthorized')
            /// endregion
            /// region put
            sensibelData[idName] = sensibelID
            sensibelData[revisionName] = sensibelRevision

            await expect(client.put(sensibelData))
                .rejects.toHaveProperty('error', 'unauthorized')
            /// endregion
            /// region bulkDocs
            expect((await client.bulkDocs([sensibelData]))[0])
                .toHaveProperty('error', 'unauthorized')
            /// endregion
            /// region delete
            await expect(client.remove(id, revision))
                .resolves.toHaveProperty('ok', true)
            await expect(client.remove(sensibelID, sensibelRevision))
                .rejects.toHaveProperty('error', 'unauthorized')
            /// endregion
            /// region copy
            /* TODO
            await expect(client.copy(id, revision))
                .resolves.toHaveProperty('ok', true)
            await expect(client.copy(sensibelID, sensibelRevision))
                .rejects.toHaveProperty('error', 'unauthorized')
            */
            /// endregion
            // endregion
        // eslint-disable-next-line no-useless-catch
        } catch (error) {
            throw error
        } finally {
            await waitWithTimeout(
                client.close(),
                config.closeTimeoutInSeconds,
                'test client connection to close'
            )
            state.hook = 'shouldExit'
            await expect(shouldExit(state)).resolves.toBeUndefined()
        }
    })
    // endregion
})
