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
import path from 'path'
import {pluginAPI} from 'web-node'

import {loadService, preLoadService, shouldExit} from '../index'
import packageConfiguration from '../package.json'
import {Configuration, Runner, ServicePromises, Services} from '../type'
// endregion
describe('index', (): void => {
    // region prepare environment
    const configuration: Configuration =
        packageConfiguration.webNode as unknown as Configuration
    configuration.couchdb.url = 'http://dummy-url'
    // endregion
    // region tests
    test('preLoadService', async (): Promise<void> => {
        const runner: Runner = configuration.couchdb.binary.runner[
            configuration.couchdb.binary.runner.length - 1
        ]

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
        expect(services).toHaveProperty(
            'couchdb.server.runner.binaryFilePath',
            path.resolve(runner.location[0], runner.name as string)
        )
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
                server: {process: {kill: (): boolean => {
                    testValue += 1

                    return true
                }}}
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
