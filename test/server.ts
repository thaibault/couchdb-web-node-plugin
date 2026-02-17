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
import {copy, NOOP} from 'clientnode'
import PouchDBMemoryPlugin from 'pouchdb-adapter-memory'
import PouchDBFindPlugin from 'pouchdb-find'
import PouchDB from 'pouchdb-node'
import {pluginAPI} from 'web-node'
import webNodePackageConfiguration from 'web-node/package.json'

import {describe, expect, jest, test} from '@jest/globals'

import expressUtilities from '../loadExpress'
import packageConfiguration from '../package.json'
import {restart, start, stop} from '../server'
import {
    Configuration, CouchDB, InPlaceRunner, LocalDatabaseConfiguration, State
} from '../type'
import {Express} from 'express-serve-static-core'
// endregion
jest.setTimeout(
    packageConfiguration.webNode.couchdb.closeTimeoutInSeconds * 1000
)

describe('server', (): void => {
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
    config.databaseName = 'server-test'
    // endregion
    // region tests
    test('start/restart/stop', async (): Promise<void> => {
        const connector = PouchDB
            .plugin(PouchDBMemoryPlugin)
            .plugin(PouchDBFindPlugin)
            .defaults({
                adapter: 'memory',
                logPath: '/dev/null',
                // eslint-disable-next-line camelcase
                skip_setup: true
            } as LocalDatabaseConfiguration) as typeof PouchDB
        const service = {
            backendConnector: connector,
            connector,
            connection: new connector(config.databaseName),
            server: {
                runner: {packages: ['express', 'express-pouchdb']} as
                    InPlaceRunner,
                resolve: NOOP
            }
        } as CouchDB
        const state = {
            configuration,
            pluginAPI,
            plugins: [],
            services: {couchdb: service}
        } as unknown as State

        if (global.COUCHDB_WEBNODE_PLUGIN_EXPRESS_INSTANCES) {
            state.services.couchdb.server.expressInstance =
                global.COUCHDB_WEBNODE_PLUGIN_EXPRESS_INSTANCES.express as
                    Express
            state.services.couchdb.server.expressPouchDBInstance =
                global.COUCHDB_WEBNODE_PLUGIN_EXPRESS_INSTANCES.pouchDB as
                    Express
        }

        await expect(start(state, expressUtilities)).resolves.toBeUndefined()

        global.COUCHDB_WEBNODE_PLUGIN_EXPRESS_INSTANCES = {
            express: state.services.couchdb.server.expressInstance,
            pouchDB: state.services.couchdb.server.expressPouchDBInstance
        }

        await expect(restart(state, true, expressUtilities))
            .resolves.toBeUndefined()

        await expect(stop({couchdb: service}, configuration, true))
            .resolves.toBeUndefined()
    })
    // endregion
})
