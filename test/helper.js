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

import Helper from '../helper'
import type {Models} from '../type'
// endregion
QUnit.module('helper')
QUnit.load()
// region tests
QUnit.test('ensureValidationDocumentPresence', async (
    assert:Object
):Promise<void> => {
    const done:Function = assert.async()
    for (const test:Array<any> of [
        [{put: ():Promise<void> =>
            new Promise((resolve:Function):number => setTimeout(resolve, 0))
        }, 'test', {data: 'data'}, 'Description', null, false]
    ])
        assert.strictEqual(await Helper.ensureValidationDocumentPresence(
            ...test))
    done()
})
// / region model
QUnit.test('determineAllowedModelRolesMapping', (assert:Object):void => {
    for (const test:Array<any> of [
        [{}, {}],
        [
            {
                specialPropertyNames: {allowedRoles: 'roles'},
                models: {Test: {}}
            }, {}
        ],
        [
            {
                specialPropertyNames: {allowedRoles: 'roles'},
                models: {Test: {roles: []}}
            },
            {Test: []}
        ],
        [
            {
                specialPropertyNames: {allowedRoles: 'roles'},
                models: {Test: {roles: ['a']}}
            },
            {Test: ['a']}
        ]
    ])
        assert.deepEqual(
            Helper.determineAllowedModelRolesMapping(test[0]), test[1])
})
QUnit.test('extendModel', (assert:Object):void => {
    for (const test:Array<any> of [
        ['A', {A: {}}, {}],
        ['A', {A: {}}, {}],
        [
            'Test',
            {_baseTest: {b: {}}, Test: {a: {}, _extends: '_baseTest'}},
            {a: {}, b: {}}
        ],
        [
            'C',
            {A: {a: {}}, B: {b: {}}, C: {c: {}, _extends: ['A', 'B']}},
            {a: {}, b: {}, c: {}}
        ],
        [
            'C',
            {A: {a: {}}, B: {b: {}, _extends: 'A'}, C: {c: {}, _extends: 'B'}},
            {a: {}, b: {}, c: {}}
        ],
        [
            'C',
            {
                _base: {d: {type: 'number'}},
                A: {a: {}},
                B: {b: {}, _extends: 'A'},
                C: {c: {}, _extends: 'B'}
            },
            {a: {}, b: {}, c: {}, d: {type: 'number'}}
        ]
    ])
        assert.deepEqual(Helper.extendModel(test[0], test[1]), test[2])
})
QUnit.test('extendModels', (assert:Object):void => {
    for (const test:Array<any> of [
        [{}, {}],
        [{models: {}}, {}],
        [{models: {Test: {}}}, {Test: {}}],
        [{models: {Test: {}}}, {Test: {}}],
        [
            {models: {Base: {b: {}}, Test: {a: {}, _extends: 'Base'}}},
            {Base: {b: {}}, Test: {a: {}, b: {}}}
        ],
        [
            {models: {_base: {b: {}}, Test: {a: {}}}},
            {Test: {a: {}, b: {}}}
        ]
    ])
        assert.deepEqual(Helper.extendModels(test[0]), test[1])
    assert.throws(():Models => Helper.extendModels({models: {a: {}}}))
    assert.deepEqual(Helper.extendModels({
        specialPropertyNames: {
            typeNameRegularExpressionPattern: /a/
        },
        models: {a: {}}
    }), {a: {}})
})
// / endregion
// endregion
// region vim modline
// vim: set tabstop=4 shiftwidth=4 expandtab:
// vim: foldmethod=marker foldmarker=region,endregion:
// endregion
