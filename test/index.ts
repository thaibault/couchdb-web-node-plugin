// #!/usr/bin/env node
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
import Index from '../index'
import packageConfiguration from '../package.json'
import {Configuration, Services} from '../type'
// endregion
describe('index', ():void => {
    // region prepare environment
    const configuration:Configuration =
        packageConfiguration.webNode.database as Configuration
    // endregion
    // region tests
    test('loadService', ():void =>
        expect(Index.loadService(
            {}, {database: {connection: null, server: {}}}, configuration
        )).resolves.toStrictEqual({promise: null})
    )
    test('preLoadService', ():void =>
        expect(Index.preLoadService({}, configuration)).resolves
            .toHaveProperty('database.server.runner.binaryFilePath', 'TODO')
    )
    test('shouldExit', ():void => {
        let testValue:number = 0
        const services:Services = {database: {
            connection: {close: ():void => {
                testValue += 1
            }},
            server: {process: {kill: ():void => {
                testValue += 1
            }}}
        }}
        expect(Index.shouldExit(services, configuration))
            .resolves.toStrictEqual(services)
        expect(services).toStrictEqual({})
        expect(testValue).toStrictEqual(2)
    })
// endregion
})
// region vim modline
// vim: set tabstop=4 shiftwidth=4 expandtab:
// vim: foldmethod=marker foldmarker=region,endregion:
// endregion
