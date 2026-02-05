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
import PouchDBFindPlugin from 'pouchdb-find'
import PouchDB from 'pouchdb-node'
import PouchDBValidationPlugin from 'pouchdb-validation'
import {pluginAPI} from 'web-node'

import {describe, expect, test} from '@jest/globals'

import packageConfiguration from '../package.json'
import {start} from '../server'
import {Configuration, InPlaceRunner, State} from '../type'
// endregion
describe('server', (): void => {
    // region prepare environment
    const configuration: Configuration =
        packageConfiguration.webNode as unknown as Configuration
    // endregion
    // region tests
    test('start', async (): Promise<void> => {
        const connector = PouchDB
            .plugin(PouchDBFindPlugin)
            .plugin(PouchDBValidationPlugin)
            .defaults({prefix: './dummy-location/'}) as typeof PouchDB

        await expect(start({
            configuration,
            pluginAPI,
            services: {couchdb: {
                connector,
                server: {
                    runner: {packages: ['express', 'express-pouchdb']} as
                        InPlaceRunner
                }
            }}
        } as State)).resolves.toBeUndefined()
    })
    // endregion
})
