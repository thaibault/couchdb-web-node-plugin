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
import {copy, timeout} from 'clientnode'
import PouchDB from 'pouchdb-core'
import PouchDBHTTPAdapter from 'pouchdb-adapter-http'
import PouchDBAuthenticationPlugin from 'pouchdb-authentication'
import PouchDBFindPlugin from 'pouchdb-find'
import {pluginAPI} from 'web-node'
import webNodePackageConfiguration from 'web-node/package.json'

import {describe, expect, jest, test} from '@jest/globals'

import {getEffectiveURL} from '../helper'
import {
    loadService, postLoadService, preLoadService, shouldExit
} from '../index'
import expressUtilities from '../loadExpress'
import packageConfiguration from '../package.json'
import {Configuration, Model, ServicePromises, Services, State} from '../type'
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

    config.closeTimeoutInSeconds = 3
    config.connector.fetch.timeout = config.closeTimeoutInSeconds * 1000
    config.databaseName = 'index-test'
    config.users[config.databaseName] = {
        name: 'test',
        password: 'test',
        roles: ['users']
    }
    config.url = 'dummy-url'
    config.runner.variants[2].configuration = {
        adapter: 'memory'
    }
    config.attachAutoRestarter = false
    config.model.entities.TestModel = {
        propertyA: {}
    } as unknown as Model

    const {id: idName, type: typeName} = config.model.property.name.special
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

        state.hook = 'loadService'
        await expect(loadService(state, expressUtilities))
            .resolves.toHaveProperty('couchdb')

        // TODO: implement tests for authorized rest api
        const pouchDB = PouchDB
            .plugin(PouchDBAuthenticationPlugin)
            .plugin(PouchDBFindPlugin)
            .plugin(PouchDBHTTPAdapter)
        const client = new pouchDB(getEffectiveURL(config))

        await client.logIn(
            config.users[config.databaseName].name,
            config.users[config.databaseName].password
        )
        try {
            console.log('Create', {
                [typeName]: 'TestModel', propertyA: 'value'
            })
            const {id} = await client.post({
                [typeName]: 'TestModel', propertyA: 'value'
            })
            console.log('Rewad', {selector: {[idName]: id}})
            console.log(
                'TODO FIND',
                await client.find({selector: {[idName]: id}})
            )
        } catch (e) {
            console.error('Error', e)
        }
        await client.logOut()
        await Promise.race([
            client.close(), timeout(config.closeTimeoutInSeconds * 1000)
        ])

        state.hook = 'shouldExit'
        await expect(shouldExit(state)).resolves.toBeUndefined()
    })
    // endregion
})
