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

import DatabaseHelper from '../databaseHelper'
import Helper from '../helper'
import type {
    DatabaseForbiddenError, ModelConfiguration, Models, UpdateStrategy
} from '../type'
// endregion
QUnit.module('databaseHelper')
QUnit.load()
// region tests
QUnit.test('authenticate', (assert:Object):void => {
    for (const test:Array<any> of [
        [{}],
        [{}, null, {roles: []}],
        [{type: 'Test'}, {}, {roles: []}, {}, {Test: ['users']}, 'type'],
        [{type: 'Test'}, {}, {roles: ['users']}, {}, {Test: []}, 'type']
    ])
        assert.throws(():?true => DatabaseHelper.authenticate(...test))
    for (const test:Array<any> of [
        [{}, null, {roles: ['_admin']}],
        [{}, {}, {roles: ['_admin']}, {}, {}, 'type'],
        [{type: 'Test'}, {}, {roles: ['users']}, {}, {Test: 'users'}, 'type'],
        [{type: 'Test'}, {}, {roles: ['users']}, {}, {Test: ['users']}, 'type']
    ])
        assert.ok(DatabaseHelper.authenticate(...test))
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
            [[{'-type': 'Test', _rev: 'latest'}, null], 'Revision'],
            [[{'-type': 'Test', _rev: 'latest'}, {}], 'Revision'],
            [
                [{'-type': 'Test', _rev: 'latest'}, {'-type': 'Test'}],
                'Revision'
            ],
            // endregion
            // region model
            [[{}, {}], 'Type'],
            [[{'-type': 'test'}], 'Model'],
            // endregion
            // region hooks
            // / region on create
            [[{'-type': 'Test', a: ''}], {models: {Test: {a: {
                onCreateExpression: '+'
            }}}}, 'Compilation'],
            [[{'-type': 'Test', a: ''}], {models: {Test: {a: {
                onCreateExecution: 'return +'
            }}}}, 'Compilation'],
            [[{'-type': 'Test', a: ''}], {models: {Test: {a: {
                onCreateExpression: 'undefinedVariableName'
            }}}}, 'Runtime'],
            [[{'-type': 'Test', a: ''}], {models: {Test: {a: {
                onCreateExecution: 'return undefinedVariableName'
            }}}}, 'Runtime'],
            // / endregion
            // / region on update
            [[{'-type': 'Test', a: ''}], {models: {Test: {a: {
                onUpdateExpression: '+'
            }}}}, 'Compilation'],
            [[{'-type': 'Test', a: ''}], {models: {Test: {a: {
                onUpdateExecution: 'return +'
            }}}}, 'Compilation'],
            [[{'-type': 'Test', a: ''}], {models: {Test: {a: {
                onUpdateExpression: 'undefinedVariableName'
            }}}}, 'Runtime'],
            [[{'-type': 'Test', a: ''}], {models: {Test: {a: {
                onUpdateExecution: 'return undefinedVariableName'
            }}}}, 'Runtime'],
            // / endregion
            // endregion
            // region property writable/mutable
            [
                [{'-type': 'Test', a: 'b'}, {'-type': 'Test'}],
                {models: {Test: {a: {writable: false}}}}, 'Readonly'
            ],
            [
                [{'-type': 'Test', a: 'b'}, {'-type': 'Test', a: 'a'}],
                {models: {Test: {a: {writable: false}}}}, 'Readonly'
            ],
            // endregion
            // region property existents
            [[{'-type': 'Test', a: 2}], {models: {Test: {}}}, 'Property'],
            [
                [{'-type': 'Test', a: null}],
                {models: {Test: {a: {nullable: false}}}}, 'NotNull'
            ],
            [
                [{'-type': 'Test'}], {models: {Test: {a: {nullable: false}}}},
                'MissingProperty'
            ],
            // endregion
            // region property type
            [
                [{'-type': 'Test', a: 2}], {models: {Test: {a: {}}}},
                'PropertyType'
            ],
            [
                [{'-type': 'Test', a: 'b'}],
                {models: {Test: {a: {type: 'number'}}}}, 'PropertyType'
            ],
            [
                [{'-type': 'Test', a: 1}],
                {models: {Test: {a: {type: 'boolean'}}}}, 'PropertyType'
            ],
            [
                [{'-type': 'Test', a: 'a'}],
                {models: {Test: {a: {type: 'DateTime'}}}}, 'PropertyType'
            ],
            // / region array
            // // region type
            [
                [{'-type': 'Test', a: 2}],
                {models: {Test: {a: {type: 'string[]'}}}}, 'PropertyType'
            ],
            [
                [{'-type': 'Test', a: [2]}],
                {models: {Test: {a: {type: 'string[]'}}}}, 'PropertyType'
            ],
            [
                [{'-type': 'Test', a: ['b']}],
                {models: {Test: {a: {type: 'number[]'}}}}, 'PropertyType'
            ],
            [
                [{'-type': 'Test', a: [1]}],
                {models: {Test: {a: {type: 'boolean[]'}}}}, 'PropertyType'
            ],
            [
                [{'-type': 'Test', a: [1]}],
                {models: {Test: {a: {type: 'DateTime'}}}}, 'PropertyType'
            ],
            [
                [{'-type': 'Test', a: ['a']}],
                {models: {Test: {a: {type: 'DateTime[]'}}}}, 'PropertyType'
            ],
            // // endregion
            [
                [{'-type': 'Test', a: [{'-type': 'Test', b: 2}]}],
                {models: {Test: {a: {type: 'Test[]'}}}}, 'Property'
            ],
            [
                [{'-type': 'Test', a: [{'-type': 'Test', b: null}], b: 'a'}],
                {models: {Test: {a: {type: 'Test[]'}, b: {nullable: false}}}},
                'NotNull'
            ],
            [
                [
                    {'-type': 'Test', a: [{'-type': 'Test', b: 'a'}]},
                    {'-type': 'Test', a: [{'-type': 'Test', b: 'b'}]}
                ], {models: {
                    Test: {a: {type: 'Test[]', writable: false},
                    b: {}}
                }}, 'Readonly'
            ],
            [
                [{'-type': 'Test', a: [4], b: [{'-type': 'Test', a: [2]}]}],
                {models: {Test: {
                    a: {type: 'number[]', minimum: 3},
                    b: {type: 'Test[]'}
                }}}, 'Minimum'
            ],
            // / endregion
            // / region nested property
            // // region property type
            [
                [{'-type': 'Test', a: 1}],
                {models: {Test: {a: {type: 'Test'}}}}, 'NestedModel'
            ],
            [
                [{'-type': 'Test', a: null}],
                {models: {Test: {a: {type: 'Test', nullable: false}}}},
                'NotNull'
            ],
            [
                [{'-type': 'Test', a: {}}],
                {models: {Test: {a: {type: 'Test'}}}}, 'Type'
            ],
            [
                [{'-type': 'Test', a: {'-type': 'Test', b: 2}, b: 'a'}],
                {models: {Test: {a: {type: 'Test'}, b: {}}}}, 'PropertyType'
            ],
            // // endregion
            // // region property existents
            [
                [{'-type': 'Test', a: {'-type': 'Test', b: 2}}],
                {models: {Test: {a: {type: 'Test'}}}}, 'Property'
            ],
            [
                [{'-type': 'Test', a: {'-type': 'Test', b: null}, b: 'a'}],
                {models: {Test: {a: {type: 'Test'}, b: {nullable: false}}}},
                'NotNull'
            ],
            [
                [{'-type': 'Test', a: {'-type': 'Test'}, b: 'a'}],
                {models: {Test: {a: {type: 'Test'}, b: {nullable: false}}}},
                'MissingProperty'
            ],
            // // endregion
            // // region property readonly
            [
                [
                    {'-type': 'Test', a: {'-type': 'Test', b: 'a'}},
                    {'-type': 'Test', a: {'-type': 'Test', b: 'b'}}
                ], {models: {Test: {a: {type: 'Test'}, b: {writable: false}}}},
                'Readonly'
            ],
            [
                [
                    {'-type': 'Test', a: {'-type': 'Test', b: 'a'}},
                    {'-type': 'Test', a: {'-type': 'Test', b: 'b'}}
                ], {models: {Test: {a: {type: 'Test'}, b: {mutable: false}}}},
                'Immutable'
            ],
            [
                [
                    {'-type': 'Test', a: {'-type': 'Test', b: 'a'}},
                    {'-type': 'Test', a: {'-type': 'Test'}}
                ], {models: {Test: {a: {type: 'Test'}, b: {writable: false}}}},
                'Readonly'
            ],
            [
                [
                    {'-type': 'Test', a: {'-type': 'Test', b: 'a'}},
                    {'-type': 'Test', a: {'-type': 'Test', b: 'b'}}, {}, {}
                ],
                {models: {Test: {a: {type: 'Test', writable: false}, b: {}}}},
                'Readonly'
            ],
            // // endregion
            // // region property range
            [
                [{'-type': 'Test', a: 4, b: {'-type': 'Test', a: 2}}],
                {models: {Test: {
                    a: {type: 'number', minimum: 3}, b: {type: 'Test'}
                }}}, 'Minimum'
            ],
            [
                [{'-type': 'Test', a: '1', b: {'-type': 'Test', a: '12'}}],
                {models: {Test: {a: {maximum: 1}, b: {type: 'Test'}}}},
                'MaximalLength'
            ],
            // // endregion
            // // region property pattern
            [
                [{'-type': 'Test', b: {'-type': 'Test', a: 'b'}}],
                {models: {Test: {
                    a: {regularExpressionPattern: 'a'},
                    b: {type: 'Test'}
                }}}, 'PatternMatch'
            ],
            // // endregion
            // // region property constraint
            [
                [{'-type': 'Test', a: 'b', b: {'-type': 'Test', a: 'a'}}],
                {models: {Test: {
                    a: {constraintExpression: 'newValue === "b"'},
                    b: {type: 'Test'}
                }}}, 'ConstraintExpression'
            ],
            // // endregion
            // / endregion
            [
                [{'-type': 'Test', a: 1}], {models: {Test: {a: {type: 2}}}},
                'PropertyType'
            ],
            // endregion
            // region property range
            [
                [{'-type': 'Test', a: 2}],
                {models: {Test: {a: {type: 'number', minimum: 3}}}}, 'Minimum'
            ],
            [
                [{'-type': 'Test', a: 2}],
                {models: {Test: {a: {type: 'number', maximum: 1}}}}, 'Maximum'
            ],
            [
                [{'-type': 'Test', a: '12'}],
                {models: {Test: {a: {minimum: 3}}}}, 'MinimalLength'
            ],
            [
                [{'-type': 'Test', a: '12'}],
                {models: {Test: {a: {maximum: 1}}}}, 'MaximalLength'
            ],
            // endregion
            // region selection
            [
                [{'-type': 'Test', a: 2}],
                {models: {Test: {a: {type: 'number', selection: []}}}},
                'Selection'
            ],
            [
                [{'-type': 'Test', a: 2}],
                {models: {Test: {a: {type: 'number', selection: [1]}}}},
                'Selection'
            ],
            [
                [{'-type': 'Test', a: 2}],
                {models: {Test: {a: {type: 'number', selection: [1, 3]}}}},
                'Selection'
            ],
            // endregion
            // region property pattern
            [
                [{'-type': 'Test', a: 'b'}],
                {models: {Test: {a: {regularExpressionPattern: 'a'}}}},
                'PatternMatch'
            ],
            // endregion
            // region property constraint
            [
                [{'-type': 'Test', a: 'b'}],
                {models: {Test: {a: {constraintExpression: 'false'}}}},
                'ConstraintExpression'
            ],
            [
                [{'-type': 'Test', a: 'b'}],
                {models: {Test: {a: {constraintExecution: 'false'}}}},
                'ConstraintExecution'
            ],
            [
                [{'-type': 'Test', a: 'b'}],
                {models: {Test: {a: {constraintExpression: '+'}}}},
                'Compilation'
            ],
            [
                [{'-type': 'Test', a: 'b'}], {models: {Test: {a: {
                    constraintExpression: 'undefinedVariableName'
                }}}}, 'Runtime'
            ],
            [
                [{'-type': 'Test', a: 'b'}], {models: {Test: {a: {
                    constraintExecution: 'return undefinedVariableName'
                }}}}, 'Runtime'
            ],
            [[{'-type': 'Test', a: 'b'}], {models: {Test: {a: {
                constraintExpression: 'newValue === "a"'
            }}}}, 'ConstraintExpression'],
            // endregion
            // region attachments
            [
                [{'-type': 'Test', _attachments: {}}], {models: {Test: {}}},
                'Property'
            ],
            [
                [{'-type': 'Test'}],
                {models: {Test: {_attachments: {
                    minimum: 1, nullable: false
                }}}}, 'MissingProperty'
            ],
            [
                [{'-type': 'Test', _attachments: null}],
                {models: {Test: {_attachments: {
                    minimum: 1, nullable: false
                }}}}, 'NotNull'
            ],
            [
                [{'-type': 'Test', _attachments: {
                    a: {data: '', content_type: 'text/plain'},
                    b: {data: '', content_type: 'text/plain'}
                }}],
                {models: {Test: {_attachments: {maximum: 1}}}},
                'AttachmentMaximum'
            ],
            [
                [{'-type': 'Test', _attachments: {}}],
                {models: {Test: {_attachments: {
                    minimum: 1, nullable: false
                }}}}, 'AttachmentMinimum'
            ],
            [
                [{'-type': 'Test', _attachments: {test: {
                    data: '', content_type: 'text/plain'
                }}}],
                {models: {Test: {_attachments: {minimum: 2}}}},
                'AttachmentMinimum'
            ],
            [
                [{'-type': 'Test', _attachments: {a: {
                    data: '', content_type: 'text/plain'
                }}}],
                {models: {Test: {_attachments: {
                    regularExpressionPattern: /b/g
                }}}}, 'AttachmentName'
            ],
            [
                [{'-type': 'Test', _attachments: {
                    a: {data: '', content_type: 'text/plain'},
                    b: {data: '', content_type: 'text/plain'}
                }}],
                {models: {Test: {_attachments: {
                    regularExpressionPattern: /a/
                }}}}, 'AttachmentName'
            ],
            [
                [{'-type': 'Test', _attachments: {
                    a: {data: '', content_type: 'text/plain'},
                    b: {data: '', content_type: 'image/jpg'}
                }}],
                {models: {Test: {_attachments: {
                    contentTypeRegularExpressionPattern: /text\/plain/
                }}}}, 'AttachmentContentType'
            ]
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
            assert.throws(():Object => DatabaseHelper.validateDocumentUpdate(
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
            [[{'-type': 'Test', _rev: 'latest'}, {'-type': 'Test', _rev: 1}], {
                models: {Test: {}}
            }, {
                fillUp: {'-type': 'Test', _rev: 1},
                incremental: {},
                '': {'-type': 'Test', _rev: 1}
            }],
            // endregion
            // region model
            [[{'-type': 'Test'}], {models: {Test: {}}}, {
                fillUp: {'-type': 'Test'},
                incremental: {'-type': 'Test'},
                '': {'-type': 'Test'}
            }],
            [[{'-type': 'Test'}], {models: {Test: {}}}, {
                fillUp: {'-type': 'Test'},
                incremental: {'-type': 'Test'},
                '': {'-type': 'Test'}
            }],
            [[{'-type': 'Test'}], {models: {Test: {class: {}}}}, {
                fillUp: {'-type': 'Test'},
                incremental: {'-type': 'Test'},
                '': {'-type': 'Test'}
            }],
            [[{'-type': 'Test'}, {'-type': 'Test', a: '2'}], {
                models: {Test: {a: {}}}
            }, {
                fillUp: {'-type': 'Test', a: '2'},
                incremental: {},
                '': {'-type': 'Test'}
            }],
            [[{'-type': 'Test', a: '2'}, {'-type': 'Test', a: '2'}], {
                models: {Test: {a: {}}}
            }, {
                fillUp: {'-type': 'Test', a: '2'},
                incremental: {},
                '': {'-type': 'Test', a: '2'}
            }],
            [[{'-type': 'Test', a: '3'}, {'-type': 'Test', a: '2'}], {
                models: {Test: {a: {}}}}, {
                    fillUp: {a: '3', '-type': 'Test'},
                    incremental: {a: '3'},
                    '': {'-type': 'Test', a: '3'}
                }
            ],
            // endregion
            // region hooks
            // / region on create
            [[{'-type': 'Test', a: ''}], {models: {Test: {a: {
                onCreateExpression: `'2'`
            }}}}, {
                fillUp: {'-type': 'Test', a: '2'},
                incremental: {'-type': 'Test', a: '2'},
                '': {'-type': 'Test', a: '2'}
            }],
            [[{'-type': 'Test', a: ''}], {models: {Test: {a: {
                onCreateExecution: `return '2'`
            }}}}, {
                fillUp: {'-type': 'Test', a: '2'},
                incremental: {'-type': 'Test', a: '2'},
                '': {'-type': 'Test', a: '2'}
            }],
            [[{'-type': 'Test', a: ''}, {'-type': 'Test', a: ''}], {models: {
                Test: {a: {onCreateExecution: `return '2'`}}
            }}, {
                fillUp: {'-type': 'Test', a: ''},
                incremental: {},
                '': {'-type': 'Test', a: ''}
            }],
            // / endregion
            // / region on update
            [[{'-type': 'Test', a: ''}], {models: {Test: {a: {
                onUpdateExpression: `'2'`
            }}}}, {
                fillUp: {'-type': 'Test', a: '2'},
                incremental: {'-type': 'Test', a: '2'},
                '': {'-type': 'Test', a: '2'}
            }],
            [[{'-type': 'Test', a: ''}], {models: {Test: {a: {
                onUpdateExecution: `return '2'`
            }}}}, {
                fillUp: {'-type': 'Test', a: '2'},
                incremental: {'-type': 'Test', a: '2'},
                '': {'-type': 'Test', a: '2'}
            }],
            [[{'-type': 'Test', a: '1'}, {'-type': 'Test', a: '2'}], {models: {
                Test: {a: {onUpdateExpression: `'2'`
            }}}}, {
                fillUp: {'-type': 'Test', a: '2'},
                incremental: {},
                '': {'-type': 'Test', a: '2'}
            }],
            // / endregion
            // endregion
            // region property writable/mutable
            [[{'-type': 'Test', a: 'b'}, {'-type': 'Test', a: 'b'}], {models: {
                Test: {a: {writable: false}}
            }}, {
                fillUp: {'-type': 'Test', a: 'b'},
                incremental: {},
                '': {'-type': 'Test', a: 'b'}
            }],
            [[{'-type': 'Test'}, {'-type': 'Test'}], {models: {Test: {a: {
                writable: false
            }}}}, {
                fillUp: {'-type': 'Test'},
                incremental: {},
                '': {'-type': 'Test'}
            }],
            [[{'-type': 'Test', a: '2'}, {'-type': 'Test'}], {models: {Test: {a: {
                mutable: false
            }}}}, {
                fillUp: {'-type': 'Test', a: '2'},
                incremental: {a: '2'},
                '': {'-type': 'Test', a: '2'}
            }],
            // endregion
            // region property existents
            [[{'-type': 'Test', a: 2}], {models: {Test: {a: {
                type: 'number'
            }}}}, {
                fillUp: {'-type': 'Test', a: 2},
                incremental: {'-type': 'Test', a: 2},
                '': {'-type': 'Test', a: 2}
            }],
            [[{'-type': 'Test', a: null}], {models: {Test: {a: {}}}}, {
                fillUp: {'-type': 'Test'},
                incremental: {'-type': 'Test'},
                '': {'-type': 'Test'}
            }],
            [[{'-type': 'Test', a: 'a'}], {models: {Test: {a: {
                nullable: false
            }}}}, {
                fillUp: {'-type': 'Test', a: 'a'},
                incremental: {'-type': 'Test', a: 'a'},
                '': {'-type': 'Test', a: 'a'}
            }],
            [[{'-type': 'Test'}, {'-type': 'Test', a: 'a'}], {models: {Test: {
                a: {nullable: false}
            }}}, {
                fillUp: {'-type': 'Test', a: 'a'},
                incremental: {},
                '': {'-type': 'Test'}
            }],
            [[{'-type': 'Test'}], {models: {Test: {a: {
                default: '2',
                nullable: false
            }}}}, {
                fillUp: {'-type': 'Test', a: '2'},
                incremental: {'-type': 'Test', a: '2'},
                '': {'-type': 'Test', a: '2'}
            }],
            // endregion
            // region property type
            [
                [{'-type': 'Test', a: '2'}, {'-type': 'Test', a: '2'}],
                {models: {Test: {a: {}}}}, {
                    fillUp: {'-type': 'Test', a: '2'},
                    incremental: {},
                    '': {'-type': 'Test', a: '2'}
                }
            ],
            [
                [{'-type': 'Test', a: 2}, {'-type': 'Test', a: 2}],
                {models: {Test: {a: {type: 'number'}}}}, {
                    fillUp: {'-type': 'Test', a: 2},
                    incremental: {},
                    '': {'-type': 'Test', a: 2}
                }
            ],
            [
                [{'-type': 'Test', a: true}, {'-type': 'Test', a: true}],
                {models: {Test: {a: {type: 'boolean'}}}}, {
                    fillUp: {'-type': 'Test', a: true},
                    incremental: {},
                    '': {'-type': 'Test', a: true}
                }
            ],
            [
                [{'-type': 'Test', a: 1}, {'-type': 'Test', a: 1}],
                {models: {Test: {a: {type: 'DateTime'}}}}, {
                    fillUp: {'-type': 'Test', a: 1},
                    incremental: {},
                    '': {'-type': 'Test', a: 1}
                }
            ],
            // / region array
            [
                [
                    {'-type': 'Test', a: ['2']},
                    {'-type': 'Test', a: ['2']}
                ],
                {models: {Test: {a: {type: 'string[]'}}}}, {
                    fillUp: {'-type': 'Test', a: ['2']},
                    incremental: {},
                    '': {'-type': 'Test', a: ['2']}
                }
            ],
            [
                [{'-type': 'Test', a: ['2']}, {'-type': 'Test'}],
                {models: {Test: {a: {type: 'string[]'}}}}, {
                    fillUp: {'-type': 'Test', a: ['2']},
                    incremental: {a: ['2']},
                    '': {'-type': 'Test', a: ['2']}
                }
            ],
            [
                [{'-type': 'Test', a: null}, {'-type': 'Test'}],
                {models: {Test: {a: {type: 'string[]'}}}}, {
                    fillUp: {'-type': 'Test'},
                    incremental: {},
                    '': {'-type': 'Test'}
                }
            ],
            [
                [{'-type': 'Test', a: [2]}, {'-type': 'Test'}],
                {models: {Test: {a: {type: 'number[]'}}}}, {
                    fillUp: {'-type': 'Test', a: [2]},
                    incremental: {a: [2]},
                    '': {'-type': 'Test', a: [2]}
                }
            ],
            [
                [{'-type': 'Test', a: [true]}, {'-type': 'Test'}],
                {models: {Test: {a: {type: 'boolean[]'}}}}, {
                    fillUp: {'-type': 'Test', a: [true]},
                    incremental: {a: [true]},
                    '': {'-type': 'Test', a: [true]}
                }
            ],
            [
                [{'-type': 'Test', a: [1]}, {'-type': 'Test'}],
                {models: {Test: {a: {type: 'DateTime[]'}}}}, {
                    fillUp: {'-type': 'Test', a: [1]},
                    incremental: {a: [1]},
                    '': {'-type': 'Test', a: [1]}
                }
            ],
            [
                [{'-type': 'Test', a: []}, {'-type': 'Test'}],
                {models: {Test: {a: {type: 'DateTime[]'}}}}, {
                    fillUp: {'-type': 'Test', a: []},
                    incremental: {a: []},
                    '': {'-type': 'Test', a: []}
                }
            ],
            [
                [{'-type': 'Test', a: [2]}, {'-type': 'Test'}],
                {models: {Test: {a: {type: 'DateTime[]', mutable: false}}}}, {
                    fillUp: {'-type': 'Test', a: [2]},
                    incremental: {a: [2]},
                    '': {'-type': 'Test', a: [2]}
                }
            ],
            [
                [{'-type': 'Test', a: [2, 1]}, {'-type': 'Test', a: [2]}],
                {models: {Test: {a: {type: 'number[]'}}}}, {
                    fillUp: {'-type': 'Test', a: [2, 1]},
                    incremental: {a: [2, 1]},
                    '': {'-type': 'Test', a: [2, 1]}
                }
            ],
            // / endregion
            // / region nested property
            // // region property type
            [
                [
                    {'-type': 'Test', a: {'-type': 'Test'}},
                    {'-type': 'Test', a: {'-type': 'Test'}}
                ], {models: {Test: {a: {type: 'Test'}}}}, {
                    fillUp: {'-type': 'Test', a: {'-type': 'Test'}},
                    incremental: {},
                    '': {'-type': 'Test', a: {'-type': 'Test'}}
                }
            ],
            [
                [{'-type': 'Test', a: null}, {'-type': 'Test'}],
                {models: {Test: {a: {type: 'Test'}}}}, {
                    fillUp: {'-type': 'Test'},
                    incremental: {},
                    '': {'-type': 'Test'}
                }
            ],
            [
                [
                    {'-type': 'Test', a: {'-type': 'Test', b: null}},
                    {'-type': 'Test', a: {'-type': 'Test'}}
                ], {models: {Test: {a: {type: 'Test'}, b: {}}}}, {
                    fillUp: {'-type': 'Test', a: {'-type': 'Test'}},
                    incremental: {},
                    '': {'-type': 'Test', a: {'-type': 'Test'}}
                }
            ],
            [
                [
                    {'-type': 'Test', a: {'-type': 'Test', b: '2'}},
                    {'-type': 'Test', a: {'-type': 'Test', b: '2'}}
                ], {models: {Test: {a: {type: 'Test'}, b: {}}}}, {
                    fillUp: {'-type': 'Test', a: {'-type': 'Test', b: '2'}},
                    incremental: {},
                    '': {'-type': 'Test', a: {'-type': 'Test', b: '2'}}
                }
            ],
            [
                [
                    {
                        '-type': 'Test',
                        a: {'-type': 'Test', b: 'a'},
                        b: '2'
                    },
                    {
                        '-type': 'Test',
                        a: {'-type': 'Test', b: 'a'},
                        b: '2'
                    }
                ], {models: {Test: {a: {type: 'Test'}, b: {}}}}, {
                    fillUp: {
                        '-type': 'Test',
                        a: {'-type': 'Test', b: 'a'},
                        b: '2'
                    },
                    incremental: {},
                    '': {
                        '-type': 'Test',
                        a: {'-type': 'Test', b: 'a'},
                        b: '2'
                    }
                }
            ],
            // // endregion
            // // region property existents
            [
                [
                    {'-type': 'Test', a: {'-type': 'Test'}},
                    {'-type': 'Test', a: {'-type': 'Test'}}
                ], {models: {Test: {a: {type: 'Test'}}}}, {
                    fillUp: {
                        '-type': 'Test',
                        a: {'-type': 'Test'}
                    },
                    incremental: {},
                    '': {
                        '-type': 'Test',
                        a: {'-type': 'Test'}
                    }
                }
            ],
            [
                [
                    {
                        '-type': 'Test',
                        a: {'-type': 'Test', b: null},
                        b: 'a'
                    },
                    {'-type': 'Test', a: {'-type': 'Test'}, b: 'a'}
                ], {models: {Test: {a: {type: 'Test'}, b: {}}}}, {
                    fillUp: {
                        '-type': 'Test',
                        a: {'-type': 'Test'},
                        b: 'a'
                    },
                    incremental: {},
                    '': {
                        '-type': 'Test',
                        a: {'-type': 'Test'},
                        b: 'a'
                    }
                }
            ],
            [
                [
                    {
                        '-type': 'Test',
                        a: {'-type': 'Test', b: '2'},
                        b: 'a'
                    },
                    {
                        '-type': 'Test',
                        a: {'-type': 'Test', b: '2'},
                        b: 'a'
                    }
                ], {models: {Test: {a: {type: 'Test'}, b: {nullable: false}}}},
                {
                    fillUp: {
                        '-type': 'Test',
                        a: {'-type': 'Test', b: '2'},
                        b: 'a'
                    },
                    incremental: {},
                    '': {
                        '-type': 'Test',
                        a: {'-type': 'Test', b: '2'},
                        b: 'a'
                    }
                }
            ],
            // // endregion
            // // region property readonly
            [
                [
                    {'-type': 'Test', a: {'-type': 'Test', b: 'b'}},
                    {'-type': 'Test', a: {'-type': 'Test', b: 'b'}}
                ], {models: {Test: {a: {type: 'Test'}, b: {writable: false}}}},
                {
                    fillUp: {
                        '-type': 'Test',
                        a: {'-type': 'Test', b: 'b'}
                    },
                    incremental: {},
                    '': {
                        '-type': 'Test',
                        a: {'-type': 'Test', b: 'b'}
                    }
                }
            ],
            [
                [
                    {'-type': 'Test', a: {'-type': 'Test', b: 'a'}},
                    {'-type': 'Test', a: {'-type': 'Test', b: 'a'}}
                ],
                {models: {Test: {a: {type: 'Test', writable: false}, b: {}}}},
                {
                    fillUp: {'-type': 'Test', a: {'-type': 'Test', b: 'a'}},
                    incremental: {},
                    '': {'-type': 'Test', a: {'-type': 'Test', b: 'a'}}
                }
            ],
            // // endregion
            // // region property range
            [

                [
                    {'-type': 'Test', a: 4, b: {'-type': 'Test', a: 3}},
                    {'-type': 'Test'}
                ], {models: {Test: {
                    a: {type: 'number', minimum: 3},
                    b: {type: 'Test'}
                }}}, {
                    fillUp: {'-type': 'Test', a: 4, b: {
                        '-type': 'Test', a: 3
                    }},
                    incremental: {a: 4, b: {'-type': 'Test', a: 3}},
                    '': {'-type': 'Test', a: 4, b: {'-type': 'Test', a: 3}}
                }
            ],
            [
                [{'-type': 'Test', a: '1', b: {'-type': 'Test', a: '1'}}],
                {models: {Test: {a: {maximum: 1}, b: {type: 'Test'}}}}, {
                    fillUp: {
                        '-type': 'Test',
                        a: '1',
                        b: {'-type': 'Test', a: '1'}
                    },
                    incremental: {
                        '-type': 'Test',
                        a: '1',
                        b: {'-type': 'Test', a: '1'}
                    },
                    '': {
                        '-type': 'Test',
                        a: '1',
                        b: {'-type': 'Test', a: '1'}
                    }
                }
            ],
            // // endregion
            // // region property pattern
            [
                [{'-type': 'Test', b: {'-type': 'Test', a: 'a'}}],
                {models: {Test: {
                    a: {regularExpressionPattern: 'a'},
                    b: {type: 'Test'}
                }}}, {
                    fillUp: {'-type': 'Test', b: {'-type': 'Test', a: 'a'}},
                    incremental: {'-type': 'Test', b: {
                        '-type': 'Test', a: 'a'
                    }},
                    '': {'-type': 'Test', b: {'-type': 'Test', a: 'a'}}
                }
            ],
            // // endregion
            // // region property constraint
            [[{'-type': 'Test', a: 'b', b: {'-type': 'Test', a: 'b'}}], {
                models: {Test: {
                    a: {constraintExpression: 'newValue === "b"'},
                    b: {type: 'Test'}
                }
            }}, {
                fillUp: {'-type': 'Test', a: 'b', b: {
                    '-type': 'Test', a: 'b'
                }},
                incremental: {
                    '-type': 'Test',
                    a: 'b',
                    b: {'-type': 'Test', a: 'b'}
                },
                '': {
                    '-type': 'Test',
                    a: 'b',
                    b: {'-type': 'Test', a: 'b'}
                }
            }
            ],
            // // endregion
            // / endregion
            [[{'-type': 'Test', a: 2}, {'-type': 'Test'}], {
                models: {Test: {a: {type: 2}}}}, {
                    fillUp: {'-type': 'Test', a: 2},
                    incremental: {a: 2},
                    '': {'-type': 'Test', a: 2}
                }
            ],
            // endregion
            // region property range
            [[{'-type': 'Test', a: 3}, {'-type': 'Test'}], {
                models: {Test: {a: {type: 'number', minimum: 3}}}}, {
                    fillUp: {'-type': 'Test', a: 3},
                    incremental: {a: 3},
                    '': {'-type': 'Test', a: 3}
                }
            ],
            [[{'-type': 'Test', a: 1}, {'-type': 'Test'}], {
                models: {Test: {a: {type: 'number', maximum: 1}}}}, {
                    fillUp: {'-type': 'Test', a: 1},
                    incremental: {a: 1},
                    '': {'-type': 'Test', a: 1}
                }
            ],
            [[{'-type': 'Test', a: '123'}, {'-type': 'Test'}], {
                models: {Test: {a: {minimum: 3}}}}, {
                    fillUp: {'-type': 'Test', a: '123'},
                    incremental: {a: '123'},
                    '': {'-type': 'Test', a: '123'}
                }
            ],
            [[{'-type': 'Test', a: '1'}], {
                models: {Test: {a: {maximum: 1}}}}, {
                    fillUp: {'-type': 'Test', a: '1'},
                    incremental: {'-type': 'Test', a: '1'},
                    '': {'-type': 'Test', a: '1'}
                }
            ],
            // endregion
            // region selection
            [
                [{'-type': 'Test', a: 2}], {models: {Test: {a: {
                    type: 'number', selection: [2]
                }}}}, {
                    fillUp: {'-type': 'Test', a: 2},
                    incremental: {'-type': 'Test', a: 2},
                    '': {'-type': 'Test', a: 2}
                }
            ],
            [
                [{'-type': 'Test', a: 2}], {models: {Test: {a: {
                    type: 'number', selection: [1, 2]
                }}}}, {
                    fillUp: {'-type': 'Test', a: 2},
                    incremental: {'-type': 'Test', a: 2},
                    '': {'-type': 'Test', a: 2}
                }
            ],
            // endregion
            // region property pattern
            [[{'-type': 'Test', a: 'a'}], {
                models: {Test: {a: {regularExpressionPattern: 'a'}}}
            }, {
                fillUp: {'-type': 'Test', a: 'a'},
                incremental: {'-type': 'Test', a: 'a'},
                '': {'-type': 'Test', a: 'a'}
            }],
            // endregion
            // region property constraint
            [[{'-type': 'Test', a: 'b'}], {models: {Test: {a: {
                constraintExpression: 'true'
            }}}}, {
                fillUp: {'-type': 'Test', a: 'b'},
                incremental: {'-type': 'Test', a: 'b'},
                '': {'-type': 'Test', a: 'b'}
            }],
            [[{'-type': 'Test', a: 'a'}], {models: {Test: {a: {
                constraintExpression: 'newValue === "a"'
            }}}}, {
                fillUp: {'-type': 'Test', a: 'a'},
                incremental: {'-type': 'Test', a: 'a'},
                '': {'-type': 'Test', a: 'a'}
            }],
            [[{'-type': 'Test', a: 'a'}], {models: {Test: {a: {
                constraintExecution: 'return newValue === "a"'
            }}}}, {
                fillUp: {'-type': 'Test', a: 'a'},
                incremental: {'-type': 'Test', a: 'a'},
                '': {'-type': 'Test', a: 'a'}
            }],
            // endregion
            // region attachments
            [[{'-type': 'Test'}], {models: {Test: {_attachments: {
                minimum: 1
            }}}}, {
                fillUp: {'-type': 'Test'},
                incremental: {'-type': 'Test'},
                '': {'-type': 'Test'}
            }],
            [[{'-type': 'Test', _attachments: {test: {
                data: '', content_type: 'text/plain'
            }}}], {models: {Test: {_attachments: {maximum: 1}}}}, {
                fillUp: {'-type': 'Test', _attachments: {test: {
                    content_type: 'text/plain', data: ''
                }}},
                incremental: {'-type': 'Test', _attachments: {test: {
                    content_type: 'text/plain', data: ''
                }}},
                '': {'-type': 'Test', _attachments: {test: {
                    content_type: 'text/plain', data: ''
                }}}
            }],
            [[{'-type': 'Test', _attachments: {
                a: {data: '', content_type: 'text/plain'},
                b: {data: '', content_type: 'text/plain'}
            }}], {models: {Test: {_attachments: {maximum: 2, minimum: 2}}}}, {
                fillUp: {'-type': 'Test', _attachments: {
                    a: {data: '', content_type: 'text/plain'},
                    b: {data: '', content_type: 'text/plain'}
                }},
                incremental: {'-type': 'Test', _attachments: {
                    a: {data: '', content_type: 'text/plain'},
                    b: {data: '', content_type: 'text/plain'}
                }},
                '': {'-type': 'Test', _attachments: {
                    a: {data: '', content_type: 'text/plain'},
                    b: {data: '', content_type: 'text/plain'}
                }}
            }],
            [[{'-type': 'Test', _attachments: {
                a: {data: '', content_type: 'text/plain'},
                b: {data: '', content_type: 'text/plain'}
            }}], {models: {Test: {_attachments: {
                maximum: 2, regularExpressionPattern: 'a|b'
            }}}}, {
                fillUp: {'-type': 'Test', _attachments: {
                    a: {data: '', content_type: 'text/plain'},
                    b: {data: '', content_type: 'text/plain'}
                }},
                incremental: {'-type': 'Test', _attachments: {
                    a: {data: '', content_type: 'text/plain'},
                    b: {data: '', content_type: 'text/plain'}
                }},
                '': {'-type': 'Test', _attachments: {
                    a: {data: '', content_type: 'text/plain'},
                    b: {data: '', content_type: 'text/plain'}
                }}
            }],
            [[{'-type': 'Test', _attachments: {
                a: {data: '', content_type: 'image/png'},
                b: {data: '', content_type: 'image/jpeg'}
            }}], {models: {Test: {_attachments: {
                contentTypeRegularExpressionPattern: /image\/.+/,
                regularExpressionPattern: 'a|b'
            }}}}, {
                fillUp: {'-type': 'Test', _attachments: {
                    a: {data: '', content_type: 'image/png'},
                    b: {data: '', content_type: 'image/jpeg'}
                }},
                incremental: {'-type': 'Test', _attachments: {
                    a: {data: '', content_type: 'image/png'},
                    b: {data: '', content_type: 'image/jpeg'}
                }},
                '': {'-type': 'Test', _attachments: {
                    a: {data: '', content_type: 'image/png'},
                    b: {data: '', content_type: 'image/jpeg'}
                }}
            }],
            [[{'-type': 'Test', _attachments: {
                a: {data: '', content_type: 'image/png'}
            }}, {'-type': 'Test', _attachments: {
                b: {data: '', content_type: 'image/jpeg'}
            }}], {models: {Test: {_attachments: {}}}}, {
                fillUp: {'-type': 'Test', _attachments: {
                    a: {data: '', content_type: 'image/png'},
                    b: {data: '', content_type: 'image/jpeg'}
                }},
                incremental: {_attachments: {
                    a: {data: '', content_type: 'image/png'}
                }},
                '': {'-type': 'Test', _attachments: {
                    a: {data: '', content_type: 'image/png'}
                }}
            }],
            [[{'-type': 'Test', _attachments: {a: null}}, {
                '-type': 'Test', _attachments: {a: {
                    data: '', content_type: 'image/jpeg'
                }}
            }], {models: {Test: {_attachments: {}}}}, {
                fillUp: {'-type': 'Test'},
                incremental: {},
                '': {'-type': 'Test'}
            }],
            [[{'-type': 'Test'}, {'-type': 'Test', _attachments: {a: {
                data: '', content_type: 'image/jpeg'
            }}}], {models: {Test: {_attachments: {}}}}, {
                fillUp: {'-type': 'Test', _attachments: {a: {
                    data: '', content_type: 'image/jpeg'
                }}},
                incremental: {},
                '': {'-type': 'Test'}
            }]
            // endregion
        ]) {
            const models:Models = Helper.extendModels(Tools.extendObject(
                true, {}, defaultModelSpecification, test[1]))
            const modelConfiguration:ModelConfiguration = Tools.extendObject(
                true, {}, defaultModelSpecification, test[1])
            delete modelConfiguration.default
            delete modelConfiguration.models
            assert.deepEqual(DatabaseHelper.validateDocumentUpdate(
                ...test[0].concat([null, {}, {}].slice(
                    test[0].length - 1)).concat([models, modelConfiguration])
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
        [[{'-type': 'Test', a: 2}], {models: {Test: {}}}, {'-type': 'Test'}],
        [
            [{'-type': 'Test', a: '2'}], {models: {Test: {a: {}}}},
            {'-type': 'Test', a: '2'}
        ],
        [
            [{'-type': 'Test'}, {'-type': 'Test', a: 1}],
            {models: {Test: {a: {}}}}, {'-type': 'Test'}
        ],
        [
            [{'-type': 'Test', a: null}],
            {models: {Test: {a: {default: '2'}}}}, {'-type': 'Test', a: '2'}
        ],
        [
            [{'-type': 'Test', a: null}, {'-type': 'Test', a: '1'}],
            {models: {Test: {a: {default: '2'}}}}, {'-type': 'Test', a: '2'}
        ],
        [
            [{'-type': 'Test'}, {'-type': 'Test', a: '1'}],
            {models: {Test: {a: {default: '2'}}}}, {'-type': 'Test', a: '2'}
        ],
        [
            [{'-type': 'Test', b: '3'}, {'-type': 'Test', a: '1'}],
            {models: {Test: {a: {default: '2'}}}}, {'-type': 'Test', a: '2'}
        ]
    ]) {
        const models:Models = Helper.extendModels(Tools.extendObject(
            true, {}, defaultModelSpecification, test[1]))
        const modelConfiguration:ModelConfiguration = Tools.extendObject(
            true, {}, defaultModelSpecification, test[1])
        delete modelConfiguration.default
        delete modelConfiguration.models
        assert.deepEqual(DatabaseHelper.validateDocumentUpdate(
            ...test[0].concat([null, {}, {}].slice(
                test[0].length - 1
            )).concat([models, modelConfiguration])), test[2])
    }
    // endregion
})
// endregion
// region vim modline
// vim: set tabstop=4 shiftwidth=4 expandtab:
// vim: foldmethod=marker foldmarker=region,endregion:
// endregion