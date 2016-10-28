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
import Tools from 'clientnode'
import * as QUnit from 'qunit-cli'
// NOTE: Only needed for debugging this file.
try {
    module.require('source-map-support/register')
} catch (error) {}
import configuration from 'web-node/configurator'

import Helper from '../helper'
import type {
    DatabaseForbiddenError, ModelConfiguration, Models, UpdateStrategy
} from '../type'
// endregion
QUnit.module('helper')
QUnit.load()
// region tests
QUnit.test('authenticate', (assert:Object):void => {
    for (const test:Array<any> of [
        [{}],
        [{}, null, {roles: []}],
        [{type: 'Test'}, {}, {roles: []}, {}, {Test: ['users']}, 'type'],
        [{type: 'Test'}, {}, {roles: ['users']}, {}, {Test: []}, 'type']
    ])
        assert.throws(():?true => Helper.authenticate(...test))
    for (const test:Array<any> of [
        [{}, null, {roles: ['_admin']}],
        [{}, {}, {roles: ['_admin']}, {}, {}, 'type'],
        [{type: 'Test'}, {}, {roles: ['users']}, {}, {Test: 'users'}, 'type'],
        [{type: 'Test'}, {}, {roles: ['users']}, {}, {Test: ['users']}, 'type']
    ])
        assert.ok(Helper.authenticate(...test))
})
QUnit.test('ensureValidationDocumentPresence', async (
    assert:Object
):Promise<void> => {
    const done:Function = assert.async()
    for (const test:Array<any> of [
        [{put: ():Promise<void> =>
            new Promise((resolve:Function):number => setTimeout(resolve, 0))
        }, 'test', '', 'Description', false]
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
QUnit.test('validateDocumentUpdate', (assert:Object):void => {
    for (const updateStrategy:UpdateStrategy of [
        '', 'fillUp', 'incremental'
    ]) {
        const defaultModelSpecification:ModelConfiguration =
            Tools.extendObject(
                true, {}, configuration.modelConfiguration, {updateStrategy})
        for (
            const propertyName:string in defaultModelSpecification.models._base
        )
            if (
                defaultModelSpecification.models._base.hasOwnProperty(
                    propertyName
                ) && propertyName !==
                configuration.modelConfiguration.specialPropertyNames.type
            )
                delete defaultModelSpecification.models._base[propertyName]
        // region forbidden writes
        for (const test:Array<any> of [
            // region general environment
            [[{_type: 'Test', _rev: 'latest'}, null], 'Revision'],
            [[{_type: 'Test', _rev: 'latest'}, {}], 'Revision'],
            [[{_type: 'Test', _rev: 'latest'}, {_type: 'Test'}], 'Revision'],
            // endregion
            // region model
            [[{}, {}], 'Type'],
            [[{_type: 'test'}], 'Model'],
            // endregion
            // region hooks
            // / region on create
            [[{_type: 'Test', a: ''}], {models: {Test: {a: {
                onCreateExpression: '+'
            }}}}, 'Compilation'],
            [[{_type: 'Test', a: ''}], {models: {Test: {a: {
                onCreateExecution: 'return +'
            }}}}, 'Compilation'],
            [[{_type: 'Test', a: ''}], {models: {Test: {a: {
                onCreateExpression: 'undefinedVariableName'
            }}}}, 'Runtime'],
            [[{_type: 'Test', a: ''}], {models: {Test: {a: {
                onCreateExecution: 'return undefinedVariableName'
            }}}}, 'Runtime'],
            // / endregion
            // / region on update
            [[{_type: 'Test', a: ''}], {models: {Test: {a: {
                onUpdateExpression: '+'
            }}}}, 'Compilation'],
            [[{_type: 'Test', a: ''}], {models: {Test: {a: {
                onUpdateExecution: 'return +'
            }}}}, 'Compilation'],
            [[{_type: 'Test', a: ''}], {models: {Test: {a: {
                onUpdateExpression: 'undefinedVariableName'
            }}}}, 'Runtime'],
            [[{_type: 'Test', a: ''}], {models: {Test: {a: {
                onUpdateExecution: 'return undefinedVariableName'
            }}}}, 'Runtime'],
            // / endregion
            // endregion
            // region property writable/mutable
            [
                [{_type: 'Test', a: 'b'}, {_type: 'Test'}],
                {models: {Test: {a: {writable: false}}}}, 'Readonly'
            ],
            [
                [{_type: 'Test', a: 'b'}, {_type: 'Test', a: 'a'}],
                {models: {Test: {a: {writable: false}}}}, 'Readonly'
            ],
            // endregion
            // region property existents
            [[{_type: 'Test', a: 2}], {models: {Test: {}}}, 'Property'],
            [
                [{_type: 'Test', a: null}],
                {models: {Test: {a: {nullable: false}}}}, 'NotNull'
            ],
            [
                [{_type: 'Test'}], {models: {Test: {a: {nullable: false}}}},
                'MissingProperty'
            ],
            // endregion
            // region property type
            [
                [{_type: 'Test', a: 2}], {models: {Test: {a: {}}}},
                'PropertyType'
            ],
            [
                [{_type: 'Test', a: 'b'}],
                {models: {Test: {a: {type: 'number'}}}}, 'PropertyType'
            ],
            [
                [{_type: 'Test', a: 1}],
                {models: {Test: {a: {type: 'boolean'}}}}, 'PropertyType'
            ],
            [
                [{_type: 'Test', a: 'a'}],
                {models: {Test: {a: {type: 'DateTime'}}}}, 'PropertyType'
            ],
            // / region array
            // // region type
            [
                [{_type: 'Test', a: 2}],
                {models: {Test: {a: {type: 'string[]'}}}}, 'PropertyType'
            ],
            [
                [{_type: 'Test', a: [2]}],
                {models: {Test: {a: {type: 'string[]'}}}}, 'PropertyType'
            ],
            [
                [{_type: 'Test', a: ['b']}],
                {models: {Test: {a: {type: 'number[]'}}}}, 'PropertyType'
            ],
            [
                [{_type: 'Test', a: [1]}],
                {models: {Test: {a: {type: 'boolean[]'}}}}, 'PropertyType'
            ],
            [
                [{_type: 'Test', a: [1]}],
                {models: {Test: {a: {type: 'DateTime'}}}}, 'PropertyType'
            ],
            [
                [{_type: 'Test', a: ['a']}],
                {models: {Test: {a: {type: 'DateTime[]'}}}}, 'PropertyType'
            ],
            // // endregion
            [
                [{_type: 'Test', a: [{_type: 'Test', b: 2}]}],
                {models: {Test: {a: {type: 'Test[]'}}}}, 'Property'
            ],
            [
                [{_type: 'Test', a: [{_type: 'Test', b: null}], b: 'a'}],
                {models: {Test: {a: {type: 'Test[]'}, b: {nullable: false}}}},
                'NotNull'
            ],
            [
                [
                    {_type: 'Test', a: [{_type: 'Test', b: 'a'}]},
                    {_type: 'Test', a: [{_type: 'Test', b: 'b'}]}
                ], {models: {
                    Test: {a: {type: 'Test[]', writable: false},
                    b: {}}
                }}, 'Readonly'
            ],
            [
                [{_type: 'Test', a: [4], b: [{_type: 'Test', a: [2]}]}],
                {models: {Test: {
                    a: {type: 'number[]', minimum: 3},
                    b: {type: 'Test[]'}
                }}}, 'Minimum'
            ],
            // / endregion
            // / region nested property
            // // region property type
            [
                [{_type: 'Test', a: 1}],
                {models: {Test: {a: {type: 'Test'}}}}, 'NestedModel'
            ],
            [
                [{_type: 'Test', a: null}],
                {models: {Test: {a: {type: 'Test', nullable: false}}}},
                'NotNull'
            ],
            [
                [{_type: 'Test', a: {}}],
                {models: {Test: {a: {type: 'Test'}}}}, 'Type'
            ],
            [
                [{_type: 'Test', a: {_type: 'Test', b: 2}, b: 'a'}],
                {models: {Test: {a: {type: 'Test'}, b: {}}}}, 'PropertyType'
            ],
            // // endregion
            // // region property existents
            [
                [{_type: 'Test', a: {_type: 'Test', b: 2}}],
                {models: {Test: {a: {type: 'Test'}}}}, 'Property'
            ],
            [
                [{_type: 'Test', a: {_type: 'Test', b: null}, b: 'a'}],
                {models: {Test: {a: {type: 'Test'}, b: {nullable: false}}}},
                'NotNull'
            ],
            [
                [{_type: 'Test', a: {_type: 'Test'}, b: 'a'}],
                {models: {Test: {a: {type: 'Test'}, b: {nullable: false}}}},
                'MissingProperty'
            ],
            // // endregion
            // // region property readonly
            [
                [
                    {_type: 'Test', a: {_type: 'Test', b: 'a'}},
                    {_type: 'Test', a: {_type: 'Test', b: 'b'}}
                ], {models: {Test: {a: {type: 'Test'}, b: {writable: false}}}},
                'Readonly'
            ],
            [
                [
                    {_type: 'Test', a: {_type: 'Test', b: 'a'}},
                    {_type: 'Test', a: {_type: 'Test', b: 'b'}}
                ], {models: {Test: {a: {type: 'Test'}, b: {mutable: false}}}},
                'Immutable'
            ],
            [
                [
                    {_type: 'Test', a: {_type: 'Test', b: 'a'}},
                    {_type: 'Test', a: {_type: 'Test'}}
                ], {models: {Test: {a: {type: 'Test'}, b: {writable: false}}}},
                'Readonly'
            ],
            [
                [
                    {_type: 'Test', a: {_type: 'Test', b: 'a'}},
                    {_type: 'Test', a: {_type: 'Test', b: 'b'}}, {}, {}
                ],
                {models: {Test: {a: {type: 'Test', writable: false}, b: {}}}},
                'Readonly'
            ],
            // // endregion
            // // region property range
            [
                [{_type: 'Test', a: 4, b: {_type: 'Test', a: 2}}],
                {models: {Test: {
                    a: {type: 'number', minimum: 3}, b: {type: 'Test'}
                }}}, 'Minimum'
            ],
            [
                [{_type: 'Test', a: '1', b: {_type: 'Test', a: '12'}}],
                {models: {Test: {a: {maximum: 1}, b: {type: 'Test'}}}},
                'MaximalLength'
            ],
            // // endregion
            // // region property pattern
            [
                [{_type: 'Test', b: {_type: 'Test', a: 'b'}}],
                {models: {Test: {
                    a: {regularExpressionPattern: 'a'},
                    b: {type: 'Test'}
                }}}, 'PatternMatch'
            ],
            // // endregion
            // // region property constraint
            [
                [{_type: 'Test', a: 'b', b: {_type: 'Test', a: 'a'}}],
                {models: {Test: {
                    a: {constraintExpression: 'newValue === "b"'},
                    b: {type: 'Test'}
                }}}, 'ConstraintExpression'
            ],
            // // endregion
            // / endregion
            [
                [{_type: 'Test', a: 1}], {models: {Test: {a: {type: 2}}}},
                'PropertyType'
            ],
            // endregion
            // region property range
            [
                [{_type: 'Test', a: 2}],
                {models: {Test: {a: {type: 'number', minimum: 3}}}}, 'Minimum'
            ],
            [
                [{_type: 'Test', a: 2}],
                {models: {Test: {a: {type: 'number', maximum: 1}}}}, 'Maximum'
            ],
            [
                [{_type: 'Test', a: '12'}],
                {models: {Test: {a: {minimum: 3}}}}, 'MinimalLength'
            ],
            [
                [{_type: 'Test', a: '12'}],
                {models: {Test: {a: {maximum: 1}}}}, 'MaximalLength'
            ],
            // endregion
            // region selection
            [
                [{_type: 'Test', a: 2}],
                {models: {Test: {a: {type: 'number', selection: []}}}},
                'Selection'
            ],
            [
                [{_type: 'Test', a: 2}],
                {models: {Test: {a: {type: 'number', selection: [1]}}}},
                'Selection'
            ],
            [
                [{_type: 'Test', a: 2}],
                {models: {Test: {a: {type: 'number', selection: [1, 3]}}}},
                'Selection'
            ],
            // endregion
            // region property pattern
            [
                [{_type: 'Test', a: 'b'}],
                {models: {Test: {a: {regularExpressionPattern: 'a'}}}},
                'PatternMatch'
            ],
            // endregion
            // region property constraint
            [
                [{_type: 'Test', a: 'b'}],
                {models: {Test: {a: {constraintExpression: 'false'}}}},
                'ConstraintExpression'
            ],
            [
                [{_type: 'Test', a: 'b'}],
                {models: {Test: {a: {constraintExecution: 'false'}}}},
                'ConstraintExecution'
            ],
            [
                [{_type: 'Test', a: 'b'}],
                {models: {Test: {a: {constraintExpression: '+'}}}},
                'Compilation'
            ],
            [
                [{_type: 'Test', a: 'b'}], {models: {Test: {a: {
                    constraintExpression: 'undefinedVariableName'
                }}}}, 'Runtime'
            ],
            [
                [{_type: 'Test', a: 'b'}], {models: {Test: {a: {
                    constraintExecution: 'return undefinedVariableName'
                }}}}, 'Runtime'
            ],
            [[{_type: 'Test', a: 'b'}], {models: {Test: {a: {
                constraintExpression: 'newValue === "a"'
            }}}}, 'ConstraintExpression']
            // endregion
        ]) {
            if (test.length < 3)
                test.splice(1, 0, {})
            const models:Models = Helper.extendModels(Tools.extendObject(
                true, {}, defaultModelSpecification, test[1]))
            const modelConfiguration:ModelConfiguration = Tools.extendObject(
                true, {}, defaultModelSpecification, test[1])
            delete modelConfiguration.default
            delete modelConfiguration.models
            const parameter:Array<any> = test[0].concat([null, {}, {}].slice(
                test[0].length - 1
            )).concat([models, modelConfiguration])
            assert.throws(():Object => Helper.validateDocumentUpdate(
                ...parameter
            ), (error:DatabaseForbiddenError):boolean => {
                if (error.hasOwnProperty('forbidden')) {
                    const result:boolean = error.forbidden.startsWith(
                        `${test[2]}:`)
                    if (!result)
                        console.log(
                            `Error "${error.forbidden}" doesn't start with "` +
                            `${test[2]}:". Given arguments: "` +
                            parameter.map((value:any):string =>
                                Tools.representObject(value)
                            ).join('", "') + '".')
                    return result
                }
                // IgnoreTypeCheck
                console.log(`Unexpeced error "${error}" was thrown.`)
                return false
            })
        }
        // endregion
        // region allowed writes
        for (const test:Array<any> of [
            // region general environment
            [[{_deleted: true}], {}, {
                fillUp: {_deleted: true},
                incremental: {_deleted: true},
                '': {_deleted: true}
            }],
            [[{_id: 1, _rev: 1}, null, {}, {_validatedDocuments: new Set(
                ['1-1']
            )}], {}, {
                fillUp: {_id: 1, _rev: 1},
                incremental: {_id: 1, _rev: 1},
                '': {_id: 1, _rev: 1}
            }],
            [[{_type: 'Test', _rev: 'latest'}, {_type: 'Test', _rev: 1}], {
                models: {Test: {}}
            }, {
                fillUp: {_type: 'Test', _rev: 1},
                incremental: {},
                '': {_type: 'Test', _rev: 1}
            }],
            // endregion
            // region model
            [[{_type: 'Test'}], {models: {Test: {}}}, {
                fillUp: {_type: 'Test'},
                incremental: {_type: 'Test'},
                '': {_type: 'Test'}
            }],
            [[{_type: 'Test'}], {models: {Test: {}}}, {
                fillUp: {_type: 'Test'},
                incremental: {_type: 'Test'},
                '': {_type: 'Test'}
            }],
            [[{_type: 'Test'}], {models: {Test: {class: {}}}}, {
                fillUp: {_type: 'Test'},
                incremental: {_type: 'Test'},
                '': {_type: 'Test'}
            }],
            [[{_type: 'Test'}, {_type: 'Test', a: '2'}], {
                models: {Test: {a: {}}}
            }, {
                fillUp: {_type: 'Test', a: '2'},
                incremental: {},
                '': {_type: 'Test'}
            }],
            [[{_type: 'Test', a: '2'}, {_type: 'Test', a: '2'}], {
                models: {Test: {a: {}}}
            }, {
                fillUp: {_type: 'Test', a: '2'},
                incremental: {},
                '': {_type: 'Test', a: '2'}
            }],
            [[{_type: 'Test', a: '3'}, {_type: 'Test', a: '2'}], {
                models: {Test: {a: {}}}}, {
                    fillUp: {a: '3', _type: 'Test'},
                    incremental: {a: '3'},
                    '': {_type: 'Test', a: '3'}
                }
            ],
            // endregion
            // region hooks
            // / region on create
            [[{_type: 'Test', a: ''}], {models: {Test: {a: {
                onCreateExpression: `'2'`
            }}}}, {
                fillUp: {_type: 'Test', a: '2'},
                incremental: {_type: 'Test', a: '2'},
                '': {_type: 'Test', a: '2'}
            }],
            [[{_type: 'Test', a: ''}], {models: {Test: {a: {
                onCreateExecution: `return '2'`
            }}}}, {
                fillUp: {_type: 'Test', a: '2'},
                incremental: {_type: 'Test', a: '2'},
                '': {_type: 'Test', a: '2'}
            }],
            [[{_type: 'Test', a: ''}, {_type: 'Test', a: ''}], {models: {
                Test: {a: {onCreateExecution: `return '2'`}}
            }}, {
                fillUp: {_type: 'Test', a: ''},
                incremental: {},
                '': {_type: 'Test', a: ''}
            }],
            // / endregion
            // / region on update
            [[{_type: 'Test', a: ''}], {models: {Test: {a: {
                onUpdateExpression: `'2'`
            }}}}, {
                fillUp: {_type: 'Test', a: '2'},
                incremental: {_type: 'Test', a: '2'},
                '': {_type: 'Test', a: '2'}
            }],
            [[{_type: 'Test', a: ''}], {models: {Test: {a: {
                onUpdateExecution: `return '2'`
            }}}}, {
                fillUp: {_type: 'Test', a: '2'},
                incremental: {_type: 'Test', a: '2'},
                '': {_type: 'Test', a: '2'}
            }],
            [[{_type: 'Test', a: '1'}, {_type: 'Test', a: '2'}], {models: {
                Test: {a: {onUpdateExpression: `'2'`
            }}}}, {
                fillUp: {_type: 'Test', a: '2'},
                incremental: {},
                '': {_type: 'Test', a: '2'}
            }],
            // / endregion
            // endregion
            // region property writable/mutable
            [[{_type: 'Test', a: 'b'}, {_type: 'Test', a: 'b'}], {models: {
                Test: {a: {writable: false}}
            }}, {
                fillUp: {_type: 'Test', a: 'b'},
                incremental: {},
                '': {_type: 'Test', a: 'b'}
            }],
            [[{_type: 'Test'}, {_type: 'Test'}], {models: {Test: {a: {
                writable: false
            }}}}, {
                fillUp: {_type: 'Test'},
                incremental: {},
                '': {_type: 'Test'}
            }],
            [[{_type: 'Test', a: '2'}, {_type: 'Test'}], {models: {Test: {a: {
                mutable: false
            }}}}, {
                fillUp: {_type: 'Test', a: '2'},
                incremental: {a: '2'},
                '': {_type: 'Test', a: '2'}
            }],
            // endregion
            // region property existents
            [[{_type: 'Test', a: 2}], {models: {Test: {a: {
                type: 'number'
            }}}}, {
                fillUp: {_type: 'Test', a: 2},
                incremental: {_type: 'Test', a: 2},
                '': {_type: 'Test', a: 2}
            }],
            [[{_type: 'Test', a: null}], {models: {Test: {a: {}}}}, {
                fillUp: {_type: 'Test'},
                incremental: {_type: 'Test'},
                '': {_type: 'Test'}
            }],
            [[{_type: 'Test', a: 'a'}], {models: {Test: {a: {
                nullable: false
            }}}}, {
                fillUp: {_type: 'Test', a: 'a'},
                incremental: {_type: 'Test', a: 'a'},
                '': {_type: 'Test', a: 'a'}
            }],
            [[{_type: 'Test'}, {_type: 'Test', a: 'a'}], {models: {Test: {a: {
                nullable: false
            }}}}, {
                fillUp: {_type: 'Test', a: 'a'},
                incremental: {},
                '': {_type: 'Test'}
            }],
            [[{_type: 'Test'}], {models: {Test: {a: {
                default: '2',
                nullable: false
            }}}}, {
                fillUp: {_type: 'Test', a: '2'},
                incremental: {_type: 'Test', a: '2'},
                '': {_type: 'Test', a: '2'}
            }],
            // endregion
            // region property type
            [
                [{_type: 'Test', a: '2'}, {_type: 'Test', a: '2'}],
                {models: {Test: {a: {}}}}, {
                    fillUp: {_type: 'Test', a: '2'},
                    incremental: {},
                    '': {_type: 'Test', a: '2'}
                }
            ],
            [
                [{_type: 'Test', a: 2}, {_type: 'Test', a: 2}],
                {models: {Test: {a: {type: 'number'}}}}, {
                    fillUp: {_type: 'Test', a: 2},
                    incremental: {},
                    '': {_type: 'Test', a: 2}
                }
            ],
            [
                [
                    {_type: 'Test', a: true},
                    {_type: 'Test', a: true}
                ],
                {models: {Test: {a: {type: 'boolean'}}}}, {
                    fillUp: {_type: 'Test', a: true},
                    incremental: {},
                    '': {_type: 'Test', a: true}
                }
            ],
            [
                [{_type: 'Test', a: 1}, {_type: 'Test', a: 1}],
                {models: {Test: {a: {type: 'DateTime'}}}}, {
                    fillUp: {_type: 'Test', a: 1},
                    incremental: {},
                    '': {_type: 'Test', a: 1}
                }
            ],
            // / region array
            [
                [
                    {_type: 'Test', a: ['2']},
                    {_type: 'Test', a: ['2']}
                ],
                {models: {Test: {a: {type: 'string[]'}}}}, {
                    fillUp: {_type: 'Test', a: ['2']},
                    incremental: {},
                    '': {_type: 'Test', a: ['2']}
                }
            ],
            [
                [{_type: 'Test', a: ['2']}, {_type: 'Test'}],
                {models: {Test: {a: {type: 'string[]'}}}}, {
                    fillUp: {_type: 'Test', a: ['2']},
                    incremental: {a: ['2']},
                    '': {_type: 'Test', a: ['2']}
                }
            ],
            [
                [{_type: 'Test', a: null}, {_type: 'Test'}],
                {models: {Test: {a: {type: 'string[]'}}}}, {
                    fillUp: {_type: 'Test'},
                    incremental: {},
                    '': {_type: 'Test'}
                }
            ],
            [
                [{_type: 'Test', a: [2]}, {_type: 'Test'}],
                {models: {Test: {a: {type: 'number[]'}}}}, {
                    fillUp: {_type: 'Test', a: [2]},
                    incremental: {a: [2]},
                    '': {_type: 'Test', a: [2]}
                }
            ],
            [
                [{_type: 'Test', a: [true]}, {_type: 'Test'}],
                {models: {Test: {a: {type: 'boolean[]'}}}}, {
                    fillUp: {_type: 'Test', a: [true]},
                    incremental: {a: [true]},
                    '': {_type: 'Test', a: [true]}
                }
            ],
            [
                [{_type: 'Test', a: [1]}, {_type: 'Test'}],
                {models: {Test: {a: {type: 'DateTime[]'}}}}, {
                    fillUp: {_type: 'Test', a: [1]},
                    incremental: {a: [1]},
                    '': {_type: 'Test', a: [1]}
                }
            ],
            [
                [{_type: 'Test', a: []}, {_type: 'Test'}],
                {models: {Test: {a: {type: 'DateTime[]'}}}}, {
                    fillUp: {_type: 'Test', a: []},
                    incremental: {a: []},
                    '': {_type: 'Test', a: []}
                }
            ],
            [
                [{_type: 'Test', a: [2]}, {_type: 'Test'}],
                {models: {Test: {a: {type: 'DateTime[]', mutable: false}}}}, {
                    fillUp: {_type: 'Test', a: [2]},
                    incremental: {a: [2]},
                    '': {_type: 'Test', a: [2]}
                }
            ],
            [
                [
                    {_type: 'Test', a: [2, 1]},
                    {_type: 'Test', a: [2]}
                ],
                {models: {Test: {a: {type: 'number[]'}}}}, {
                    fillUp: {_type: 'Test', a: [2, 1]},
                    incremental: {a: [2, 1]},
                    '': {_type: 'Test', a: [2, 1]}
                }
            ],
            // / endregion
            // / region nested property
            // // region property type
            [
                [
                    {_type: 'Test', a: {_type: 'Test'}},
                    {_type: 'Test', a: {_type: 'Test'}}
                ], {models: {Test: {a: {type: 'Test'}}}}, {
                    fillUp: {_type: 'Test', a: {_type: 'Test'}},
                    incremental: {},
                    '': {_type: 'Test', a: {_type: 'Test'}}
                }
            ],
            [
                [{_type: 'Test', a: null}, {_type: 'Test'}],
                {models: {Test: {a: {type: 'Test'}}}}, {
                    fillUp: {_type: 'Test'},
                    incremental: {},
                    '': {_type: 'Test'}
                }
            ],
            [
                [
                    {_type: 'Test', a: {_type: 'Test', b: null}},
                    {_type: 'Test', a: {_type: 'Test'}}
                ], {models: {Test: {a: {type: 'Test'}, b: {}}}}, {
                    fillUp: {_type: 'Test', a: {_type: 'Test'}},
                    incremental: {},
                    '': {_type: 'Test', a: {_type: 'Test'}}
                }
            ],
            [
                [
                    {_type: 'Test', a: {_type: 'Test', b: '2'}},
                    {_type: 'Test', a: {_type: 'Test', b: '2'}}
                ], {models: {Test: {a: {type: 'Test'}, b: {}}}}, {
                    fillUp: {_type: 'Test', a: {
                        _type: 'Test', b: '2'
                    }},
                    incremental: {},
                    '': {_type: 'Test', a: {
                        _type: 'Test', b: '2'
                    }}
                }
            ],
            [
                [
                    {
                        _type: 'Test',
                        a: {_type: 'Test', b: 'a'},
                        b: '2'
                    },
                    {
                        _type: 'Test',
                        a: {_type: 'Test', b: 'a'},
                        b: '2'
                    }
                ], {models: {Test: {a: {type: 'Test'}, b: {}}}}, {
                    fillUp: {
                        _type: 'Test',
                        a: {_type: 'Test', b: 'a'},
                        b: '2'
                    },
                    incremental: {},
                    '': {
                        _type: 'Test',
                        a: {_type: 'Test', b: 'a'},
                        b: '2'
                    }
                }
            ],
            // // endregion
            // // region property existents
            [
                [
                    {_type: 'Test', a: {_type: 'Test'}},
                    {_type: 'Test', a: {_type: 'Test'}}
                ], {models: {Test: {a: {type: 'Test'}}}}, {
                    fillUp: {
                        _type: 'Test',
                        a: {_type: 'Test'}
                    },
                    incremental: {},
                    '': {
                        _type: 'Test',
                        a: {_type: 'Test'}
                    }
                }
            ],
            [
                [
                    {
                        _type: 'Test',
                        a: {_type: 'Test', b: null},
                        b: 'a'
                    },
                    {_type: 'Test', a: {_type: 'Test'}, b: 'a'}
                ], {models: {Test: {a: {type: 'Test'}, b: {}}}}, {
                    fillUp: {
                        _type: 'Test',
                        a: {_type: 'Test'},
                        b: 'a'
                    },
                    incremental: {},
                    '': {
                        _type: 'Test',
                        a: {_type: 'Test'},
                        b: 'a'
                    }
                }
            ],
            [
                [
                    {
                        _type: 'Test',
                        a: {_type: 'Test', b: '2'},
                        b: 'a'
                    },
                    {
                        _type: 'Test',
                        a: {_type: 'Test', b: '2'},
                        b: 'a'
                    }
                ], {models: {Test: {a: {type: 'Test'}, b: {nullable: false}}}},
                {
                    fillUp: {
                        _type: 'Test',
                        a: {_type: 'Test', b: '2'},
                        b: 'a'
                    },
                    incremental: {},
                    '': {
                        _type: 'Test',
                        a: {_type: 'Test', b: '2'},
                        b: 'a'
                    }
                }
            ],
            // // endregion
            // // region property readonly
            [
                [
                    {_type: 'Test', a: {_type: 'Test', b: 'b'}},
                    {_type: 'Test', a: {_type: 'Test', b: 'b'}}
                ], {models: {Test: {a: {type: 'Test'}, b: {writable: false}}}},
                {
                    fillUp: {
                        _type: 'Test',
                        a: {_type: 'Test', b: 'b'}
                    },
                    incremental: {},
                    '': {
                        _type: 'Test',
                        a: {_type: 'Test', b: 'b'}
                    }
                }
            ],
            [
                [
                    {_type: 'Test', a: {_type: 'Test', b: 'a'}},
                    {_type: 'Test', a: {_type: 'Test', b: 'a'}}
                ],
                {models: {Test: {a: {type: 'Test', writable: false}, b: {}}}},
                {
                    fillUp: {_type: 'Test', a: {_type: 'Test', b: 'a'}},
                    incremental: {},
                    '': {_type: 'Test', a: {_type: 'Test', b: 'a'}}
                }
            ],
            // // endregion
            // // region property range
            [

                [
                    {_type: 'Test', a: 4, b: {_type: 'Test', a: 3}},
                    {_type: 'Test'}
                ], {models: {Test: {
                    a: {type: 'number', minimum: 3},
                    b: {type: 'Test'}
                }}}, {
                    fillUp: {_type: 'Test', a: 4, b: {_type: 'Test', a: 3}},
                    incremental: {a: 4, b: {_type: 'Test', a: 3}},
                    '': {_type: 'Test', a: 4, b: {_type: 'Test', a: 3}}
                }
            ],
            [
                [{_type: 'Test', a: '1', b: {_type: 'Test', a: '1'}}],
                {models: {Test: {a: {maximum: 1}, b: {type: 'Test'}}}}, {
                    fillUp: {
                        _type: 'Test',
                        a: '1',
                        b: {_type: 'Test', a: '1'}
                    },
                    incremental: {
                        _type: 'Test',
                        a: '1',
                        b: {_type: 'Test', a: '1'}
                    },
                    '': {
                        _type: 'Test',
                        a: '1',
                        b: {_type: 'Test', a: '1'}
                    }
                }
            ],
            // // endregion
            // // region property pattern
            [
                [{_type: 'Test', b: {_type: 'Test', a: 'a'}}],
                {models: {Test: {
                    a: {regularExpressionPattern: 'a'},
                    b: {type: 'Test'}
                }}}, {
                    fillUp: {_type: 'Test', b: {_type: 'Test', a: 'a'}},
                    incremental: {_type: 'Test', b: {_type: 'Test', a: 'a'}},
                    '': {_type: 'Test', b: {_type: 'Test', a: 'a'}}
                }
            ],
            // // endregion
            // // region property constraint
            [[{_type: 'Test', a: 'b', b: {_type: 'Test', a: 'b'}}], {
                models: {Test: {
                    a: {constraintExpression: 'newValue === "b"'},
                    b: {type: 'Test'}
                }
            }}, {
                fillUp: {_type: 'Test', a: 'b', b: {_type: 'Test', a: 'b'}},
                incremental: {
                    _type: 'Test',
                    a: 'b',
                    b: {_type: 'Test', a: 'b'}
                },
                '': {
                    _type: 'Test',
                    a: 'b',
                    b: {_type: 'Test', a: 'b'}
                }
            }
            ],
            // // endregion
            // / endregion
            [[{_type: 'Test', a: 2}, {_type: 'Test'}], {
                models: {Test: {a: {type: 2}}}}, {
                    fillUp: {_type: 'Test', a: 2},
                    incremental: {a: 2},
                    '': {_type: 'Test', a: 2}
                }
            ],
            // endregion
            // region property range
            [[{_type: 'Test', a: 3}, {_type: 'Test'}], {
                models: {Test: {a: {type: 'number', minimum: 3}}}}, {
                    fillUp: {_type: 'Test', a: 3},
                    incremental: {a: 3},
                    '': {_type: 'Test', a: 3}
                }
            ],
            [[{_type: 'Test', a: 1}, {_type: 'Test'}], {
                models: {Test: {a: {type: 'number', maximum: 1}}}}, {
                    fillUp: {_type: 'Test', a: 1},
                    incremental: {a: 1},
                    '': {_type: 'Test', a: 1}
                }
            ],
            [[{_type: 'Test', a: '123'}, {_type: 'Test'}], {
                models: {Test: {a: {minimum: 3}}}}, {
                    fillUp: {_type: 'Test', a: '123'},
                    incremental: {a: '123'},
                    '': {_type: 'Test', a: '123'}
                }
            ],
            [[{_type: 'Test', a: '1'}], {
                models: {Test: {a: {maximum: 1}}}}, {
                    fillUp: {_type: 'Test', a: '1'},
                    incremental: {_type: 'Test', a: '1'},
                    '': {_type: 'Test', a: '1'}
                }
            ],
            // endregion
            // region selection
            [
                [{_type: 'Test', a: 2}], {models: {Test: {a: {
                    type: 'number', selection: [2]
                }}}}, {
                    fillUp: {_type: 'Test', a: 2},
                    incremental: {_type: 'Test', a: 2},
                    '': {_type: 'Test', a: 2}
                }
            ],
            [
                [{_type: 'Test', a: 2}], {models: {Test: {a: {
                    type: 'number', selection: [1, 2]
                }}}}, {
                    fillUp: {_type: 'Test', a: 2},
                    incremental: {_type: 'Test', a: 2},
                    '': {_type: 'Test', a: 2}
                }
            ],
            // endregion
            // region property pattern
            [[{_type: 'Test', a: 'a'}], {
                models: {Test: {a: {regularExpressionPattern: 'a'}}}
            }, {
                fillUp: {_type: 'Test', a: 'a'},
                incremental: {_type: 'Test', a: 'a'},
                '': {_type: 'Test', a: 'a'}
            }],
            // endregion
            // region property constraint
            [[{_type: 'Test', a: 'b'}], {models: {Test: {a: {
                constraintExpression: 'true'
            }}}}, {
                fillUp: {_type: 'Test', a: 'b'},
                incremental: {_type: 'Test', a: 'b'},
                '': {_type: 'Test', a: 'b'}
            }],
            [[{_type: 'Test', a: 'a'}], {models: {Test: {a: {
                constraintExpression: 'newValue === "a"'
            }}}}, {
                fillUp: {_type: 'Test', a: 'a'},
                incremental: {_type: 'Test', a: 'a'},
                '': {_type: 'Test', a: 'a'}
            }],
            [[{_type: 'Test', a: 'a'}], {models: {Test: {a: {
                constraintExecution: 'return newValue === "a"'
            }}}}, {
                fillUp: {_type: 'Test', a: 'a'},
                incremental: {_type: 'Test', a: 'a'},
                '': {_type: 'Test', a: 'a'}
            }]
            // endregion
        ]) {
            const models:Models = Helper.extendModels(Tools.extendObject(
                true, {}, defaultModelSpecification, test[1]))
            const modelConfiguration:ModelConfiguration = Tools.extendObject(
                true, {}, defaultModelSpecification, test[1])
            delete modelConfiguration.default
            delete modelConfiguration.models
            assert.deepEqual(Helper.validateDocumentUpdate(...test[0].concat([
                null, {}, {}
            ].slice(test[0].length - 1)).concat([models, modelConfiguration])
            ), test[2][updateStrategy])
        }
        // endregion
    }
    // region migration writes
    const defaultModelSpecification:ModelConfiguration = Tools.extendObject(
        true, {}, configuration.modelConfiguration, {updateStrategy: 'migrate'}
    )
    for (const propertyName:string in defaultModelSpecification.models._base)
        if (
            defaultModelSpecification.models._base.hasOwnProperty(
                propertyName
            ) && propertyName !==
            configuration.modelConfiguration.specialPropertyNames.type
        )
            delete defaultModelSpecification.models._base[propertyName]
    for (const test:Array<any> of [
        [[{_type: 'Test', a: 2}], {models: {Test: {}}}, {_type: 'Test'}],
        [
            [{_type: 'Test', a: '2'}], {models: {Test: {a: {}}}},
            {_type: 'Test', a: '2'}
        ],
        [
            [{_type: 'Test'}, {_type: 'Test', a: 1}],
            {models: {Test: {a: {}}}}, {_type: 'Test'}
        ],
        [
            [{_type: 'Test', a: null}],
            {models: {Test: {a: {default: '2'}}}}, {_type: 'Test', a: '2'}
        ],
        [
            [{_type: 'Test', a: null}, {_type: 'Test', a: '1'}],
            {models: {Test: {a: {default: '2'}}}}, {_type: 'Test', a: '2'}
        ],
        [
            [{_type: 'Test'}, {_type: 'Test', a: '1'}],
            {models: {Test: {a: {default: '2'}}}}, {_type: 'Test', a: '2'}
        ],
        [
            [{_type: 'Test', b: '3'}, {_type: 'Test', a: '1'}],
            {models: {Test: {a: {default: '2'}}}}, {_type: 'Test', a: '2'}
        ]
    ]) {
        const models:Models = Helper.extendModels(Tools.extendObject(
            true, {}, defaultModelSpecification, test[1]))
        const modelConfiguration:ModelConfiguration = Tools.extendObject(
            true, {}, defaultModelSpecification, test[1])
        delete modelConfiguration.default
        delete modelConfiguration.models
        assert.deepEqual(Helper.validateDocumentUpdate(...test[0].concat([
            null, {}, {}
        ].slice(test[0].length - 1)).concat([models, modelConfiguration])
        ), test[2])
    }
    // endregion
})
// / endregion
// endregion
// region vim modline
// vim: set tabstop=4 shiftwidth=4 expandtab:
// vim: foldmethod=marker foldmarker=region,endregion:
// endregion
