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
    See http://creativecommons.org/licenses/by/3.0/deed.de
    endregion
*/
// region imports
import * as QUnit from 'qunit-cli'
// NOTE: Only needed for debugging this file.
try {
    module.require('source-map-support/register')
} catch (error) {}
import configuration from 'web-node/configurator'
import type {Services} from 'web-node/type'

import Index from '../index'
// endregion
QUnit.module('index')
QUnit.load()
// region tests
QUnit.test('exit', async (assert:Object):Promise<void> => {
    const done:Function = assert.async()
    let testValue:number = 0
    const services:Services = {database: {
        connection: {close: ():void => {
            testValue += 1
        }},
        serverProcess: {kill: ():void => {
            testValue += 1
        }}
    }}
    try {
        assert.deepEqual(await Index.exit(services, configuration), services)
    } catch (error) {
        console.error(error)
    }
    assert.deepEqual(services, {})
    assert.strictEqual(testValue, 2)
    done()
})
QUnit.test('preLoadService', async (assert:Object):Promise<void> => {
    try {
        assert.deepEqual(await Index.preLoadService(
            {database: {connection: {}, serverProcess: {}}}, configuration
        ), {database: {connection: {}, serverProcess: {}}})
    } catch (error) {
        console.error(error)
    }
})
// endregion
// region vim modline
// vim: set tabstop=4 shiftwidth=4 expandtab:
// vim: foldmethod=marker foldmarker=region,endregion:
// endregion
