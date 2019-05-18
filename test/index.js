// @flow
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
import registerTest from 'clientnode/test'
import {configuration} from 'web-node'
import type {Services} from 'web-node/type'

import Index from '../index'
// endregion
registerTest(async function():Promise<void> {
    this.module('index')
    // region tests
    this.test('loadService', async (assert:Object):Promise<void> => {
        try {
            assert.deepEqual((await Index.loadService(
                {}, {database: {connection: null, server: {}}}, configuration
            )).promise, null)
        } catch (error) {
            console.error(error)
        }
    })
    this.test('preLoadService', async (assert:Object):Promise<void> => {
        try {
            assert.strictEqual(typeof (await Index.preLoadService({
            }, configuration)).database.server.runner.binaryFilePath, 'string')
        } catch (error) {
            console.error(error)
        }
    })
    this.test('shouldExit', async (assert:Object):Promise<void> => {
        const done:Function = assert.async()
        let testValue:number = 0
        const services:Services = {database: {
            connection: {close: ():void => {
                testValue += 1
            }},
            server: {process: {kill: ():void => {
                testValue += 1
            }}}
        }}
        try {
            assert.deepEqual(
                await Index.shouldExit(services, configuration), services)
        } catch (error) {
            console.error(error)
        }
        assert.deepEqual(services, {})
        assert.strictEqual(testValue, 2)
        done()
    })
// endregion
}, 'plain')
// region vim modline
// vim: set tabstop=4 shiftwidth=4 expandtab:
// vim: foldmethod=marker foldmarker=region,endregion:
// endregion
