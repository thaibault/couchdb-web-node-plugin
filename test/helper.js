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
import type {PlainObject} from 'clientnode'
import Tools from 'clientnode'
import registerTest from 'clientnode/test'
// NOTE: Only needed for debugging this file.
try {
    require('source-map-support/register')
} catch (error) {}
import configuration from 'web-node/configurator'

import Helper from '../helper'
import type {ModelConfiguration, Models} from '../type'
// endregion
registerTest(async function():Promise<void> {
    this.module('helper')
    // region tests
    this.test('ensureValidationDocumentPresence', async (
        assert:Object
    ):Promise<void> => {
        const done:Function = assert.async()
        for (const test:Array<any> of [
            [{put: ():Promise<void> =>
                new Promise((resolve:Function):Promise<boolean> =>
                    Tools.timeout(resolve))
            }, 'test', {data: 'data'}, 'Description', null, false]
        ])
            assert.strictEqual(await Helper.ensureValidationDocumentPresence(
                ...test))
        done()
    })
    // / region model
    this.test('determineAllowedModelRolesMapping', (assert:Object):void => {
        const modelConfiguration:ModelConfiguration =
            Tools.copyLimitedRecursively(configuration.database.model)
        modelConfiguration.entities = {}
        for (const test:Array<any> of [
            [{}, {}],
            [{
                property: {name: {special: {allowedRole: 'roles'}}},
                entities: {Test: {}}
            }, {}],
            [{
                property: {name: {special: {allowedRole: 'roles'}}},
                entities: {Test: {roles: []}}
            }, {Test: []}],
            [{
                property: {name: {special: {allowedRole: 'roles'}}},
                entities: {Test: {roles: ['a']}}
            }, {Test: ['a']}]
        ])
            assert.deepEqual(Helper.determineAllowedModelRolesMapping(
                Tools.extendObject(true, {}, modelConfiguration, test[0])
            ), test[1])
    })
    this.test('extendModel', (assert:Object):void => {
        const specialNames:PlainObject =
            configuration.database.model.property.name.special
        for (const test:Array<any> of [
            ['A', {A: {}}, {}],
            ['A', {A: {}}, {}],
            ['Test', {_baseTest: {b: {}}, Test: {a: {}, [
                specialNames.extend
            ]: '_baseTest'}}, {a: {}, b: {}}],
            ['C', {A: {a: {}}, B: {b: {}}, C: {c: {}, [specialNames.extend]: [
                'A', 'B'
            ]}}, {a: {}, b: {}, c: {}}],
            [
                'C',
                {
                    A: {a: {}},
                    B: {b: {}, [specialNames.extend]: 'A'},
                    C: {c: {}, [specialNames.extend]: 'B'}
                },
                {a: {}, b: {}, c: {}}
            ],
            [
                'C',
                {
                    _base: {d: {type: 'number'}},
                    A: {a: {}},
                    B: {b: {}, [specialNames.extend]: 'A'},
                    C: {c: {}, [specialNames.extend]: 'B'}
                },
                {a: {}, b: {}, c: {}, d: {type: 'number'}}
            ]
        ])
            assert.deepEqual(Helper.extendModel(test[0], test[1]), test[2])
    })
    this.test('extendModels', (assert:Object):void => {
        const modelConfiguration:ModelConfiguration =
            Tools.copyLimitedRecursively(configuration.database.model)
        modelConfiguration.entities = {}
        // IgnoreTypeCheck
        modelConfiguration.property.defaultSpecification = {}
        const specialNames:PlainObject = modelConfiguration.property.name
            .special
        for (const test:Array<any> of [
            [{}, {}],
            [{entities: {}}, {}],
            [{entities: {Test: {}}}, {Test: {}}],
            [{entities: {Test: {}}}, {Test: {}}],
            [
                {entities: {Base: {b: {}}, Test: {a: {}, [
                    specialNames.extend
                ]: 'Base'}}},
                {Base: {b: {}}, Test: {a: {}, b: {}}}
            ],
            [
                {entities: {_base: {b: {}}, Test: {a: {}}}},
                {_base: {b: {}}, Test: {a: {}, b: {}}}
            ],
            [
                {
                    property: {defaultSpecification: {maximum: 3}},
                    entities: {_base: {}, Test: {a: {}}}
                },
                {_base: {}, Test: {a: {maximum: 3}}}
            ],
            [
                {entities: {Test: {[specialNames.attachment]: {}}}},
                {Test: {[specialNames.attachment]: {}}}
            ],
            [
                {
                    entities: {Test: {[specialNames.attachment]: {a: {}}}},
                    property: {defaultSpecification: {minimum: 1}}
                },
                {Test: {[specialNames.attachment]: {a: {minimum: 1}}}}
            ]
        ])
            assert.deepEqual(Helper.extendModels(Tools.extendObject(
                true, {}, modelConfiguration, test[0]
            )), test[1])
        assert.throws(():Models => Helper.extendModels(Tools.extendObject(
            true, {}, modelConfiguration, {entities: {a: {}}})))
        assert.deepEqual(Helper.extendModels(Tools.extendObject(true, {
        }, modelConfiguration, {
            property: {name: {typeRegularExpressionPattern: {public: 'a'}}},
            entities: {a: {}}
        })), {a: {}})
    })
    // / endregion
}, ['plain'])
// endregion
// region vim modline
// vim: set tabstop=4 shiftwidth=4 expandtab:
// vim: foldmethod=marker foldmarker=region,endregion:
// endregion
