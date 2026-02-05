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
import PouchDBMemoryPlugin from 'pouchdb-adapter-memory'
import PouchDBFindPlugin from 'pouchdb-find'
import PouchDB from 'pouchdb-node'
import PouchDBValidationPlugin from 'pouchdb-validation'
import {pluginAPI} from 'web-node'

import {describe, expect, test} from '@jest/globals'

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
    // endregion
    // region tests
    test('start/restart/stop', (done): void => {
        void (async () => {
            const connector = PouchDB
                .plugin(PouchDBMemoryPlugin)
                .plugin(PouchDBFindPlugin)
                .plugin(PouchDBValidationPlugin)
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
                        console.log('RESOLLVE')
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

            await restart(state, expressUtilities)

            // NOTE: Pouchdb needs some time finished further microtasks.
            await timeout(100)

            console.log('AAAA')

            await expect(stop({couchdb: service}, configuration, true))
                .resolves.toBeUndefined()
            console.log('BBBB')
        })()
    })
    // endregion
})
