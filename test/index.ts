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
import Tools from 'clientnode'
import path from 'path'

import Index from '../index'
import packageConfiguration from '../package.json'
import {Configuration, Runner, Services} from '../type'
// endregion
describe('index', ():void => {
    // region prepare environment
    const configuration:Configuration =
        packageConfiguration.webNode as Configuration
    configuration.couchdb.url = 'http://dummy-url'
    // endregion
    // region tests
    test('loadService', ():void =>
        expect(Index.loadService(
            {}, {couchdb: {connection: null, server: {}}}, configuration
        )).resolves.toStrictEqual({name: 'couchdb', promise: null})
    )
    test('preLoadService', ():void => {
        const runner:Runner = configuration.couchdb.binary.runner[
            configuration.couchdb.binary.runner.length - 1
        ]
        expect(Index.preLoadService({}, configuration)).resolves
            .toHaveProperty(
                'couchdb.server.runner.binaryFilePath',
                path.resolve(runner.location[0], runner.name)
            )
    })
    test('shouldExit', async ():Promise<void> => {
        let testValue:number = 0
        const services:Services = {couchdb: {
            connection: {close: ():void => {
                testValue += 1
            }},
            server: {process: {kill: ():void => {
                testValue += 1
            }}}
        }}

        expect((await Index.shouldExit(services, configuration)))
            .toStrictEqual(services)
        expect(services).toStrictEqual({})
        expect(testValue).toStrictEqual(2)
    })
    // endregion
})
// region vim modline
// vim: set tabstop=4 shiftwidth=4 expandtab:
// vim: foldmethod=marker foldmarker=region,endregion:
// endregion
