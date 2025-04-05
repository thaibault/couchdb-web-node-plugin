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
import {describe, expect, test} from '@jest/globals'
import {pluginAPI} from 'web-node'

import {loadService, preLoadService, shouldExit} from '../index'
import packageConfiguration from '../package.json'
import {Configuration, ServicePromises, Services} from '../type'
// endregion
describe('index', (): void => {
    // region prepare environment
    const configuration: Configuration =
        packageConfiguration.webNode as unknown as Configuration
    configuration.couchdb.backend.configuration['couchdb/database_dir'] =
        './dummy-location'
    configuration.couchdb.url = 'http://dummy-url'
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
    // endregion
})
