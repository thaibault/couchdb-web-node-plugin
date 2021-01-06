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
import {
    testEachAgainstSameExpectation, ThrowSymbol
} from 'clientnode/testHelper'
import {FirstParameter, SecondParameter} from 'clientnode/type'

import DatabaseHelper from '../databaseHelper'
import Helper from '../helper'
import packageConfiguration from '../package.json'
import {
    Configuration,
    DatabaseForbiddenError,
    Document,
    ModelConfiguration,
    Models,
    SpecialPropertyNames,
    UpdateStrategy
} from '../type'
// endregion
describe('databaseHelper', ():void => {
    // region prepare environment
    const configuration:Configuration =
        packageConfiguration.webNode as Configuration
    const specialNames:SpecialPropertyNames =
        configuration.couchdb.model.property.name.special
    const attachmentName:string = specialNames.attachment
    const idName:string = specialNames.id
    const revisionName:string = specialNames.revision
    const typeName:string = specialNames.type
    // endregion
    // region tests
    testEachAgainstSameExpectation<typeof DatabaseHelper.authenticate>(
        'authenticate',
        DatabaseHelper.authenticate,
        ThrowSymbol,

        [
            {type: 'Test'},
            {},
            {roles: []},
            {},
            {Test: {read: 'users'}},
            'id',
            'type'
        ],
        [{type: 'Test'}, {}, {roles: ['users']}, {}, {}, 'id', 'type']
    )
    testEachAgainstSameExpectation<typeof DatabaseHelper.authenticate>(
        'authenticate',
        DatabaseHelper.authenticate,
        true,

        [{}],
        [{}, null, {roles: ['_admin']}],
        [
            {},
            {},
            {roles: ['_admin']},
            {},
            {}
        ],
        [
            {'-type': 'Test'},
            {},
            {roles: ['users']},
            {},
            {Test: {write: ['users']}}
        ],
        [
            {'-type': 'Test'},
            {},
            {roles: ['users']},
            {},
            {Test: {write: ['users']}}
        ]
    )
    test.each<string>(['', 'fillUp', 'incremental'])(
        'validateDocumentUpdate (with update strategy "%s")',
        (updateStrategy:string):void => {
            const defaultModelConfiguration:ModelConfiguration = {
                ...Tools.copy(configuration.couchdb.model), updateStrategy
            }
            for (
                const propertyName in defaultModelConfiguration.entities._base
            )
                if (
                    defaultModelConfiguration.entities._base.hasOwnProperty(
                        propertyName
                    ) &&
                    propertyName !== typeName
                )
                    delete defaultModelConfiguration.entities._base[
                        propertyName
                    ]
            // region forbidden writes
            for (const test of [
                // region general environment
                /*
                    Get an exception if an expected previous document does not
                    exist (or has no revision).
                */
                [
                    [{[typeName]: 'Test', [revisionName]: 'latest'}, null],
                    'Revision'
                ],
                [
                    [{[typeName]: 'Test', [revisionName]: 'latest'}, {}],
                    'Revision'
                ],
                [
                    [
                        {[typeName]: 'Test', [revisionName]: 'latest'},
                        {[typeName]: 'Test'}
                    ],
                    'Revision'
                ],
                // endregion
                // region changes
                /*
                    Get an exception if nothing really changes. Those database
                    requests should be avoid by the application to improve
                    performance and avoiding to have useless document
                    revisions.
                */
                [
                    [{[typeName]: 'Test'}, {[typeName]: 'Test'}],
                    {entities: {Test: {a: {}}}},
                    'NoChange'
                ],
                [
                    [
                        {
                            [typeName]: 'Test',
                            [specialNames.strategy]: 'migrate'
                        },
                        {[typeName]: 'Test'}
                    ],
                    {entities: {Test: {a: {}}}},
                    'NoChange'
                ],
                /*
                    Empty values should be normalized according and identified
                    as nothing really changes.
                */
                [
                    [
                        {
                            [typeName]: 'Test',
                            [specialNames.strategy]: 'migrate',
                            a: ''
                        },
                        {[typeName]: 'Test', a: ''}
                    ],
                    {entities: {Test: {a: {emptyEqualsToNull: false}}}},
                    'NoChange'
                ],
                [
                    [
                        {
                            [typeName]: 'Test',
                            [specialNames.strategy]: 'migrate',
                            a: ''
                        },
                        {[typeName]: 'Test'}
                    ],
                    {entities: {Test: {a: {}}}},
                    'NoChange'
                ],
                [
                    [
                        {
                            [specialNames.strategy]: 'migrate',
                            [typeName]: 'Test'
                        },
                        {[typeName]: 'Test'}
                    ],
                    {entities: {Test: {[attachmentName]: {a: {}}}}},
                    'NoChange'
                ],
                /*
                    Equal existing and new values should not trigger a new
                    document revision.
                */
                [
                    [
                        {[typeName]: 'Test', a: '2'},
                        {[typeName]: 'Test', a: '2'}
                    ],
                    {entities: {Test: {a: {}}}},
                    'NoChange'
                ],
                /*
                    Normalized equal existing and new values should not trigger
                    a new document revision.
                */
                [
                    [
                        {[typeName]: 'Test', a: 'a '},
                        {[typeName]: 'Test', a: 'a'}
                    ],
                    {entities: {Test: {a: {}}}},
                    'NoChange'
                ],
                [
                    [{[typeName]: 'Test', a: []}, {[typeName]: 'Test'}],
                    {entities: {Test: {a: {type: 'integer[]'}}}},
                    'NoChange'
                ],
                [
                    [{[typeName]: 'Test', a: []}, {[typeName]: 'Test', a: []}],
                    {entities: {Test: {a: {
                        type: 'integer[]', emptyEqualsToNull: false
                    }}}},
                    'NoChange'
                ],
                [
                    [
                        {[typeName]: 'Test', a: [1, 2]},
                        {[typeName]: 'Test', a: [1, 2]}
                    ],
                    {entities: {Test: {a: {type: 'integer[]'}}}},
                    'NoChange'
                ],
                [
                    [
                        {[typeName]: 'Test', a: {b: 1}},
                        {[typeName]: 'Test', a: {b: 1}}
                    ],
                    {entities: {Test: {a: {type: {b: 1}}}}},
                    'NoChange'
                ],
                [
                    [
                        {[typeName]: 'Test', a: {[typeName]: '_test', b: 1}},
                        {[typeName]: 'Test', a: {[typeName]: '_test', b: 1}}
                    ],
                    {entities: {
                        _test: {b: {type: 'number'}},
                        Test: {a: {type: '_test'}}
                    }},
                    'NoChange'
                ],
                [
                    [
                        {[typeName]: 'Test', a: new Date(0)},
                        {[typeName]: 'Test', a: 0}
                    ],
                    {entities: {Test: {a: {type: 'DateTime'}}}},
                    'NoChange'
                ],
                [
                    [{[typeName]: 'Test', _deleted: true}],
                    {entities: {Test: {}}},
                    'NoChange'
                ],
                [
                    [{[typeName]: 'Test'}, {[typeName]: 'Test', a: '1'}],
                    {entities: {Test: {a: {}}}},
                    updateStrategy ? 'NoChange' : {[typeName]: 'Test'}
                ],
                // endregion
                // region model
                // No specified type should result in an exception.
                [[{}, {}], 'Type'],
                /*
                    Am explicit type name has to follow the convention (have to
                    start with an uppercase character).
                */
                [[{[typeName]: 'test'}], 'TypeName'],
                [[{[typeName]: '_test'}], 'TypeName'],
                // A given type has to be specified.
                [[{[typeName]: 'Test'}], 'Model'],
                /*
                    A valid specified type which will be changed to an invalid
                    one (on update trigger) should result in an exception.
                */
                [
                    [{[typeName]: 'Test'}],
                    {entities: {Test: {[specialNames.create.execution]: `
                        newDocument['${typeName}'] = '_test'
                        return newDocument
                    `}}},
                    'TypeName'
                ],
                [
                    [{[typeName]: 'Test'}],
                    {entities: {Test: {[specialNames.create.expression]: `
                        (newDocument['${typeName}'] = '_test') &&
                        newDocument
                    `}}},
                    'TypeName'
                ],
                [
                    [{[typeName]: 'Test'}],
                    {entities: {Test: {[specialNames.update.execution]: `
                        newDocument['${typeName}'] = '_test'
                        return newDocument
                    `}}},
                    'TypeName'
                ],
                [
                    [{[typeName]: 'Test'}],
                    {entities: {Test: {[specialNames.update.expression]: `
                        (newDocument['${typeName}'] = '_test') &&
                        newDocument
                    `}}},
                    'TypeName'
                ],
                // endregion
                // region hooks
                // / region on create
                /*
                    Syntactically invalid create expressions should lead to an
                    exception.
                */
                [
                    [{[typeName]: 'Test', a: ''}],
                    {entities: {Test: {a: {onCreateExpression: '+'}}}},
                    'Compilation'
                ],
                [
                    [{[typeName]: 'Test', a: ''}],
                    {entities: {Test: {a: {onCreateExecution: 'return +'}}}},
                    'Compilation'
                ],
                /*
                    Runtime errors during running create expressions should
                    lead to an exception.
                */
                [
                    [{[typeName]: 'Test', a: ''}],
                    {entities: {Test: {a: {
                        onCreateExpression: 'undefinedVariableName'
                    }}}},
                    'Runtime'
                ],
                [
                    [{[typeName]: 'Test', a: ''}],
                    {entities: {Test: {a: {
                        onCreateExecution: 'return undefinedVariableName'
                    }}}},
                    'Runtime'
                ],
                // / endregion
                // / region on update
                /*
                    Syntactically invalid update expressions should lead to an
                    exception.
                */
                [
                    [{[typeName]: 'Test', a: ''}],
                    {entities: {Test: {a: {onUpdateExpression: '+'}}}},
                    'Compilation'
                ],
                [
                    [{[typeName]: 'Test', a: ''}],
                    {entities: {Test: {a: {onUpdateExecution: 'return +'}}}},
                    'Compilation'
                ],
                /*
                    Runtime errors during running create expressions should
                    lead to an exception.
                */
                [
                    [{[typeName]: 'Test', a: ''}],
                    {entities: {Test: {a: {
                        onUpdateExpression: 'undefinedVariableName'
                    }}}},
                    'Runtime'
                ],
                [
                    [{[typeName]: 'Test', a: ''}],
                    {entities: {Test: {a: {
                        onUpdateExecution: 'return undefinedVariableName'
                    }}}},
                    'Runtime'
                ],
                // / endregion
                // endregion
                // region property writable/mutable
                [
                    [{[typeName]: 'Test', a: 'b'}, {[typeName]: 'Test'}],
                    {entities: {Test: {a: {writable: false}}}},
                    'Readonly'
                ],
                [
                    [
                        {[typeName]: 'Test', a: 'b'},
                        {[typeName]: 'Test', a: 'a'}
                    ],
                    {entities: {Test: {a: {writable: false}}}},
                    'Readonly'
                ],
                // endregion
                // region property existence
                // Not specified properties should result in an exception.
                [
                    [{[typeName]: 'Test', a: 2}],
                    {entities: {Test: {}}},
                    'Property'
                ],
                /*
                    Required fields have to be defined properly (not null or
                    undefined).
                */
                [
                    [{[typeName]: 'Test', a: null}],
                    {entities: {Test: {a: {nullable: false}}}},
                    'NotNull'
                ],
                [
                    [{[typeName]: 'Test'}],
                    {entities: {Test: {a: {nullable: false}}}},
                    'MissingProperty'
                ],
                [
                    [{[typeName]: 'Test'}, {[typeName]: 'Test', a: ''}],
                    {entities: {Test: {a: {nullable: false}}}},
                    updateStrategy ? 'NoChange' : 'MissingProperty'
                ],
                // endregion
                // region property type
                /*
                    Properties have to be its specified type (string is
                    default).
                */
                [
                    [{[typeName]: 'Test', a: 2}],
                    {entities: {Test: {a: {}}}},
                    'PropertyType'
                ],
                [
                    [{[typeName]: 'Test', a: 'b'}],
                    {entities: {Test: {a: {type: 'number'}}}},
                    'PropertyType'
                ],
                [
                    [{[typeName]: 'Test', a: parseInt('a')}],
                    {entities: {Test: {a: {type: 'number'}}}},
                    'PropertyType'
                ],
                [
                    [{[typeName]: 'Test', a: 'b'}],
                    {entities: {Test: {a: {type: 'integer'}}}},
                    'PropertyType'
                ],
                [
                    [{[typeName]: 'Test', a: 2.2}],
                    {entities: {Test: {a: {type: 'integer'}}}},
                    'PropertyType'
                ],
                [
                    [{[typeName]: 'Test', a: 1}],
                    {entities: {Test: {a: {type: 'boolean'}}}},
                    'PropertyType'
                ],
                [
                    [{[typeName]: 'Test', a: 'a'}],
                    {entities: {Test: {a: {type: 'DateTime'}}}},
                    'PropertyType'
                ],
                [
                    [{[typeName]: 'Test', a: new Date('a')}],
                    {entities: {Test: {a: {type: 'DateTime'}}}},
                    'PropertyType'
                ],
                [
                    [{[typeName]: 'Test', a: '1'}],
                    {entities: {Test: {[specialNames.additional]: {
                        type: 'number'
                    }}}},
                    'PropertyType'
                ],
                [
                    [{[typeName]: 'Test', a: '1'}],
                    {entities: {Test: {[specialNames.additional]: {
                        type: ['number', 'boolean', '2']
                    }}}},
                    'PropertyType'
                ],
                // / region array
                // // region type
                [
                    [{[typeName]: 'Test', a: 2}],
                    {entities: {Test: {a: {type: 'string[]'}}}},
                    'PropertyType'
                ],
                [
                    [{[typeName]: 'Test', a: [2]}],
                    {entities: {Test: {a: {type: 'string[]'}}}}, 'PropertyType'
                ],
                [
                    [{[typeName]: 'Test', a: ['b']}],
                    {entities: {Test: {a: {type: 'number[]'}}}}, 'PropertyType'
                ],
                [
                    [{[typeName]: 'Test', a: [1]}],
                    {entities: {Test: {a: {type: 'boolean[]'}}}},
                    'PropertyType'
                ],
                [
                    [{[typeName]: 'Test', a: '[1]'}],
                    {entities: {Test: {a: {type: 'DateTime'}}}}, 'PropertyType'
                ],
                [
                    [{[typeName]: 'Test', a: '["a"]'}],
                    {entities: {Test: {a: {type: 'DateTime[]'}}}},
                    'PropertyType'
                ],
                [
                    [{[typeName]: 'Test', a: [{[typeName]: 'Test'}]}],
                    {entities: {Test: {a: {type: 'Custom[]'}}}}, 'PropertyType'
                ],
                [
                    [{[typeName]: 'Test', a: [{[typeName]: 'Custom'}, {
                        [typeName]: 'Test'
                    }]}],
                    {entities: {Test: {a: {type: 'Custom[]'}}}}, 'PropertyType'
                ],
                // // endregion
                [
                    [{[typeName]: 'Test', a: [{[typeName]: 'Test', b: 2}]}],
                    {entities: {Test: {a: {type: 'Test[]'}}}}, 'Property'
                ],
                [
                    [{[typeName]: 'Test', a: [{
                        [typeName]: 'Test', b: null
                    }], b: 'a'}],
                    {entities: {Test: {a: {type: 'Test[]'}, b: {
                        nullable: false
                    }}}}, 'NotNull'
                ],
                [[
                    {[typeName]: 'Test', a: [{[typeName]: 'Test', b: 'a'}]},
                    {[typeName]: 'Test', a: [{[typeName]: 'Test', b: 'b'}]}
                ], {entities: {
                    Test: {a: {type: 'Test[]', writable: false}, b: {}}
                }}, 'Readonly'],
                [
                    [{[typeName]: 'Test', a: [4], b: [{[typeName]: 'Test', a: [
                        2
                    ]}]}], {entities: {Test: {
                        a: {type: 'number[]', minimum: 3},
                        b: {type: 'Test[]'}
                    }}}, 'Minimum'
                ],
                [
                    [{[typeName]: 'Test', a: [4]}], {entities: {Test: {
                        a: {type: 'integer[]', minimumNumber: 2}
                    }}}, 'MinimumArrayLength'
                ],
                [
                    [{[typeName]: 'Test', a: []}], {entities: {Test: {a: {
                        emptyEqualsToNull: false,
                        minimumNumber: 1,
                        type: 'integer[]'
                    }}}}, 'MinimumArrayLength'
                ],
                [
                    [{[typeName]: 'Test', a: [1]}], {entities: {Test: {
                        a: {type: 'integer[]', maximumNumber: 0}
                    }}}, 'MaximumArrayLength'
                ],
                [
                    [{[typeName]: 'Test', a: [1, 2]}], {entities: {Test: {
                        a: {type: 'integer[]', maximumNumber: 1}
                    }}}, 'MaximumArrayLength'
                ],
                [
                    [{[typeName]: 'Test', a: [1, 2, 3]}], {entities: {Test: {
                        a: {type: 'integer[]', maximumNumber: 2}
                    }}}, 'MaximumArrayLength'
                ],
                [
                    [{[typeName]: 'Test', a: [1]}], {entities: {Test: {
                        a: {type: 'integer[]', constraintExpression: {
                            evaluation: 'newValue === 2'
                        }}
                    }}}, 'ConstraintExpression'
                ],
                [
                    [{[typeName]: 'Test', a: [1]}], {entities: {Test: {
                        a: {type: 'integer[]', arrayConstraintExpression: {
                            evaluation: 'newValue.length === 2'
                        }}
                    }}}, 'ArrayConstraintExpression'
                ],
                // / endregion
                // / region nested property
                // // region property type
                [
                    [{[typeName]: 'Test', a: 1}],
                    {entities: {Test: {a: {type: 'Test'}}}}, 'NestedType'
                ],
                [
                    [{[typeName]: 'Test', a: null}],
                    {entities: {Test: {a: {type: 'Test', nullable: false}}}},
                    'NotNull'
                ],
                [
                    [{[typeName]: 'Test', a: {type: 'Test'}}],
                    {entities: {NotTest: {a: {type: 'Test'}}}}, 'Model'
                ],
                [
                    [{
                        [typeName]: 'Test',
                        a: {[typeName]: 'Test', b: 2},
                        b: 'a'
                    }],
                    {entities: {Test: {a: {type: 'Test'}, b: {}}}},
                    'PropertyType'
                ],
                // // endregion
                // // region property existence
                [
                    [{[typeName]: 'Test', a: {[typeName]: 'Test', b: 2}}],
                    {entities: {Test: {a: {type: 'Test'}}}}, 'Property'
                ],
                [[{
                    [typeName]: 'Test',
                    a: {[typeName]: 'Test', b: null},
                    b: 'a'
                }], {entities: {Test: {a: {type: 'Test'}, b: {
                    nullable: false
                }}}}, 'NotNull'],
                [
                    [{[typeName]: 'Test', a: {[typeName]: 'Test'}, b: 'a'}],
                    {entities: {Test: {a: {type: 'Test'}, b: {
                        nullable: false
                    }}}}, 'MissingProperty'
                ],
                // // endregion
                // // region property readonly
                [
                    [
                        {[typeName]: 'Test', a: {[typeName]: 'Test', b: 'a'}},
                        {[typeName]: 'Test', a: {[typeName]: 'Test', b: 'b'}}
                    ], {entities: {Test: {a: {type: 'Test'}, b: {
                        writable: false
                    }}}}, 'Readonly'
                ],
                [
                    [
                        {[typeName]: 'Test', a: {[typeName]: 'Test', b: 'a'}},
                        {[typeName]: 'Test', a: {[typeName]: 'Test', b: 'b'}}
                    ], {entities: {Test: {a: {type: 'Test'}, b: {
                        mutable: false
                    }}}}, 'Immutable'
                ],
                [
                    [
                        {[typeName]: 'Test', a: {[typeName]: 'Test', b: 'a'}},
                        {[typeName]: 'Test', a: {[typeName]: 'Test'}}
                    ], {entities: {Test: {a: {type: 'Test'}, b: {
                        writable: false
                    }}}}, 'Readonly'
                ],
                [
                    [
                        {[typeName]: 'Test', a: {[typeName]: 'Test', b: 'a'}},
                        {[typeName]: 'Test', a: {[typeName]: 'Test', b: 'b'}},
                        {}, {}
                    ],
                    {entities: {Test: {a: {type: 'Test', writable: false}, b: {
                    }}}}, 'Readonly'
                ],
                // // endregion
                // // region property range
                [[{
                    [typeName]: 'Test',
                    a: 4,
                    b: {[typeName]: 'Test', a: 2}
                }], {entities: {Test: {
                    a: {type: ['number', 'string'], minimum: 3},
                    b: {type: 'Test'}
                }}}, 'Minimum'],
                [[{
                    [typeName]: 'Test',
                    a: '1',
                    b: {[typeName]: 'Test', a: '12'}
                }], {entities: {Test: {
                    a: {maximumLength: 1},
                    b: {type: 'Test'}
                }}}, 'MaximalLength'],
                // // endregion
                // // region property pattern
                [
                    [{[typeName]: 'Test', b: {[typeName]: 'Test', a: 'b'}}],
                    {entities: {Test: {
                        a: {regularExpressionPattern: 'a'},
                        b: {type: 'Test'}
                    }}}, 'PatternMatch'
                ],
                [
                    [{[typeName]: 'Test', b: {[typeName]: 'Test', a: 'a'}}],
                    {entities: {Test: {
                        a: {invertedRegularExpressionPattern: 'a'},
                        b: {type: 'Test'}
                    }}}, 'InvertedPatternMatch'
                ],
                // // endregion
                // // region property constraint
                [[{
                    [typeName]: 'Test',
                    a: 'b',
                    b: {[typeName]: 'Test', a: 'a'}
                }], {entities: {Test: {
                    a: {constraintExpression: {
                        evaluation: 'newValue === "b"'
                    }},
                    b: {type: 'Test'}
                }}}, 'ConstraintExpression'],
                [[{[typeName]: 'Test', a: 'b', b: {
                    [typeName]: 'Test', a: 'a'
                }}], {entities: {Test: {
                    a: {constraintExpression: {
                        evaluation: 'newValue === "b"'
                    }},
                    b: {type: 'Test'}
                }}}, 'ConstraintExpression'],
                // // endregion
                // / endregion
                [
                    [{[typeName]: 'Test1', a: 1}], {entities: {
                        Test1: {a: {type: 'foreignKey:Test2'}},
                        Test2: {[idName]: {type: 'string'}}
                    }}, 'PropertyType'
                ],
                [[{[typeName]: 'Test', a: 1}], {entities: {Test: {a: {
                    type: 2
                }}}}, 'PropertyType'],
                // endregion
                // region property range
                // Values have to be in their specified range.
                [
                    [{[typeName]: 'Test', a: 2}],
                    {entities: {Test: {a: {type: 'number', minimum: 3}}}},
                    'Minimum'
                ],
                [
                    [{[typeName]: 'Test', a: 1.1}],
                    {entities: {Test: {a: {type: 'number', maximum: 1}}}},
                    'Maximum'
                ],
                [
                    [{[typeName]: 'Test', a: 2}],
                    {entities: {Test: {a: {type: 'integer', maximum: 1}}}},
                    'Maximum'
                ],
                [
                    [{[typeName]: 'Test', a: '12'}],
                    {entities: {Test: {a: {minimumLength: 3}}}},
                    'MinimalLength'
                ],
                [
                    [{[typeName]: 'Test', a: '12'}],
                    {entities: {Test: {a: {maximumLength: 1}}}},
                    'MaximalLength'
                ],
                // endregion
                // region selection
                // Values have to be in their specified limits.
                [
                    [{[typeName]: 'Test', a: 2}],
                    {entities: {Test: {a: {type: 'number', selection: []}}}},
                    'Selection'
                ],
                [
                    [{[typeName]: 'Test', a: 2}],
                    {entities: {Test: {a: {type: 'number', selection: [1]}}}},
                    'Selection'
                ],
                [
                    [{[typeName]: 'Test', a: 2}],
                    {entities: {Test: {a: {type: 'integer', selection: [
                        1, 3
                    ]}}}},
                    'Selection'
                ],
                // endregion
                // region property pattern
                // Values have to match their specified pattern.
                [
                    [{[typeName]: 'Test', a: 'b'}],
                    {entities: {Test: {a: {regularExpressionPattern: 'a'}}}},
                    'PatternMatch'
                ],
                [
                    [{[typeName]: 'Test', a: 'a'}],
                    {entities: {Test: {a: {
                        invertedRegularExpressionPattern: 'a'
                    }}}},
                    'InvertedPatternMatch'
                ],
                // endregion
                // region property constraint
                /*
                    Values have to satisfy their constraints so a given
                    constraint expression has to resolve to "true".
                */
                [
                    [{[typeName]: 'Test', a: 'b'}],
                    {entities: {Test: {a: {constraintExpression: {
                        evaluation: 'false'
                    }}}}},
                    'ConstraintExpression'
                ],
                [
                    [{[typeName]: 'Test', a: 'b'}],
                    {entities: {Test: {a: {constraintExecution: {
                        evaluation: 'return false'
                    }}}}},
                    'ConstraintExecution'
                ],
                [
                    [{[typeName]: 'Test', a: 'b'}],
                    {entities: {Test: {a: {constraintExpression: {
                        evaluation: '+'
                    }}}}},
                    'Compilation'
                ],
                [
                    [{[typeName]: 'Test', a: 'b'}],
                    {entities: {Test: {a: {constraintExpression: {
                        evaluation: 'undefinedVariableName'
                    }}}}},
                    'Runtime'
                ],
                [
                    [{[typeName]: 'Test', a: 'b'}],
                    {entities: {Test: {a: {constraintExecution: {
                        evaluation: 'return undefinedVariableName'
                    }}}}},
                    'Runtime'
                ],
                [
                    [{[typeName]: 'Test', a: 'b'}],
                    {entities: {Test: {a: {constraintExpression: {
                        evaluation: 'newValue === "a"'
                    }}}}},
                    'ConstraintExpression'
                ],
                // endregion
                // region constraint
                /*
                    Models have to satisfy their constraints so a given
                    constraint expression has to resolve to "true".
                */
                [
                    [{[typeName]: 'Test', a: 'a', b: 'b'}],
                    {entities: {Test: {
                        _constraintExpressions: [{evaluation: 'false'}],
                        a: {},
                        b: {}
                    }}},
                    'ConstraintExpressions'
                ],
                [
                    [{[typeName]: 'Test', a: 'a', b: 'b'}],
                    {entities: {Test: {
                        _constraintExecutions: [{evaluation: 'return false'}],
                        a: {},
                        b: {}
                    }}},
                    'ConstraintExecutions'
                ],
                [
                    [{[typeName]: 'Test', a: 'a', b: 'b'}],
                    {entities: {Test: {
                        _constraintExecutions: [{
                            description: '`Fails always!`',
                            evaluation: 'return false'
                        }],
                        a: {},
                        b: {}
                    }}},
                    'ConstraintExecutions'
                ],
                [
                    [{[typeName]: 'Test', a: 'a', b: 'b'}],
                    {entities: {Test: {
                        _constraintExecutions: [{
                            description: '`a: ${newDocument.a} failed!`',
                            evaluation: 'return newDocument.a === newDocument.b'
                        }],
                        a: {},
                        b: {}
                    }}},
                    'ConstraintExecutions'
                ],
                // endregion
                // region attachment
                // Non specified attachments aren't allowed.
                [
                    [{[typeName]: 'Test', [attachmentName]: {}}],
                    {entities: {Test: {}}},
                    'Property'
                ],
                // Required attachments have to be present.
                [
                    [{[typeName]: 'Test'}],
                    {entities: {Test: {[attachmentName]: {
                        '.*': {minimumNumber: 1, nullable: false}
                    }}}},
                    'AttachmentMissing'
                ],
                [
                    [{[typeName]: 'Test', [attachmentName]: {test: {
                        data: null
                    }}}],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        nullable: false
                    }}}}},
                    'AttachmentMissing'
                ],
                [
                    [{
                        [typeName]: 'Test',
                        [attachmentName]: {test: {data: null}}
                    }],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        minimumNumber: 1, nullable: false
                    }}}}},
                    'AttachmentMissing'
                ],
                // Every required attachments have to be present.
                [
                    [{[typeName]: 'Test', [attachmentName]: {
                        /* eslint-disable camelcase */
                        a: {data: '', content_type: 'text/plain'}
                        /* eslint-enable camelcase */
                    }}],
                    {entities: {Test: {[attachmentName]: {
                        a: {minimumNumber: 1, nullable: false},
                        b: {minimumNumber: 1, nullable: false}
                    }}}},
                    'AttachmentMissing'
                ],
                [
                    [{[typeName]: 'Test'}],
                    {entities: {Test: {[attachmentName]: {a: {
                        minimumNumber: 1, nullable: false
                    }}}}},
                    'AttachmentMissing'
                ],
                [
                    [{[typeName]: 'Test', [attachmentName]: null}],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        minimumNumber: 1, nullable: false
                    }}}}},
                    'AttachmentMissing'
                ],
                // Attachments have to be attachments types.
                [
                    [{[typeName]: 'Test', [attachmentName]: new Date()}],
                    {entities: {Test: {[attachmentName]: {'.*': {}}}}},
                    'AttachmentType'
                ],
                // Number of attachments have to be in its specified bounds.
                [
                    [{[typeName]: 'Test', [attachmentName]: {
                        /* eslint-disable camelcase */
                        a: {data: '', content_type: 'text/plain'},
                        b: {data: '', content_type: 'text/plain'}
                        /* eslint-enable camelcase */
                    }}],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        maximumNumber: 1
                    }}}}},
                    'AttachmentMaximum'
                ],
                [
                    [{[typeName]: 'Test', [attachmentName]: {test: {
                        /* eslint-disable camelcase */
                        data: '', content_type: 'text/plain'
                        /* eslint-enable camelcase */
                    }}}],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        minimumNumber: 2
                    }}}}},
                    'AttachmentMinimum'
                ],
                [
                    [{[typeName]: 'Test', [attachmentName]: {}}],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        minimumNumber: 1, nullable: false
                    }}}}},
                    'AttachmentMissing'
                ],
                /*
                    Needed attachments should be removable if no proper
                    replacement is provided.
                */
                [
                    [
                        {[typeName]: 'Test', [attachmentName]: {test: {
                            data: null
                        }}},
                        {
                            [typeName]: 'Test',
                            [attachmentName]: {test: {
                                /* eslint-disable camelcase */
                                content_type: 'text/plain', data: ''
                                /* eslint-enable camelcase */
                            }}
                        }
                    ],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        nullable: false
                    }}}}},
                    'AttachmentMissing'
                ],
                // Attachments types should match their specification.
                [
                    [{[typeName]: 'Test', [attachmentName]: {a: {
                        /* eslint-disable camelcase */
                        data: '', content_type: 'text/plain'
                        /* eslint-enable camelcase */
                    }}}],
                    {entities: {Test: {[attachmentName]: {b: {}}}}},
                    'AttachmentTypeMatch'
                ],
                [
                    [{[typeName]: 'Test', [attachmentName]: {a: {
                        /* eslint-disable camelcase */
                        data: '', content_type: 'text/plain'
                        /* eslint-enable camelcase */
                    }}}],
                    {entities: {Test: {[attachmentName]: {b: {}, c: {}}}}},
                    'AttachmentTypeMatch'
                ],
                // Attachments names should match their specification.
                [
                    [{[typeName]: 'Test', [attachmentName]: {a: {
                        /* eslint-disable camelcase */
                        data: '', content_type: 'text/plain'
                        /* eslint-enable camelcase */
                    }}}],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        regularExpressionPattern: /b/g
                    }}}}},
                    'AttachmentName'
                ],
                [
                    [{[typeName]: 'Test', [attachmentName]: {a: {
                        /* eslint-disable camelcase */
                        data: '', content_type: 'text/plain'
                        /* eslint-enable camelcase */
                    }}}],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        invertedRegularExpressionPattern: /a/g
                    }}}}},
                    'InvertedAttachmentName'
                ],
                [
                    [{[typeName]: 'Test', [attachmentName]: {
                        /* eslint-disable camelcase */
                        a: {data: '', content_type: 'text/plain'},
                        b: {data: '', content_type: 'text/plain'}
                        /* eslint-enable camelcase */
                    }}],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        regularExpressionPattern: /a/
                    }}}}},
                    'AttachmentName'
                ],
                [
                    [{[typeName]: 'Test', [attachmentName]: {
                        /* eslint-disable camelcase */
                        a: {data: '', content_type: 'text/plain'},
                        b: {data: '', content_type: 'text/plain'}
                        /* eslint-enable camelcase */
                    }}],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        invertedRegularExpressionPattern: /a/
                    }}}}},
                    'InvertedAttachmentName'
                ],
                // Attachments content type should match their specification.
                [
                    [{[typeName]: 'Test', [attachmentName]: {
                        /* eslint-disable camelcase */
                        a: {data: '', content_type: 'text/plain'},
                        b: {data: '', content_type: 'image/jpg'}
                        /* eslint-enable camelcase */
                    }}],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        contentTypeRegularExpressionPattern: /text\/plain/
                    }}}}},
                    'AttachmentContentType'
                ],
                // Attachments specified sizes should be ensured.
                [
                    [{[typeName]: 'Test', [attachmentName]: {a: {
                        data: 'a', length: 1
                    }}}],
                    {entities: {Test: {[attachmentName]: {a: {
                        minimumSize: 2
                    }}}}},
                    'AttachmentMinimumSize'
                ],
                [
                    [{[typeName]: 'Test', [attachmentName]: {a: {
                        data: 'abcd', length: 3
                    }}}],
                    {entities: {Test: {[attachmentName]: {a: {maximumSize: 2
                    }}}}},
                    'AttachmentMaximumSize'
                ],
                // Overall attachments specified sizes should be ensured.
                [
                    [{[typeName]: 'Test', [attachmentName]: {a: {
                        data: 'a', length: 1
                    }}}],
                    {entities: {Test: {[attachmentName]: {a: {
                        minimumAggregatedSize: 2
                    }}}}},
                    'AttachmentAggregatedMinimumSize'
                ],
                [
                    [{[typeName]: 'Test', [attachmentName]: {a: {
                        data: 'abcd', length: 3
                    }}}],
                    {entities: {Test: {[attachmentName]: {a: {
                        maximumAggregatedSize: 2
                    }}}}},
                    'AttachmentAggregatedMaximumSize'
                ],
                [
                    [{[typeName]: 'Test', [attachmentName]: {a: {
                        data: 'a', length: 1
                    }}}],
                    {entities: {Test: {
                        _minimumAggregatedSize: 2,
                        [attachmentName]: {a: {}}
                    }}},
                    'AggregatedMinimumSize'
                ],
                [
                    [{[typeName]: 'Test', [attachmentName]: {a: {
                        data: 'abcd', length: 3
                    }}}],
                    {entities: {Test: {
                        _maximumAggregatedSize: 2,
                        [attachmentName]: {a: {}}
                    }}},
                    'AggregatedMaximumSize'
                ]
                // endregion
            ]) {
                if (test.length < 3)
                    test.splice(1, 0, {})
                const modelConfiguration:ModelConfiguration = Tools.extend(
                    true, Tools.copy(defaultModelConfiguration), test[1]
                )
                const models:Models = Helper.extendModels(modelConfiguration)
                delete modelConfiguration.property.defaultSpecification
                delete modelConfiguration.entities
                const parameter:Array<any> = test[0]
                    .concat([null, {}, {}].slice(test[0].length - 1))
                    .concat(modelConfiguration, models)
                if (typeof test[2] !== 'string') {
                    expect(DatabaseHelper.validateDocumentUpdate(...parameter))
                        .toStrictEqual(test[2])
                    continue
                }
                expect(():Document =>
                    DatabaseHelper.validateDocumentUpdate(...parameter)
                ).toThrow(new RegExp(`^${test[2]}: .+[.!]$`, 's'))
            }
            // endregion
            // region allowed writes
            for (const test of [
                // region general environment
                /*
                    NOTE: Needed if we are able to validate "_users" table:

                    [
                        [{type: 'user', [idName]: 'org.couchdb.user:test'}],
                        {},
                        {
                            fillUp: {
                                type: 'user',
                                [idName]: 'org.couchdb.user:test'
                            },
                            incremental: {
                                type: 'user', [idName]: 'org.couchdb.user:test'
                            },
                            '': {
                                type: 'user', [idName]: 'org.couchdb.user:test'
                            }
                        }
                    ],
                    [
                        [
                            {type: 'user', [idName]: 'org.couchdb.user:test'},
                            {type: 'user', [idName]: 'org.couchdb.user:test'}
                        ],
                        {},
                        {
                            fillUp: {
                                type: 'user',
                                [idName]: 'org.couchdb.user:test'
                            },
                            incremental: {
                                type: 'user', [idName]: 'org.couchdb.user:test'
                            },
                            '': {
                                type: 'user', [idName]: 'org.couchdb.user:test'
                            }
                        }
                    ],
                */
                // It should be possible to remove existing documents.
                [
                    [
                        {[typeName]: 'Test', _deleted: true},
                        {[typeName]: 'Test'}
                    ],
                    {entities: {Test: {}}},
                    {
                        fillUp: {[typeName]: 'Test', _deleted: true},
                        incremental: {_deleted: true},
                        '': {[typeName]: 'Test', _deleted: true}
                    }
                ],
                /*
                    It should be possible to migrate documents with non
                    specified properties.
                */
                [
                    [{
                        a: 2,
                        [typeName]: 'Test',
                        [specialNames.strategy]: 'migrate'
                    }],
                    {entities: {Test: {}}},
                    {
                        fillUp: {[typeName]: 'Test'},
                        incremental: {[typeName]: 'Test'},
                        '': {[typeName]: 'Test'}
                    }
                ],
                // TODO document what is really tested.
                [
                    [
                        {[idName]: 1, [revisionName]: 1},
                        null,
                        {},
                        {
                            [configuration.couchdb.model.property.name
                                .validatedDocumentsCache
                            ]: new Set(['1-1'])
                        }
                    ],
                    {},
                    {
                        fillUp: {[idName]: 1, [revisionName]: 1},
                        incremental: {[idName]: 1, [revisionName]: 1},
                        '': {[idName]: 1, [revisionName]: 1}
                    }
                ],
                [
                    [
                        {
                            a: null,
                            [idName]: 1,
                            [revisionName]: 1,
                            [typeName]: 'Test'
                        },
                        {
                            [typeName]: 'Test',
                            [idName]: 1,
                            [revisionName]: 0,
                            a: 'a'
                        }
                    ],
                    {entities: {Test: {a: {}, [idName]: {type: 'number'}}}},
                    {
                        fillUp: {
                            [typeName]: 'Test', [idName]: 1, [revisionName]: 1
                        },
                        incremental: {[idName]: 1, [revisionName]: 1},
                        '': {
                            [idName]: 1,
                            [revisionName]: 1,
                            [typeName]: 'Test'
                        }
                    }
                ],
                [
                    [
                        {[typeName]: 'Test', [revisionName]: 'latest', a: 'a'},
                        {[typeName]: 'Test', [revisionName]: 1}
                    ],
                    {entities: {Test: {a: {}}}},
                    {
                        fillUp: {
                            [typeName]: 'Test',
                            [revisionName]: 1, a: 'a'
                        },
                        incremental: {[revisionName]: 1, a: 'a'},
                        '': {[typeName]: 'Test', [revisionName]: 1, a: 'a'}
                    }
                ],
                [
                    [
                        {[typeName]: 'Test', [revisionName]: 'upsert', a: 'a'},
                        {[typeName]: 'Test', [revisionName]: 1}
                    ],
                    {entities: {Test: {a: {}}}},
                    {
                        fillUp: {[typeName]: 'Test', [revisionName]: 1, a: 'a'},
                        incremental: {[revisionName]: 1, a: 'a'},
                        '': {[typeName]: 'Test', [revisionName]: 1, a: 'a'}
                    }
                ],
                [
                    [{[typeName]: 'Test', [revisionName]: 'upsert'}],
                    {entities: {Test: {}}},
                    {
                        fillUp: {[typeName]: 'Test'},
                        incremental: {[typeName]: 'Test'},
                        '': {[typeName]: 'Test'}
                    }
                ],
                [
                    [
                        {[typeName]: 'Test', [revisionName]: 1, a: 'a'},
                        {[typeName]: 'Test', [revisionName]: 1}
                    ], {entities: {Test: {a: {}}}},
                    {
                        fillUp: {
                            [typeName]: 'Test', [revisionName]: 1, a: 'a'
                        },
                        incremental: {[revisionName]: 1, a: 'a'},
                        '': {[typeName]: 'Test', [revisionName]: 1, a: 'a'}
                    }
                ],
                /*
                    Only explicitly specified properties should be
                    automatically filled up from old documents.
                */
                [
                    [{[typeName]: 'Test', a: 1}, {[typeName]: 'Test', b: 2}],
                    {entities: {Test: {[specialNames.additional]: {
                        type: 'any'
                    }}}},
                    {
                        fillUp: {[typeName]: 'Test', a: 1},
                        incremental: {a: 1},
                        '': {[typeName]: 'Test', a: 1}
                    }
                ],
                // endregion
                // region model
                // It specified be possible to created specified documents.
                [
                    [{[typeName]: 'Test'}],
                    {entities: {Test: {}}}, {
                        fillUp: {[typeName]: 'Test'},
                        incremental: {[typeName]: 'Test'},
                        '': {[typeName]: 'Test'}
                    }
                ],
                [
                    [{[typeName]: 'Test'}],
                    {entities: {Test: {}}},
                    {
                        fillUp: {[typeName]: 'Test'},
                        incremental: {[typeName]: 'Test'},
                        '': {[typeName]: 'Test'}
                    }
                ],
                [
                    [{[typeName]: 'Test'}],
                    {entities: {Test: {class: {}}}},
                    {
                        fillUp: {[typeName]: 'Test'},
                        incremental: {[typeName]: 'Test'},
                        '': {[typeName]: 'Test'}
                    }
                ],
                [
                    [
                        {[typeName]: 'Test', b: 'b'},
                        {[typeName]: 'Test', a: '2'}
                    ],
                    {entities: {Test: {a: {}, b: {}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: '2', b: 'b'},
                        incremental: {b: 'b'},
                        '': {[typeName]: 'Test', b: 'b'}
                    }
                ],
                [
                    [
                        {[typeName]: 'Test', a: '3'},
                        {[typeName]: 'Test', a: '2'}
                    ],
                    {entities: {Test: {a: {}}}},
                    {
                        fillUp: {a: '3', [typeName]: 'Test'},
                        incremental: {a: '3'},
                        '': {[typeName]: 'Test', a: '3'}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: {[typeName]: '_test'}}],
                    {entities: {Test: {a: {type: '_test'}}, _test: {}}},
                    {
                        fillUp: {[typeName]: 'Test', a: {[typeName]: '_test'}},
                        incremental: {
                            [typeName]: 'Test',
                            a: {[typeName]: '_test'}
                        },
                        '': {[typeName]: 'Test', a: {[typeName]: '_test'}}
                    }
                ],
                // endregion
                // region hooks
                // / region on create
                [
                    [{[typeName]: 'Test', a: ''}],
                    {entities: {Test: {a: {onCreateExpression: `'2'`}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: '2'},
                        incremental: {[typeName]: 'Test', a: '2'},
                        '': {[typeName]: 'Test', a: '2'}
                    }
                ],
                [
                    [{
                        [typeName]: 'Test',
                        [attachmentName]: {test: {
                            /* eslint-disable camelcase */
                            data: 'payload', content_type: 'text/plain'
                            /* eslint-enable camelcase */
                        }}
                    }],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        onCreateExpression:
                            `(newDocument[name].data += ' footer') && ` +
                            'newDocument[name]'
                    }}}}},
                    {
                        fillUp: {
                            [typeName]: 'Test',
                            [attachmentName]: {test: {
                                /* eslint-disable camelcase */
                                content_type: 'text/plain',
                                data: 'payload footer'
                                /* eslint-enable camelcase */
                            }}
                        },
                        incremental: {
                            [typeName]: 'Test',
                            [attachmentName]: {test: {
                                /* eslint-disable camelcase */
                                content_type: 'text/plain',
                                data: 'payload footer'
                                /* eslint-enable camelcase */
                            }}
                        },
                        '': {
                            [typeName]: 'Test',
                            [attachmentName]: {test: {
                                /* eslint-disable camelcase */
                                content_type: 'text/plain',
                                data: 'payload footer'
                                /* eslint-enable camelcase */
                            }}
                        }
                    }
                ],
                [
                    [
                        {
                            [typeName]: 'Test',
                            [attachmentName]: {test: {
                                /* eslint-disable camelcase */
                                data: 'payload', content_type: 'text/plain'
                                /* eslint-enable camelcase */
                            }}
                        },
                        {[typeName]: 'Test'}
                    ],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        onCreateExpression:
                            `(newDocument[name].data += ' footer') && ` +
                            'newDocument[name]'
                    }}}}},
                    {
                        fillUp: {
                            [typeName]: 'Test',
                            [attachmentName]: {test: {
                                /* eslint-disable camelcase */
                                data: 'payload', content_type: 'text/plain'
                                /* eslint-enable camelcase */
                            }}
                        },
                        incremental: {[attachmentName]: {test: {
                            /* eslint-disable camelcase */
                            data: 'payload', content_type: 'text/plain'
                            /* eslint-enable camelcase */
                        }}},
                        '': {
                            [typeName]: 'Test',
                            [attachmentName]: {test: {
                                /* eslint-disable camelcase */
                                data: 'payload', content_type: 'text/plain'
                                /* eslint-enable camelcase */
                            }}
                        }
                    }
                ],
                [
                    [{[typeName]: 'Test', a: ''}],
                    {entities: {Test: {a: {onCreateExecution: `return '2'`}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: '2'},
                        incremental: {[typeName]: 'Test', a: '2'},
                        '': {[typeName]: 'Test', a: '2'}
                    }
                ],
                [
                    [
                        {[typeName]: 'Test', a: '3', b: 'b'},
                        {[typeName]: 'Test', a: '3'}
                    ],
                    {entities: {Test: {
                        a: {onCreateExecution: `return '2'`},
                        b: {}
                    }}},
                    {
                        fillUp: {[typeName]: 'Test', a: '3', b: 'b'},
                        incremental: {b: 'b'},
                        '': {[typeName]: 'Test', a: '3', b: 'b'}
                    }
                ],
                // / endregion
                // / region on update
                [
                    [{[typeName]: 'Test', a: ''}],
                    {entities: {Test: {a: {onUpdateExpression: `'2'`}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: '2'},
                        incremental: {[typeName]: 'Test', a: '2'},
                        '': {[typeName]: 'Test', a: '2'}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: ''}],
                    {entities: {Test: {a: {onUpdateExecution: `return '2'`}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: '2'},
                        incremental: {[typeName]: 'Test', a: '2'},
                        '': {[typeName]: 'Test', a: '2'}
                    }
                ],
                [
                    [
                        {[typeName]: 'Test', a: '1', b: ''},
                        {[typeName]: 'Test', a: '2'}
                    ],
                    {entities: {Test: {
                        a: {onUpdateExpression: `'2'`},
                        b: {emptyEqualsToNull: false}
                    }}},
                    {
                        fillUp: {[typeName]: 'Test', a: '2', b: ''},
                        incremental: {b: ''},
                        '': {[typeName]: 'Test', a: '2', b: ''}
                    }
                ],
                [
                    [{
                        [typeName]: 'Test',
                        [attachmentName]: {test: {
                            /* eslint-disable camelcase */
                            content_type: 'text/plain',
                            data: 'payload'
                            /* eslint-enable camelcase */
                        }}
                    }],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        onUpdateExpression:
                            `(newDocument[name].data += ' footer') && ` +
                            'newDocument[name]'
                    }}}}},
                    {
                        fillUp: {
                            [typeName]: 'Test',
                            [attachmentName]: {test: {
                                /* eslint-disable camelcase */
                                content_type: 'text/plain',
                                data: 'payload footer'
                                /* eslint-enable camelcase */
                            }}
                        },
                        incremental: {
                            [typeName]: 'Test',
                            [attachmentName]: {test: {
                                /* eslint-disable camelcase */
                                content_type: 'text/plain',
                                data: 'payload footer'
                                /* eslint-enable camelcase */
                            }}
                        },
                        '': {
                            [typeName]: 'Test',
                            [attachmentName]: {test: {
                                /* eslint-disable camelcase */
                                content_type: 'text/plain',
                                data: 'payload footer'
                                /* eslint-enable camelcase */
                            }}
                        }
                    }
                ],
                [
                    [
                        {
                            [typeName]: 'Test',
                            [attachmentName]: {test: {
                                /* eslint-disable camelcase */
                                content_type: 'text/plain',
                                data: 'payload'
                                /* eslint-enable camelcase */
                            }}
                        },
                        {[typeName]: 'Test'}
                    ],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        onUpdateExpression:
                            `(newDocument[name].data += ' footer') && ` +
                            'newDocument[name]'
                    }}}}},
                    {
                        fillUp: {
                            [typeName]: 'Test',
                            [attachmentName]: {test: {
                                /* eslint-disable camelcase */
                                content_type: 'text/plain',
                                data: 'payload footer'
                                /* eslint-enable camelcase */
                            }}
                        },
                        incremental: {[attachmentName]: {test: {
                            /* eslint-disable camelcase */
                            content_type: 'text/plain',
                            data: 'payload footer'
                            /* eslint-enable camelcase */
                        }}},
                        '': {
                            [typeName]: 'Test',
                            [attachmentName]: {test: {
                                /* eslint-disable camelcase */
                                content_type: 'text/plain',
                                data: 'payload footer'
                                /* eslint-enable camelcase */
                            }}
                        }
                    }
                ],
                [
                    [{[typeName]: 'Test', a: ''}, {[typeName]: 'Test'}],
                    {entities: {Test: {
                        [attachmentName]: {'.*': {
                            onUpdateExpression:
                                `(newDocument[name].data += ' footer') && ` +
                                'newDocument[name]'
                        }},
                        a: {emptyEqualsToNull: false}
                    }}},
                    {
                        fillUp: {[typeName]: 'Test', a: ''},
                        incremental: {a: ''},
                        '': {[typeName]: 'Test', a: ''}
                    }
                ],
                // / endregion
                // endregion
                // region property writable/mutable
                [
                    [
                        {[typeName]: 'Test', a: 'b', b: ''},
                        {[typeName]: 'Test', a: 'b'}
                    ],
                    {entities: {Test: {a: {writable: false}, b: {
                        emptyEqualsToNull: false
                    }}}},
                    {
                        fillUp: {[typeName]: 'Test', a: 'b', b: ''},
                        incremental: {b: ''},
                        '': {[typeName]: 'Test', a: 'b', b: ''}
                    }
                ],
                [
                    [
                        {[typeName]: 'Test', b: ''},
                        {[typeName]: 'Test'}
                    ],
                    {entities: {Test: {
                        a: {writable: false},
                        b: {emptyEqualsToNull: false}
                    }}},
                    {
                        fillUp: {[typeName]: 'Test', b: ''},
                        incremental: {b: ''},
                        '': {[typeName]: 'Test', b: ''}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: '2'}, {[typeName]: 'Test'}],
                    {entities: {Test: {a: {mutable: false}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: '2'},
                        incremental: {a: '2'},
                        '': {[typeName]: 'Test', a: '2'}
                    }
                ],
                // endregion
                // region property existents
                [
                    [
                        {[typeName]: 'Test', a: null},
                        {[typeName]: 'Test', a: ''}
                    ],
                    {entities: {Test: {a: {emptyEqualsToNull: false}}}},
                    {
                        fillUp: {[typeName]: 'Test'},
                        incremental: {},
                        '': {[typeName]: 'Test'}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: 2}],
                    {entities: {Test: {a: {type: 'number'}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: 2},
                        incremental: {[typeName]: 'Test', a: 2},
                        '': {[typeName]: 'Test', a: 2}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: null}],
                    {entities: {Test: {a: {}}}},
                    {
                        fillUp: {[typeName]: 'Test'},
                        incremental: {[typeName]: 'Test'},
                        '': {[typeName]: 'Test'}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: 'a'}],
                    {entities: {Test: {a: {nullable: false}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: 'a'},
                        incremental: {[typeName]: 'Test', a: 'a'},
                        '': {[typeName]: 'Test', a: 'a'}
                    }
                ],
                [
                    [{[typeName]: 'Test'}],
                    {entities: {Test: {a: {default: '2', nullable: false}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: '2'},
                        incremental: {[typeName]: 'Test', a: '2'},
                        '': {[typeName]: 'Test', a: '2'}
                    }
                ],
                [
                    [{[typeName]: 'Test'}],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        default: {test: {
                            /* eslint-disable camelcase */
                            data: '', content_type: 'text/plain'
                            /* eslint-enable camelcase */
                        }},
                        nullable: false
                    }}}}},
                    {
                        fillUp: {
                            [typeName]: 'Test',
                            [attachmentName]: {test: {
                                /* eslint-disable camelcase */
                                data: '', content_type: 'text/plain'
                                /* eslint-enable camelcase */
                            }}
                        },
                        incremental: {
                            [typeName]: 'Test',
                            [attachmentName]: {test: {
                                /* eslint-disable camelcase */
                                data: '', content_type: 'text/plain'
                                /* eslint-enable camelcase */
                            }}
                        },
                        '': {
                            [typeName]: 'Test',
                            [attachmentName]: {test: {
                                /* eslint-disable camelcase */
                                data: '', content_type: 'text/plain'
                                /* eslint-enable camelcase */
                            }}
                        }
                    }
                ],
                // endregion
                // region property type
                [
                    [
                        {[typeName]: 'Test', a: '2 ', b: ''},
                        {[typeName]: 'Test', a: '2'}
                    ],
                    {entities: {Test: {a: {}, b: {emptyEqualsToNull: false}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: '2', b: ''},
                        incremental: {b: ''},
                        '': {[typeName]: 'Test', a: '2', b: ''}
                    }
                ],
                [
                    [
                        {[typeName]: 'Test', a: '2 '},
                        {[typeName]: 'Test', a: '2'}
                    ],
                    {entities: {Test: {a: {trim: false}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: '2 '},
                        incremental: {a: '2 '},
                        '': {[typeName]: 'Test', a: '2 '}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: 3}, {[typeName]: 'Test', a: 2}],
                    {entities: {Test: {a: {type: 'integer'}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: 3},
                        incremental: {a: 3},
                        '': {[typeName]: 'Test', a: 3}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: 2.2}, {[typeName]: 'Test', a: 2}],
                    {entities: {Test: {a: {type: 'number'}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: 2.2},
                        incremental: {a: 2.2},
                        '': {[typeName]: 'Test', a: 2.2}
                    }
                ],
                [
                    [
                        {[typeName]: 'Test', a: true, b: ''},
                        {[typeName]: 'Test', a: true}
                    ],
                    {entities: {Test: {
                        a: {type: 'boolean'}, b: {emptyEqualsToNull: false}
                    }}},
                    {
                        fillUp: {[typeName]: 'Test', a: true, b: ''},
                        incremental: {b: ''},
                        '': {[typeName]: 'Test', a: true, b: ''}
                    }
                ],
                [
                    [
                        {[typeName]: 'Test', a: 1, b: ''},
                        {[typeName]: 'Test', a: 1}
                    ],
                    {entities: {Test: {
                        a: {type: 'DateTime'}, b: {emptyEqualsToNull: false}
                    }}},
                    {
                        fillUp: {[typeName]: 'Test', a: 1, b: ''},
                        incremental: {b: ''},
                        '': {[typeName]: 'Test', a: 1, b: ''}
                    }
                ],
                [
                    [
                        {
                            [typeName]: 'Test',
                            a: new Date(1970, 0, 1, 0, -1 * (
                                new Date(1970, 0, 1)
                            ).getTimezoneOffset()),
                            b: ''
                        },
                        {
                            [typeName]: 'Test',
                            a: new Date(1970, 0, 1, 0, -1 * (new Date(
                                1970, 0, 1
                            )).getTimezoneOffset())
                        }
                    ],
                    {entities: {Test: {a: {type: 'DateTime'}, b: {
                        emptyEqualsToNull: false
                    }}}},
                    {
                        fillUp: {[typeName]: 'Test', a: 0, b: ''},
                        incremental: {b: ''},
                        '': {[typeName]: 'Test', a: 0, b: ''}
                    }
                ],
                [
                    [
                        {
                            [typeName]: 'Test',
                            a: (new Date(1970, 0, 1, 0, -1 * (new Date(
                                1970, 0, 1
                            )).getTimezoneOffset())).toUTCString(),
                            b: ''
                        },
                        {
                            [typeName]: 'Test',
                            a: (new Date(1970, 0, 1, 0, -1 * (new Date(
                                1970, 0, 1
                            )).getTimezoneOffset())).toUTCString()
                        }
                    ],
                    {entities: {Test: {
                        a: {type: 'DateTime'},
                        b: {emptyEqualsToNull: false}
                    }}},
                    {
                        fillUp: {[typeName]: 'Test', a: 0, b: ''},
                        incremental: {b: ''},
                        '': {[typeName]: 'Test', a: 0, b: ''}
                    }
                ],
                [
                    [
                        {
                            [typeName]: 'Test',
                            a: new Date(1970, 0, 1, 0, -1 * (new Date(
                                1970, 0, 1
                            )).getTimezoneOffset()).toLocaleString(),
                            b: ''
                        },
                        {
                            [typeName]: 'Test',
                            a: new Date(1970, 0, 1, 0, -1 * (new Date(
                                1970, 0, 1
                            )).getTimezoneOffset()).toLocaleString()
                        }
                    ],
                    {entities: {Test: {
                        a: {type: 'DateTime'},
                        b: {emptyEqualsToNull: false}}}
                    },
                    {
                        fillUp: {[typeName]: 'Test', a: 0, b: ''},
                        incremental: {b: ''},
                        '': {[typeName]: 'Test', a: 0, b: ''}
                    }
                ],
                [
                    [
                        {
                            [typeName]: 'Test',
                            a: new Date(1970, 0, 1, 0, -1 * (new Date(
                                1970, 0, 1
                            )).getTimezoneOffset(), 1, 0),
                            b: ''
                        },
                        {
                            [typeName]: 'Test',
                            a: new Date(1970, 0, 1, 0, -1 * (new Date(
                                1970, 0, 1
                            )).getTimezoneOffset(), 1, 0)
                        }
                    ],
                    {entities: {Test: {
                        a: {type: 'DateTime'},
                        b: {emptyEqualsToNull: false}
                    }}},
                    {
                        fillUp: {[typeName]: 'Test', a: 1, b: ''},
                        incremental: {b: ''},
                        '': {[typeName]: 'Test', a: 1, b: ''}
                    }
                ],
                [
                    [
                        {
                            [typeName]: 'Test',
                            a: new Date(1970, 0, 1, 0, -1 * (new Date(
                                1970, 0, 1
                            )).getTimezoneOffset(), 2).toUTCString(),
                            b: ''
                        },
                        {
                            [typeName]: 'Test',
                            a: new Date(1970, 0, 1, 0, -1 * (new Date(
                                1970, 0, 1
                            )).getTimezoneOffset(), 2).toUTCString()
                        }
                    ],
                    {entities: {Test: {
                        a: {type: 'DateTime'},
                        b: {emptyEqualsToNull: false}
                    }}},
                    {
                        fillUp: {[typeName]: 'Test', a: 2, b: ''},
                        incremental: {b: ''},
                        '': {[typeName]: 'Test', a: 2, b: ''}
                    }
                ],
                [
                    [
                        {
                            [typeName]: 'Test',
                            a: new Date(1970, 0, 1, 5, -1 * (new Date(
                                1970, 0, 1
                            )).getTimezoneOffset(), 2).toISOString(),
                            b: ''
                        },
                        {
                            [typeName]: 'Test',
                            a: new Date(1970, 0, 1, 5, -1 * (new Date(
                                1970, 0, 1
                            )).getTimezoneOffset(), 2).toISOString()
                        }
                    ],
                    {entities: {Test: {
                        a: {type: 'DateTime'},
                        b: {emptyEqualsToNull: false}
                    }}},
                    {
                        fillUp: {
                            [typeName]: 'Test',
                            a: 5 * 60 ** 2 + 2,
                            b: ''
                        },
                        incremental: {b: ''},
                        '': {
                            [typeName]: 'Test',
                            a: 5 * 60 ** 2 + 2,
                            b: ''
                        }
                    }
                ],
                [
                    [{[typeName]: 'Test', a: 2, b: ''}],
                    {entities: {Test: {[specialNames.additional]: {
                        type: 'any', emptyEqualsToNull: false
                    }}}},
                    {
                        fillUp: {[typeName]: 'Test', a: 2, b: ''},
                        incremental: {[typeName]: 'Test', a: 2, b: ''},
                        '': {[typeName]: 'Test', a: 2, b: ''}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: '2', b: ''}],
                    {entities: {Test: {[specialNames.additional]: {
                        emptyEqualsToNull: false
                    }}}},
                    {
                        fillUp: {[typeName]: 'Test', a: '2', b: ''},
                        incremental: {[typeName]: 'Test', a: '2', b: ''},
                        '': {[typeName]: 'Test', a: '2', b: ''}
                    }
                ],
                // / region array
                [
                    [
                        {[typeName]: 'Test', a: ['2'], b: ''},
                        {[typeName]: 'Test', a: ['2']}
                    ],
                    {entities: {Test: {
                        a: {type: 'string[]'}, b: {emptyEqualsToNull: false}
                    }}},
                    {
                        fillUp: {[typeName]: 'Test', a: ['2'], b: ''},
                        incremental: {b: ''},
                        '': {[typeName]: 'Test', a: ['2'], b: ''}
                    }
                ],
                [
                    [
                        {[typeName]: 'Test', a: ['2']},
                        {[typeName]: 'Test', a: ['2', '3']}
                    ],
                    {entities: {Test: {a: {type: 'string[]'}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: ['2']},
                        incremental: {a: ['2']},
                        '': {[typeName]: 'Test', a: ['2']}
                    }
                ],
                [
                    [
                        {[typeName]: 'Test', a: ['3']},
                        {[typeName]: 'Test', a: ['2']}
                    ],
                    {entities: {Test: {a: {type: 'string[]'}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: ['3']},
                        incremental: {a: ['3']},
                        '': {[typeName]: 'Test', a: ['3']}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: ['2']}, {[typeName]: 'Test'}],
                    {entities: {Test: {a: {type: 'string[]'}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: ['2']},
                        incremental: {a: ['2']},
                        '': {[typeName]: 'Test', a: ['2']}
                    }
                ],
                [
                    [
                        {[typeName]: 'Test', a: null, b: ''},
                        {[typeName]: 'Test'}
                    ],
                    {entities: {Test: {
                        a: {type: 'string[]'}, b: {emptyEqualsToNull: false}
                    }}},
                    {
                        fillUp: {[typeName]: 'Test', b: ''},
                        incremental: {b: ''},
                        '': {[typeName]: 'Test', b: ''}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: [2]}, {[typeName]: 'Test'}],
                    {entities: {Test: {a: {type: 'integer[]'}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: [2]},
                        incremental: {a: [2]},
                        '': {[typeName]: 'Test', a: [2]}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: [2.3]}, {[typeName]: 'Test'}],
                    {entities: {Test: {a: {type: 'number[]'}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: [2.3]},
                        incremental: {a: [2.3]},
                        '': {[typeName]: 'Test', a: [2.3]}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: [true]}, {[typeName]: 'Test'}],
                    {entities: {Test: {a: {type: 'boolean[]'}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: [true]},
                        incremental: {a: [true]},
                        '': {[typeName]: 'Test', a: [true]}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: [1]}, {[typeName]: 'Test'}],
                    {entities: {Test: {a: {type: 'DateTime[]'}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: [1]},
                        incremental: {a: [1]},
                        '': {[typeName]: 'Test', a: [1]}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: []}, {[typeName]: 'Test'}],
                    {entities: {Test: {a: {
                        emptyEqualsToNull: false, type: 'DateTime[]'
                    }}}},
                    {
                        fillUp: {[typeName]: 'Test', a: []},
                        incremental: {a: []},
                        '': {[typeName]: 'Test', a: []}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: [2]}, {[typeName]: 'Test'}],
                    {entities: {Test: {a: {
                        type: 'DateTime[]', mutable: false
                    }}}},
                    {
                        fillUp: {[typeName]: 'Test', a: [2]},
                        incremental: {a: [2]},
                        '': {[typeName]: 'Test', a: [2]}
                    }
                ],
                [
                    [
                        {[typeName]: 'Test', a: [2, 1.1]},
                        {[typeName]: 'Test', a: [2]}
                    ],
                    {entities: {Test: {a: {type: 'number[]'}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: [2, 1.1]},
                        incremental: {a: [2, 1.1]},
                        '': {[typeName]: 'Test', a: [2, 1.1]}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: [2, 1]}],
                    {entities: {Test: {a: {
                        type: 'integer[]', maximumNumber: 2, minimumNumber: 1
                    }}}},
                    {
                        fillUp: {[typeName]: 'Test', a: [2, 1]},
                        incremental: {[typeName]: 'Test', a: [2, 1]},
                        '': {[typeName]: 'Test', a: [2, 1]}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: [2, 1]}],
                    {entities: {Test: {a: {
                        maximumNumber: Infinity,
                        minimumNumber: 0,
                        type: 'integer[]'
                    }}}},
                    {
                        fillUp: {[typeName]: 'Test', a: [2, 1]},
                        incremental: {[typeName]: 'Test', a: [2, 1]},
                        '': {[typeName]: 'Test', a: [2, 1]}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: [2]}],
                    {entities: {Test: {a: {
                        type: 'integer[]', maximum: 2, maximumNumber: 1
                    }}}},
                    {
                        fillUp: {[typeName]: 'Test', a: [2]},
                        incremental: {[typeName]: 'Test', a: [2]},
                        '': {[typeName]: 'Test', a: [2]}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: []}],
                    {entities: {Test: {a: {
                        type: 'integer[]', maximum: 2, maximumNumber: 0
                    }}}},
                    {
                        fillUp: {[typeName]: 'Test'},
                        incremental: {[typeName]: 'Test'},
                        '': {[typeName]: 'Test'}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: [2, '2']}],
                    {entities: {Test: {a: {type: 'any[]'}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: [2, '2']},
                        incremental: {[typeName]: 'Test', a: [2, '2']},
                        '': {[typeName]: 'Test', a: [2, '2']}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: [2, '2']}],
                    {entities: {Test: {a: {type: [['number', 'string']]}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: [2, '2']},
                        incremental: {[typeName]: 'Test', a: [2, '2']},
                        '': {[typeName]: 'Test', a: [2, '2']}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: [{b: 'b'}]}],
                    {entities: {Test: {a: {type: 'Test[]'}, b: {}}}},
                    {
                        fillUp: {
                            [typeName]: 'Test',
                            a: [{
                                [typeName]: 'Test',
                                b: 'b'
                            }]
                        },
                        incremental: {
                            [typeName]: 'Test',
                            a: [{
                                [typeName]: 'Test',
                                b: 'b'
                            }]
                        },
                        '': {
                            [typeName]: 'Test',
                            a: [{
                                [typeName]: 'Test',
                                b: 'b'
                            }]
                        }
                    }
                ],
                // / endregion
                // / region nested property
                // // region property type
                [
                    [
                        {[typeName]: 'Test', a: {[typeName]: 'Test'}, b: 'b'},
                        {[typeName]: 'Test', a: {[typeName]: 'Test'}}
                    ],
                    {entities: {Test: {a: {type: 'Test'}, b: {}}}},
                    {
                        fillUp: {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test'},
                            b: 'b'
                        },
                        incremental: {b: 'b'},
                        '': {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test'},
                            b: 'b'
                        }
                    }
                ],
                [
                    [
                        {[typeName]: 'Test', a: null, b: 'b'},
                        {[typeName]: 'Test'}
                    ],
                    {entities: {Test: {a: {type: 'Test'}, b: {}}}},
                    {
                        fillUp: {[typeName]: 'Test', b: 'b'},
                        incremental: {b: 'b'},
                        '': {[typeName]: 'Test', b: 'b'}
                    }
                ],
                [
                    [
                        {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test', b: null},
                            b: 'b'
                        },
                        {[typeName]: 'Test', a: {[typeName]: 'Test'}}
                    ],
                    {entities: {Test: {a: {type: 'Test'}, b: {}}}},
                    {
                        fillUp: {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test'},
                            b: 'b'
                        },
                        incremental: {b: 'b'},
                        '': {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test'},
                            b: 'b'
                        }
                    }
                ],
                [
                    [
                        {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test', b: '2'},
                            b: 'b'
                        },
                        {[typeName]: 'Test', a: {[typeName]: 'Test', b: '2'}}
                    ],
                    {entities: {Test: {a: {type: 'Test'}, b: {}}}},
                    {
                        fillUp: {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test', b: '2'},
                            b: 'b'
                        },
                        incremental: {b: 'b'},
                        '': {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test', b: '2'},
                            b: 'b'
                        }
                    }
                ],
                [
                    [
                        {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test', b: 'a'},
                            b: '3'
                        },
                        {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test', b: 'a'},
                            b: '2'
                        }
                    ],
                    {entities: {Test: {a: {type: 'Test'}, b: {}}}},
                    {
                        fillUp: {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test', b: 'a'},
                            b: '3'
                        },
                        incremental: {b: '3'},
                        '': {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test', b: 'a'},
                            b: '3'
                        }
                    }
                ],
                [
                    [{[typeName]: 'Test', a: {[typeName]: 'Test', b: 2}}],
                    {entities: {Test: {a: {type: 'Test'}, b: {type: 'any'}}}},
                    {
                        fillUp: {
                            [typeName]: 'Test', a: {[typeName]: 'Test', b: 2}
                        },
                        incremental: {
                            [typeName]: 'Test', a: {[typeName]: 'Test', b: 2}
                        },
                        '': {[typeName]: 'Test', a: {[typeName]: 'Test', b: 2}}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: {b: 'b'}}],
                    {entities: {Test: {a: {type: 'Test'}, b: {}}}},
                    {
                        fillUp: {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test', b: 'b'}
                        },
                        incremental: {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test', b: 'b'}
                        },
                        '': {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test', b: 'b'}
                        }
                    }
                ],
                // // endregion
                // // region property existents
                [
                    [
                        {[typeName]: 'Test', a: {[typeName]: 'Test'}, b: 'b'},
                        {[typeName]: 'Test', a: {[typeName]: 'Test'}}
                    ],
                    {entities: {Test: {a: {type: 'Test'}, b: {}}}},
                    {
                        fillUp: {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test'},
                            b: 'b'
                        },
                        incremental: {b: 'b'},
                        '': {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test'},
                            b: 'b'
                        }
                    }
                ],
                [
                    [
                        {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test', b: null},
                            b: 'b'
                        },
                        {[typeName]: 'Test', a: {[typeName]: 'Test'}, b: 'a'}
                    ],
                    {entities: {Test: {a: {type: 'Test'}, b: {}}}},
                    {
                        fillUp: {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test'},
                            b: 'b'
                        },
                        incremental: {b: 'b'},
                        '': {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test'},
                            b: 'b'
                        }
                    }
                ],
                [
                    [
                        {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test', b: '2'},
                            b: 'b'
                        },
                        {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test', b: '2'},
                            b: 'a'
                        }
                    ],
                    {entities: {Test: {
                        a: {type: 'Test'}, b: {nullable: false}
                    }}},
                    {
                        fillUp: {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test', b: '2'},
                            b: 'b'
                        },
                        incremental: {b: 'b'},
                        '': {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test', b: '2'},
                            b: 'b'
                        }
                    }
                ],
                // // endregion
                // // region property readonly
                [
                    [
                        {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test', b: 'b'},
                            c: 'c'
                        },
                        {[typeName]: 'Test', a: {[typeName]: 'Test', b: 'b'}}
                    ],
                    {entities: {Test: {
                        a: {type: 'Test'},
                        b: {writable: false},
                        c: {}
                    }}},
                    {
                        fillUp: {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test', b: 'b'},
                            c: 'c'
                        },
                        incremental: {c: 'c'},
                        '': {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test', b: 'b'},
                            c: 'c'
                        }
                    }
                ],
                [
                    [
                        {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test', b: 'a'},
                            b: 'b'
                        },
                        {[typeName]: 'Test', a: {[typeName]: 'Test', b: 'a'}}
                    ],
                    {entities: {Test: {
                        a: {type: 'Test', writable: false}, b: {}}}
                    },
                    {
                        fillUp: {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test', b: 'a'},
                            b: 'b'
                        },
                        incremental: {b: 'b'},
                        '': {
                            [typeName]: 'Test',
                            a: {[typeName]: 'Test', b: 'a'},
                            b: 'b'
                        }
                    }
                ],
                // // endregion
                // // region property range
                [
                    [
                        {
                            [typeName]: 'Test',
                            a: 4,
                            b: {[typeName]: 'Test', a: 3}
                        },
                        {[typeName]: 'Test'}
                    ],
                    {entities: {Test: {
                        a: {type: 'integer', minimum: 3},
                        b: {type: 'Test'}
                    }}},
                    {
                        fillUp: {
                            [typeName]: 'Test',
                            a: 4,
                            b: {[typeName]: 'Test', a: 3}
                        },
                        incremental: {a: 4, b: {[typeName]: 'Test', a: 3}},
                        '': {
                            [typeName]: 'Test',
                            a: 4,
                            b: {[typeName]: 'Test', a: 3}
                        }
                    }
                ],
                [
                    [{
                        [typeName]: 'Test',
                        a: '1',
                        b: {[typeName]: 'Test', a: '1'}
                    }],
                    {entities: {Test: {
                        a: {maximumLength: 1}, b: {type: 'Test'}
                    }}},
                    {
                        fillUp: {
                            [typeName]: 'Test',
                            a: '1',
                            b: {[typeName]: 'Test', a: '1'}
                        },
                        incremental: {
                            [typeName]: 'Test',
                            a: '1',
                            b: {[typeName]: 'Test', a: '1'}
                        },
                        '': {
                            [typeName]: 'Test',
                            a: '1',
                            b: {[typeName]: 'Test', a: '1'}
                        }
                    }
                ],
                // // endregion
                // // region property pattern
                [
                    [{[typeName]: 'Test', b: {[typeName]: 'Test', a: 'a'}}],
                    {entities: {Test: {
                        a: {regularExpressionPattern: 'a'},
                        b: {type: 'Test'}
                    }}},
                    {
                        fillUp: {[typeName]: 'Test', b: {
                            [typeName]: 'Test', a: 'a'
                        }},
                        incremental: {[typeName]: 'Test', b: {
                            [typeName]: 'Test', a: 'a'
                        }},
                        '': {
                            [typeName]: 'Test',
                            b: {[typeName]: 'Test', a: 'a'}
                        }
                    }
                ],
                [
                    [{[typeName]: 'Test', b: {[typeName]: 'Test', a: 'a'}}],
                    {entities: {Test: {
                        a: {invertedRegularExpressionPattern: 'b'},
                        b: {type: 'Test'}
                    }}},
                    {
                        fillUp: {[typeName]: 'Test', b: {
                            [typeName]: 'Test', a: 'a'
                        }},
                        incremental: {[typeName]: 'Test', b: {
                            [typeName]: 'Test', a: 'a'
                        }},
                        '': {
                            [typeName]: 'Test',
                            b: {[typeName]: 'Test', a: 'a'}
                        }
                    }
                ],
                // // endregion
                // // region property constraint
                [
                    [{
                        [typeName]: 'Test',
                        a: 'b',
                        b: {[typeName]: 'Test', a: 'b'}
                    }],
                    {entities: {Test: {
                        a: {constraintExpression: {
                            evaluation: 'newValue === "b"'
                        }},
                        b: {type: 'Test'}
                    }}},
                    {
                        fillUp: {
                            [typeName]: 'Test',
                            a: 'b',
                            b: {[typeName]: 'Test', a: 'b'}
                        },
                        incremental: {
                            [typeName]: 'Test',
                            a: 'b',
                            b: {[typeName]: 'Test', a: 'b'}
                        },
                        '': {
                            [typeName]: 'Test',
                            a: 'b',
                            b: {[typeName]: 'Test', a: 'b'}
                        }
                    }
                ],
                // // endregion
                // / endregion
                [
                    [{[typeName]: 'Test1', a: 2}],
                    {entities: {
                        Test1: {a: {type: 'foreignKey:Test2'}},
                        Test2: {[idName]: {type: 'number'}}
                    }},
                    {
                        fillUp: {[typeName]: 'Test1', a: 2},
                        incremental: {[typeName]: 'Test1', a: 2},
                        '': {[typeName]: 'Test1', a: 2}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: 2}, {[typeName]: 'Test'}],
                    {entities: {Test: {a: {type: 2}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: 2},
                        incremental: {a: 2},
                        '': {[typeName]: 'Test', a: 2}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: 2}, {[typeName]: 'Test'}],
                    {entities: {Test: {a: {type: [2, 'boolean']}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: 2},
                        incremental: {a: 2},
                        '': {[typeName]: 'Test', a: 2}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: false}, {[typeName]: 'Test'}],
                    {entities: {Test: {a: {type: [2, 'boolean']}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: false},
                        incremental: {a: false},
                        '': {[typeName]: 'Test', a: false}
                    }
                ],
                // endregion
                // region property range
                [
                    [{[typeName]: 'Test'}],
                    {entities: {Test: {a: {type: 'number', default: 2}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: 2},
                        incremental: {[typeName]: 'Test', a: 2},
                        '': {[typeName]: 'Test', a: 2}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: 3}, {[typeName]: 'Test'}],
                    {entities: {Test: {a: {type: 'number', minimum: 3}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: 3},
                        incremental: {a: 3},
                        '': {[typeName]: 'Test', a: 3}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: 1}, {[typeName]: 'Test'}],
                    {entities: {Test: {a: {type: 'number', maximum: 1}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: 1},
                        incremental: {a: 1},
                        '': {[typeName]: 'Test', a: 1}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: '123'}, {[typeName]: 'Test'}],
                    {entities: {Test: {a: {minimumLength: 3}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: '123'},
                        incremental: {a: '123'},
                        '': {[typeName]: 'Test', a: '123'}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: '1'}],
                    {entities: {Test: {a: {maximumLength: 1}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: '1'},
                        incremental: {[typeName]: 'Test', a: '1'},
                        '': {[typeName]: 'Test', a: '1'}
                    }
                ],
                // endregion
                // region selection
                [
                    [{[typeName]: 'Test', a: 2}],
                    {entities: {Test: {a: {type: 'number', selection: [2]}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: 2},
                        incremental: {[typeName]: 'Test', a: 2},
                        '': {[typeName]: 'Test', a: 2}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: 2}],
                    {entities: {Test: {a: {
                        type: 'number', selection: [1, 2]
                    }}}},
                    {
                        fillUp: {[typeName]: 'Test', a: 2},
                        incremental: {[typeName]: 'Test', a: 2},
                        '': {[typeName]: 'Test', a: 2}
                    }
                ],
                // endregion
                // region property pattern
                [
                    [{[typeName]: 'Test', a: 'a'}],
                    {entities: {Test: {a: {regularExpressionPattern: 'a'}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: 'a'},
                        incremental: {[typeName]: 'Test', a: 'a'},
                        '': {[typeName]: 'Test', a: 'a'}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: 'a'}],
                    {entities: {Test: {a: {
                        invertedRegularExpressionPattern: 'b'
                    }}}},
                    {
                        fillUp: {[typeName]: 'Test', a: 'a'},
                        incremental: {[typeName]: 'Test', a: 'a'},
                        '': {[typeName]: 'Test', a: 'a'}
                    }
                ],
                // endregion
                // region property constraint
                [
                    [{[typeName]: 'Test', a: 'b'}],
                    {entities: {Test: {a: {constraintExpression: {
                        evaluation: 'true'
                    }}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: 'b'},
                        incremental: {[typeName]: 'Test', a: 'b'},
                        '': {[typeName]: 'Test', a: 'b'}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: 'a'}],
                    {entities: {Test: {a: {constraintExpression: {
                        evaluation: 'newValue === "a"'
                    }}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: 'a'},
                        incremental: {[typeName]: 'Test', a: 'a'},
                        '': {[typeName]: 'Test', a: 'a'}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: 'a'}],
                    {entities: {Test: {a: {constraintExecution: {
                        evaluation: 'return newValue === "a"'
                    }}}}},
                    {
                        fillUp: {[typeName]: 'Test', a: 'a'},
                        incremental: {[typeName]: 'Test', a: 'a'},
                        '': {[typeName]: 'Test', a: 'a'}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: 'a'}],
                    {entities: {Test: {a: {
                        constraintExecution: {
                            evaluation: 'return newValue === "a"'
                        },
                        description: '`Value have to be "a" not "${newValue}".`'
                    }}}},
                    {
                        fillUp: {[typeName]: 'Test', a: 'a'},
                        incremental: {[typeName]: 'Test', a: 'a'},
                        '': {[typeName]: 'Test', a: 'a'}
                    }
                ],
                // endregion
                // region constraint
                [
                    [{[typeName]: 'Test', a: 'a', b: 'b'}],
                    {entities: {Test: {
                        _constraintExpressions: [{evaluation: 'true'}],
                        a: {},
                        b: {}
                    }}},
                    {
                        fillUp: {[typeName]: 'Test', a: 'a', b: 'b'},
                        incremental: {[typeName]: 'Test', a: 'a', b: 'b'},
                        '': {[typeName]: 'Test', a: 'a', b: 'b'}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: 'a', b: 'b'}],
                    {entities: {Test: {
                        _constraintExecutions: [{
                            description: '`Always valid: "${newDocument.a}".`',
                            evaluation: 'return true'
                        }],
                        a: {},
                        b: {}
                    }}},
                    {
                        fillUp: {[typeName]: 'Test', a: 'a', b: 'b'},
                        incremental: {[typeName]: 'Test', a: 'a', b: 'b'},
                        '': {[typeName]: 'Test', a: 'a', b: 'b'}
                    }
                ],
                [
                    [{[typeName]: 'Test', a: 'a', b: 'a'}],
                    {entities: {Test: {
                        _constraintExpressions: [{
                            evaluation: 'newDocument.a === newDocument.b'
                        }],
                        a: {},
                        b: {}
                    }}},
                    {
                        fillUp: {[typeName]: 'Test', a: 'a', b: 'a'},
                        incremental: {[typeName]: 'Test', a: 'a', b: 'a'},
                        '': {[typeName]: 'Test', a: 'a', b: 'a'}
                    }
                ],
                // endregion
                // region attachment
                [
                    [{[typeName]: 'Test'}],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        minimumNumber: 1
                    }}}}},
                    {
                        fillUp: {[typeName]: 'Test'},
                        incremental: {[typeName]: 'Test'},
                        '': {[typeName]: 'Test'}
                    }
                ],
                [
                    [{
                        [typeName]: 'Test',
                        [attachmentName]: {test: {
                            /* eslint-disable camelcase */
                            content_type: 'text/plain', data: ''
                            /* eslint-enable camelcase */
                        }}
                    }],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        maximumNumber: 1
                    }}}}},
                    {
                        fillUp: {[typeName]: 'Test', [attachmentName]: {test: {
                            /* eslint-disable camelcase */
                            content_type: 'text/plain', data: ''
                            /* eslint-enable camelcase */
                        }}},
                        incremental: {[typeName]: 'Test', [attachmentName]: {
                            /* eslint-disable camelcase */
                            test: {content_type: 'text/plain', data: ''}
                            /* eslint-enable camelcase */
                        }},
                        '': {[typeName]: 'Test', [attachmentName]: {test: {
                            /* eslint-disable camelcase */
                            content_type: 'text/plain', data: ''
                            /* eslint-enable camelcase */
                        }}}
                    }
                ],
                [
                    [{
                        [typeName]: 'Test',
                        [attachmentName]: {'favicon.png': {
                            /* eslint-disable camelcase */
                            content_type: 'image/png', data: 'abc'
                            /* eslint-enable camelcase */
                        }}
                    }],
                    {entities: {Test: {[attachmentName]: {
                        '.+\\.(?:jpe?g|png|svg)': {
                            contentTypeRegularExpressionPattern:
                                'image/(?:p?jpe?g|png|svg)',
                            maximumNumber: 1,
                            nullable: false
                        }
                    }}}},
                    {
                        fillUp: {[typeName]: 'Test', [attachmentName]: {
                            'favicon.png': {
                                /* eslint-disable camelcase */
                                content_type: 'image/png', data: 'abc'
                                /* eslint-enable camelcase */
                            }
                        }},
                        incremental: {[typeName]: 'Test', [attachmentName]: {
                            'favicon.png': {
                                /* eslint-disable camelcase */
                                content_type: 'image/png', data: 'abc'
                                /* eslint-enable camelcase */
                            }
                        }},
                        '': {[typeName]: 'Test', [attachmentName]: {
                            /* eslint-disable camelcase */
                            'favicon.png': {
                                content_type: 'image/png',
                                data: 'abc'
                            }
                            /* eslint-enable camelcase */
                        }}
                    }
                ],
                [
                    [{
                        [typeName]: 'Test',
                        [attachmentName]: {test: {
                            /* eslint-disable camelcase */
                            content_type: 'text/plain', data: ''
                            /* eslint-enable camelcase */
                        }}
                    }],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        nullable: false
                    }}}}},
                    {
                        fillUp: {[typeName]: 'Test', [attachmentName]: {test: {
                            /* eslint-disable camelcase */
                            content_type: 'text/plain', data: ''
                            /* eslint-enable camelcase */
                        }}},
                        incremental: {
                            [typeName]: 'Test',
                            [attachmentName]: {test: {
                                /* eslint-disable camelcase */
                                content_type: 'text/plain', data: ''
                                /* eslint-enable camelcase */
                            }}
                        },
                        '': {[typeName]: 'Test', [attachmentName]: {test: {
                            /* eslint-disable camelcase */
                            content_type: 'text/plain', data: ''
                            /* eslint-enable camelcase */
                        }}}
                    }
                ],
                [
                    [{
                        [typeName]: 'Test',
                        [attachmentName]: {
                            /* eslint-disable camelcase */
                            a: {content_type: 'text/plain', data: ''},
                            b: {content_type: 'text/plain', data: ''}
                            /* eslint-enable camelcase */
                        }
                    }],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        maximumNumber: 2, minimumNumber: 2
                    }}}}},
                    {
                        fillUp: {[typeName]: 'Test', [attachmentName]: {
                            /* eslint-disable camelcase */
                            a: {content_type: 'text/plain', data: ''},
                            b: {content_type: 'text/plain', data: ''}
                            /* eslint-enable camelcase */
                        }},
                        incremental: {[typeName]: 'Test', [attachmentName]: {
                            /* eslint-disable camelcase */
                            a: {content_type: 'text/plain', data: ''},
                            b: {content_type: 'text/plain', data: ''}
                            /* eslint-enable camelcase */
                        }},
                        '': {[typeName]: 'Test', [attachmentName]: {
                            /* eslint-disable camelcase */
                            a: {content_type: 'text/plain', data: ''},
                            b: {content_type: 'text/plain', data: ''}
                            /* eslint-enable camelcase */
                        }}
                    }
                ],
                [
                    [{
                        [typeName]: 'Test',
                        [attachmentName]: {
                            /* eslint-disable camelcase */
                            a: {content_type: 'text/plain', data: ''},
                            b: {content_type: 'text/plain', data: ''}
                            /* eslint-enable camelcase */
                        }
                    }],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        maximumNumber: 2, regularExpressionPattern: 'a|b'
                    }}}}},
                    {
                        fillUp: {[typeName]: 'Test', [attachmentName]: {
                            /* eslint-disable camelcase */
                            a: {content_type: 'text/plain', data: ''},
                            b: {content_type: 'text/plain', data: ''}
                            /* eslint-enable camelcase */
                        }},
                        incremental: {[typeName]: 'Test', [attachmentName]: {
                            /* eslint-disable camelcase */
                            a: {content_type: 'text/plain', data: ''},
                            b: {content_type: 'text/plain', data: ''}
                            /* eslint-enable camelcase */
                        }},
                        '': {[typeName]: 'Test', [attachmentName]: {
                            /* eslint-disable camelcase */
                            a: {content_type: 'text/plain', data: ''},
                            b: {content_type: 'text/plain', data: ''}
                            /* eslint-enable camelcase */
                        }}
                    }
                ],
                [
                    [{
                        [typeName]: 'Test',
                        [attachmentName]: {
                            /* eslint-disable camelcase */
                            a: {content_type: 'text/plain', data: ''},
                            b: {content_type: 'text/plain', data: ''}
                            /* eslint-enable camelcase */
                        }
                    }],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        maximumNumber: 2,
                        invertedRegularExpressionPattern: 'c|d'
                    }}}}},
                    {
                        fillUp: {
                            [typeName]: 'Test',
                            [attachmentName]: {
                                /* eslint-disable camelcase */
                                a: {content_type: 'text/plain', data: ''},
                                b: {content_type: 'text/plain', data: ''}
                                /* eslint-enable camelcase */
                            }
                        },
                        incremental: {
                            [typeName]: 'Test',
                            [attachmentName]: {
                                /* eslint-disable camelcase */
                                a: {content_type: 'text/plain', data: ''},
                                b: {content_type: 'text/plain', data: ''}
                                /* eslint-enable camelcase */
                            }
                        },
                        '': {
                            [typeName]: 'Test',
                            [attachmentName]: {
                                /* eslint-disable camelcase */
                                a: {content_type: 'text/plain', data: ''},
                                b: {content_type: 'text/plain', data: ''}
                                /* eslint-enable camelcase */
                            }
                        }
                    }
                ],
                [
                    [{
                        [typeName]: 'Test',
                        [attachmentName]: {
                            /* eslint-disable camelcase */
                            a: {content_type: 'image/png', data: ''},
                            b: {content_type: 'image/jpeg', data: ''}
                            /* eslint-enable camelcase */
                        }
                    }],
                    {entities: {Test: {[attachmentName]: {'.*': {
                        contentTypeRegularExpressionPattern: /image\/.+/,
                        regularExpressionPattern: 'a|b'
                    }}}}},
                    {
                        fillUp: {
                            [typeName]: 'Test',
                            [attachmentName]: {
                                /* eslint-disable camelcase */
                                a: {content_type: 'image/png', data: ''},
                                b: {content_type: 'image/jpeg', data: ''}
                                /* eslint-enable camelcase */
                            }
                        },
                        incremental: {
                            [typeName]: 'Test',
                            [attachmentName]: {
                                /* eslint-disable camelcase */
                                a: {content_type: 'image/png', data: ''},
                                b: {content_type: 'image/jpeg', data: ''}
                                /* eslint-enable camelcase */
                            }
                        },
                        '': {
                            [typeName]: 'Test',
                            [attachmentName]: {
                                /* eslint-disable camelcase */
                                a: {content_type: 'image/png', data: ''},
                                b: {content_type: 'image/jpeg', data: ''}
                                /* eslint-enable camelcase */
                            }
                        }
                    }
                ],
                [
                    [
                        {
                            [typeName]: 'Test',
                            [attachmentName]: {
                                /* eslint-disable camelcase */
                                a: {content_type: 'image/png', data: ''}
                                /* eslint-enable camelcase */
                            }
                        },
                        {
                            [typeName]: 'Test',
                            [attachmentName]: {
                                /* eslint-disable camelcase */
                                b: {content_type: 'image/jpeg', data: ''}
                                /* eslint-enable camelcase */
                            }
                        }
                    ],
                    {entities: {Test: {[attachmentName]: {'.*': {}}}}},
                    {
                        fillUp: {[typeName]: 'Test', [attachmentName]: {
                            /* eslint-disable camelcase */
                            a: {content_type: 'image/png', data: ''},
                            b: {content_type: 'image/jpeg', data: ''}
                            /* eslint-enable camelcase */
                        }},
                        incremental: {[attachmentName]: {
                            /* eslint-disable camelcase */
                            a: {content_type: 'image/png', data: ''}
                            /* eslint-enable camelcase */
                        }},
                        '': {[typeName]: 'Test', [attachmentName]: {
                            /* eslint-disable camelcase */
                            a: {content_type: 'image/png', data: ''}
                            /* eslint-enable camelcase */
                        }}
                    }
                ],
                [
                    [
                        {
                            [typeName]: 'Test',
                            [attachmentName]: {a: {data: null}},
                            b: 'b'
                        }, {
                            [typeName]: 'Test',
                            [attachmentName]: {a: {
                                /* eslint-disable camelcase */
                                content_type: 'image/jpeg', data: ''
                                /* eslint-enable camelcase */
                            }}
                        }
                    ],
                    {entities: {Test: {[attachmentName]: {'.*': {}}, b: {}}}},
                    {
                        fillUp: {[typeName]: 'Test', b: 'b'},
                        incremental: {b: 'b'},
                        '': {[typeName]: 'Test', b: 'b'}
                    }
                ],
                [
                    [
                        {
                            [typeName]: 'Test',
                            [attachmentName]: {a: {data: null}},
                            b: 'b'
                        }, {
                            [typeName]: 'Test',
                            [attachmentName]: {a: {
                                /* eslint-disable camelcase */
                                content_type: 'image/jpeg', data: ''
                                /* eslint-enable camelcase */
                            }}
                        }
                    ],
                    {entities: {Test: {[attachmentName]: {'.*': {}}, b: {}}}},
                    {
                        fillUp: {[typeName]: 'Test', b: 'b'},
                        incremental: {b: 'b'},
                        '': {[typeName]: 'Test', b: 'b'}
                    }
                ],
                [
                    [
                        {[typeName]: 'Test', a: 'a'},
                        {[typeName]: 'Test', [attachmentName]: {a: {
                            /* eslint-disable camelcase */
                            content_type: 'image/jpeg', data: ''
                            /* eslint-enable camelcase */
                        }}}
                    ],
                    {entities: {Test: {[attachmentName]: {'.*': {}}, a: {}}}},
                    {
                        fillUp: {
                            [typeName]: 'Test',
                            [attachmentName]: {a: {
                                /* eslint-disable camelcase */
                                content_type: 'image/jpeg', data: ''
                                /* eslint-enable camelcase */
                            }},
                            a: 'a'
                        },
                        incremental: {a: 'a'},
                        '': {[typeName]: 'Test', a: 'a'}
                    }
                ],
                [
                    [
                        {[typeName]: 'Test', a: 'a'},
                        {
                            [typeName]: 'Test',
                            [attachmentName]: {a: {
                                /* eslint-disable camelcase */
                                content_type: 'image/jpeg', data: ''
                                /* eslint-enable camelcase */
                            }}
                        }
                    ],
                    {entities: {Test: {[attachmentName]: {a: {}}, a: {}}}},
                    {
                        fillUp: {
                            [typeName]: 'Test', [attachmentName]: {a: {
                                /* eslint-disable camelcase */
                                content_type: 'image/jpeg', data: ''
                                /* eslint-enable camelcase */
                            }},
                            a: 'a'
                        },
                        incremental: {a: 'a'},
                        '': {[typeName]: 'Test', a: 'a'}
                    }
                ],
                [
                    [
                        {[typeName]: 'Test', a: 'a'},
                        {
                            [typeName]: 'Test',
                            [attachmentName]: {a: {
                                /* eslint-disable camelcase */
                                content_type: 'image/jpeg', data: ''
                                /* eslint-enable camelcase */
                            }}
                        }
                    ],
                    {entities: {Test: {
                        [attachmentName]: {a: {
                            minimumNumber: 0, nullable: false
                        }},
                        a: {}
                    }}},
                    {
                        fillUp: {
                            [typeName]: 'Test',
                            [attachmentName]: {a: {
                                /* eslint-disable camelcase */
                                content_type: 'image/jpeg', data: ''
                                /* eslint-enable camelcase */
                            }},
                            a: 'a'
                        },
                        incremental: {a: 'a'},
                        '': {[typeName]: 'Test', a: 'a'}
                    }
                ],
                [
                    [{
                        [typeName]: 'Test',
                        [attachmentName]: {a: {data: 'a', length: 1}}
                    }],
                    {entities: {Test: {[attachmentName]: {a: {
                        minimumSize: 1
                    }}}}},
                    {
                        fillUp: {
                            [typeName]: 'Test',
                            [attachmentName]: {a: {data: 'a', length: 1}}
                        },
                        incremental: {
                            [typeName]: 'Test',
                            [attachmentName]: {a: {data: 'a', length: 1}}
                        },
                        '': {
                            [typeName]: 'Test',
                            [attachmentName]: {a: {data: 'a', length: 1}}
                        }
                    }
                ],
                [
                    [{
                        [typeName]: 'Test',
                        [attachmentName]: {a: {data: 'abc', length: 3}}
                    }],
                    {entities: {Test: {[attachmentName]: {a: {
                        maximumSize: 3, minimumSize: 2
                    }}}}},
                    {
                        fillUp: {
                            [typeName]: 'Test',
                            [attachmentName]: {a: {data: 'abc', length: 3}}
                        },
                        incremental: {
                            [typeName]: 'Test',
                            [attachmentName]: {a: {data: 'abc', length: 3}}
                        },
                        '': {
                            [typeName]: 'Test',
                            [attachmentName]: {a: {data: 'abc', length: 3}}
                        }
                    }
                ]
                // endregion
            ]) {
                const modelConfiguration:ModelConfiguration = Tools.extend(
                    true, Tools.copy(defaultModelConfiguration), test[1]
                )
                const models:Models = Helper.extendModels(modelConfiguration)
                delete modelConfiguration.property.defaultSpecification
                delete modelConfiguration.entities
                expect(DatabaseHelper.validateDocumentUpdate(
                    ...test[0]
                        .concat([null, {}, {}].slice(test[0].length - 1))
                        .concat(modelConfiguration, models)
                )).toStrictEqual(test[2][updateStrategy])
            }
            // endregion
        }
    )
    // / region migration writes
    test.each<[
        FirstParameter<typeof DatabaseHelper.validateDocumentUpdate>,
        ReturnType<typeof DatabaseHelper.validateDocumentUpdate>,
        ModelConfiguration,
        SecondParameter<typeof DatabaseHelper.validateDocumentUpdate>
    ]>([
        // Remove obsolete properties.
        [
            {[typeName]: 'Test', a: 2},
            {[typeName]: 'Test'},
            {entities: {Test: {}}}
        ],
        // Create missing properties with default value.
        [
            {[typeName]: 'Test'},
            {[typeName]: 'Test', a: '2'},
            {entities: {Test: {a: {default: '2'}}}}
        ],
        // Do not change valid properties.
        [
            {[typeName]: 'Test', a: '2'},
            {[typeName]: 'Test', a: '2'},
            {entities: {Test: {a: {}}}}
        ],
        // Ignore wrong specified non required properties in old document.
        [
            {[typeName]: 'Test', b: 'b'},
            {[typeName]: 'Test', b: 'b'},
            {entities: {Test: {a: {}, b: {}}}},
            {[typeName]: 'Test', a: 1}
        ],
        // Ignore not specified properties in old document.
        [
            {[typeName]: 'Test'},
            {[typeName]: 'Test'},
            {entities: {Test: {}}},
            {[typeName]: 'Test', a: 1}
        ],
        // Set property to default value if explicitly set to "null".
        [
            {[typeName]: 'Test', a: null},
            {[typeName]: 'Test', a: '2'},
            {entities: {Test: {a: {default: '2'}}}}
        ],
        /*
            Set property to default value if explicitly set to "null" by
            ignoring maybe existing old documents value.
        */
        [
            {[typeName]: 'Test', a: null},
            {[typeName]: 'Test', a: '2'},
            {entities: {Test: {a: {default: '2'}}}},
            {[typeName]: 'Test', a: '1'}
        ],
        /*
            Set property to default value if property is missing which has
            a specified default (string) value.
        */
        [
            {[typeName]: 'Test'},
            {[typeName]: 'Test', a: '2'},
            {entities: {Test: {a: {default: '2'}}}},
            {[typeName]: 'Test', a: '1'}
        ],
        /*
            Set property to default value if property is missing which has
            a specified default value and remove not existing properties.
        */
        [
            {[typeName]: 'Test', b: '3'},
            {[typeName]: 'Test', a: '2'},
            {entities: {Test: {a: {default: '2'}}}},
            {[typeName]: 'Test', a: '1'}
        ],
        /*
            Set property to default value if property is missing which has
            a specified default (number) value.
        */
        [
            {[typeName]: 'Test'},
            {[typeName]: 'Test', a: 2},
            {entities: {Test: {a: {default: 2, type: 'number'}}}}
        ],
        /*
            Set property to default value if property is missing which has
            a specified default (any) value.
        */
        [
            {[typeName]: 'Test'},
            {[typeName]: 'Test', a: 2},
            {entities: {Test: {a: {default: 2, type: 'any'}}}}
        ],
        /*
            Set property to default value if property is missing which has
            a specified default value (where on is any).
        */
        [
            {[typeName]: 'Test'},
            {[typeName]: 'Test', a: 2},
            {entities: {Test: {a: {default: 2, type: ['any']}}}},
        ],
        /*
            Set property to default value if property is missing which has
            a specified default value (where a selection of types is
            provided).
        */
        [
            {[typeName]: 'Test'},
            {[typeName]: 'Test', a: 2},
            {entities: {Test: {a: {default: 2, type: ['any', 'boolean']}}}},
        ],
        [
            {[typeName]: 'Test'},
            {[typeName]: 'Test', a: 2},
            {entities: {Test: {a: {default: 2, type: ['number', 'boolean']}}}}
        ],
        // Ignore not specified attachment properties in old document.
        [
            {[typeName]: 'Test', b: 'b'},
            {[typeName]: 'Test', b: 'b'},
            {entities: {Test: {b: {}}}},
            {[typeName]: 'Test', [attachmentName]: {}}
        ],
        [
            {[typeName]: 'Test', b: 'b'},
            {[typeName]: 'Test', b: 'b'},
            {entities: {Test: {b: {}}}},
            {
                [typeName]: 'Test',
                [attachmentName]: {
                    /* eslint-disable camelcase */
                    test: {data: '', content_type: 'text/plain'}
                    /* eslint-enable camelcase */
                }
            }
        ],
        /*
            Set attachment to a default one if it is missing and has a
            specified default one.
        */
        [
            {[typeName]: 'Test'},
            {[typeName]: 'Test'},
            {entities: {Test: {[attachmentName]: {'.*': {default: {test: {
                /* eslint-disable camelcase */
                data: '', content_type: 'text/plain'
                /* eslint-enable camelcase */
            }}}}}}},
            {
                [typeName]: 'Test',
                [attachmentName]: {test: {
                    /* eslint-disable camelcase */
                    data: '', content_type: 'text/plain'
                    /* eslint-enable camelcase */
                }}
            }
        ],
        // Migrate model type if old one is provided.
        [
            {[typeName]: 'OldTest'},
            {[typeName]: 'Test'},
            {entities: {Test: {[specialNames.oldType]: 'OldTest'}}}
        ],
        // Migrate nested property model type if old one is provided.
        [
            {[typeName]: 'Test', a: {[typeName]: 'OldTest', b: 'b'}},
            {[typeName]: 'Test', a: {[typeName]: 'Test', b: 'b'}},
            {entities: {Test: {
                a: {type: 'Test'},
                [specialNames.oldType]: 'OldTest',
                b: {}
            }}}
        ],
        // Migrate nested array model type if old one is provided.
        [
            {[typeName]: 'Test', a: [{[typeName]: 'OldTest', b: 'b'}]},
            {[typeName]: 'Test', a: [{[typeName]: 'Test', b: 'b'}]},
            {entities: {Test: {
                a: {type: 'Test[]'},
                [specialNames.oldType]: 'OldTest',
                b: {}
            }}}
        ],
        // Migrate nested array property model type if old one is provided.
        [
            {
                [typeName]: 'Test',
                a: [{
                    [typeName]: 'Test',
                    a: [{[typeName]: 'OldTest', b: 'b'}]
                }]
            },
            {
                [typeName]: 'Test',
                a: [{
                    [typeName]: 'Test',
                    a: [{[typeName]: 'Test', b: 'b'}]
                }]
            },
            {entities: {Test: {
                a: {type: 'Test[]'},
                [specialNames.oldType]: 'OldTest',
                b: {}
            }}}
        ],
        // Migrate property names if old name is provided.
        [
            {[typeName]: 'Test', a: 'a'},
            {[typeName]: 'Test', b: 'a'},
            {entities: {Test: {b: {oldName: 'a'}}}}
        ]
    ])(
        'validateDocumentUpdate(%p, ...) === %p (with update strategy "' +
        'migration")',
        (
            newDocument:FirstParameter<typeof DatabaseHelper.validateDocumentUpdate>,
            expected:ReturnType<typeof DatabaseHelper.validateDocumentUpdate>,
            modelConfiguration:ModelConfiguration,
            oldDocument:SecondParameter<typeof DatabaseHelper.validateDocumentUpdate> = null
        ):void => {
            const defaultModelConfiguration:ModelConfiguration = {
                ...Tools.copy(configuration.couchdb.model),
                updateStrategy: 'migrate'
            }
            for (
                const propertyName in defaultModelConfiguration.entities._base
            )
                if (
                    defaultModelConfiguration.entities._base.hasOwnProperty(
                        propertyName
                    ) &&
                    propertyName !== typeName
                )
                    delete defaultModelConfiguration.entities._base[
                        propertyName
                    ]
            const models:Models = Helper.extendModels(Tools.extend(
                true, Tools.copy(defaultModelConfiguration), modelConfiguration
            ))
            const testModelConfiguration:ModelConfiguration = Tools.extend(
                true, Tools.copy(defaultModelConfiguration), modelConfiguration
            )
            delete testModelConfiguration.property.defaultSpecification
            delete testModelConfiguration.entities
            expect(DatabaseHelper.validateDocumentUpdate(
                newDocument,
                oldDocument,
                {},
                {},
                testModelConfiguration,
                models
            )).toStrictEqual(expected)
        }
    )
    // / endregion
    // endregion
})
// region vim modline
// vim: set tabstop=4 shiftwidth=4 expandtab:
// vim: foldmethod=marker foldmarker=region,endregion:
// endregion
