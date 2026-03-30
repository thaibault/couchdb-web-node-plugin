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
import {copy, Mapping, timeout} from 'clientnode'
import {Express} from 'express-serve-static-core'
import PouchDB from 'pouchdb-node'
import PouchDBHTTPAdapter from 'pouchdb-adapter-http'
import PouchDBFindPlugin from 'pouchdb-find'
import {pluginAPI} from 'web-node'
import webNodePackageConfiguration from 'web-node/package.json'

import {afterAll, beforeAll, describe, expect, jest, test} from '@jest/globals'

import {
    getConnectorOptions, getEffectiveURL, getPouchDBPlugin, waitWithTimeout
} from '../helper'
import {
    loadService,
    postLoadService,
    preLoadService,
    shouldExit
} from '../index'
import expressUtilities from '../loadExpress'
import packageConfiguration from '../package.json'
import {
    Configuration,
    Connection,
    LocalDatabaseConfiguration,
    Model,
    Services,
    State
} from '../type'
// endregion
jest.setTimeout(
    packageConfiguration.webNode.couchdb.closeTimeoutInSeconds * 1000
)

describe('crud', (): void => {
    // region prepare environment
    const configuration = {
        ...copy(webNodePackageConfiguration.webNode),
        ...copy(packageConfiguration.webNode)
    } as
        unknown as
        Configuration
    const config = configuration.couchdb

    const {id: idName, revision: revisionName, type: typeName} =
        config.model.property.name.special

    config.closeTimeoutInSeconds = 10
    config.connector.fetch.timeout = config.closeTimeoutInSeconds * 1000
    config.databaseName = 'index-test'
    config.security[config.databaseName] = {
        members: {
            names: ['test'],
            roles: ['users']
        }
    }
    config.users = [{
        name: 'test',
        password: 'test',
        roles: ['users']
    }]
    config.runner.variants[2].configuration = {
        adapter: 'memory',
        logPath: '/dev/null'
    } as LocalDatabaseConfiguration
    config.attachAutoRestarter = false
    ;(config.model.entities.TestModel as Model) = {
        _roles: 'users',
        _attachments: {
            'file.txt': {
                default: {
                    'file.txt': {
                        // eslint-disable-next-line camelcase
                        content_type: 'text/plain',
                        data:
                            Buffer.from('Is there life on Mars?', 'binary')
                                .toString('base64')
                    }
                },
                maximumNumber: 1
            }
        },
        writableProperty: {},
        test2Reference: {type: 'foreignKey:Test2Model'},
        sub: {type: {test2References: {type: 'foreignKey:Test2Model[]'}}}
    } as unknown as Model
    ;(config.model.entities.Test2Model as Model) = {_roles: 'users'} as
        unknown as
        Model
    ;(config.model.entities.SensibelTestModel as Model) = {
        _roles: 'users',
        _attachments: {
            'secureFile.txt': {
                roles: 'admin',
                default: {
                    'secureFile.txt': {
                        // eslint-disable-next-line camelcase
                        content_type: 'text/plain',
                        data:
                            Buffer.from('There is!', 'binary')
                                .toString('base64')
                    }
                },
                maximumNumber: 1
            }
        },
        readonlyProperty: {
            roles: {
                read: 'users',
                write: []
            },
            default: 'readonlyValue'
        },
        secureProperty: {
            roles: 'admin',
            default: 'secureValue'
        },
        writableProperty: {
            roles: 'users'
        }
    } as unknown as Model

    const services: Services = {} as Services

    const state = {
        configuration,
        data: {couchdbWebNodeExpressUtilities: expressUtilities},
        pluginAPI,
        plugins: [],
        services
    } as unknown as State
    let client: Connection
    beforeAll(async () => {
        state.hook = 'preLoadService'
        await preLoadService(state)

        if (global.COUCHDB_WEBNODE_PLUGIN_EXPRESS_INSTANCES) {
            state.services.couchdb.server.expressInstance =
                global.COUCHDB_WEBNODE_PLUGIN_EXPRESS_INSTANCES.express as
                    Express
            state.services.couchdb.server.expressPouchDBInstance =
                global.COUCHDB_WEBNODE_PLUGIN_EXPRESS_INSTANCES.pouchDB as
                    Express
        }

        state.hook = 'loadService'
        await loadService(state)

        global.COUCHDB_WEBNODE_PLUGIN_EXPRESS_INSTANCES = {
            express: state.services.couchdb.server.expressInstance,
            pouchDB: state.services.couchdb.server.expressPouchDBInstance
        }

        // region initialize test client connection
        const pouchDB = PouchDB
            .plugin(PouchDBHTTPAdapter)
            .plugin(PouchDBFindPlugin)
            .plugin(getPouchDBPlugin(state.configuration.couchdb))
        client = new pouchDB(
            getEffectiveURL(config),
            {
                ...getConnectorOptions(config.connector),
                auth: {
                    username: config.users[0].name,
                    password: config.users[0].password
                }
            }
        ) as Connection
        client.installCouchDBWebNodePlugin('test')
        // endregion
    })
    afterAll(async () => {
        await waitWithTimeout(
            client.close(),
            config.closeTimeoutInSeconds,
            'test client connection to close'
        )
        state.hook = 'shouldExit'
        await expect(shouldExit(state)).resolves.toBeUndefined()
    })
    // endregion
    test('authorization', async (): Promise<void> => {
        const data: Mapping =
            {[typeName]: 'TestModel', writableProperty: 'test'}
        let {id, rev: revision} = await client.post(data)
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
        /// region attachments
        await expect(client.getAttachment(id, 'file.txt'))
            .resolves.toHaveProperty('type')
        await expect(client.getAttachment(sensibelID, 'secureFile.txt'))
            .rejects.toBeDefined()
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
        /// region putAttachment
        const putAttachmentResult = await client.putAttachment(
            id,
            'file.txt',
            revision,
            Buffer.from('Is there life outside Earth?', 'binary')
                .toString('base64'),
            'text/plain'
        )
        expect(putAttachmentResult).toHaveProperty('ok', true)
        revision = putAttachmentResult.rev
        await expect(client.putAttachment(
            sensibelID,
            'secureFile.txt',
            sensibelRevision,
            Buffer.from('No!', 'binary').toString('base64'),
            'text/plain'
        )).rejects.toHaveProperty('error', 'unauthorized')
        /// endregion
        /// region removeAttachment
        const removeAttachmentResult =
            await client.removeAttachment(id, 'file.txt', revision)
        expect(removeAttachmentResult).toHaveProperty('ok', true)
        revision = removeAttachmentResult.rev
        await expect(client.removeAttachment(
            sensibelID, 'secureFile.txt', sensibelRevision
        )).rejects.toHaveProperty('error', 'unauthorized')
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
        // endregion
    })
    test(
        'referential integrity due to initialization',
        async (): Promise<void> => {
            const {foreignKeys} = state.services.couchdb

            expect(foreignKeys.static.TestModel).toEqual(
                [
                    {
                        targetModelName: 'Test2Model',
                        propertySelector: ['test2Reference']
                    },
                    {
                        targetModelName: 'Test2Model',
                        propertySelector: ['sub', 'test2References']
                    }
                ]
            )

            // Create a references from "TestModel" to "Test2Model".
            const {id: test2ID} = await client.post({[typeName]: 'Test2Model'})
            const {id: test2ID2} = await client.post({[typeName]: 'Test2Model'})
            const {id: testID, rev: testRevision} = await client.post(
                {[typeName]: 'TestModel', test2Reference: test2ID}
            )
            await state.services.couchdb.removeDanglingForeignKeys?.()

            // Check whether reference got grabbed.
            expect(foreignKeys.runtime).toEqual({
                [test2ID]: [
                    {
                        propertySelector: ['test2Reference'],
                        id: testID
                    }
                ]
            })

            await client.put({
                [idName]: testID,
                [revisionName]: testRevision,
                sub: {test2References: [test2ID, test2ID2]}
            })
            await state.services.couchdb.removeDanglingForeignKeys?.()

            /*
                Check whether further added references in lists got grabbed as
                well.
            */
            expect(foreignKeys.runtime).toEqual({
                [test2ID]: [
                    {
                        propertySelector: ['test2Reference'],
                        id: testID
                    },
                    {
                        propertySelector: ['sub', 'test2References'],
                        id: testID
                    }
                ],
                [test2ID2]: [
                    {
                        propertySelector: ['sub', 'test2References'],
                        id: testID
                    }
                ]
            })

            await client.remove(test2ID2)
            await state.services.couchdb.removeDanglingForeignKeys?.()

            /*
                Check whether removed documents results in removed references
                as well.
            */
            expect(foreignKeys.runtime).not.toHaveProperty(test2ID2)

            const updatedTestDocument = (await client.find({
                selector: {[idName]: testID},
                fields: ['sub.test2References']
            })).docs[0]
            expect(updatedTestDocument).toEqual({
                sub: {test2References: [test2ID]}
            })

            await client.remove(testID)
            await client.remove(test2ID)
            await state.services.couchdb.removeDanglingForeignKeys?.()

            expect(foreignKeys.runtime).toMatchObject({})
        }
    )
    // TODO
    test.only(
        'referential integrity during runtime',
        async (): Promise<void> => {
            const {couchdb} = state.services
            const {foreignKeys} = couchdb

            config.attachAutoRestarter = true
            state.hook = 'postLoadService'
            await postLoadService(state)

            // Create a references from "TestModel" to "Test2Model".
            const {id: test2ID} = await client.post({[typeName]: 'Test2Model'})
            const {id: test2ID2} =
                await client.post({[typeName]: 'Test2Model'})
            const {id: testID} = await client.post({
                [typeName]: 'TestModel',
                test2Reference: test2ID,
                sub: {test2References: [test2ID, test2ID2]}
            })

            const waitForStabilization = async (getter: () => unknown) => {
                let maySetteled = false
                /*
                    eslint-disable @typescript-eslint/no-unnecessary-condition
                */
                while (true) {
                    const lastValue = getter()

                    for (let count = 0; count < 10; count++)
                        await timeout()

                    if (lastValue === getter())
                        if (maySetteled)
                            break
                        else
                            maySetteled = true
                }
                /* eslint-enable @typescript-eslint/no-unnecessary-condition */
            }
            await waitForStabilization(() =>
                couchdb.lastUpdateForeignKeysChangesSequenceIdentifier
            )

            expect(foreignKeys.runtime).toEqual({
                [test2ID]: [
                    {
                        propertySelector: ['test2Reference'],
                        id: testID
                    },
                    {
                        propertySelector: ['sub', 'test2References'],
                        id: testID
                    }
                ],
                [test2ID2]: [
                    {
                        propertySelector: ['sub', 'test2References'],
                        id: testID
                    }
                ]
            })

            await client.remove(test2ID2)

            await Promise.all([
                waitForStabilization(() =>
                    couchdb.lastUpdateForeignKeysChangesSequenceIdentifier
                ),
                waitForStabilization(() =>
                    couchdb
                        .lastRemoveDanglingForeignKeysChangesSequenceIdentifier
                )
            ])

            /*
                Check whether removed documents results in removed references
                as well.
            */
            expect(foreignKeys.runtime).not.toHaveProperty(test2ID2)

            const updatedTestDocument = (await client.find({
                selector: {[idName]: testID},
                fields: ['sub.test2References']
            })).docs[0]

            expect(updatedTestDocument).toEqual({
                sub: {test2References: [test2ID]}
            })

            console.log(
                'Runtime 1',
                JSON.stringify(foreignKeys.runtime, null, 2)
            )
            return

            await client.remove(testID)
            await client.remove(test2ID)

            await Promise.all([
                waitForStabilization(() =>
                    couchdb.lastUpdateForeignKeysChangesSequenceIdentifier
                ),
                waitForStabilization(() =>
                    couchdb
                        .lastRemoveDanglingForeignKeysChangesSequenceIdentifier
                )
            ])

            expect(foreignKeys.runtime).toMatchObject({})
        }
    )
    // endregion
})
