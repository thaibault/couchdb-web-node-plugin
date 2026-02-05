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
import {resolve} from 'path'
import PouchDBMemoryPlugin from 'pouchdb-adapter-memory'
import PouchDBFindPlugin from 'pouchdb-find'
import PouchDB from 'pouchdb-node'
import PouchDBValidationPlugin from 'pouchdb-validation'
import {pluginAPI} from 'web-node'

import {describe, expect, test} from '@jest/globals'

import {getConnectorOptions} from '../helper'
import expressUtilities from '../loadExpress'
import packageConfiguration from '../package.json'
import {restart, start, stop} from '../server'
import {Configuration, CouchDB, InPlaceRunner, State} from '../type'
// endregion
describe('server', (): void => {
    // region prepare environment
    const configuration = {
        ...copy(packageConfiguration.webNode),
        core: {plugin: {hotReloading: false}}
    } as unknown as Configuration
    configuration.couchdb.databaseName = 'server-test'
    configuration.couchdb.url = 'dummy-url'
    configuration.couchdb.connector.adapter = 'memory'
    configuration.couchdb.backend.configuration['couchdb/database_dir'] =
        'server-test-database-dummy-path/'
    // endregion
    // region tests
    test('start/restart/stop', (done): void => {
        void (async () => {
            const connector = PouchDB
                .plugin(PouchDBMemoryPlugin)
                .plugin(PouchDBFindPlugin)
                .plugin(PouchDBValidationPlugin)
                .defaults({
                    prefix: resolve(configuration.couchdb.backend
                        .configuration['couchdb/database_dir'] as string) +
                    '/',
                    ...getConnectorOptions(configuration.couchdb.connector)
                }) as typeof PouchDB
            const service = {
                connection: new connector(
                    configuration.couchdb.databaseName,
                    configuration.couchdb.connector
                ),
                connector,
                server: {
                    runner: {packages: ['express', 'express-pouchdb']} as
                        InPlaceRunner,
                    resolve: () => {
                        console.log('TODO RESOLVE called')
                        done()
                    }
                }
            } as CouchDB
            const state = {
                configuration,
                pluginAPI,
                plugins: [],
                services: {couchdb: service}
            } as unknown as State

            await expect(start(state, expressUtilities))
                .resolves.toBeUndefined()

            // NOTE: Pouchdb needs some time finished further microtasks.
            await timeout(100)

            await expect(restart(state, expressUtilities))
                .resolves.toBeUndefined()

            // NOTE: Pouchdb needs some time finished further microtasks.
            await timeout(100)

            await expect(stop({couchdb: service}, configuration, true))
                .resolves.toBeUndefined()

            console.log('BBBB')
        })()
    })
    // endregion
})
