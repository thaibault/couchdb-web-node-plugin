// #!/usr/bin/env babel-node
// -*- coding: utf-8 -*-
'use strict'
/* !
    region header
    Copyright Torben Sickert (info["~at~"]tsickert.com) 16.12.2012

    License
    -------

    This library written by Torben Sickert stands under a creative commons
    naming 3.0 unported license.
    See https://creativecommons.org/licenses/by/3.0/deed.de
    endregion
*/
// region imports
import type {
    Configuration, Model, Models, ServicePromises, Services, State
} from '../type'

import {copy} from 'clientnode'
import {pluginAPI} from 'web-node'
import webNodePackageConfiguration from 'web-node/package.json'

import {describe, expect, test} from '@jest/globals'
import {
    loadService, postLoadService, preLoadService, shouldExit
} from '../index'
import packageConfiguration from '../package.json'
// endregion
describe('index', (): void => {
    // region prepare environment
    const configuration = {
        ...copy(webNodePackageConfiguration.webNode),
        ...copy(packageConfiguration.webNode)
    } as
        unknown as
        Configuration
    configuration.couchdb.attachAutoRestarter = false
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
    describe('loadService configuration checks', (): void => {
        /**
         * Runs "loadService" against a mocked database connector which
         * accepts every request so only given configuration matters.
         * @param entities - Models to check.
         * @param users - Database users to ensure presence for.
         * @param calls - Optional list to record connector calls into.
         * @returns Promise resolving or rejecting like "loadService".
         */
        const loadWithModels = (
            entities: Models,
            users: Configuration['couchdb']['users'] = [],
            calls: Array<string> = []
        ): Promise<unknown> => {
            const localConfiguration = copy(configuration)
            const config = localConfiguration.couchdb

            // Avoid pending timers of connection close timeouts.
            config.closeTimeoutInSeconds = .01
            config.ensureAdminPresence = false
            config.ensureSecuritySettingsPresence = false
            config.ensureUserPresence = users.length > 0
            config.users = users
            config.model.updateConfiguration = false
            config.model.updateValidation = true
            config.model.entities = {
                ...config.model.entities, ...entities
            } as unknown as typeof config.model.entities
            localConfiguration.core.debug = true

            class Connector {
                closed = false
                name: string
                constructor(url: string) {
                    this.name = url.substring(url.lastIndexOf('/') + 1)
                }
                record(call: string): Promise<void> {
                    calls.push(`${this.name}.${call}`)

                    return this.closed ?
                        Promise.reject(new Error('database is closed')) :
                        Promise.resolve()
                }
                allDocs(): Promise<unknown> {
                    return this.record('allDocs').then(() => ({rows: []}))
                }
                close(): Promise<void> {
                    calls.push(`${this.name}.close`)
                    this.closed = true

                    return Promise.resolve()
                }
                get(id: string): Promise<unknown> {
                    return this.record(`get:${id}`).then(() => {
                        // eslint-disable-next-line no-throw-literal
                        throw {name: 'not_found'}
                    })
                }
                put({_id: id}: {_id: string}): Promise<unknown> {
                    return this.record(`put:${id}`).then(() => ({ok: true}))
                }
                installCouchDBWebNodePlugin(): void {
                    // Nothing to install.
                }
                setMaxListeners(): void {
                    // Nothing to configure.
                }
            }

            return loadService({
                configuration: localConfiguration,
                data: undefined,
                hook: 'loadService',
                pluginAPI,
                plugins: [],
                servicePromises: {} as ServicePromises,
                services: {couchdb: {connector: Connector, server: {}}}
            } as unknown as State)
        }
        const invalidConstraintModel = {
            _constraintExpressions: [{description: '+', evaluation: 'true'}]
        } as unknown as Model

        test('invalid model constraint description', (): Promise<void> =>
            expect(loadWithModels({
                InvalidConstraintModel: invalidConstraintModel
            })).rejects.toThrow(
                /^Specified constraint description "\+" for model "InvalidConstraintModel" doesn't compile: /
            )
        )
        test('invalid property constraint description', (): Promise<void> =>
            expect(loadWithModels({InvalidConstraintModel: {
                a: {constraintExecution: {
                    description: 'return +', evaluation: 'return true'
                }}
            } as unknown as Model})).rejects.toThrow(
                /^Specified constraint description "return \+" for model "InvalidConstraintModel" in property "a" as "constraintExecution" doesn't compile: /
            )
        )
        test('ensure presence of multiple users', async (
        ): Promise<void> => {
            const calls: Array<string> = []

            // Invalid constraint stops loading right after user handling.
            await expect(loadWithModels(
                {InvalidConstraintModel: invalidConstraintModel},
                [
                    {name: 'a', password: 'a', roles: []},
                    {name: 'b', password: 'b', roles: []}
                ],
                calls
            )).rejects.toThrow(/^Specified constraint description /)

            expect(calls.filter((call) => call.startsWith('_users.')))
                .toStrictEqual([
                    '_users.get:org.couchdb.user:a',
                    '_users.put:org.couchdb.user:a',
                    '_users.get:org.couchdb.user:b',
                    '_users.put:org.couchdb.user:b',
                    '_users.close'
                ])
        })
    })
    // endregion
})
