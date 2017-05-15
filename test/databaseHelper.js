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
import registerTest from 'clientnode/test'
// NOTE: Only needed for debugging this file.
try {
    require('source-map-support/register')
} catch (error) {}
import configuration from 'web-node/configurator'

import DatabaseHelper from '../databaseHelper'
import Helper from '../helper'
import type {
    DatabaseForbiddenError, ModelConfiguration, Models, UpdateStrategy
} from '../type'
// endregion
registerTest(async function():Promise<void> {
    this.module('databaseHelper')
    // region tests
    this.test('authenticate', (assert:Object):void => {
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
            [
                {type: 'Test'}, {}, {roles: ['users']}, {}, {Test: 'users'},
                'type'
            ],
            [
                {type: 'Test'}, {}, {roles: ['users']}, {}, {Test: ['users']},
                'type'
            ]
        ])
            assert.ok(DatabaseHelper.authenticate(...test))
    })
    this.test('validateDocumentUpdate', (assert:Object):void => {
        const attachmentName:string =
            configuration.database.model.property.name.special.attachment
        const idName:string =
            configuration.database.model.property.name.special.id
        const revisionName:string =
            configuration.database.model.property.name.special.revision
        for (const updateStrategy:UpdateStrategy of [
            '', 'fillUp', 'incremental'
        ]) {
            const defaultModelConfiguration:ModelConfiguration =
                Tools.extendObject(true, {}, configuration.database.model, {
                    updateStrategy})
            for (
                const propertyName:string in
                defaultModelConfiguration.entities._base
            )
                if (defaultModelConfiguration.entities._base.hasOwnProperty(
                    propertyName
                ) && propertyName !== configuration.database.model.property
                    .name.special.type
                )
                    delete defaultModelConfiguration.entities._base[
                        propertyName]
            // region forbidden writes
            for (const test:Array<any> of [
                // region general environment
                [
                    [{'-type': 'Test', [revisionName]: 'latest'}, null],
                    'Revision'
                ],
                [
                    [{'-type': 'Test', [revisionName]: 'latest'}, {}],
                    'Revision'
                ],
                [
                    [
                        {'-type': 'Test', [revisionName]: 'latest'},
                        {'-type': 'Test'}
                    ],
                    'Revision'
                ],
                // endregion
                // region model
                [[{}, {}], 'Type'],
                [[{'-type': 'test'}], 'TypeName'],
                [[{'-type': '_test'}], 'TypeName'],
                [[{'-type': 'Test'}], 'Model'],
                // endregion
                // region hooks
                // / region on create
                [[{'-type': 'Test', a: ''}], {entities: {Test: {a: {
                    onCreateExpression: '+'
                }}}}, 'Compilation'],
                [[{'-type': 'Test', a: ''}], {entities: {Test: {a: {
                    onCreateExecution: 'return +'
                }}}}, 'Compilation'],
                [[{'-type': 'Test', a: ''}], {entities: {Test: {a: {
                    onCreateExpression: 'undefinedVariableName'
                }}}}, 'Runtime'],
                [[{'-type': 'Test', a: ''}], {entities: {Test: {a: {
                    onCreateExecution: 'return undefinedVariableName'
                }}}}, 'Runtime'],
                // / endregion
                // / region on update
                [[{'-type': 'Test', a: ''}], {entities: {Test: {a: {
                    onUpdateExpression: '+'
                }}}}, 'Compilation'],
                [[{'-type': 'Test', a: ''}], {entities: {Test: {a: {
                    onUpdateExecution: 'return +'
                }}}}, 'Compilation'],
                [[{'-type': 'Test', a: ''}], {entities: {Test: {a: {
                    onUpdateExpression: 'undefinedVariableName'
                }}}}, 'Runtime'],
                [[{'-type': 'Test', a: ''}], {entities: {Test: {a: {
                    onUpdateExecution: 'return undefinedVariableName'
                }}}}, 'Runtime'],
                // / endregion
                // endregion
                // region property writable/mutable
                [
                    [{'-type': 'Test', a: 'b'}, {'-type': 'Test'}],
                    {entities: {Test: {a: {writable: false}}}}, 'Readonly'
                ],
                [
                    [{'-type': 'Test', a: 'b'}, {'-type': 'Test', a: 'a'}],
                    {entities: {Test: {a: {writable: false}}}}, 'Readonly'
                ],
                // endregion
                // region property existents
                [
                    [{'-type': 'Test', a: 2}], {entities: {Test: {}}},
                    'Property'
                ],
                [
                    [{'-type': 'Test', _constraintExpressions: null}],
                    {entities: {Test: {}}}, 'Invalid'
                ],
                [
                    [{'-type': 'Test', a: null}],
                    {entities: {Test: {a: {nullable: false}}}}, 'NotNull'
                ],
                [
                    [{'-type': 'Test'}],
                    {entities: {Test: {a: {nullable: false}}}},
                    'MissingProperty'
                ],
                // endregion
                // region property type
                [
                    [{'-type': 'Test', a: 2}], {entities: {Test: {a: {}}}},
                    'PropertyType'
                ],
                [
                    [{'-type': 'Test', a: 'b'}],
                    {entities: {Test: {a: {type: 'number'}}}}, 'PropertyType'
                ],
                [
                    [{'-type': 'Test', a: 'b'}],
                    {entities: {Test: {a: {type: 'integer'}}}}, 'PropertyType'
                ],
                [
                    [{'-type': 'Test', a: 2.2}],
                    {entities: {Test: {a: {type: 'integer'}}}}, 'PropertyType'
                ],
                [
                    [{'-type': 'Test', a: 1}],
                    {entities: {Test: {a: {type: 'boolean'}}}}, 'PropertyType'
                ],
                [
                    [{'-type': 'Test', a: 'a'}],
                    {entities: {Test: {a: {type: 'DateTime'}}}}, 'PropertyType'
                ],
                // / region array
                // // region type
                [
                    [{'-type': 'Test', a: 2}],
                    {entities: {Test: {a: {type: 'string[]'}}}}, 'PropertyType'
                ],
                [
                    [{'-type': 'Test', a: [2]}],
                    {entities: {Test: {a: {type: 'string[]'}}}}, 'PropertyType'
                ],
                [
                    [{'-type': 'Test', a: ['b']}],
                    {entities: {Test: {a: {type: 'number[]'}}}}, 'PropertyType'
                ],
                [
                    [{'-type': 'Test', a: [1]}],
                    {entities: {Test: {a: {type: 'boolean[]'}}}},
                    'PropertyType'
                ],
                [
                    [{'-type': 'Test', a: '[1]'}],
                    {entities: {Test: {a: {type: 'DateTime'}}}}, 'PropertyType'
                ],
                [
                    [{'-type': 'Test', a: '["a"]'}],
                    {entities: {Test: {a: {type: 'DateTime[]'}}}},
                    'PropertyType'
                ],
                [
                    [{'-type': 'Test', a: [{'-type': 'Test'}]}],
                    {entities: {Test: {a: {type: 'Custom[]'}}}}, 'PropertyType'
                ],
                [
                    [{'-type': 'Test', a: [{'-type': 'Custom'}, {
                        '-type': 'Test'
                    }]}],
                    {entities: {Test: {a: {type: 'Custom[]'}}}}, 'PropertyType'
                ],
                // // endregion
                [
                    [{'-type': 'Test', a: [{'-type': 'Test', b: 2}]}],
                    {entities: {Test: {a: {type: 'Test[]'}}}}, 'Property'
                ],
                [
                    [{'-type': 'Test', a: [{
                        '-type': 'Test', b: null
                    }], b: 'a'}],
                    {entities: {Test: {a: {type: 'Test[]'}, b: {
                        nullable: false
                    }}}}, 'NotNull'
                ],
                [
                    [
                        {'-type': 'Test', a: [{'-type': 'Test', b: 'a'}]},
                        {'-type': 'Test', a: [{'-type': 'Test', b: 'b'}]}
                    ], {entities: {
                        Test: {a: {type: 'Test[]', writable: false}, b: {}}
                    }}, 'Readonly'
                ],
                [
                    [{'-type': 'Test', a: [4], b: [{'-type': 'Test', a: [
                        2
                    ]}]}], {entities: {Test: {
                        a: {type: 'number[]', minimum: 3},
                        b: {type: 'Test[]'}
                    }}}, 'Minimum'
                ],
                [
                    [{'-type': 'Test', a: [4]}], {entities: {Test: {
                        a: {type: 'integer[]', minimumLength: 2}
                    }}}, 'MinimumArrayLength'
                ],
                [
                    [{'-type': 'Test', a: []}], {entities: {Test: {
                        a: {type: 'integer[]', minimumLength: 1}
                    }}}, 'MinimumArrayLength'
                ],
                [
                    [{'-type': 'Test', a: [1]}], {entities: {Test: {
                        a: {type: 'integer[]', maximumLength: 0}
                    }}}, 'MaximumArrayLength'
                ],
                [
                    [{'-type': 'Test', a: [1, 2]}], {entities: {Test: {
                        a: {type: 'integer[]', maximumLength: 1}
                    }}}, 'MaximumArrayLength'
                ],
                [
                    [{'-type': 'Test', a: [1, 2, 3]}], {entities: {Test: {
                        a: {type: 'integer[]', maximumLength: 2}
                    }}}, 'MaximumArrayLength'
                ],
                [
                    [{'-type': 'Test', a: [1]}], {entities: {Test: {
                        a: {type: 'integer[]', constraintExpression: {
                            evaluation: 'newValue === 2'
                        }}
                    }}}, 'ConstraintExpression'
                ],
                [
                    [{'-type': 'Test', a: [1]}], {entities: {Test: {
                        a: {type: 'integer[]', arrayConstraintExpression: {
                            evaluation: 'newValue.length === 2'
                        }}
                    }}}, 'ArrayConstraintExpression'
                ],
                // / endregion
                // / region nested property
                // // region property type
                [
                    [{'-type': 'Test', a: 1}],
                    {entities: {Test: {a: {type: 'Test'}}}}, 'NestedModel'
                ],
                [
                    [{'-type': 'Test', a: null}],
                    {entities: {Test: {a: {type: 'Test', nullable: false}}}},
                    'NotNull'
                ],
                [
                    [{'-type': 'Test', a: {}}],
                    {entities: {Test: {a: {type: 'Test'}}}}, 'Type'
                ],
                [
                    [{'-type': 'Test', a: {'-type': 'Test', b: 2}, b: 'a'}],
                    {entities: {Test: {a: {type: 'Test'}, b: {}}}},
                    'PropertyType'
                ],
                // // endregion
                // // region property existents
                [
                    [{'-type': 'Test', a: {'-type': 'Test', b: 2}}],
                    {entities: {Test: {a: {type: 'Test'}}}}, 'Property'
                ],
                [
                    [{'-type': 'Test', a: {'-type': 'Test', b: null}, b: 'a'}],
                    {entities: {Test: {a: {type: 'Test'}, b: {
                        nullable: false
                    }}}}, 'NotNull'
                ],
                [
                    [{'-type': 'Test', a: {'-type': 'Test'}, b: 'a'}],
                    {entities: {Test: {a: {type: 'Test'}, b: {
                        nullable: false
                    }}}}, 'MissingProperty'
                ],
                // // endregion
                // // region property readonly
                [
                    [
                        {'-type': 'Test', a: {'-type': 'Test', b: 'a'}},
                        {'-type': 'Test', a: {'-type': 'Test', b: 'b'}}
                    ], {entities: {Test: {a: {type: 'Test'}, b: {
                        writable: false
                    }}}}, 'Readonly'
                ],
                [
                    [
                        {'-type': 'Test', a: {'-type': 'Test', b: 'a'}},
                        {'-type': 'Test', a: {'-type': 'Test', b: 'b'}}
                    ], {entities: {Test: {a: {type: 'Test'}, b: {
                        mutable: false
                    }}}}, 'Immutable'
                ],
                [
                    [
                        {'-type': 'Test', a: {'-type': 'Test', b: 'a'}},
                        {'-type': 'Test', a: {'-type': 'Test'}}
                    ], {entities: {Test: {a: {type: 'Test'}, b: {
                        writable: false
                    }}}}, 'Readonly'
                ],
                [
                    [
                        {'-type': 'Test', a: {'-type': 'Test', b: 'a'}},
                        {'-type': 'Test', a: {'-type': 'Test', b: 'b'}}, {}, {}
                    ],
                    {entities: {Test: {a: {type: 'Test', writable: false}, b: {
                    }}}}, 'Readonly'
                ],
                // // endregion
                // // region property range
                [
                    [{'-type': 'Test', a: 4, b: {'-type': 'Test', a: 2}}],
                    {entities: {Test: {
                        a: {type: 'number', minimum: 3}, b: {type: 'Test'}
                    }}}, 'Minimum'
                ],
                [
                    [{'-type': 'Test', a: '1', b: {'-type': 'Test', a: '12'}}],
                    {entities: {Test: {a: {maximum: 1}, b: {type: 'Test'}}}},
                    'MaximalLength'
                ],
                // // endregion
                // // region property pattern
                [
                    [{'-type': 'Test', b: {'-type': 'Test', a: 'b'}}],
                    {entities: {Test: {
                        a: {regularExpressionPattern: 'a'},
                        b: {type: 'Test'}
                    }}}, 'PatternMatch'
                ],
                // // endregion
                // // region property constraint
                [
                    [{'-type': 'Test', a: 'b', b: {'-type': 'Test', a: 'a'}}],
                    {entities: {Test: {
                        a: {constraintExpression: {
                            evaluation: 'newValue === "b"'
                        }},
                        b: {type: 'Test'}
                    }}}, 'ConstraintExpression'
                ],
                [
                    [{'-type': 'Test', a: 'b', b: {'-type': 'Test', a: 'a'}}],
                    {entities: {Test: {
                        a: {constraintExpression: {
                            evaluation: 'newValue === "b"'
                        }},
                        b: {type: 'Test'}
                    }}}, 'ConstraintExpression'
                ],
                // // endregion
                // / endregion
                [
                    [{'-type': 'Test1', a: 1}], {entities: {
                        Test1: {a: {type: 'foreignKey:Test2'}},
                        Test2: {[idName]: {type: 'string'}}
                    }}, 'PropertyType'
                ],
                [[{'-type': 'Test', a: 1}], {entities: {Test: {a: {
                    type: 2
                }}}}, 'PropertyType'],
                // endregion
                // region property range
                [
                    [{'-type': 'Test', a: 2}],
                    {entities: {Test: {a: {type: 'number', minimum: 3}}}},
                    'Minimum'
                ],
                [
                    [{'-type': 'Test', a: 1.1}],
                    {entities: {Test: {a: {type: 'number', maximum: 1}}}},
                    'Maximum'
                ],
                [
                    [{'-type': 'Test', a: 2}],
                    {entities: {Test: {a: {type: 'integer', maximum: 1}}}},
                    'Maximum'
                ],
                [
                    [{'-type': 'Test', a: '12'}],
                    {entities: {Test: {a: {minimum: 3}}}}, 'MinimalLength'
                ],
                [
                    [{'-type': 'Test', a: '12'}],
                    {entities: {Test: {a: {maximum: 1}}}}, 'MaximalLength'
                ],
                // endregion
                // region selection
                [
                    [{'-type': 'Test', a: 2}],
                    {entities: {Test: {a: {type: 'number', selection: []}}}},
                    'Selection'
                ],
                [
                    [{'-type': 'Test', a: 2}],
                    {entities: {Test: {a: {type: 'number', selection: [1]}}}},
                    'Selection'
                ],
                [
                    [{'-type': 'Test', a: 2}],
                    {entities: {Test: {a: {type: 'integer', selection: [
                        1, 3
                    ]}}}},
                    'Selection'
                ],
                // endregion
                // region property pattern
                [
                    [{'-type': 'Test', a: 'b'}],
                    {entities: {Test: {a: {regularExpressionPattern: 'a'}}}},
                    'PatternMatch'
                ],
                // endregion
                // region property constraint
                [
                    [{'-type': 'Test', a: 'b'}],
                    {entities: {Test: {a: {constraintExpression: {
                        evaluation: 'false'
                    }}}}},
                    'ConstraintExpression'
                ],
                [
                    [{'-type': 'Test', a: 'b'}],
                    {entities: {Test: {a: {constraintExecution: {
                        evaluation: 'return false'
                    }}}}}, 'ConstraintExecution'
                ],
                [
                    [{'-type': 'Test', a: 'b'}],
                    {entities: {Test: {a: {constraintExpression: {
                        evaluation: '+'
                    }}}}},
                    'Compilation'
                ],
                [[{'-type': 'Test', a: 'b'}], {entities: {Test: {a: {
                    constraintExpression: {evaluation: 'undefinedVariableName'}
                }}}}, 'Runtime'],
                [[{'-type': 'Test', a: 'b'}], {entities: {Test: {a: {
                    constraintExecution: {
                        evaluation: 'return undefinedVariableName'
                    }
                }}}}, 'Runtime'],
                [[{'-type': 'Test', a: 'b'}], {entities: {Test: {a: {
                    constraintExpression: {
                        evaluation: 'newValue === "a"'
                    }
                }}}}, 'ConstraintExpression'],
                // endregion
                // region constraint
                [[{'-type': 'Test', a: 'a', b: 'b'}], {entities: {Test: {
                    _constraintExpressions: [{evaluation: 'false'}],
                    a: {},
                    b: {}
                }}}, 'ConstraintExpressions'],
                [[{'-type': 'Test', a: 'a', b: 'b'}], {entities: {Test: {
                    _constraintExecutions: [{evaluation: 'return false'}],
                    a: {},
                    b: {}
                }}}, 'ConstraintExecutions'],
                [[{'-type': 'Test', a: 'a', b: 'b'}], {entities: {Test: {
                    _constraintExecutions: [{
                        description: '`Fails always!`',
                        evaluation: 'return false'
                    }],
                    a: {},
                    b: {}
                }}}, 'ConstraintExecutions'],
                [[{'-type': 'Test', a: 'a', b: 'b'}], {entities: {Test: {
                    _constraintExecutions: [{
                        description: '`a: ${newDocument.a} failed!`',
                        evaluation: 'return newDocument.a === newDocument.b'
                    }],
                    a: {},
                    b: {}
                }}}, 'ConstraintExecutions'],
                // endregion
                // region attachment
                [
                    [{'-type': 'Test', [attachmentName]: {}}],
                    {entities: {Test: {}}}, 'Property'
                ],
                [[{'-type': 'Test'}], {entities: {Test: {[attachmentName]: {
                    '.*': {minimum: 1, nullable: false}
                }}}}, 'MissingAttachment'],
                [[{'-type': 'Test', [attachmentName]: {test: {
                    data: null
                }}}], {entities: {Test: {[attachmentName]: {'.*': {
                    nullable: false
                }}}}}, 'MissingAttachment'],
                [[{'-type': 'Test', [attachmentName]: {test: {data: null}}}], {
                    entities: {Test: {[attachmentName]: {'.*': {
                        minimum: 1, nullable: false
                    }}}}
                }, 'MissingAttachment'],
                [[{'-type': 'Test', [attachmentName]: {
                    a: {data: '', content_type: 'text/plain'}
                }}], {entities: {Test: {[attachmentName]: {
                    a: {minimum: 1, nullable: false},
                    b: {minimum: 1, nullable: false}
                }}}}, 'MissingAttachment'],
                [[{'-type': 'Test'}], {entities: {Test: {[attachmentName]: {
                    a: {minimum: 1, nullable: false}
                }}}}, 'MissingAttachment'],
                [[{'-type': 'Test', [attachmentName]: null}], {entities: {
                    Test: {[attachmentName]: {'.*': {
                        minimum: 1, nullable: false
                    }}}
                }}, 'MissingAttachment'],
                [
                    [{'-type': 'Test', [attachmentName]: {
                        // eslint-disable camelcase
                        a: {data: '', content_type: 'text/plain'},
                        b: {data: '', content_type: 'text/plain'}
                        // eslint-enable camelcase
                    }}],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        maximum: 1
                    }}}}},
                    'AttachmentMaximum'
                ],
                [
                    [{'-type': 'Test', [attachmentName]: {}}],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        minimum: 1, nullable: false
                    }}}}}, 'MissingAttachment'
                ],
                [
                    [{'-type': 'Test', [attachmentName]: {test: {
                        data: null
                    }}}, {
                        '-type': 'Test',
                        [attachmentName]: {test: {
                            content_type: 'text/plain', data: ''
                        }}
                    }], {entities: {Test: {[attachmentName]: {'.*': {
                        nullable: false
                    }}}}}, 'MissingAttachment'
                ],
                [
                    [{'-type': 'Test', [attachmentName]: {a: {
                        // eslint-disable camelcase
                        data: '', content_type: 'text/plain'
                        // eslint-enable camelcase
                    }}}],
                    {entities: {Test: {[attachmentName]: {b: {}}}}},
                    'AttachmentTypeMatch'
                ],
                [
                    [{'-type': 'Test', [attachmentName]: {a: {
                        // eslint-disable camelcase
                        data: '', content_type: 'text/plain'
                        // eslint-enable camelcase
                    }}}],
                    {entities: {Test: {[attachmentName]: {b: {}, c: {}}}}},
                    'AttachmentTypeMatch'
                ],
                [
                    [{'-type': 'Test', [attachmentName]: {test: {
                        // eslint-disable camelcase
                        data: '', content_type: 'text/plain'
                        // eslint-enable camelcase
                    }}}],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        minimum: 2
                    }}}}},
                    'AttachmentMinimum'
                ],
                [
                    [{'-type': 'Test', [attachmentName]: {a: {
                        // eslint-disable camelcase
                        data: '', content_type: 'text/plain'
                        // eslint-enable camelcase
                    }}}],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        regularExpressionPattern: /b/g
                    }}}}}, 'AttachmentName'
                ],
                [
                    [{'-type': 'Test', [attachmentName]: {
                        // eslint-disable camelcase
                        a: {data: '', content_type: 'text/plain'},
                        b: {data: '', content_type: 'text/plain'}
                        // eslint-enable camelcase
                    }}],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        regularExpressionPattern: /a/
                    }}}}}, 'AttachmentName'
                ],
                [
                    [{'-type': 'Test', [attachmentName]: {
                        // eslint-disable camelcase
                        a: {data: '', content_type: 'text/plain'},
                        b: {data: '', content_type: 'image/jpg'}
                        // eslint-enable camelcase
                    }}],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        contentTypeRegularExpressionPattern: /text\/plain/
                    }}}}}, 'AttachmentContentType'
                ]
                // endregion
            ]) {
                if (test.length < 3)
                    test.splice(1, 0, {})
                const models:Models = Helper.extendModels(Tools.extendObject(
                    true, {}, defaultModelConfiguration, test[1]))
                const modelConfiguration:ModelConfiguration =
                    Tools.extendObject(
                        true, {}, defaultModelConfiguration, test[1])
                delete modelConfiguration.property.defaultSpecification
                delete modelConfiguration.entities
                const parameter:Array<any> = test[0].concat([null, {}, {
                }].slice(test[0].length - 1)).concat([
                    models, modelConfiguration])
                assert.throws((
                ):Object => DatabaseHelper.validateDocumentUpdate(
                    ...parameter
                ), (error:DatabaseForbiddenError):boolean => {
                    if (error.hasOwnProperty('forbidden')) {
                        const result:boolean = error.forbidden.startsWith(
                            `${test[2]}:`)
                        if (!result)
                            console.error(
                                `Error "${error.forbidden}" doesn't start ` +
                                `with "${test[2]}:". Given arguments: "` +
                                parameter.map((value:any):string =>
                                    Tools.representObject(value)
                                ).join('", "') + '".')
                        return result
                    }
                    // IgnoreTypeCheck
                    console.error(`Unexpeced error "${error}" was thrown.`)
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
                /*
                    NOTE: Needed if we are able to validate "_users" table:

                    [[{type: 'user', [idName]: 'org.couchdb.user:test'}], {}, {
                        fillUp: {
                            type: 'user',
                            [idName]: 'org.couchdb.user:test'
                        },
                        incremental: {
                            type: 'user', [idName]: 'org.couchdb.user:test'
                        },
                        '': {type: 'user', [idName]: 'org.couchdb.user:test'}
                    }],
                    [[{type: 'user', [idName]: 'org.couchdb.user:test'}, {
                        type: 'user', [idName]: 'org.couchdb.user:test'
                    }], {}, {
                        fillUp: {
                            type: 'user',
                            [idName]: 'org.couchdb.user:test'
                        },
                        incremental: {
                            type: 'user', [idName]: 'org.couchdb.user:test'
                        },
                        '': {type: 'user', [idName]: 'org.couchdb.user:test'}
                    }]
                */
                [[{[idName]: 1, [revisionName]: 1}, null, {}, {
                    _validatedDocuments: new Set(['1-1'])
                }], {}, {
                    fillUp: {[idName]: 1, [revisionName]: 1},
                    incremental: {[idName]: 1, [revisionName]: 1},
                    '': {[idName]: 1, [revisionName]: 1}
                }],
                [[{'-type': 'Test', [idName]: 1, [revisionName]: 1, a: null}, {
                    '-type': 'Test', [idName]: 1, [revisionName]: 0, a: 'a'
                }], {entities: {Test: {a: {}}}}, {
                    fillUp: {'-type': 'Test', [idName]: 1, [revisionName]: 1},
                    incremental: {[idName]: 1, [revisionName]: 1},
                    '': {'-type': 'Test', [idName]: 1, [revisionName]: 1}
                }],
                [[{'-type': 'Test', [revisionName]: 'latest'}, {
                    '-type': 'Test', [revisionName]: 1
                }], {entities: {Test: {}}}, {
                    fillUp: {'-type': 'Test', [revisionName]: 1},
                    incremental: {[revisionName]: 1},
                    '': {'-type': 'Test', [revisionName]: 1}
                }],
                [[{'-type': 'Test', [revisionName]: 'upsert'}, {
                    '-type': 'Test', [revisionName]: 1
                }], {entities: {Test: {}}}, {
                    fillUp: {'-type': 'Test', [revisionName]: 1},
                    incremental: {[revisionName]: 1},
                    '': {'-type': 'Test', [revisionName]: 1}
                }],
                [[{'-type': 'Test', [revisionName]: 'upsert'}], {entities: {
                    Test: {}
                }}, {
                    fillUp: {'-type': 'Test'},
                    incremental: {'-type': 'Test'},
                    '': {'-type': 'Test'}
                }],
                [[
                    {'-type': 'Test', [revisionName]: 1},
                    {'-type': 'Test', [revisionName]: 1}
                ], {entities: {Test: {}}}, {
                    fillUp: {'-type': 'Test', [revisionName]: 1},
                    incremental: {[revisionName]: 1},
                    '': {'-type': 'Test', [revisionName]: 1}
                }],
                // endregion
                // region model
                [[{'-type': 'Test'}], {entities: {Test: {}}}, {
                    fillUp: {'-type': 'Test'},
                    incremental: {'-type': 'Test'},
                    '': {'-type': 'Test'}
                }],
                [[{'-type': 'Test'}], {entities: {Test: {}}}, {
                    fillUp: {'-type': 'Test'},
                    incremental: {'-type': 'Test'},
                    '': {'-type': 'Test'}
                }],
                [[{'-type': 'Test'}], {entities: {Test: {class: {}}}}, {
                    fillUp: {'-type': 'Test'},
                    incremental: {'-type': 'Test'},
                    '': {'-type': 'Test'}
                }],
                [[{'-type': 'Test'}, {'-type': 'Test', a: '2'}], {
                    entities: {Test: {a: {}}}
                }, {
                    fillUp: {'-type': 'Test', a: '2'},
                    incremental: {},
                    '': {'-type': 'Test'}
                }],
                [[{'-type': 'Test', a: '2'}, {'-type': 'Test', a: '2'}], {
                    entities: {Test: {a: {}}}
                }, {
                    fillUp: {'-type': 'Test', a: '2'},
                    incremental: {},
                    '': {'-type': 'Test', a: '2'}
                }],
                [[{'-type': 'Test', a: '3'}, {'-type': 'Test', a: '2'}], {
                    entities: {Test: {a: {}}}
                }, {
                    fillUp: {a: '3', '-type': 'Test'},
                    incremental: {a: '3'},
                    '': {'-type': 'Test', a: '3'}
                }],
                [[{'-type': 'Test', a: {'-type': '_test'}}], {
                    entities: {Test: {a: {type: '_test'}}, _test: {}}
                }, {
                    fillUp: {'-type': 'Test', a: {'-type': '_test'}},
                    incremental: {'-type': 'Test', a: {'-type': '_test'}},
                    '': {'-type': 'Test', a: {'-type': '_test'}}
                }],
                // endregion
                // region hooks
                // / region on create
                [[{'-type': 'Test', a: ''}], {entities: {Test: {a: {
                    onCreateExpression: `'2'`
                }}}}, {
                    fillUp: {'-type': 'Test', a: '2'},
                    incremental: {'-type': 'Test', a: '2'},
                    '': {'-type': 'Test', a: '2'}
                }],
                [[{'-type': 'Test', [attachmentName]: {test: {
                    // eslint-disable camelcase
                    data: 'payload', content_type: 'text/plain'
                    // eslint-enable camelcase
                }}}], {entities: {Test: {[attachmentName]: {'.*': {
                    onCreateExpression:
                        `(newDocument[name].data += ' footer') && ` +
                        'newDocument[name]'
                }}}}}, {
                    fillUp: {'-type': 'Test', [attachmentName]: {test: {
                        // eslint-disable camelcase
                        data: 'payload footer', content_type: 'text/plain'
                        // eslint-enable camelcase
                    }}},
                    incremental: {'-type': 'Test', [attachmentName]: {test: {
                        // eslint-disable camelcase
                        data: 'payload footer', content_type: 'text/plain'
                        // eslint-enable camelcase
                    }}},
                    '': {'-type': 'Test', [attachmentName]: {test: {
                        // eslint-disable camelcase
                        data: 'payload footer', content_type: 'text/plain'
                        // eslint-enable camelcase
                    }}}
                }],
                [[{'-type': 'Test', [attachmentName]: {test: {
                    // eslint-disable camelcase
                    data: 'payload', content_type: 'text/plain'
                    // eslint-enable camelcase
                }}}, {'-type': 'Test'}], {entities: {Test: {[attachmentName]: {
                    '.*': {
                        onCreateExpression:
                            `(newDocument[name].data += ' footer') && ` +
                            'newDocument[name]'
                    }
                }}}}, {
                    fillUp: {'-type': 'Test', [attachmentName]: {test: {
                        // eslint-disable camelcase
                        data: 'payload', content_type: 'text/plain'
                        // eslint-enable camelcase
                    }}},
                    incremental: {[attachmentName]: {test: {
                        // eslint-disable camelcase
                        data: 'payload', content_type: 'text/plain'
                        // eslint-enable camelcase
                    }}},
                    '': {'-type': 'Test', [attachmentName]: {test: {
                        // eslint-disable camelcase
                        data: 'payload', content_type: 'text/plain'
                        // eslint-enable camelcase
                    }}}
                }],
                [[{'-type': 'Test', a: ''}], {entities: {Test: {a: {
                    onCreateExecution: `return '2'`
                }}}}, {
                    fillUp: {'-type': 'Test', a: '2'},
                    incremental: {'-type': 'Test', a: '2'},
                    '': {'-type': 'Test', a: '2'}
                }],
                [[{'-type': 'Test', a: ''}, {'-type': 'Test', a: ''}], {
                    entities: {Test: {a: {onCreateExecution: `return '2'`}}}
                }, {
                    fillUp: {'-type': 'Test', a: ''},
                    incremental: {},
                    '': {'-type': 'Test', a: ''}
                }],
                [[{'-type': 'Test', a: ''}, {'-type': 'Test', a: ''}], {
                    entities: {Test: {a: {onCreateExecution: `return '2'`}}}
                }, {
                    fillUp: {'-type': 'Test', a: ''},
                    incremental: {},
                    '': {'-type': 'Test', a: ''}
                }],
                // / endregion
                // / region on update
                [[{'-type': 'Test', a: ''}], {entities: {Test: {a: {
                    onUpdateExpression: `'2'`
                }}}}, {
                    fillUp: {'-type': 'Test', a: '2'},
                    incremental: {'-type': 'Test', a: '2'},
                    '': {'-type': 'Test', a: '2'}
                }],
                [[{'-type': 'Test', a: ''}], {entities: {Test: {a: {
                    onUpdateExecution: `return '2'`
                }}}}, {
                    fillUp: {'-type': 'Test', a: '2'},
                    incremental: {'-type': 'Test', a: '2'},
                    '': {'-type': 'Test', a: '2'}
                }],
                [[{'-type': 'Test', a: '1'}, {'-type': 'Test', a: '2'}], {
                    entities: {Test: {a: {onUpdateExpression: `'2'`}}}
                }, {
                    fillUp: {'-type': 'Test', a: '2'},
                    incremental: {},
                    '': {'-type': 'Test', a: '2'}
                }],
                [[{'-type': 'Test', [attachmentName]: {test: {
                    // eslint-disable camelcase
                    data: 'payload', content_type: 'text/plain'
                    // eslint-enable camelcase
                }}}], {entities: {Test: {[attachmentName]: {'.*': {
                    onUpdateExpression:
                        `(newDocument[name].data += ' footer') && ` +
                        'newDocument[name]'
                }}}}}, {
                    fillUp: {'-type': 'Test', [attachmentName]: {test: {
                        // eslint-disable camelcase
                        data: 'payload footer', content_type: 'text/plain'
                        // eslint-enable camelcase
                    }}},
                    incremental: {'-type': 'Test', [attachmentName]: {test: {
                        // eslint-disable camelcase
                        data: 'payload footer', content_type: 'text/plain'
                        // eslint-enable camelcase
                    }}},
                    '': {'-type': 'Test', [attachmentName]: {test: {
                        // eslint-disable camelcase
                        data: 'payload footer', content_type: 'text/plain'
                        // eslint-enable camelcase
                    }}}
                }],
                [[{'-type': 'Test', [attachmentName]: {test: {
                    // eslint-disable camelcase
                    data: 'payload', content_type: 'text/plain'
                    // eslint-enable camelcase
                }}}, {'-type': 'Test'}], {entities: {Test: {[attachmentName]: {
                    '.*': {
                        onUpdateExpression:
                            `(newDocument[name].data += ' footer') && ` +
                            'newDocument[name]'
                    }
                }}}}, {
                    fillUp: {'-type': 'Test', [attachmentName]: {test: {
                        // eslint-disable camelcase
                        data: 'payload footer', content_type: 'text/plain'
                        // eslint-enable camelcase
                    }}},
                    incremental: {[attachmentName]: {test: {
                        // eslint-disable camelcase
                        data: 'payload footer', content_type: 'text/plain'
                        // eslint-enable camelcase
                    }}},
                    '': {'-type': 'Test', [attachmentName]: {test: {
                        // eslint-disable camelcase
                        data: 'payload footer', content_type: 'text/plain'
                        // eslint-enable camelcase
                    }}}
                }],
                [[{'-type': 'Test'}, {'-type': 'Test'}], {entities: {Test: {
                    [attachmentName]: {'.*': {onUpdateExpression:
                        `(newDocument[name].data += ' footer') && ` +
                        'newDocument[name]'
                    }}
                }}}, {
                    fillUp: {'-type': 'Test'},
                    incremental: {},
                    '': {'-type': 'Test'}
                }],
                // / endregion
                // endregion
                // region property writable/mutable
                [[{'-type': 'Test', a: 'b'}, {'-type': 'Test', a: 'b'}], {
                    entities: {Test: {a: {writable: false}}}
                }, {
                    fillUp: {'-type': 'Test', a: 'b'},
                    incremental: {},
                    '': {'-type': 'Test', a: 'b'}
                }],
                [[{'-type': 'Test'}, {'-type': 'Test'}], {entities: {Test: {a: {
                    writable: false
                }}}}, {
                    fillUp: {'-type': 'Test'},
                    incremental: {},
                    '': {'-type': 'Test'}
                }],
                [
                    [{'-type': 'Test', a: '2'}, {'-type': 'Test'}],
                    {entities: {Test: {a: {mutable: false}}}}, {
                        fillUp: {'-type': 'Test', a: '2'},
                        incremental: {a: '2'},
                        '': {'-type': 'Test', a: '2'}
                    }
                ],
                // endregion
                // region property existents
                [[{'-type': 'Test', a: 2}], {entities: {Test: {a: {
                    type: 'number'
                }}}}, {
                    fillUp: {'-type': 'Test', a: 2},
                    incremental: {'-type': 'Test', a: 2},
                    '': {'-type': 'Test', a: 2}
                }],
                [[{'-type': 'Test', a: null}], {entities: {Test: {a: {}}}}, {
                    fillUp: {'-type': 'Test'},
                    incremental: {'-type': 'Test'},
                    '': {'-type': 'Test'}
                }],
                [[{'-type': 'Test', a: 'a'}], {entities: {Test: {a: {
                    nullable: false
                }}}}, {
                    fillUp: {'-type': 'Test', a: 'a'},
                    incremental: {'-type': 'Test', a: 'a'},
                    '': {'-type': 'Test', a: 'a'}
                }],
                [[{'-type': 'Test'}, {'-type': 'Test', a: 'a'}], {entities: {
                    Test: {a: {nullable: false}}
                }}, {
                    fillUp: {'-type': 'Test', a: 'a'},
                    incremental: {},
                    '': {'-type': 'Test'}
                }],
                [[{'-type': 'Test'}], {entities: {Test: {a: {
                    default: '2',
                    nullable: false
                }}}}, {
                    fillUp: {'-type': 'Test', a: '2'},
                    incremental: {'-type': 'Test', a: '2'},
                    '': {'-type': 'Test', a: '2'}
                }],
                [[{'-type': 'Test'}], {entities: {Test: {[attachmentName]: {
                    '.*': {
                        default: {test: {
                            // eslint-disable camelcase
                            data: '', content_type: 'text/plain'
                            // eslint-enable camelcase
                        }},
                        nullable: false
                    }
                }}}}, {
                    fillUp: {'-type': 'Test', [attachmentName]: {test: {
                        // eslint-disable camelcase
                        data: '', content_type: 'text/plain'
                        // eslint-enable camelcase
                    }}},
                    incremental: {'-type': 'Test', [attachmentName]: {test: {
                        // eslint-disable camelcase
                        data: '', content_type: 'text/plain'
                        // eslint-enable camelcase
                    }}},
                    '': {'-type': 'Test', [attachmentName]: {test: {
                        // eslint-disable camelcase
                        data: '', content_type: 'text/plain'
                        // eslint-enable camelcase
                    }}}
                }],
                //  endregion
                // region property type
                [
                    [{'-type': 'Test', a: '2'}, {'-type': 'Test', a: '2'}],
                    {entities: {Test: {a: {}}}}, {
                        fillUp: {'-type': 'Test', a: '2'},
                        incremental: {},
                        '': {'-type': 'Test', a: '2'}
                    }
                ],
                [
                    [{'-type': 'Test', a: 2}, {'-type': 'Test', a: 2}],
                    {entities: {Test: {a: {type: 'integer'}}}}, {
                        fillUp: {'-type': 'Test', a: 2},
                        incremental: {},
                        '': {'-type': 'Test', a: 2}
                    }
                ],
                [
                    [{'-type': 'Test', a: 2.2}, {'-type': 'Test', a: 2}],
                    {entities: {Test: {a: {type: 'number'}}}}, {
                        fillUp: {'-type': 'Test', a: 2.2},
                        incremental: {a: 2.2},
                        '': {'-type': 'Test', a: 2.2}
                    }
                ],
                [
                    [{'-type': 'Test', a: true}, {'-type': 'Test', a: true}],
                    {entities: {Test: {a: {type: 'boolean'}}}}, {
                        fillUp: {'-type': 'Test', a: true},
                        incremental: {},
                        '': {'-type': 'Test', a: true}
                    }
                ],
                [
                    [{'-type': 'Test', a: 1}, {'-type': 'Test', a: 1}],
                    {entities: {Test: {a: {type: 'DateTime'}}}}, {
                        fillUp: {'-type': 'Test', a: 1},
                        incremental: {},
                        '': {'-type': 'Test', a: 1}
                    }
                ],
                [
                    [{'-type': 'Test', a: new Date(
                        1970, 0, 1, 0, -1 *
                        (new Date(1970, 0, 1)).getTimezoneOffset()
                    )}, {'-type': 'Test', a: new Date(
                        1970, 0, 1, 0, -1 *
                        (new Date(1970, 0, 1)).getTimezoneOffset()
                    )}],
                    {entities: {Test: {a: {type: 'DateTime'}}}}, {
                        fillUp: {'-type': 'Test', a: 0},
                        incremental: {},
                        '': {'-type': 'Test', a: 0}
                    }
                ],
                [
                    [
                        {'-type': 'Test', a: (new Date(
                            1970, 0, 1, 0, -1 * (new Date(
                                1970, 0, 1
                            )).getTimezoneOffset()
                        )).toUTCString()},
                        {'-type': 'Test', a: (new Date(
                            1970, 0, 1, 0, -1 * (new Date(
                                1970, 0, 1
                            )).getTimezoneOffset()
                        )).toUTCString()}
                    ],
                    {entities: {Test: {a: {type: 'DateTime'}}}}, {
                        fillUp: {'-type': 'Test', a: 0},
                        incremental: {},
                        '': {'-type': 'Test', a: 0}
                    }
                ],
                [
                    [
                        {'-type': 'Test', a: new Date(1970, 0, 1, 0, -1 * (
                            new Date(1970, 0, 1)).getTimezoneOffset()
                        ).toLocaleString()},
                        {'-type': 'Test', a: new Date(1970, 0, 1, 0, -1 * (
                            new Date(1970, 0, 1)
                        ).getTimezoneOffset()).toLocaleString()}
                    ],
                    {entities: {Test: {a: {type: 'DateTime'}}}}, {
                        fillUp: {'-type': 'Test', a: 0},
                        incremental: {},
                        '': {'-type': 'Test', a: 0}
                    }
                ],
                [
                    [{'-type': 'Test', a: new Date(1970, 0, 1, 0, -1 * (
                        new Date(1970, 0, 1)
                    ).getTimezoneOffset(), 0, 1)},
                    {'-type': 'Test', a: new Date(1970, 0, 1, 0, -1 * (
                        new Date(1970, 0, 1)
                    ).getTimezoneOffset(), 0, 1)}],
                    {entities: {Test: {a: {type: 'DateTime'}}}}, {
                        fillUp: {'-type': 'Test', a: 1},
                        incremental: {},
                        '': {'-type': 'Test', a: 1}
                    }
                ],
                [
                    [
                        {'-type': 'Test', a: new Date(1970, 0, 1, 0, -1 * (
                            new Date(1970, 0, 1)
                        ).getTimezoneOffset(), 2).toUTCString()},
                        {'-type': 'Test', a: new Date(1970, 0, 1, 0, -1 * (
                            new Date(1970, 0, 1)
                        ).getTimezoneOffset(), 2).toUTCString()}
                    ],
                    {entities: {Test: {a: {type: 'DateTime'}}}}, {
                        fillUp: {'-type': 'Test', a: 2 * 1000},
                        incremental: {},
                        '': {'-type': 'Test', a: 2 * 1000}
                    }
                ],
                [
                    [
                        {'-type': 'Test', a: new Date(1970, 0, 1, 5, -1 * (
                            new Date(1970, 0, 1)
                        ).getTimezoneOffset(), 2).toISOString()},
                        {'-type': 'Test', a: new Date(1970, 0, 1, 5, -1 * (
                            new Date(1970, 0, 1)
                        ).getTimezoneOffset(), 2).toISOString()}
                    ],
                    {entities: {Test: {a: {type: 'DateTime'}}}}, {
                        fillUp: {
                            '-type': 'Test',
                            a: 5 * 60 ** 2 * 1000 + 2 * 1000
                        },
                        incremental: {},
                        '': {
                            '-type': 'Test',
                            a: 5 * 60 ** 2 * 1000 + 2 * 1000
                        }
                    }
                ],
                // / region array
                [
                    [
                        {'-type': 'Test', a: ['2']},
                        {'-type': 'Test', a: ['2']}
                    ],
                    {entities: {Test: {a: {type: 'string[]'}}}}, {
                        fillUp: {'-type': 'Test', a: ['2']},
                        incremental: {},
                        '': {'-type': 'Test', a: ['2']}
                    }
                ],
                [
                    [{'-type': 'Test', a: ['2']}, {'-type': 'Test'}],
                    {entities: {Test: {a: {type: 'string[]'}}}}, {
                        fillUp: {'-type': 'Test', a: ['2']},
                        incremental: {a: ['2']},
                        '': {'-type': 'Test', a: ['2']}
                    }
                ],
                [
                    [{'-type': 'Test', a: null}, {'-type': 'Test'}],
                    {entities: {Test: {a: {type: 'string[]'}}}}, {
                        fillUp: {'-type': 'Test'},
                        incremental: {},
                        '': {'-type': 'Test'}
                    }
                ],
                [
                    [{'-type': 'Test', a: [2]}, {'-type': 'Test'}],
                    {entities: {Test: {a: {type: 'integer[]'}}}}, {
                        fillUp: {'-type': 'Test', a: [2]},
                        incremental: {a: [2]},
                        '': {'-type': 'Test', a: [2]}
                    }
                ],
                [
                    [{'-type': 'Test', a: [2.3]}, {'-type': 'Test'}],
                    {entities: {Test: {a: {type: 'number[]'}}}}, {
                        fillUp: {'-type': 'Test', a: [2.3]},
                        incremental: {a: [2.3]},
                        '': {'-type': 'Test', a: [2.3]}
                    }
                ],
                [
                    [{'-type': 'Test', a: [true]}, {'-type': 'Test'}],
                    {entities: {Test: {a: {type: 'boolean[]'}}}}, {
                        fillUp: {'-type': 'Test', a: [true]},
                        incremental: {a: [true]},
                        '': {'-type': 'Test', a: [true]}
                    }
                ],
                [
                    [{'-type': 'Test', a: [1]}, {'-type': 'Test'}],
                    {entities: {Test: {a: {type: 'DateTime[]'}}}}, {
                        fillUp: {'-type': 'Test', a: [1]},
                        incremental: {a: [1]},
                        '': {'-type': 'Test', a: [1]}
                    }
                ],
                [
                    [{'-type': 'Test', a: []}, {'-type': 'Test'}],
                    {entities: {Test: {a: {type: 'DateTime[]'}}}}, {
                        fillUp: {'-type': 'Test', a: []},
                        incremental: {a: []},
                        '': {'-type': 'Test', a: []}
                    }
                ],
                [
                    [{'-type': 'Test', a: [2]}, {'-type': 'Test'}],
                    {entities: {Test: {a: {
                        type: 'DateTime[]', mutable: false
                    }}}}, {
                        fillUp: {'-type': 'Test', a: [2]},
                        incremental: {a: [2]},
                        '': {'-type': 'Test', a: [2]}
                    }
                ],
                [
                    [{'-type': 'Test', a: [2, 1.1]}, {'-type': 'Test', a: [2]}],
                    {entities: {Test: {a: {type: 'number[]'}}}}, {
                        fillUp: {'-type': 'Test', a: [2, 1.1]},
                        incremental: {a: [2, 1.1]},
                        '': {'-type': 'Test', a: [2, 1.1]}
                    }
                ],
                [
                    [{'-type': 'Test', a: [2, 1]}], {entities: {Test: {a: {
                        type: 'integer[]', minimumLength: 1, maximumLength: 2
                    }}}}, {
                        fillUp: {'-type': 'Test', a: [2, 1]},
                        incremental: {'-type': 'Test', a: [2, 1]},
                        '': {'-type': 'Test', a: [2, 1]}
                    }
                ],
                [
                    [{'-type': 'Test', a: [2, 1]}], {entities: {Test: {a: {
                        type: 'integer[]', maximumLength: Infinity,
                        minimumLength: 0
                    }}}}, {
                        fillUp: {'-type': 'Test', a: [2, 1]},
                        incremental: {'-type': 'Test', a: [2, 1]},
                        '': {'-type': 'Test', a: [2, 1]}
                    }
                ],
                [
                    [{'-type': 'Test', a: [2]}], {entities: {Test: {a: {
                        type: 'integer[]', maximum: 2, maximumLength: 1
                    }}}}, {
                        fillUp: {'-type': 'Test', a: [2]},
                        incremental: {'-type': 'Test', a: [2]},
                        '': {'-type': 'Test', a: [2]}
                    }
                ],
                [
                    [{'-type': 'Test', a: []}], {entities: {Test: {a: {
                        type: 'integer[]', maximum: 2, maximumLength: 0
                    }}}}, {
                        fillUp: {'-type': 'Test', a: []},
                        incremental: {'-type': 'Test', a: []},
                        '': {'-type': 'Test', a: []}
                    }
                ],
                [
                    [{'-type': 'Test', a: [2]}], {entities: {Test: {a: {
                        type: 'integer[]', arrayConstraintExpression: {
                            evaluation: 'newValue.length === 1'
                        }, constraintExpression: {
                            evaluation: 'newValue === 2'
                        }
                    }}}}, {
                        fillUp: {'-type': 'Test', a: [2]},
                        incremental: {'-type': 'Test', a: [2]},
                        '': {'-type': 'Test', a: [2]}
                    }
                ],
                // / endregion
                // / region nested property
                // // region property type
                [
                    [
                        {'-type': 'Test', a: {'-type': 'Test'}},
                        {'-type': 'Test', a: {'-type': 'Test'}}
                    ], {entities: {Test: {a: {type: 'Test'}}}}, {
                        fillUp: {'-type': 'Test', a: {'-type': 'Test'}},
                        incremental: {},
                        '': {'-type': 'Test', a: {'-type': 'Test'}}
                    }
                ],
                [
                    [{'-type': 'Test', a: null}, {'-type': 'Test'}],
                    {entities: {Test: {a: {type: 'Test'}}}}, {
                        fillUp: {'-type': 'Test'},
                        incremental: {},
                        '': {'-type': 'Test'}
                    }
                ],
                [
                    [
                        {'-type': 'Test', a: {'-type': 'Test', b: null}},
                        {'-type': 'Test', a: {'-type': 'Test'}}
                    ], {entities: {Test: {a: {type: 'Test'}, b: {}}}}, {
                        fillUp: {'-type': 'Test', a: {'-type': 'Test'}},
                        incremental: {},
                        '': {'-type': 'Test', a: {'-type': 'Test'}}
                    }
                ],
                [
                    [
                        {'-type': 'Test', a: {'-type': 'Test', b: '2'}},
                        {'-type': 'Test', a: {'-type': 'Test', b: '2'}}
                    ], {entities: {Test: {a: {type: 'Test'}, b: {}}}}, {
                        fillUp: {'-type': 'Test', a: {
                            '-type': 'Test', b: '2'
                        }},
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
                    ], {entities: {Test: {a: {type: 'Test'}, b: {}}}}, {
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
                    ], {entities: {Test: {a: {type: 'Test'}}}}, {
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
                    ], {entities: {Test: {a: {type: 'Test'}, b: {}}}}, {
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
                    ], {entities: {Test: {a: {type: 'Test'}, b: {
                        nullable: false
                    }}}}, {
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
                    ], {entities: {Test: {a: {type: 'Test'}, b: {
                        writable: false
                    }}}}, {
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
                    {entities: {Test: {a: {type: 'Test', writable: false}, b: {
                    }}}}, {
                        fillUp: {'-type': 'Test', a: {
                            '-type': 'Test', b: 'a'
                        }},
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
                    ], {entities: {Test: {
                        a: {type: 'integer', minimum: 3},
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
                    {entities: {Test: {a: {maximum: 1}, b: {type: 'Test'}}}}, {
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
                    {entities: {Test: {
                        a: {regularExpressionPattern: 'a'},
                        b: {type: 'Test'}
                    }}}, {
                        fillUp: {'-type': 'Test', b: {
                            '-type': 'Test', a: 'a'
                        }},
                        incremental: {'-type': 'Test', b: {
                            '-type': 'Test', a: 'a'
                        }},
                        '': {'-type': 'Test', b: {'-type': 'Test', a: 'a'}}
                    }
                ],
                // // endregion
                // // region property constraint
                [[{'-type': 'Test', a: 'b', b: {'-type': 'Test', a: 'b'}}], {
                    entities: {Test: {
                        a: {constraintExpression: {
                            evaluation: 'newValue === "b"'
                        }},
                        b: {type: 'Test'}
                    }}
                }, {
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
                [[{'-type': 'Test1', a: 2}], {entities: {
                    Test1: {a: {type: 'foreignKey:Test2'}},
                    Test2: {[idName]: {type: 'number'}}
                }}, {
                    fillUp: {'-type': 'Test1', a: 2},
                    incremental: {'-type': 'Test1', a: 2},
                    '': {'-type': 'Test1', a: 2}
                }],
                [[{'-type': 'Test', a: 2}, {'-type': 'Test'}], {
                    entities: {Test: {a: {type: 2}}}}, {
                        fillUp: {'-type': 'Test', a: 2},
                        incremental: {a: 2},
                        '': {'-type': 'Test', a: 2}
                    }
                ],
                // endregion
                // region property range
                [[{'-type': 'Test'}], {
                    entities: {Test: {a: {type: 'number', default: 2}}}}, {
                        fillUp: {'-type': 'Test', a: 2},
                        incremental: {'-type': 'Test', a: 2},
                        '': {'-type': 'Test', a: 2}
                    }
                ],
                [[{'-type': 'Test', a: 3}, {'-type': 'Test'}], {
                    entities: {Test: {a: {type: 'number', minimum: 3}}}}, {
                        fillUp: {'-type': 'Test', a: 3},
                        incremental: {a: 3},
                        '': {'-type': 'Test', a: 3}
                    }
                ],
                [[{'-type': 'Test', a: 1}, {'-type': 'Test'}], {
                    entities: {Test: {a: {type: 'number', maximum: 1}}}}, {
                        fillUp: {'-type': 'Test', a: 1},
                        incremental: {a: 1},
                        '': {'-type': 'Test', a: 1}
                    }
                ],
                [[{'-type': 'Test', a: '123'}, {'-type': 'Test'}], {
                    entities: {Test: {a: {minimum: 3}}}}, {
                        fillUp: {'-type': 'Test', a: '123'},
                        incremental: {a: '123'},
                        '': {'-type': 'Test', a: '123'}
                    }
                ],
                [[{'-type': 'Test', a: '1'}], {
                    entities: {Test: {a: {maximum: 1}}}}, {
                        fillUp: {'-type': 'Test', a: '1'},
                        incremental: {'-type': 'Test', a: '1'},
                        '': {'-type': 'Test', a: '1'}
                    }
                ],
                // endregion
                // region selection
                [
                    [{'-type': 'Test', a: 2}], {entities: {Test: {a: {
                        type: 'number', selection: [2]
                    }}}}, {
                        fillUp: {'-type': 'Test', a: 2},
                        incremental: {'-type': 'Test', a: 2},
                        '': {'-type': 'Test', a: 2}
                    }
                ],
                [
                    [{'-type': 'Test', a: 2}], {entities: {Test: {a: {
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
                    entities: {Test: {a: {regularExpressionPattern: 'a'}}}
                }, {
                    fillUp: {'-type': 'Test', a: 'a'},
                    incremental: {'-type': 'Test', a: 'a'},
                    '': {'-type': 'Test', a: 'a'}
                }],
                // endregion
                // region property constraint
                [[{'-type': 'Test', a: 'b'}], {entities: {Test: {a: {
                    constraintExpression: {evaluation: 'true'}
                }}}}, {
                    fillUp: {'-type': 'Test', a: 'b'},
                    incremental: {'-type': 'Test', a: 'b'},
                    '': {'-type': 'Test', a: 'b'}
                }],
                [[{'-type': 'Test', a: 'a'}], {entities: {Test: {a: {
                    constraintExpression: {evaluation: 'newValue === "a"'}
                }}}}, {
                    fillUp: {'-type': 'Test', a: 'a'},
                    incremental: {'-type': 'Test', a: 'a'},
                    '': {'-type': 'Test', a: 'a'}
                }],
                [[{'-type': 'Test', a: 'a'}], {entities: {Test: {a: {
                    constraintExecution: {
                        evaluation: 'return newValue === "a"'
                    }
                }}}}, {
                    fillUp: {'-type': 'Test', a: 'a'},
                    incremental: {'-type': 'Test', a: 'a'},
                    '': {'-type': 'Test', a: 'a'}
                }],
                [[{'-type': 'Test', a: 'a'}], {entities: {Test: {a: {
                    constraintExecution: {
                        evaluation: 'return newValue === "a"'
                    },
                    description: '`Value have to be "a" not "${newValue}".`'
                }}}}, {
                    fillUp: {'-type': 'Test', a: 'a'},
                    incremental: {'-type': 'Test', a: 'a'},
                    '': {'-type': 'Test', a: 'a'}
                }],
                // endregion
                // region constraint
                [[{'-type': 'Test', a: 'a', b: 'b'}], {entities: {Test: {
                    _constraintExpressions: [{evaluation: 'true'}],
                    a: {},
                    b: {}
                }}}, {
                    fillUp: {'-type': 'Test', a: 'a', b: 'b'},
                    incremental: {'-type': 'Test', a: 'a', b: 'b'},
                    '': {'-type': 'Test', a: 'a', b: 'b'}
                }],
                [[{'-type': 'Test', a: 'a', b: 'b'}], {entities: {Test: {
                    _constraintExecutions: [{
                        description: '`Always valid: "${newDocument.a}".`',
                        evaluation: 'return true'
                    }],
                    a: {},
                    b: {}
                }}}, {
                    fillUp: {'-type': 'Test', a: 'a', b: 'b'},
                    incremental: {'-type': 'Test', a: 'a', b: 'b'},
                    '': {'-type': 'Test', a: 'a', b: 'b'}
                }],
                [[{'-type': 'Test', a: 'a', b: 'a'}], {entities: {Test: {
                    _constraintExpressions: [{
                        evaluation: 'newDocument.a === newDocument.b'
                    }],
                    a: {},
                    b: {}
                }}}, {
                    fillUp: {'-type': 'Test', a: 'a', b: 'a'},
                    incremental: {'-type': 'Test', a: 'a', b: 'a'},
                    '': {'-type': 'Test', a: 'a', b: 'a'}
                }],
                // endregion
                // region attachment
                [[{'-type': 'Test'}], {entities: {Test: {[attachmentName]: {
                    '.*': {minimum: 1}
                }}}}, {
                    fillUp: {'-type': 'Test'},
                    incremental: {'-type': 'Test'},
                    '': {'-type': 'Test'}
                }],
                [[{'-type': 'Test', [attachmentName]: {test: {
                    // eslint-disable camelcase
                    content_type: 'text/plain', data: ''
                    // eslint-enable camelcase
                }}}], {entities: {Test: {[attachmentName]: {'.*': {
                    maximum: 1
                }}}}},
                {
                    fillUp: {'-type': 'Test', [attachmentName]: {test: {
                        // eslint-disable camelcase
                        content_type: 'text/plain', data: ''
                        // eslint-enable camelcase
                    }}},
                    incremental: {'-type': 'Test', [attachmentName]: {test: {
                        // eslint-disable camelcase
                        content_type: 'text/plain', data: ''
                        // eslint-enable camelcase
                    }}},
                    '': {'-type': 'Test', [attachmentName]: {test: {
                        // eslint-disable camelcase
                        content_type: 'text/plain', data: ''
                        // eslint-enable camelcase
                    }}}
                }],
                [[{'-type': 'Test', [attachmentName]: {'favicon.png': {
                    // eslint-disable camelcase
                    content_type: 'image/png', data: 'abc'
                    // eslint-enable camelcase
                }}}], {entities: {Test: {[attachmentName]: {
                    '.+\\.(?:jpe?g|png|svg)': {
                        contentTypeRegularExpressionPattern:
                            'image/(?:p?jpe?g|png|svg)',
                        maximum: 1,
                        nullable: false
                    }
                }}}}, {
                    fillUp: {'-type': 'Test', [attachmentName]: {
                        'favicon.png': {
                            // eslint-disable camelcase
                            content_type: 'image/png', data: 'abc'
                            // eslint-enable camelcase
                        }
                    }},
                    incremental: {'-type': 'Test', [attachmentName]: {
                        'favicon.png': {
                            // eslint-disable camelcase
                            content_type: 'image/png', data: 'abc'
                            // eslint-enable camelcase
                        }
                    }},
                    '': {'-type': 'Test', [attachmentName]: {'favicon.png': {
                        // eslint-disable camelcase
                        content_type: 'image/png', data: 'abc'
                        // eslint-enable camelcase
                    }}}
                }],
                [[{'-type': 'Test', [attachmentName]: {test: {
                    // eslint-disable camelcase
                    content_type: 'text/plain', data: ''
                    // eslint-enable camelcase
                }}}], {entities: {Test: {[attachmentName]: {'.*': {
                    nullable: false
                }}}}}, {
                    fillUp: {'-type': 'Test', [attachmentName]: {test: {
                        // eslint-disable camelcase
                        content_type: 'text/plain', data: ''
                        // eslint-enable camelcase
                    }}},
                    incremental: {'-type': 'Test', [attachmentName]: {test: {
                        // eslint-disable camelcase
                        content_type: 'text/plain', data: ''
                        // eslint-enable camelcase
                    }}},
                    '': {'-type': 'Test', [attachmentName]: {test: {
                        // eslint-disable camelcase
                        content_type: 'text/plain', data: ''
                        // eslint-enable camelcase
                    }}}
                }],
                [[{'-type': 'Test', [attachmentName]: {
                    // eslint-disable camelcase
                    a: {content_type: 'text/plain', data: ''},
                    b: {content_type: 'text/plain', data: ''}
                    // eslint-enable camelcase
                }}], {entities: {Test: {[attachmentName]: {'.*': {
                    maximum: 2, minimum: 2
                }}}}}, {
                    fillUp: {'-type': 'Test', [attachmentName]: {
                        // eslint-disable camelcase
                        a: {content_type: 'text/plain', data: ''},
                        b: {content_type: 'text/plain', data: ''}
                        // eslint-enable camelcase
                    }},
                    incremental: {'-type': 'Test', [attachmentName]: {
                        // eslint-disable camelcase
                        a: {content_type: 'text/plain', data: ''},
                        b: {content_type: 'text/plain', data: ''}
                        // eslint-enable camelcase
                    }},
                    '': {'-type': 'Test', [attachmentName]: {
                        // eslint-disable camelcase
                        a: {content_type: 'text/plain', data: ''},
                        b: {content_type: 'text/plain', data: ''}
                        // eslint-enable camelcase
                    }}
                }],
                [[{'-type': 'Test', [attachmentName]: {
                    // eslint-disable camelcase
                    a: {content_type: 'text/plain', data: ''},
                    b: {content_type: 'text/plain', data: ''}
                    // eslint-enable camelcase
                }}], {entities: {Test: {[attachmentName]: {'.*': {
                    maximum: 2, regularExpressionPattern: 'a|b'
                }}}}}, {
                    fillUp: {'-type': 'Test', [attachmentName]: {
                        // eslint-disable camelcase
                        a: {content_type: 'text/plain', data: ''},
                        b: {content_type: 'text/plain', data: ''}
                        // eslint-enable camelcase
                    }},
                    incremental: {'-type': 'Test', [attachmentName]: {
                        // eslint-disable camelcase
                        a: {content_type: 'text/plain', data: ''},
                        b: {content_type: 'text/plain', data: ''}
                        // eslint-enable camelcase
                    }},
                    '': {'-type': 'Test', [attachmentName]: {
                        // eslint-disable camelcase
                        a: {content_type: 'text/plain', data: ''},
                        b: {content_type: 'text/plain', data: ''}
                        // eslint-enable camelcase
                    }}
                }],
                [[{'-type': 'Test', [attachmentName]: {
                    // eslint-disable camelcase
                    a: {content_type: 'image/png', data: ''},
                    b: {content_type: 'image/jpeg', data: ''}
                    // eslint-enable camelcase
                }}], {entities: {Test: {[attachmentName]: {'.*': {
                    contentTypeRegularExpressionPattern: /image\/.+/,
                    regularExpressionPattern: 'a|b'
                }}}}}, {
                    fillUp: {'-type': 'Test', [attachmentName]: {
                        // eslint-disable camelcase
                        a: {content_type: 'image/png', data: ''},
                        b: {content_type: 'image/jpeg', data: ''}
                        // eslint-enable camelcase
                    }},
                    incremental: {'-type': 'Test', [attachmentName]: {
                        // eslint-disable camelcase
                        a: {content_type: 'image/png', data: ''},
                        b: {content_type: 'image/jpeg', data: ''}
                        // eslint-enable camelcase
                    }},
                    '': {'-type': 'Test', [attachmentName]: {
                        // eslint-disable camelcase
                        a: {content_type: 'image/png', data: ''},
                        b: {content_type: 'image/jpeg', data: ''}
                        // eslint-enable camelcase
                    }}
                }],
                [[{'-type': 'Test', [attachmentName]: {
                    // eslint-disable camelcase
                    a: {content_type: 'image/png', data: ''}
                    // eslint-enable camelcase
                }}, {'-type': 'Test', [attachmentName]: {
                    // eslint-disable camelcase
                    b: {content_type: 'image/jpeg', data: ''}
                    // eslint-enable camelcase
                }}], {entities: {Test: {[attachmentName]: {'.*': {}}}}}, {
                    fillUp: {'-type': 'Test', [attachmentName]: {
                        // eslint-disable camelcase
                        a: {content_type: 'image/png', data: ''},
                        b: {content_type: 'image/jpeg', data: ''}
                        // eslint-enable camelcase
                    }},
                    incremental: {[attachmentName]: {
                        // eslint-disable camelcase
                        a: {content_type: 'image/png', data: ''}
                        // eslint-enable camelcase
                    }},
                    '': {'-type': 'Test', [attachmentName]: {
                        // eslint-disable camelcase
                        a: {content_type: 'image/png', data: ''}
                        // eslint-enable camelcase
                    }}
                }],
                [[{'-type': 'Test', [attachmentName]: {a: {data: null}}}, {
                    '-type': 'Test', [attachmentName]: {a: {
                        // eslint-disable camelcase
                        content_type: 'image/jpeg', data: ''
                        // eslint-enable camelcase
                    }}
                }], {entities: {Test: {[attachmentName]: {'.*': {}}}}}, {
                    fillUp: {'-type': 'Test'},
                    incremental: {},
                    '': {'-type': 'Test'}
                }],
                [[{'-type': 'Test', [attachmentName]: {a: {data: null}}}, {
                    '-type': 'Test', [attachmentName]: {a: {
                        // eslint-disable camelcase
                        content_type: 'image/jpeg', data: ''
                        // eslint-enable camelcase
                    }}
                }], {entities: {Test: {[attachmentName]: {'.*': {}}}}}, {
                    fillUp: {'-type': 'Test'},
                    incremental: {},
                    '': {'-type': 'Test'}
                }],
                [[{'-type': 'Test'}, {'-type': 'Test', [attachmentName]: {a: {
                    // eslint-disable camelcase
                    content_type: 'image/jpeg', data: ''
                    // eslint-enable camelcase
                }}}], {entities: {Test: {[attachmentName]: {'.*': {}}}}}, {
                    fillUp: {'-type': 'Test', [attachmentName]: {a: {
                        // eslint-disable camelcase
                        content_type: 'image/jpeg', data: ''
                        // eslint-enable camelcase
                    }}},
                    incremental: {},
                    '': {'-type': 'Test'}
                }],
                [[{'-type': 'Test'}, {'-type': 'Test', [attachmentName]: {a: {
                    // eslint-disable camelcase
                    content_type: 'image/jpeg', data: ''
                    // eslint-enable camelcase
                }}}], {entities: {Test: {[attachmentName]: {a: {}}}}}, {
                    fillUp: {'-type': 'Test', [attachmentName]: {a: {
                        // eslint-disable camelcase
                        content_type: 'image/jpeg', data: ''
                        // eslint-enable camelcase
                    }}},
                    incremental: {},
                    '': {'-type': 'Test'}
                }]
                // endregion
            ]) {
                const models:Models = Helper.extendModels(Tools.extendObject(
                    true, {}, defaultModelConfiguration, test[1]))
                const modelConfiguration:ModelConfiguration =
                    Tools.extendObject(
                        true, {}, defaultModelConfiguration, test[1])
                delete modelConfiguration.property.defaultSpecification
                delete modelConfiguration.entities
                try {
                    assert.deepEqual(DatabaseHelper.validateDocumentUpdate(
                        ...test[0].concat([null, {}, {}].slice(
                            test[0].length - 1
                        )).concat([models, modelConfiguration])
                    ), test[2][updateStrategy])
                } catch (error) {
                    console.error(error)
                }
            }
            // endregion
        }
        // region migration writes
        const defaultModelConfiguration:ModelConfiguration =
            Tools.extendObject(true, {}, configuration.database.model, {
                updateStrategy: 'migrate'})
        for (
            const propertyName:string in
            defaultModelConfiguration.entities._base
        )
            if (defaultModelConfiguration.entities._base.hasOwnProperty(
                propertyName
            ) && propertyName !== configuration.database.model.property.name
                .special.type
            )
                delete defaultModelConfiguration.entities._base[propertyName]
        for (const test:Array<any> of [
            [
                [{'-type': 'Test', a: 2}], {entities: {Test: {}}},
                {'-type': 'Test'}
            ],
            [
                [{'-type': 'Test'}], {entities: {Test: {a: {default: '2'}}}},
                {'-type': 'Test', a: '2'}
            ],
            [
                [{'-type': 'Test', a: '2'}], {entities: {Test: {a: {}}}},
                {'-type': 'Test', a: '2'}
            ],
            [
                [{'-type': 'Test'}, {'-type': 'Test', a: 1}],
                {entities: {Test: {a: {}}}}, {'-type': 'Test'}
            ],
            [
                [{'-type': 'Test', a: null}],
                {entities: {Test: {a: {default: '2'}}}},
                {'-type': 'Test', a: '2'}
            ],
            [
                [{'-type': 'Test', a: null}, {'-type': 'Test', a: '1'}],
                {entities: {Test: {a: {default: '2'}}}},
                {'-type': 'Test', a: '2'}
            ],
            [
                [{'-type': 'Test'}, {'-type': 'Test', a: '1'}],
                {entities: {Test: {a: {default: '2'}}}},
                {'-type': 'Test', a: '2'}
            ],
            [
                [{'-type': 'Test', b: '3'}, {'-type': 'Test', a: '1'}],
                {entities: {Test: {a: {default: '2'}}}},
                {'-type': 'Test', a: '2'}
            ],
            [
                [{'-type': 'Test'}],
                {entities: {Test: {a: {default: 2, type: 'number'}}}},
                {'-type': 'Test', a: 2}
            ],
            [
                [{'-type': 'Test'}, {'-type': 'Test', [attachmentName]: {}}],
                {entities: {Test: {}}}, {'-type': 'Test'}
            ],
            [
                [{'-type': 'Test'}, {'-type': 'Test', [attachmentName]: {
                    test: {
                        // eslint-disable camelcase
                        data: '', content_type: 'text/plain'
                        // eslint-enable camelcase
                    }
                }}],
                {entities: {Test: {}}}, {'-type': 'Test'}
            ],
            [
                [{'-type': 'Test'}, {'-type': 'Test'}],
                {entities: {Test: {[attachmentName]: {'.*': {default: {test: {
                    // eslint-disable camelcase
                    data: '', content_type: 'text/plain'
                    // eslint-enable camelcase
                }}}}}}}, {'-type': 'Test', [attachmentName]: {test: {
                    // eslint-disable camelcase
                    data: '', content_type: 'text/plain'
                    // eslint-enable camelcase
                }}}
            ]
        ]) {
            const models:Models = Helper.extendModels(Tools.extendObject(
                true, {}, defaultModelConfiguration, test[1]))
            const modelConfiguration:ModelConfiguration = Tools.extendObject(
                true, {}, defaultModelConfiguration, test[1])
            delete modelConfiguration.property.defaultSpecification
            delete modelConfiguration.entities
            assert.deepEqual(DatabaseHelper.validateDocumentUpdate(
                ...test[0].concat([null, {}, {}].slice(
                    test[0].length - 1
                )).concat([models, modelConfiguration])), test[2])
        }
        // endregion
    })
// endregion
}, ['plain'])
// region vim modline
// vim: set tabstop=4 shiftwidth=4 expandtab:
// vim: foldmethod=marker foldmarker=region,endregion:
// endregion
