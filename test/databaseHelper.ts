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
import {describe, expect, test} from '@jest/globals'
import {
    copy,
    extend,
    FirstParameter,
    PlainObject,
    RecursivePartial,
    SecondParameter
} from 'clientnode'
import {
    TEST_THROW_SYMBOL, testEachAgainstSameExpectation
} from 'clientnode/test-helper'

import {authorize, validateDocumentUpdate} from '../databaseHelper'
import {extendModels} from '../helper'
import packageConfiguration from '../package.json'
import {
    Attachment,
    Attachments,
    BaseModel,
    Configuration,
    Document,
    ModelConfiguration,
    PartialFullDocument,
    SpecialPropertyNames
} from '../type'
// endregion
describe('databaseHelper', () => {
    // region prepare environment
    const configuration: Configuration =
        packageConfiguration.webNode as unknown as Configuration

    const specialNames: SpecialPropertyNames =
        configuration.couchdb.model.property.name.special

    const {
        attachment: attachmentName,
        id: idName,
        revision: revisionName,
        type: typeName
    } = specialNames

    const baseDocument: Document =
        {[idName]: '', [revisionName]: '', [typeName]: 'base'}
    // endregion
    // region tests
    testEachAgainstSameExpectation<typeof authorize>(
        'authorize',
        authorize,
        TEST_THROW_SYMBOL,

        [
            {...baseDocument, type: 'Test'},
            null,
            {roles: []},
            {},
            {Test: {properties: {}, read: ['users'], write: []}},
            'id',
            'type'
        ],
        [
            {...baseDocument, type: 'Test'},
            null,
            {roles: ['users']},
            {},
            {},
            'id',
            'type'
        ]
    )
    testEachAgainstSameExpectation<typeof authorize>(
        'authorize',
        authorize,
        true,

        [{}],
        [{}, null, {roles: ['_admin']}],
        [
            {},
            null,
            {roles: ['_admin']},
            {},
            {}
        ],
        [
            {'-type': 'Test'},
            null,
            {roles: ['users']},
            {},
            {Test: {properties: {}, read: [], write: ['users']}}
        ],
        [
            {'-type': 'Test'},
            {},
            {roles: ['users']},
            {},
            {Test: {properties: {}, read: [], write: ['users']}}
        ]
    )
    for (const updateStrategy of [
        'fillUp', 'incremental', 'replace'
    ] as const) {
        let only = false
        let skip = false
        const defaultModelConfiguration: ModelConfiguration = {
            // Numbers are date cross implementation save.
            ...copy(configuration.couchdb.model),
            dateTimeFormat: 'number',
            updateStrategy
        }

        for (const propertyName of Object.keys(
            defaultModelConfiguration.entities._base
        ))
            if (propertyName !== typeName)
                delete defaultModelConfiguration.entities._base[
                    propertyName as keyof BaseModel
                ]
        // region forbidden writes
        type NormalizedForbiddenTest =
            [
                [
                    FirstParameter<typeof validateDocumentUpdate>,
                    SecondParameter<typeof validateDocumentUpdate>?
                ],
                RecursivePartial<ModelConfiguration<{
                    a: unknown
                    b: unknown
                }>>,
                string
            ]
        type ForbiddenTest =
            NormalizedForbiddenTest |
            [
                [
                    FirstParameter<typeof validateDocumentUpdate>,
                    SecondParameter<typeof validateDocumentUpdate>?
                ],
                string
            ]
        const forbiddenTester = (...givenTest: ForbiddenTest): void => {
            const test = givenTest as NormalizedForbiddenTest
            if (givenTest.length < 3)
                (test as unknown as Array<unknown>).splice(1, 0, {})

            const modelConfiguration: ModelConfiguration = extend(
                true,
                copy(defaultModelConfiguration),
                test[1] as Partial<ModelConfiguration>
            )
            const models = extendModels(modelConfiguration)

            delete (
                modelConfiguration.property as
                    Partial<ModelConfiguration['property']>
            ).defaultSpecification
            delete (modelConfiguration as Partial<ModelConfiguration>)
                .entities

            const parameters: Parameters<typeof validateDocumentUpdate> =
                (test[0] as unknown as Array<unknown>)
                    .concat([null, {}, {}].slice(test[0].length - 1))
                    .concat(modelConfiguration, models) as
                    Parameters<typeof validateDocumentUpdate>

            if (typeof test[2] !== 'string') {
                expect(validateDocumentUpdate(...parameters))
                    .toStrictEqual(test[2])

                return
            }

            expect((): PartialFullDocument =>
                validateDocumentUpdate(...parameters)
            ).toThrow(new RegExp(`^${test[2]}: .+[.!]$`, 's'))
        }
        /// region general environment
        test.each([
            /*
                Get an exception if an expected previous document does not
                exist (or has no revision).
            */
            [
                [{[typeName]: 'Test', [revisionName]: '0-latest'}, null],
                'Revision'
            ],
            [
                [{[typeName]: 'Test', [revisionName]: '0-latest'}, {}],
                'Revision'
            ],
            [
                [
                    {[typeName]: 'Test', [revisionName]: '0-latest'},
                    {[typeName]: 'Test'}
                ],
                'Revision'
            ]
        ] as Array<ForbiddenTest>)(
            '%#. forbidden general environment validateDocumentUpdate ' +
            `(with update strategy "${updateStrategy}")`,
            forbiddenTester
        )
        /// endregion
        /// region changes
        test.each([
            /*
                Get an exception if nothing really changes. Those database
                requests should be avoided by the application to improve
                performance and avoiding have useless document revisions.
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
                Empty values should be normalized according and identified as
                nothing really changes.
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
                {entities: {Test: {a: {emptyEqualsNull: false}}}},
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
                Equal existing and new values should not trigger a new document
                revision.
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
                Normalized equal existing and new values should not trigger a
                new document revision.
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
                {
                    entities: {
                        Test: {
                            a: {
                                type: 'integer[]', emptyEqualsNull: false
                            }
                        }
                    }
                },
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
                {
                    entities: {
                        _test: {b: {type: 'number'}},
                        Test: {a: {type: '_test'}}
                    }
                },
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
                updateStrategy === 'replace' ?
                    {[typeName]: 'Test'} :
                    'NoChange'
            ]
        ] as Array<ForbiddenTest>)(
            '%#. forbidden changes validateDocumentUpdate ' +
            `(with update strategy "${updateStrategy}")`,
            forbiddenTester
        )
        /// endregion
        /// region model
        test.each([
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
                A valid specified type which will be changed to an invalid one
                (on update trigger) should result in an exception.
            */
            [
                [{[typeName]: 'Test'}],
                {
                    entities: {
                        Test: {
                            [specialNames.create.execution]: `
                        newDocument['${typeName}'] = '_test'
                        return newDocument
                    `
                        }
                    }
                },
                'TypeName'
            ],
            [
                [{[typeName]: 'Test'}],
                {
                    entities: {
                        Test: {
                            [specialNames.create.expression]: `
                        (newDocument['${typeName}'] = '_test') &&
                        newDocument
                    `
                        }
                    }
                },
                'TypeName'
            ],
            [
                [{[typeName]: 'Test'}],
                {
                    entities: {
                        Test: {
                            [specialNames.update.execution]: `
                        newDocument['${typeName}'] = '_test'
                        return newDocument
                    `
                        }
                    }
                },
                'TypeName'
            ],
            [
                [{[typeName]: 'Test'}],
                {
                    entities: {
                        Test: {
                            [specialNames.update.expression]: `
                        (newDocument['${typeName}'] = '_test') &&
                        newDocument
                    `
                        }
                    }
                },
                'TypeName'
            ]
        ] as Array<ForbiddenTest>)(
            '%#. forbidden model validateDocumentUpdate ' +
            `(with update strategy "${updateStrategy}")`,
            forbiddenTester
        )
        /// endregion
        /// region hooks
        test.each([
            // region on create
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
                Runtime errors during running create expressions should lead to
                an exception.
            */
            [
                [{[typeName]: 'Test', a: ''}],
                {
                    entities: {
                        Test: {
                            a: {
                                onCreateExpression: 'undefinedVariableName'
                            }
                        }
                    }
                },
                'Runtime'
            ],
            [
                [{[typeName]: 'Test', a: ''}],
                {
                    entities: {
                        Test: {
                            a: {
                                onCreateExecution:
                                    'return undefinedVariableName'
                            }
                        }
                    }
                },
                'Runtime'
            ],
            // endregion
            // region on update
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
                Runtime errors during running create expressions should lead to
                an exception.
            */
            [
                [{[typeName]: 'Test', a: ''}],
                {
                    entities: {
                        Test: {
                            a: {
                                onUpdateExpression: 'undefinedVariableName'
                            }
                        }
                    }
                },
                'Runtime'
            ],
            [
                [{[typeName]: 'Test', a: ''}],
                {
                    entities: {
                        Test: {
                            a: {
                                onUpdateExecution:
                                    'return undefinedVariableName'
                            }
                        }
                    }
                },
                'Runtime'
            ]
            // endregion
        ] as Array<ForbiddenTest>)(
            '%#. forbidden hooks validateDocumentUpdate ' +
            `(with update strategy "${updateStrategy}")`,
            forbiddenTester
        )
        /// endregion
        /// region property writable/mutable
        test.each([
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
            ]
        ] as Array<ForbiddenTest>)(
            '%#. forbidden property writable/mutable validateDocumentUpdate ' +
            `(with update strategy "${updateStrategy}")`,
            forbiddenTester
        )
        /// endregion
        /// region property existence
        test.each([
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
                updateStrategy === 'replace' ? 'MissingProperty' : 'NoChange'
            ]
        ] as Array<ForbiddenTest>)(
            '%#. forbidden property existence validateDocumentUpdate ' +
            `(with update strategy "${updateStrategy}")`,
            forbiddenTester
        )
        /// endregion
        /// region property type
        test.each([
            // Properties have to be its specified type (string is default).
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
                {
                    entities: {
                        Test: {[specialNames.additional]: {type: 'number'}}
                    }
                },
                'PropertyType'
            ],
            [
                [{[typeName]: 'Test', a: '1'}],
                {
                    entities: {
                        Test: {
                            [specialNames.additional]: {
                                type: ['number', 'boolean', '2']
                            }
                        }
                    }
                },
                'PropertyType'
            ],
            // region array
            /// region type
            [
                [{[typeName]: 'Test', a: 2}],
                {entities: {Test: {a: {type: 'string[]'}}}},
                'PropertyType'
            ],
            [
                [{[typeName]: 'Test', a: [2]}],
                {entities: {Test: {a: {type: 'string[]'}}}},
                'PropertyType'
            ],
            [
                [{[typeName]: 'Test', a: ['b']}],
                {entities: {Test: {a: {type: 'number[]'}}}},
                'PropertyType'
            ],
            [
                [{[typeName]: 'Test', a: [1]}],
                {entities: {Test: {a: {type: 'boolean[]'}}}},
                'PropertyType'
            ],
            [
                [{[typeName]: 'Test', a: '[1]'}],
                {entities: {Test: {a: {type: 'DateTime'}}}},
                'PropertyType'
            ],
            [
                [{[typeName]: 'Test', a: '["a"]'}],
                {entities: {Test: {a: {type: 'DateTime[]'}}}},
                'PropertyType'
            ],
            [
                [{[typeName]: 'Test', a: [{[typeName]: 'Test'}]}],
                {entities: {Test: {a: {type: 'Custom[]'}}}},
                'PropertyType'
            ],
            [
                [{
                    [typeName]: 'Test', a: [{[typeName]: 'Custom'}, {
                        [typeName]: 'Test'
                    }]
                }],
                {entities: {Test: {a: {type: 'Custom[]'}}}},
                'PropertyType'
            ],
            /// endregion
            [
                [{[typeName]: 'Test', a: [{[typeName]: 'Test', b: 2}]}],
                {entities: {Test: {a: {type: 'Test[]'}}}},
                'Property'
            ],
            [
                [{
                    [typeName]: 'Test', a: [{
                        [typeName]: 'Test', b: null
                    }], b: 'a'
                }],
                {
                    entities: {
                        Test: {
                            a: {type: 'Test[]'}, b: {
                                nullable: false
                            }
                        }
                    }
                },
                'NotNull'
            ],
            [
                [
                    {
                        [typeName]: 'Test',
                        a: [{[typeName]: 'Test', b: 'a'}]
                    },
                    {[typeName]: 'Test', a: [{[typeName]: 'Test', b: 'b'}]}
                ],
                {
                    entities: {
                        Test: {a: {type: 'Test[]', writable: false}, b: {}}
                    }
                },
                'Readonly'],
            [
                [{
                    [typeName]: 'Test', a: [4], b: [{
                        [typeName]: 'Test', a: [
                            2
                        ]
                    }]
                }],
                {
                    entities: {
                        Test: {
                            a: {type: 'number[]', minimum: 3},
                            b: {type: 'Test[]'}
                        }
                    }
                },
                'Minimum'
            ],
            [
                [{[typeName]: 'Test', a: [4]}],
                {
                    entities: {
                        Test: {
                            a: {type: 'integer[]', minimumNumber: 2}
                        }
                    }
                },
                'MinimumArrayLength'
            ],
            [
                [{[typeName]: 'Test', a: []}],
                {
                    entities: {
                        Test: {
                            a: {
                                emptyEqualsNull: false,
                                minimumNumber: 1,
                                type: 'integer[]'
                            }
                        }
                    }
                },
                'MinimumArrayLength'
            ],
            [
                [{[typeName]: 'Test', a: [1]}],
                {
                    entities: {
                        Test: {
                            a: {type: 'integer[]', maximumNumber: 0}
                        }
                    }
                },
                'MaximumArrayLength'
            ],
            [
                [{[typeName]: 'Test', a: [1, 2]}],
                {
                    entities: {
                        Test: {
                            a: {type: 'integer[]', maximumNumber: 1}
                        }
                    }
                },
                'MaximumArrayLength'
            ],
            [
                [{[typeName]: 'Test', a: [1, 2, 3]}],
                {
                    entities: {
                        Test: {
                            a: {type: 'integer[]', maximumNumber: 2}
                        }
                    }
                },
                'MaximumArrayLength'
            ],
            [
                [{[typeName]: 'Test', a: [1]}],
                {
                    entities: {
                        Test: {
                            a: {
                                type: 'integer[]',
                                constraintExpression: {
                                    evaluation: 'newValue === 2'
                                }
                            }
                        }
                    }
                },
                'ConstraintExpression'
            ],
            [
                [{[typeName]: 'Test', a: [1]}],
                {
                    entities: {
                        Test: {
                            a: {
                                type: 'integer[]', arrayConstraintExpression: {
                                    evaluation: 'newValue.length === 2'
                                }
                            }
                        }
                    }
                },
                'ArrayConstraintExpression'
            ],
            // endregion
            // region nested property
            /// region property type
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
            /// endregion
            /// region property existence
            [
                [{[typeName]: 'Test', a: {[typeName]: 'Test', b: 2}}],
                {entities: {Test: {a: {type: 'Test'}}}},
                'Property'
            ],
            [
                [{
                    [typeName]: 'Test',
                    a: {[typeName]: 'Test', b: null},
                    b: 'a'
                }],
                {
                    entities: {
                        Test: {
                            a: {type: 'Test'}, b: {
                                nullable: false
                            }
                        }
                    }
                },
                'NotNull'
            ],
            [
                [{[typeName]: 'Test', a: {[typeName]: 'Test'}, b: 'a'}],
                {
                    entities: {
                        Test: {
                            a: {type: 'Test'}, b: {
                                nullable: false
                            }
                        }
                    }
                },
                'MissingProperty'
            ],
            /// endregion
            /// region property readonly
            [
                [
                    {[typeName]: 'Test', a: {[typeName]: 'Test', b: 'a'}},
                    {[typeName]: 'Test', a: {[typeName]: 'Test', b: 'b'}}
                ],
                {
                    entities: {
                        Test: {
                            a: {type: 'Test'}, b: {
                                writable: false
                            }
                        }
                    }
                },
                'Readonly'
            ],
            [
                [
                    {[typeName]: 'Test', a: {[typeName]: 'Test', b: 'a'}},
                    {[typeName]: 'Test', a: {[typeName]: 'Test', b: 'b'}}
                ],
                {
                    entities: {
                        Test: {a: {type: 'Test'}, b: {mutable: false}}
                    }
                },
                'Immutable'
            ],
            [
                [
                    {[typeName]: 'Test', a: {[typeName]: 'Test', b: 'a'}},
                    {[typeName]: 'Test', a: {[typeName]: 'Test'}}
                ],
                {
                    entities: {
                        Test: {a: {type: 'Test'}, b: {writable: false}}
                    }
                },
                'Readonly'
            ],
            [
                [
                    {[typeName]: 'Test', a: {[typeName]: 'Test', b: 'a'}},
                    {[typeName]: 'Test', a: {[typeName]: 'Test', b: 'b'}},
                    {}, {}
                ],
                {
                    entities: {
                        Test: {a: {type: 'Test', writable: false}, b: {}}
                    }
                },
                'Readonly'
            ],
            /// endregion
            /// region property range
            [
                [{
                    [typeName]: 'Test',
                    a: 4,
                    b: {[typeName]: 'Test', a: 2}
                }],
                {
                    entities: {
                        Test: {
                            a: {type: ['number', 'string'], minimum: 3},
                            b: {type: 'Test'}
                        }
                    }
                },
                'Minimum'
            ],
            [
                [{
                    [typeName]: 'Test',
                    a: '1',
                    b: {[typeName]: 'Test', a: '12'}
                }],
                {
                    entities: {
                        Test: {a: {maximumLength: 1}, b: {type: 'Test'}}
                    }
                },
                'MaximalLength'
            ],
            /// endregion
            /// region property pattern
            [
                [{[typeName]: 'Test', b: {[typeName]: 'Test', a: 'b'}}],
                {entities: {Test: {a: {pattern: 'a'}, b: {type: 'Test'}}}},
                'PatternMatch'
            ],
            [
                [{[typeName]: 'Test', b: {[typeName]: 'Test', a: 'a'}}],
                {
                    entities: {
                        Test: {
                            a: {invertedPattern: 'a'}, b: {type: 'Test'}
                        }
                    }
                },
                'InvertedPatternMatch'
            ],
            /// endregion
            /// region property constraint
            [
                [{
                    [typeName]: 'Test',
                    a: 'b',
                    b: {[typeName]: 'Test', a: 'a'}
                }],
                {
                    entities: {
                        Test: {
                            a: {
                                constraintExpression: {
                                    evaluation: 'newValue === "b"'
                                }
                            },
                            b: {type: 'Test'}
                        }
                    }
                },
                'ConstraintExpression'
            ],
            [
                [{
                    [typeName]: 'Test',
                    a: 'b',
                    b: {[typeName]: 'Test', a: 'a'}
                }],
                {
                    entities: {
                        Test: {
                            a: {
                                constraintExpression: {
                                    evaluation: 'newValue === "b"'
                                }
                            },
                            b: {type: 'Test'}
                        }
                    }
                },
                'ConstraintExpression'
            ],
            /// endregion
            // endregion
            [
                [{[typeName]: 'Test1', a: 1}],
                {
                    entities: {
                        Test1: {a: {type: 'foreignKey:Test2'}},
                        Test2: {[idName]: {type: 'string'}}
                    }
                },
                'PropertyType'
            ],
            [
                [{[typeName]: 'Test', a: 1}],
                {entities: {Test: {a: {type: 2}}}},
                'PropertyType'
            ]
        ] as Array<ForbiddenTest>)(
            '%#. forbidden property type validateDocumentUpdate ' +
            `(with update strategy "${updateStrategy}")`,
            forbiddenTester
        )
        /// endregion
        /// region property range
        test.each([
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
            ]
        ] as Array<ForbiddenTest>)(
            '%#. forbidden property range validateDocumentUpdate ' +
            `(with update strategy "${updateStrategy}")`,
            forbiddenTester
        )
        /// endregion
        /// region selection
        test.each([
            // Values have to be in their specified limits.
            [
                [{[typeName]: 'Test', a: 2}],
                {entities: {Test: {a: {selection: [], type: 'number'}}}},
                'Selection'
            ],
            [
                [{[typeName]: 'Test', a: 2}],
                {entities: {Test: {a: {selection: [1], type: 'number'}}}},
                'Selection'
            ],
            [
                [{[typeName]: 'Test', a: 2}],
                {
                    entities: {
                        Test: {
                            a: {
                                selection: [1, 3], type: 'integer'
                            }
                        }
                    }
                },
                'Selection'
            ],
            [
                [{[typeName]: 'Test', a: '2'}],
                {
                    entities: {
                        Test: {
                            a: {
                                selection: {'1': 'a', '3': 'c'}, type: 'string'
                            }
                        }
                    }
                },
                'Selection'
            ],
            [
                [{[typeName]: 'Test', a: 2}],
                {
                    entities: {
                        Test: {
                            a: {
                                selection: [
                                    {label: 'a', value: 1}, {
                                        label: 'c',
                                        value: 3
                                    }
                                ],
                                type: 'number'
                            }
                        }
                    }
                },
                'Selection'
            ]
        ] as Array<ForbiddenTest>)(
            '%#. forbidden selection validateDocumentUpdate ' +
            `(with update strategy "${updateStrategy}")`,
            forbiddenTester
        )
        /// endregion
        /// region property pattern
        test.each([
            // Values have to match their specified pattern.
            [
                [{[typeName]: 'Test', a: 'b'}],
                {entities: {Test: {a: {pattern: 'a'}}}},
                'PatternMatch'
            ],
            [
                [{[typeName]: 'Test', a: 'a'}],
                {entities: {Test: {a: {invertedPattern: 'a'}}}},
                'InvertedPatternMatch'
            ]
        ] as Array<ForbiddenTest>)(
            '%#. forbidden property pattern validateDocumentUpdate ' +
            `(with update strategy "${updateStrategy}")`,
            forbiddenTester
        )
        /// endregion
        /// region property constraint
        test.each([
            /*
                Values have to satisfy their constraints so a given constraint
                expression has to resolve to "true".
            */
            [
                [{[typeName]: 'Test', a: 'b'}],
                {
                    entities: {
                        Test: {
                            a: {
                                constraintExpression: {
                                    evaluation: 'false'
                                }
                            }
                        }
                    }
                },
                'ConstraintExpression'
            ],
            [
                [{[typeName]: 'Test', a: 'b'}],
                {
                    entities: {
                        Test: {
                            a: {
                                constraintExecution: {
                                    evaluation: 'return false'
                                }
                            }
                        }
                    }
                },
                'ConstraintExecution'
            ],
            [
                [{[typeName]: 'Test', a: 'b'}],
                {
                    entities: {
                        Test: {
                            a: {
                                constraintExpression: {
                                    evaluation: '+'
                                }
                            }
                        }
                    }
                },
                'Compilation'
            ],
            [
                [{[typeName]: 'Test', a: 'b'}],
                {
                    entities: {
                        Test: {
                            a: {
                                constraintExpression: {
                                    evaluation: 'undefinedVariableName'
                                }
                            }
                        }
                    }
                },
                'Runtime'
            ],
            [
                [{[typeName]: 'Test', a: 'b'}],
                {
                    entities: {
                        Test: {
                            a: {
                                constraintExecution: {
                                    evaluation: 'return undefinedVariableName'
                                }
                            }
                        }
                    }
                },
                'Runtime'
            ],
            [
                [{[typeName]: 'Test', a: 'b'}],
                {
                    entities: {
                        Test: {
                            a: {
                                constraintExpression: {
                                    evaluation: 'newValue === "a"'
                                }
                            }
                        }
                    }
                },
                'ConstraintExpression'
            ]
        ] as Array<ForbiddenTest>)(
            '%#. forbidden property constraint validateDocumentUpdate ' +
            `(with update strategy "${updateStrategy}")`,
            forbiddenTester
        )
        /// endregion
        /// region constraint
        test.each([
            /*
                Models have to satisfy their constraints so a given constraint
                expression has to resolve to "true".
            */
            [
                [{[typeName]: 'Test', a: 'a', b: 'b'}],
                {
                    entities: {
                        Test: {
                            _constraintExpressions: [{evaluation: 'false'}],
                            a: {},
                            b: {}
                        }
                    }
                },
                'ConstraintExpressions'
            ],
            [
                [{[typeName]: 'Test', a: 'a', b: 'b'}],
                {
                    entities: {
                        Test: {
                            _constraintExecutions: [
                                {evaluation: 'return false'}
                            ],
                            a: {},
                            b: {}
                        }
                    }
                },
                'ConstraintExecutions'
            ],
            [
                [{[typeName]: 'Test', a: 'a', b: 'b'}],
                {
                    entities: {
                        Test: {
                            _constraintExecutions: [{
                                description: '`Fails always!`',
                                evaluation: 'return false'
                            }],
                            a: {},
                            b: {}
                        }
                    }
                },
                'ConstraintExecutions'
            ],
            [
                [{[typeName]: 'Test', a: 'a', b: 'b'}],
                {
                    entities: {
                        Test: {
                            _constraintExecutions: [{
                                description: '`a: ${newDocument.a} failed!`',
                                evaluation:
                                    'return newDocument.a === newDocument.b'
                            }],
                            a: {},
                            b: {}
                        }
                    }
                },
                'ConstraintExecutions'
            ]
        ] as Array<ForbiddenTest>)(
            '%#. forbidden constraint validateDocumentUpdate ' +
            `(with update strategy "${updateStrategy}")`,
            forbiddenTester
        )
        /// endregion
        /// region attachment
        test.each([
            // Non specified attachments aren't allowed.
            [
                [{[typeName]: 'Test', [attachmentName]: {} as Attachments}],
                {entities: {Test: {}}},
                'Property'
            ],
            // Required attachments have to be present.
            [
                [{[typeName]: 'Test'}],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                data: {
                                    fileName: {pattern: '.*'},
                                    minimumNumber: 1,
                                    nullable: false
                                }
                            }
                        }
                    }
                },
                'AttachmentMissing'
            ],
            [
                [{
                    [typeName]: 'Test', [attachmentName]: {
                        test: {
                            data: null
                        }
                    }
                }],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                data: {
                                    nullable: false
                                }
                            }
                        }
                    }
                },
                'AttachmentMissing'
            ],
            [
                [{
                    [typeName]: 'Test',
                    [attachmentName]: {test: {data: null}}
                }],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                test: {
                                    minimumNumber: 1, nullable: false
                                }
                            }
                        }
                    }
                },
                'AttachmentMissing'
            ],
            // Every required attachments have to be present.
            [
                [{
                    [typeName]: 'Test', [attachmentName]: {
                        /* eslint-disable camelcase */
                        a: {data: '', content_type: 'text/plain'}
                        /* eslint-enable camelcase */
                    }
                }],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                a: {minimumNumber: 1, nullable: false},
                                b: {minimumNumber: 1, nullable: false}
                            }
                        }
                    }
                },
                'AttachmentMissing'
            ],
            [
                [{[typeName]: 'Test'}],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                a: {
                                    minimumNumber: 1, nullable: false
                                }
                            }
                        }
                    }
                },
                'AttachmentMissing'
            ],
            [
                [{[typeName]: 'Test', [attachmentName]: null}],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                data: {
                                    minimumNumber: 1, nullable: false
                                }
                            }
                        }
                    }
                },
                'AttachmentMissing'
            ],
            // Attachments have to be attachments types.
            [
                [{[typeName]: 'Test', [attachmentName]: new Date()}],
                {entities: {Test: {[attachmentName]: {data: {}}}}},
                'AttachmentType'
            ],
            // Number of attachments have to be in its specified bounds.
            [
                [{
                    [typeName]: 'Test', [attachmentName]: {
                        /* eslint-disable camelcase */
                        a: {data: '', content_type: 'text/plain'},
                        b: {data: '', content_type: 'text/plain'}
                        /* eslint-enable camelcase */
                    }
                }],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                data: {
                                    fileName: {pattern: '.*'},
                                    maximumNumber: 1
                                }
                            }
                        }
                    }
                },
                'AttachmentMaximum'
            ],
            [
                [{
                    [typeName]: 'Test', [attachmentName]: {
                        test: {
                            /* eslint-disable camelcase */
                            data: '', content_type: 'text/plain'
                            /* eslint-enable camelcase */
                        }
                    }
                }],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                test: {
                                    minimumNumber: 2
                                }
                            }
                        }
                    }
                },
                'AttachmentMinimum'
            ],
            [
                [{[typeName]: 'Test', [attachmentName]: {}}],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                data: {
                                    minimumNumber: 1, nullable: false
                                }
                            }
                        }
                    }
                },
                'AttachmentMissing'
            ],
            /*
                Needed attachments should be removable if no proper replacement
                is provided.
            */
            [
                [
                    {
                        [typeName]: 'Test',
                        [attachmentName]: {test: {data: null}}
                    },
                    {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            test: {
                                /* eslint-disable camelcase */
                                content_type: 'text/plain', data: ''
                                /* eslint-enable camelcase */
                            }
                        }
                    }
                ],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                test: {
                                    nullable: false
                                }
                            }
                        }
                    }
                },
                'AttachmentMissing'
            ],
            // Attachments types should match their specification.
            [
                [{
                    [typeName]: 'Test', [attachmentName]: {
                        a: {
                            /* eslint-disable camelcase */
                            data: '', content_type: 'text/plain'
                            /* eslint-enable camelcase */
                        }
                    }
                }],
                {entities: {Test: {[attachmentName]: {b: {}}}}},
                'AttachmentTypeMatch'
            ],
            [
                [{
                    [typeName]: 'Test', [attachmentName]: {
                        a: {
                            /* eslint-disable camelcase */
                            data: '', content_type: 'text/plain'
                            /* eslint-enable camelcase */
                        }
                    }
                }],
                {entities: {Test: {[attachmentName]: {b: {}, c: {}}}}},
                'AttachmentTypeMatch'
            ],
            // Attachments names should match their specification.
            [
                [{
                    [typeName]: 'Test', [attachmentName]: {
                        a: {
                            /* eslint-disable camelcase */
                            data: '', content_type: 'text/plain'
                            /* eslint-enable camelcase */
                        }
                    }
                }],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                data: {
                                    fileName: {pattern: /b/g, value: 'a'}
                                }
                            }
                        }
                    }
                },
                'AttachmentName'
            ],
            [
                [{
                    [typeName]: 'Test', [attachmentName]: {
                        a: {
                            /* eslint-disable camelcase */
                            data: '', content_type: 'text/plain'
                            /* eslint-enable camelcase */
                        }
                    }
                }],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                a: {
                                    fileName: {invertedPattern: /a/g}
                                }
                            }
                        }
                    }
                },
                'InvertedAttachmentName'
            ],
            [
                [{
                    [typeName]: 'Test', [attachmentName]: {
                        /* eslint-disable camelcase */
                        a: {data: '', content_type: 'text/plain'},
                        b: {data: '', content_type: 'text/plain'}
                        /* eslint-enable camelcase */
                    }
                }],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                data: {
                                    fileName: {pattern: /a/}
                                }
                            }
                        }
                    }
                },
                'AttachmentTypeMatch'
            ],
            [
                [{
                    [typeName]: 'Test', [attachmentName]: {
                        /* eslint-disable camelcase */
                        a: {data: '', content_type: 'text/plain'},
                        b: {data: '', content_type: 'text/plain'}
                        /* eslint-enable camelcase */
                    }
                }],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                data: {
                                    fileName: {
                                        pattern: /[ab]/,
                                        invertedPattern: /a/
                                    }
                                }
                            }
                        }
                    }
                },
                'InvertedAttachmentName'
            ],
            // Attachments content type should match their specification.
            [
                [{
                    [typeName]: 'Test', [attachmentName]: {
                        /* eslint-disable camelcase */
                        a: {data: '', content_type: 'text/plain'},
                        b: {data: '', content_type: 'image/jpg'}
                        /* eslint-enable camelcase */
                    }
                }],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                data: {
                                    contentTypePattern: /text\/plain/,
                                    fileName: {pattern: /.*/}
                                }
                            }
                        }
                    }
                },
                'AttachmentContentType'
            ],
            // Attachments specified sizes should be ensured.
            [
                [{
                    [typeName]: 'Test', [attachmentName]: {
                        a: {
                            data: 'a', length: 1
                        }
                    }
                }],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                a: {
                                    minimumSize: 2
                                }
                            }
                        }
                    }
                },
                'AttachmentMinimumSize'
            ],
            [
                [{
                    [typeName]: 'Test', [attachmentName]: {
                        a: {
                            data: 'abcd', length: 3
                        }
                    }
                }],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                a: {
                                    maximumSize: 2
                                }
                            }
                        }
                    }
                },
                'AttachmentMaximumSize'
            ],
            // Overall attachments specified sizes should be ensured.
            [
                [{
                    [typeName]: 'Test', [attachmentName]: {
                        a: {
                            data: 'a', length: 1
                        }
                    }
                }],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                a: {
                                    minimumAggregatedSize: 2
                                }
                            }
                        }
                    }
                },
                'AttachmentAggregatedMinimumSize'
            ],
            [
                [{
                    [typeName]: 'Test', [attachmentName]: {
                        a: {
                            data: 'abcd', length: 3
                        }
                    }
                }],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                a: {
                                    maximumAggregatedSize: 2
                                }
                            }
                        }
                    }
                },
                'AttachmentAggregatedMaximumSize'
            ],
            [
                [{
                    [typeName]: 'Test', [attachmentName]: {
                        a: {
                            data: 'a', length: 1
                        }
                    }
                }],
                {
                    entities: {
                        Test: {
                            _minimumAggregatedSize: 2,
                            [attachmentName]: {a: {}}
                        }
                    }
                },
                'AggregatedMinimumSize'
            ],
            [
                [{
                    [typeName]: 'Test', [attachmentName]: {
                        a: {
                            data: 'abcd', length: 3
                        }
                    }
                }],
                {
                    entities: {
                        Test: {
                            _maximumAggregatedSize: 2,
                            [attachmentName]: {a: {}}
                        }
                    }
                },
                'AggregatedMaximumSize'
            ]
        ] as Array<ForbiddenTest>)(
            '%#. forbidden attachment validateDocumentUpdate ' +
            `(with update strategy "${updateStrategy}")`,
            forbiddenTester
        )
        /// endregion
        // endregion
        // region allowed writes
        type AllowedTest = [
            [
                Parameters<typeof validateDocumentUpdate>[0],
                Parameters<typeof validateDocumentUpdate>[1]?,
                Parameters<typeof validateDocumentUpdate>[2]?,
                Parameters<typeof validateDocumentUpdate>[3]?
            ],
            RecursivePartial<ModelConfiguration<{
                a: unknown
                b: unknown
                c: unknown
                class: unknown
                type: unknown
            }>>,
            {
                fillUp: ReturnType<typeof validateDocumentUpdate>
                incremental: ReturnType<typeof validateDocumentUpdate>
                replace: ReturnType<typeof validateDocumentUpdate>
            }
        ]
        const allowedTester = (
            parameters: AllowedTest[0],
            givenModelConfiguration: AllowedTest[1],
            expected: AllowedTest[2]
        ): void => {
            // @ts-expect-error Is complaining about "autoMigrationPath".
            const modelConfiguration: ModelConfiguration = extend(
                true,
                copy(defaultModelConfiguration),
                givenModelConfiguration as ModelConfiguration
            )
            const models = extendModels(modelConfiguration)

            delete (
                modelConfiguration.property as
                    Partial<ModelConfiguration['property']>
            ).defaultSpecification
            delete (modelConfiguration as Partial<ModelConfiguration>)
                .entities

            expect(validateDocumentUpdate(
                ...(
                    parameters
                        .concat([null, {}, {}].slice(parameters.length - 1))
                ) as [
                    Parameters<typeof validateDocumentUpdate>[0],
                    Parameters<typeof validateDocumentUpdate>[1],
                    Parameters<typeof validateDocumentUpdate>[2],
                    Parameters<typeof validateDocumentUpdate>[3]
                ],
                modelConfiguration,
                models
            )).toStrictEqual((expected)[updateStrategy])
        }
        const adaptTests = (tests: Array<AllowedTest>): Array<AllowedTest> =>
            /*
                Provides test only one or skip all tests from specified one to
                support delta debugging when searching for failing test.
            */
            tests
                .filter((test: Array<unknown>) => {
                    if (only || skip)
                        return false
                    if (test[0] === 'only')
                        only = true
                    if (test[0] === 'skip') {
                        skip = true
                        return false
                    }
                    return true
                })
                .filter((_test, index, tests) =>
                    !only || index === tests.length - 1
                )
                .map((test: Array<unknown>) =>
                    ['only', 'skip'].includes(test[0] as string) ?
                        test.slice(1) :
                        test
                ) as Array<AllowedTest>
        /// region general environment
        test.each(adaptTests([
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
                        replace: {
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
                        replace: {
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
                    replace: {[typeName]: 'Test', _deleted: true}
                }
            ],
            /*
                It should be possible to migrate documents with non specified
                properties.
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
                    replace: {[typeName]: 'Test'}
                }
            ],
            // TODO document what is really tested.
            [
                [
                    {[idName]: '1', [revisionName]: '1'},
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
                    fillUp: {[idName]: '1', [revisionName]: '1'},
                    incremental: {[idName]: '1', [revisionName]: '1'},
                    replace: {[idName]: '1', [revisionName]: '1'}
                }
            ],
            [
                [
                    {
                        [typeName]: 'Test',
                        [idName]: '1',
                        [revisionName]: '1',
                        a: null
                    },
                    {
                        [typeName]: 'Test',
                        [idName]: '1',
                        [revisionName]: '0',
                        a: 'a'
                    }
                ],
                {entities: {Test: {a: {}, [idName]: {type: 'string'}}}},
                {
                    fillUp: {
                        [typeName]: 'Test', [idName]: '1', [revisionName]: '1'
                    },
                    incremental: {[idName]: '1', [revisionName]: '1', a: null},
                    replace: {
                        [idName]: '1',
                        [revisionName]: '1',
                        [typeName]: 'Test'
                    }
                }
            ],
            [
                [
                    {
                        [typeName]: 'Test',
                        [revisionName]: '0-latest',
                        a: 'a'
                    },
                    {[typeName]: 'Test', [revisionName]: '1'}
                ],
                {entities: {Test: {a: {}}}},
                {
                    fillUp: {
                        [typeName]: 'Test',
                        [revisionName]: '1', a: 'a'
                    },
                    incremental: {[revisionName]: '1', a: 'a'},
                    replace: {[typeName]: 'Test', [revisionName]: '1', a: 'a'}
                }
            ],
            [
                [
                    {
                        [typeName]: 'Test',
                        [revisionName]: '0-upsert',
                        a: 'a'
                    },
                    {[typeName]: 'Test', [revisionName]: '1'}
                ],
                {entities: {Test: {a: {}}}},
                {
                    fillUp: {
                        [typeName]: 'Test', [revisionName]: '1', a: 'a'
                    },
                    incremental: {[revisionName]: '1', a: 'a'},
                    replace: {[typeName]: 'Test', [revisionName]: '1', a: 'a'}
                }
            ],
            [
                [{[typeName]: 'Test', [revisionName]: '0-upsert'}],
                {entities: {Test: {}}},
                {
                    fillUp: {[typeName]: 'Test'},
                    incremental: {[typeName]: 'Test'},
                    replace: {[typeName]: 'Test'}
                }
            ],
            [
                [
                    {[typeName]: 'Test', [revisionName]: '1', a: 'a'},
                    {[typeName]: 'Test', [revisionName]: '1'}
                ], {entities: {Test: {a: {}}}},
                {
                    fillUp: {
                        [typeName]: 'Test', [revisionName]: '1', a: 'a'
                    },
                    incremental: {[revisionName]: '1', a: 'a'},
                    replace: {[typeName]: 'Test', [revisionName]: '1', a: 'a'}
                }
            ],
            /*
                Only explicitly specified properties should be automatically
                filled up from old documents.
            */
            [
                [{[typeName]: 'Test', a: 1}, {[typeName]: 'Test', b: 2}],
                {
                    entities: {
                        Test: {
                            [specialNames.additional]: {type: 'any'}
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: 1},
                    incremental: {a: 1},
                    replace: {[typeName]: 'Test', a: 1}
                }
            ],
            /*
                Only explicitly specified properties should be automatically
                filled up from old documents except we defined it differently.
            */
            [
                [{[typeName]: 'Test', a: 1}, {[typeName]: 'Test', b: 2}],
                {
                    entities: {
                        Test: {
                            _updateStrategy: 'fillUp',
                            [specialNames.additional]: {type: 'any'}
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: 1, b: 2},
                    incremental: {a: 1},
                    replace: {[typeName]: 'Test', a: 1}
                }
            ]
        ]))(
            '%#. allowed general environment validateDocumentUpdate ' +
            `(with update strategy "${updateStrategy}")`,
            allowedTester
        )
        /// endregion
        /// region model
        test.each(adaptTests([
            // It specified be possible to created specified documents.
            [
                [{[typeName]: 'Test'}],
                {entities: {Test: {}}},
                {
                    fillUp: {[typeName]: 'Test'},
                    incremental: {[typeName]: 'Test'},
                    replace: {[typeName]: 'Test'}
                }
            ],
            [
                [{[typeName]: 'Test'}],
                {entities: {Test: {}}},
                {
                    fillUp: {[typeName]: 'Test'},
                    incremental: {[typeName]: 'Test'},
                    replace: {[typeName]: 'Test'}
                }
            ],
            [
                [{[typeName]: 'Test'}],
                {entities: {Test: {class: {}}}},
                {
                    fillUp: {[typeName]: 'Test'},
                    incremental: {[typeName]: 'Test'},
                    replace: {[typeName]: 'Test'}
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
                    replace: {[typeName]: 'Test', b: 'b'}
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
                    replace: {[typeName]: 'Test', a: '3'}
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
                    replace: {[typeName]: 'Test', a: {[typeName]: '_test'}}
                }
            ]
        ]))(
            '%#. allowed model validateDocumentUpdate (with update strategy ' +
            `"${updateStrategy}")`,
            allowedTester
        )
        /// endregion
        /// region hooks
        test.each(adaptTests([
            // region on create
            [
                [{[typeName]: 'Test', a: ''}],
                {entities: {Test: {a: {onCreateExpression: `'2'`}}}},
                {
                    fillUp: {[typeName]: 'Test', a: '2'},
                    incremental: {[typeName]: 'Test', a: '2'},
                    replace: {[typeName]: 'Test', a: '2'}
                }
            ],
            [
                [{
                    [typeName]: 'Test',
                    [attachmentName]: {
                        test: {
                            /* eslint-disable camelcase */
                            data: 'payload', content_type: 'text/plain'
                            /* eslint-enable camelcase */
                        }
                    }
                }],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                test: {
                                    onCreateExpression: `
                                        (
                                            attachmentsTarget[name].data +=
                                                ' footer'
                                        ) &&
                                        attachmentsTarget[name]
                                    `
                                }
                            }
                        }
                    }
                },
                {
                    fillUp: {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            test: {
                                /* eslint-disable camelcase */
                                content_type: 'text/plain',
                                data: 'payload footer'
                                /* eslint-enable camelcase */
                            }
                        }
                    },
                    incremental: {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            test: {
                                /* eslint-disable camelcase */
                                content_type: 'text/plain',
                                data: 'payload footer'
                                /* eslint-enable camelcase */
                            }
                        }
                    },
                    replace: {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            test: {
                                /* eslint-disable camelcase */
                                content_type: 'text/plain',
                                data: 'payload footer'
                                /* eslint-enable camelcase */
                            }
                        }
                    }
                }
            ],
            [
                [
                    {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            test: {
                                /* eslint-disable camelcase */
                                data: 'payload', content_type: 'text/plain'
                                /* eslint-enable camelcase */
                            }
                        }
                    },
                    {[typeName]: 'Test'}
                ],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                test: {
                                    onCreateExpression: `
                                        (
                                            attachmentsTarget[name].data +=
                                                ' footer'
                                        ) &&
                                        attachmentsTarget[name]
                                    `
                                }
                            }
                        }
                    }
                },
                {
                    fillUp: {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            test: {
                                /* eslint-disable camelcase */
                                data: 'payload', content_type: 'text/plain'
                                /* eslint-enable camelcase */
                            }
                        }
                    },
                    incremental: {
                        [attachmentName]: {
                            test: {
                                /* eslint-disable camelcase */
                                data: 'payload', content_type: 'text/plain'
                                /* eslint-enable camelcase */
                            }
                        }
                    },
                    replace: {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            test: {
                                /* eslint-disable camelcase */
                                data: 'payload', content_type: 'text/plain'
                                /* eslint-enable camelcase */
                            }
                        }
                    }
                }
            ],
            [
                [{[typeName]: 'Test', a: ''}],
                {entities: {Test: {a: {onCreateExecution: `return '2'`}}}},
                {
                    fillUp: {[typeName]: 'Test', a: '2'},
                    incremental: {[typeName]: 'Test', a: '2'},
                    replace: {[typeName]: 'Test', a: '2'}
                }
            ],
            [
                [
                    {[typeName]: 'Test', a: '3', b: 'b'},
                    {[typeName]: 'Test', a: '3'}
                ],
                {
                    entities: {
                        Test: {
                            a: {onCreateExecution: `return '2'`},
                            b: {}
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: '3', b: 'b'},
                    incremental: {b: 'b'},
                    replace: {[typeName]: 'Test', a: '3', b: 'b'}
                }
            ],
            // endregion
            // region on update
            [
                [{[typeName]: 'Test', a: ''}],
                {entities: {Test: {a: {onUpdateExpression: `'2'`}}}},
                {
                    fillUp: {[typeName]: 'Test', a: '2'},
                    incremental: {[typeName]: 'Test', a: '2'},
                    replace: {[typeName]: 'Test', a: '2'}
                }
            ],
            [
                [{[typeName]: 'Test', a: ''}],
                {entities: {Test: {a: {onUpdateExecution: `return '2'`}}}},
                {
                    fillUp: {[typeName]: 'Test', a: '2'},
                    incremental: {[typeName]: 'Test', a: '2'},
                    replace: {[typeName]: 'Test', a: '2'}
                }
            ],
            [
                [
                    {[typeName]: 'Test', a: '1', b: ''},
                    {[typeName]: 'Test', a: '2'}
                ],
                {
                    entities: {
                        Test: {
                            a: {onUpdateExpression: `'2'`},
                            b: {emptyEqualsNull: false}
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: '2', b: ''},
                    incremental: {b: ''},
                    replace: {[typeName]: 'Test', a: '2', b: ''}
                }
            ],
            [
                [{
                    [typeName]: 'Test',
                    [attachmentName]: {
                        test: {
                            /* eslint-disable camelcase */
                            content_type: 'text/plain',
                            data: 'payload'
                            /* eslint-enable camelcase */
                        }
                    }
                }],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                test: {
                                    onUpdateExpression: `
                                        (
                                            attachmentsTarget[name].data +=
                                                ' footer'
                                        ) &&
                                        attachmentsTarget[name]
                                    `
                                }
                            }
                        }
                    }
                },
                {
                    fillUp: {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            test: {
                                /* eslint-disable camelcase */
                                content_type: 'text/plain',
                                data: 'payload footer'
                                /* eslint-enable camelcase */
                            }
                        }
                    },
                    incremental: {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            test: {
                                /* eslint-disable camelcase */
                                content_type: 'text/plain',
                                data: 'payload footer'
                                /* eslint-enable camelcase */
                            }
                        }
                    },
                    replace: {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            test: {
                                /* eslint-disable camelcase */
                                content_type: 'text/plain',
                                data: 'payload footer'
                                /* eslint-enable camelcase */
                            }
                        }
                    }
                }
            ],
            [
                [
                    {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            test: {
                                /* eslint-disable camelcase */
                                content_type: 'text/plain',
                                data: 'payload'
                                /* eslint-enable camelcase */
                            }
                        }
                    },
                    {[typeName]: 'Test'}
                ],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                test: {
                                    onUpdateExpression: `
                                        (
                                            attachmentsTarget[name].data +=
                                                ' footer'
                                        ) &&
                                        attachmentsTarget[name]
                                    `
                                }
                            }
                        }
                    }
                },
                {
                    fillUp: {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            test: {
                                /* eslint-disable camelcase */
                                content_type: 'text/plain',
                                data: 'payload footer'
                                /* eslint-enable camelcase */
                            }
                        }
                    },
                    incremental: {
                        [attachmentName]: {
                            test: {
                                /* eslint-disable camelcase */
                                content_type: 'text/plain',
                                data: 'payload footer'
                                /* eslint-enable camelcase */
                            }
                        }
                    },
                    replace: {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            test: {
                                /* eslint-disable camelcase */
                                content_type: 'text/plain',
                                data: 'payload footer'
                                /* eslint-enable camelcase */
                            }
                        }
                    }
                }
            ],
            [
                [{[typeName]: 'Test', a: ''}, {[typeName]: 'Test'}],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                data: {
                                    onUpdateExpression: `
                                        (
                                            attachmentsTarget[name].data +=
                                                ' footer'
                                        ) &&
                                        attachmentsTarget[name]
                                    `
                                }
                            },
                            a: {emptyEqualsNull: false}
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: ''},
                    incremental: {a: ''},
                    replace: {[typeName]: 'Test', a: ''}
                }
            ]
            // endregion
        ]))(
            '%#. allowed hooks validateDocumentUpdate ' +
            `(with update strategy "${updateStrategy}")`,
            allowedTester
        )
        /// endregion
        /// region property writable/mutable
        test.each(adaptTests([
            [
                [
                    {[typeName]: 'Test', a: 'b', b: ''},
                    {[typeName]: 'Test', a: 'b'}
                ],
                {
                    entities: {
                        Test: {
                            a: {writable: false}, b: {
                                emptyEqualsNull: false
                            }
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: 'b', b: ''},
                    incremental: {b: ''},
                    replace: {[typeName]: 'Test', a: 'b', b: ''}
                }
            ],
            [
                [
                    {[typeName]: 'Test', b: ''},
                    {[typeName]: 'Test'}
                ],
                {
                    entities: {
                        Test: {
                            a: {writable: false},
                            b: {emptyEqualsNull: false}
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', b: ''},
                    incremental: {b: ''},
                    replace: {[typeName]: 'Test', b: ''}
                }
            ],
            [
                [{[typeName]: 'Test', a: '2'}, {[typeName]: 'Test'}],
                {entities: {Test: {a: {mutable: false}}}},
                {
                    fillUp: {[typeName]: 'Test', a: '2'},
                    incremental: {a: '2'},
                    replace: {[typeName]: 'Test', a: '2'}
                }
            ]
        ]))(
            '%#. allowed property writable/mutable validateDocumentUpdate ' +
            `(with update strategy "${updateStrategy}")`,
            allowedTester
        )
        /// endregion
        /// region property existence
        test.each(adaptTests([
            [
                [
                    {[typeName]: 'Test', a: null},
                    {[typeName]: 'Test', a: ''}
                ],
                {entities: {Test: {a: {emptyEqualsNull: false}}}},
                {
                    fillUp: {[typeName]: 'Test'},
                    incremental: {a: null},
                    replace: {[typeName]: 'Test'}
                }
            ],
            [
                [
                    {[typeName]: 'Test', a: ''},
                    {[typeName]: 'Test', a: 'old'}
                ],
                {entities: {Test: {a: {emptyEqualsNull: false}}}},
                {
                    fillUp: {[typeName]: 'Test', a: ''},
                    incremental: {a: ''},
                    replace: {[typeName]: 'Test', a: ''}
                }
            ],
            [
                [
                    {[typeName]: 'Test', a: ''},
                    {[typeName]: 'Test', a: 'old'}
                ],
                {entities: {Test: {a: {emptyEqualsNull: true}}}},
                {
                    fillUp: {[typeName]: 'Test'},
                    incremental: {a: null},
                    replace: {[typeName]: 'Test'}
                }
            ],
            [
                [{[typeName]: 'Test', a: 2}],
                {entities: {Test: {a: {type: 'number'}}}},
                {
                    fillUp: {[typeName]: 'Test', a: 2},
                    incremental: {[typeName]: 'Test', a: 2},
                    replace: {[typeName]: 'Test', a: 2}
                }
            ],
            [
                [{[typeName]: 'Test', a: null}],
                {entities: {Test: {a: {}}}},
                {
                    fillUp: {[typeName]: 'Test'},
                    incremental: {[typeName]: 'Test'},
                    replace: {[typeName]: 'Test'}
                }
            ],
            [
                [{[typeName]: 'Test', a: 'a'}],
                {entities: {Test: {a: {nullable: false}}}},
                {
                    fillUp: {[typeName]: 'Test', a: 'a'},
                    incremental: {[typeName]: 'Test', a: 'a'},
                    replace: {[typeName]: 'Test', a: 'a'}
                }
            ],
            [
                [{[typeName]: 'Test'}],
                {entities: {Test: {a: {default: '2', nullable: false}}}},
                {
                    fillUp: {[typeName]: 'Test', a: '2'},
                    incremental: {[typeName]: 'Test', a: '2'},
                    replace: {[typeName]: 'Test', a: '2'}
                }
            ],
            [
                [{[typeName]: 'Test'}],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                test: {
                                    default: {
                                        test: {
                                            /* eslint-disable camelcase */
                                            data: '',
                                            content_type: 'text/plain'
                                            /* eslint-enable camelcase */
                                        }
                                    },
                                    nullable: false
                                }
                            }
                        }
                    }
                },
                {
                    fillUp: {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            test: {
                                /* eslint-disable camelcase */
                                data: '', content_type: 'text/plain'
                                /* eslint-enable camelcase */
                            }
                        }
                    },
                    incremental: {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            test: {
                                /* eslint-disable camelcase */
                                data: '', content_type: 'text/plain'
                                /* eslint-enable camelcase */
                            }
                        }
                    },
                    replace: {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            test: {
                                /* eslint-disable camelcase */
                                data: '', content_type: 'text/plain'
                                /* eslint-enable camelcase */
                            }
                        }
                    }
                }
            ]
        ]))(
            '%#. allowed property existence validateDocumentUpdate ' +
            `(with update strategy "${updateStrategy}")`,
            allowedTester
        )
        /// endregion
        /// region property type
        test.each(adaptTests([
            [
                [
                    {[typeName]: 'Test', a: '2 ', b: ''},
                    {[typeName]: 'Test', a: '2'}
                ],
                {entities: {Test: {a: {}, b: {emptyEqualsNull: false}}}},
                {
                    fillUp: {[typeName]: 'Test', a: '2', b: ''},
                    incremental: {b: ''},
                    replace: {[typeName]: 'Test', a: '2', b: ''}
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
                    replace: {[typeName]: 'Test', a: '2 '}
                }
            ],
            [
                [{[typeName]: 'Test', a: 3}, {[typeName]: 'Test', a: 2}],
                {entities: {Test: {a: {type: 'integer'}}}},
                {
                    fillUp: {[typeName]: 'Test', a: 3},
                    incremental: {a: 3},
                    replace: {[typeName]: 'Test', a: 3}
                }
            ],
            [
                [{[typeName]: 'Test', a: 2.2}, {[typeName]: 'Test', a: 2}],
                {entities: {Test: {a: {type: 'number'}}}},
                {
                    fillUp: {[typeName]: 'Test', a: 2.2},
                    incremental: {a: 2.2},
                    replace: {[typeName]: 'Test', a: 2.2}
                }
            ],
            [
                [
                    {[typeName]: 'Test', a: true, b: ''},
                    {[typeName]: 'Test', a: true}
                ],
                {
                    entities: {
                        Test: {
                            a: {type: 'boolean'}, b: {emptyEqualsNull: false}
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: true, b: ''},
                    incremental: {b: ''},
                    replace: {[typeName]: 'Test', a: true, b: ''}
                }
            ],
            [
                [
                    {[typeName]: 'Test', a: 1, b: ''},
                    {[typeName]: 'Test', a: 1}
                ],
                {
                    entities: {
                        Test: {
                            a: {type: 'DateTime'},
                            b: {emptyEqualsNull: false}
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: 1, b: ''},
                    incremental: {b: ''},
                    replace: {[typeName]: 'Test', a: 1, b: ''}
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
                {
                    entities: {
                        Test: {
                            a: {type: 'DateTime'}, b: {emptyEqualsNull: false}
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: 0, b: ''},
                    incremental: {b: ''},
                    replace: {[typeName]: 'Test', a: 0, b: ''}
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
                {
                    entities: {
                        Test: {
                            a: {type: 'DateTime'}, b: {emptyEqualsNull: false}
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: 0, b: ''},
                    incremental: {b: ''},
                    replace: {[typeName]: 'Test', a: 0, b: ''}
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
                {
                    entities: {
                        Test: {
                            a: {type: 'DateTime'},
                            b: {emptyEqualsNull: false}
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: 0, b: ''},
                    incremental: {b: ''},
                    replace: {[typeName]: 'Test', a: 0, b: ''}
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
                {
                    entities: {
                        Test: {
                            a: {type: 'DateTime'},
                            b: {emptyEqualsNull: false}
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: 1, b: ''},
                    incremental: {b: ''},
                    replace: {[typeName]: 'Test', a: 1, b: ''}
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
                {
                    entities: {
                        Test: {
                            a: {type: 'DateTime'},
                            b: {emptyEqualsNull: false}
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: 2, b: ''},
                    incremental: {b: ''},
                    replace: {[typeName]: 'Test', a: 2, b: ''}
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
                {
                    entities: {
                        Test: {
                            a: {type: 'DateTime'},
                            b: {emptyEqualsNull: false}
                        }
                    }
                },
                {
                    fillUp: {
                        [typeName]: 'Test',
                        a: 5 * 60 ** 2 + 2,
                        b: ''
                    },
                    incremental: {b: ''},
                    replace: {
                        [typeName]: 'Test',
                        a: 5 * 60 ** 2 + 2,
                        b: ''
                    }
                }
            ],
            [
                [{[typeName]: 'Test', a: 2, b: ''}],
                {
                    entities: {
                        Test: {
                            [specialNames.additional]: {
                                type: 'any', emptyEqualsNull: false
                            }
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: 2, b: ''},
                    incremental: {[typeName]: 'Test', a: 2, b: ''},
                    replace: {[typeName]: 'Test', a: 2, b: ''}
                }
            ],
            [
                [{[typeName]: 'Test', a: '2', b: ''}],
                {
                    entities: {
                        Test: {
                            [specialNames.additional]: {
                                emptyEqualsNull: false
                            }
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: '2', b: ''},
                    incremental: {[typeName]: 'Test', a: '2', b: ''},
                    replace: {[typeName]: 'Test', a: '2', b: ''}
                }
            ],
            // region array
            [
                [
                    {[typeName]: 'Test', a: ['2'], b: ''},
                    {[typeName]: 'Test', a: ['2']}
                ],
                {
                    entities: {
                        Test: {
                            a: {type: 'string[]'}, b: {emptyEqualsNull: false}
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: ['2'], b: ''},
                    incremental: {b: ''},
                    replace: {[typeName]: 'Test', a: ['2'], b: ''}
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
                    replace: {[typeName]: 'Test', a: ['2']}
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
                    replace: {[typeName]: 'Test', a: ['3']}
                }
            ],
            [
                [{[typeName]: 'Test', a: ['2']}, {[typeName]: 'Test'}],
                {entities: {Test: {a: {type: 'string[]'}}}},
                {
                    fillUp: {[typeName]: 'Test', a: ['2']},
                    incremental: {a: ['2']},
                    replace: {[typeName]: 'Test', a: ['2']}
                }
            ],
            [
                [
                    {[typeName]: 'Test', a: null, b: ''},
                    {[typeName]: 'Test'}
                ],
                {
                    entities: {
                        Test: {
                            a: {type: 'string[]'}, b: {emptyEqualsNull: false}
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', b: ''},
                    incremental: {b: ''},
                    replace: {[typeName]: 'Test', b: ''}
                }
            ],
            [
                [{[typeName]: 'Test', a: [2]}, {[typeName]: 'Test'}],
                {entities: {Test: {a: {type: 'integer[]'}}}},
                {
                    fillUp: {[typeName]: 'Test', a: [2]},
                    incremental: {a: [2]},
                    replace: {[typeName]: 'Test', a: [2]}
                }
            ],
            [
                [{[typeName]: 'Test', a: [2.3]}, {[typeName]: 'Test'}],
                {entities: {Test: {a: {type: 'number[]'}}}},
                {
                    fillUp: {[typeName]: 'Test', a: [2.3]},
                    incremental: {a: [2.3]},
                    replace: {[typeName]: 'Test', a: [2.3]}
                }
            ],
            [
                [{[typeName]: 'Test', a: [true]}, {[typeName]: 'Test'}],
                {entities: {Test: {a: {type: 'boolean[]'}}}},
                {
                    fillUp: {[typeName]: 'Test', a: [true]},
                    incremental: {a: [true]},
                    replace: {[typeName]: 'Test', a: [true]}
                }
            ],
            [
                [{[typeName]: 'Test', a: [1]}, {[typeName]: 'Test'}],
                {entities: {Test: {a: {type: 'DateTime[]'}}}},
                {
                    fillUp: {[typeName]: 'Test', a: [1]},
                    incremental: {a: [1]},
                    replace: {[typeName]: 'Test', a: [1]}
                }
            ],
            [
                [{[typeName]: 'Test', a: []}, {[typeName]: 'Test'}],
                {
                    entities: {
                        Test: {
                            a: {
                                emptyEqualsNull: false, type: 'DateTime[]'
                            }
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: []},
                    incremental: {a: []},
                    replace: {[typeName]: 'Test', a: []}
                }
            ],
            [
                [{[typeName]: 'Test', a: [2]}, {[typeName]: 'Test'}],
                {
                    entities: {
                        Test: {
                            a: {
                                type: 'DateTime[]', mutable: false
                            }
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: [2]},
                    incremental: {a: [2]},
                    replace: {[typeName]: 'Test', a: [2]}
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
                    replace: {[typeName]: 'Test', a: [2, 1.1]}
                }
            ],
            [
                [{[typeName]: 'Test', a: [2, 1]}],
                {
                    entities: {
                        Test: {
                            a: {
                                type: 'integer[]',
                                maximumNumber: 2,
                                minimumNumber: 1
                            }
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: [2, 1]},
                    incremental: {[typeName]: 'Test', a: [2, 1]},
                    replace: {[typeName]: 'Test', a: [2, 1]}
                }
            ],
            [
                [{[typeName]: 'Test', a: [2, 1]}],
                {
                    entities: {
                        Test: {
                            a: {
                                maximumNumber: Infinity,
                                minimumNumber: 0,
                                type: 'integer[]'
                            }
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: [2, 1]},
                    incremental: {[typeName]: 'Test', a: [2, 1]},
                    replace: {[typeName]: 'Test', a: [2, 1]}
                }
            ],
            [
                [{[typeName]: 'Test', a: [2]}],
                {
                    entities: {
                        Test: {
                            a: {
                                type: 'integer[]', maximum: 2, maximumNumber: 1
                            }
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: [2]},
                    incremental: {[typeName]: 'Test', a: [2]},
                    replace: {[typeName]: 'Test', a: [2]}
                }
            ],
            [
                [{[typeName]: 'Test', a: []}],
                {
                    entities: {
                        Test: {
                            a: {
                                type: 'integer[]', maximum: 2, maximumNumber: 0
                            }
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test'},
                    incremental: {[typeName]: 'Test'},
                    replace: {[typeName]: 'Test'}
                }
            ],
            [
                [{[typeName]: 'Test', a: [2, '2']}],
                {entities: {Test: {a: {type: 'any[]'}}}},
                {
                    fillUp: {[typeName]: 'Test', a: [2, '2']},
                    incremental: {[typeName]: 'Test', a: [2, '2']},
                    replace: {[typeName]: 'Test', a: [2, '2']}
                }
            ],
            [
                [{[typeName]: 'Test', a: [2, '2']}],
                {entities: {Test: {a: {type: [['number', 'string']]}}}},
                {
                    fillUp: {[typeName]: 'Test', a: [2, '2']},
                    incremental: {[typeName]: 'Test', a: [2, '2']},
                    replace: {[typeName]: 'Test', a: [2, '2']}
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
                    replace: {
                        [typeName]: 'Test',
                        a: [{
                            [typeName]: 'Test',
                            b: 'b'
                        }]
                    }
                }
            ],
            [
                [
                    {[typeName]: 'Test', a: [{b: 'new'}]},
                    {[typeName]: 'Test', a: [{b: 'old'}]}
                ],
                {
                    entities: {
                        Data: {b: {}},
                        Test: {a: {type: 'Data[]'}}
                    }
                },
                {
                    fillUp: {
                        [typeName]: 'Test',
                        a: [{[typeName]: 'Data', b: 'new'}]
                    },
                    incremental: {a: [{[typeName]: 'Data', b: 'new'}]},
                    replace: {
                        [typeName]: 'Test',
                        a: [{[typeName]: 'Data', b: 'new'}]
                    }
                }
            ],
            [
                [
                    {[typeName]: 'Test', a: [{b: ''}]},
                    {[typeName]: 'Test', a: [{b: 'old'}]}
                ],
                {entities: {
                    Data: {b: {}},
                    Test: {a: {type: 'Data[]'}}
                }},
                {
                    fillUp: {
                        [typeName]: 'Test',
                        a: [{[typeName]: 'Data'}]
                    },
                    incremental: {a: [{[typeName]: 'Data'}]},
                    replace: {
                        [typeName]: 'Test',
                        a: [{[typeName]: 'Data'}]
                    }
                }
            ],
            [
                [
                    {[typeName]: 'Test', a: {b: [{c: ''}]}},
                    {[typeName]: 'Test', a: {b: [{c: 'old'}]}}
                ],
                {entities: {
                    Item: {c: {}},
                    Data: {b: {type: 'Item[]'}},
                    Test: {a: {type: 'Data'}}
                }},
                {
                    fillUp: {
                        [typeName]: 'Test',
                        a: {
                            [typeName]: 'Data',
                            b: [{[typeName]: 'Item'}]
                        }
                    },
                    incremental: {
                        a: {
                            [typeName]: 'Data',
                            b: [{[typeName]: 'Item'}]
                        }
                    },
                    replace: {
                        [typeName]: 'Test',
                        a: {
                            [typeName]: 'Data',
                            b: [{[typeName]: 'Item'}]
                        }
                    }
                }
            ],
            // Delete array
            [
                [{[typeName]: 'Test', a: null}],
                {entities: {Test: {a: {type: 'Test[]'}}}},
                {
                    fillUp: {[typeName]: 'Test'},
                    incremental: {[typeName]: 'Test'},
                    replace: {[typeName]: 'Test'}
                }
            ],
            [
                [{[typeName]: 'Test', a: undefined}],
                {
                    entities: {
                        Test: {a: {type: 'string[]', default: ['a']}}
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: ['a']},
                    incremental: {[typeName]: 'Test', a: ['a']},
                    replace: {[typeName]: 'Test', a: ['a']}
                }
            ],
            [
                [
                    {[typeName]: 'Test', a: null, b: 2},
                    {[typeName]: 'Test', a: []}
                ],
                {
                    entities: {
                        Test: {
                            a: {type: 'string[]', default: ['a']},
                            b: {type: 'number'}
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', b: 2},
                    incremental: {a: null, b: 2},
                    replace: {[typeName]: 'Test', b: 2}
                }
            ],
            [
                [
                    {[typeName]: 'Test', a: null, b: 2},
                    {[typeName]: 'Test'}
                ],
                {
                    entities: {
                        Test: {
                            a: {type: 'string[]', default: ['a']},
                            b: {type: 'number'}
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', b: 2},
                    incremental: {b: 2},
                    replace: {[typeName]: 'Test', b: 2}
                }
            ],
            [
                [
                    {[typeName]: 'Test', a: null, b: 2},
                    {[typeName]: 'Test', a: []}
                ],
                {
                    entities: {
                        Test: {
                            a: {type: 'string[]', default: ['a']},
                            b: {type: 'number'}
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', b: 2},
                    incremental: {a: null, b: 2},
                    replace: {[typeName]: 'Test', b: 2}
                }
            ],
            [
                [{[typeName]: 'Test', b: 2}, {[typeName]: 'Test'}],
                {
                    entities: {
                        Test: {
                            a: {type: 'string[]', default: ['a']},
                            b: {type: 'number'}
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', b: 2},
                    incremental: {b: 2},
                    replace: {[typeName]: 'Test', b: 2}
                }
            ],
            // endregion
            // region nested property
            /// region property type
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
                    replace: {
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
                    replace: {[typeName]: 'Test', b: 'b'}
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
                    replace: {
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
                    replace: {
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
                    replace: {
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
                    replace: {[typeName]: 'Test', a: {[typeName]: 'Test', b: 2}}
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
                    replace: {
                        [typeName]: 'Test',
                        a: {[typeName]: 'Test', b: 'b'}
                    }
                }
            ],
            /// endregion
            /// region property existence
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
                    replace: {
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
                    replace: {
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
                {
                    entities: {
                        Test: {
                            a: {type: 'Test'}, b: {nullable: false}
                        }
                    }
                },
                {
                    fillUp: {
                        [typeName]: 'Test',
                        a: {[typeName]: 'Test', b: '2'},
                        b: 'b'
                    },
                    incremental: {b: 'b'},
                    replace: {
                        [typeName]: 'Test',
                        a: {[typeName]: 'Test', b: '2'},
                        b: 'b'
                    }
                }
            ],
            /// endregion
            /// region property readonly
            [
                [
                    {
                        [typeName]: 'Test',
                        a: {[typeName]: 'Test', b: 'b'},
                        c: 'c'
                    },
                    {[typeName]: 'Test', a: {[typeName]: 'Test', b: 'b'}}
                ],
                {
                    entities: {
                        Test: {
                            a: {type: 'Test'},
                            b: {writable: false},
                            c: {}
                        }
                    }
                },
                {
                    fillUp: {
                        [typeName]: 'Test',
                        a: {[typeName]: 'Test', b: 'b'},
                        c: 'c'
                    },
                    incremental: {c: 'c'},
                    replace: {
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
                {
                    entities: {
                        Test: {
                            a: {type: 'Test', writable: false}, b: {}
                        }
                    }
                },
                {
                    fillUp: {
                        [typeName]: 'Test',
                        a: {[typeName]: 'Test', b: 'a'},
                        b: 'b'
                    },
                    incremental: {b: 'b'},
                    replace: {
                        [typeName]: 'Test',
                        a: {[typeName]: 'Test', b: 'a'},
                        b: 'b'
                    }
                }
            ],
            /// endregion
            /// region property range
            [
                [
                    {
                        [typeName]: 'Test',
                        a: 4,
                        b: {[typeName]: 'Test', a: 3}
                    },
                    {[typeName]: 'Test'}
                ],
                {
                    entities: {
                        Test: {
                            a: {type: 'integer', minimum: 3},
                            b: {type: 'Test'}
                        }
                    }
                },
                {
                    fillUp: {
                        [typeName]: 'Test',
                        a: 4,
                        b: {[typeName]: 'Test', a: 3}
                    },
                    incremental: {a: 4, b: {[typeName]: 'Test', a: 3}},
                    replace: {
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
                {
                    entities: {
                        Test: {
                            a: {maximumLength: 1}, b: {type: 'Test'}
                        }
                    }
                },
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
                    replace: {
                        [typeName]: 'Test',
                        a: '1',
                        b: {[typeName]: 'Test', a: '1'}
                    }
                }
            ],
            /// endregion
            /// region property pattern
            [
                [{[typeName]: 'Test', b: {[typeName]: 'Test', a: 'a'}}],
                {entities: {Test: {a: {pattern: 'a'}, b: {type: 'Test'}}}},
                {
                    fillUp: {
                        [typeName]: 'Test', b: {
                            [typeName]: 'Test', a: 'a'
                        }
                    },
                    incremental: {
                        [typeName]: 'Test', b: {
                            [typeName]: 'Test', a: 'a'
                        }
                    },
                    replace: {
                        [typeName]: 'Test',
                        b: {[typeName]: 'Test', a: 'a'}
                    }
                }
            ],
            [
                [{[typeName]: 'Test', b: {[typeName]: 'Test', a: 'a'}}],
                {
                    entities: {
                        Test: {
                            a: {pattern: ['b', 'a']}, b: {type: 'Test'}
                        }
                    }
                },
                {
                    fillUp: {
                        [typeName]: 'Test', b: {
                            [typeName]: 'Test', a: 'a'
                        }
                    },
                    incremental: {
                        [typeName]: 'Test', b: {
                            [typeName]: 'Test', a: 'a'
                        }
                    },
                    replace: {
                        [typeName]: 'Test',
                        b: {[typeName]: 'Test', a: 'a'}
                    }
                }
            ],
            [
                [{[typeName]: 'Test', b: {[typeName]: 'Test', a: 'a'}}],
                {
                    entities: {
                        Test: {
                            a: {invertedPattern: 'b'}, b: {type: 'Test'}
                        }
                    }
                },
                {
                    fillUp: {
                        [typeName]: 'Test', b: {
                            [typeName]: 'Test', a: 'a'
                        }
                    },
                    incremental: {
                        [typeName]: 'Test', b: {
                            [typeName]: 'Test', a: 'a'
                        }
                    },
                    replace: {
                        [typeName]: 'Test',
                        b: {[typeName]: 'Test', a: 'a'}
                    }
                }
            ],
            [
                [{[typeName]: 'Test', b: {[typeName]: 'Test', a: 'a'}}],
                {
                    entities: {
                        Test: {
                            a: {invertedPattern: ['b', 'c']}, b: {type: 'Test'}
                        }
                    }
                },
                {
                    fillUp: {
                        [typeName]: 'Test', b: {
                            [typeName]: 'Test', a: 'a'
                        }
                    },
                    incremental: {
                        [typeName]: 'Test', b: {
                            [typeName]: 'Test', a: 'a'
                        }
                    },
                    replace: {
                        [typeName]: 'Test',
                        b: {[typeName]: 'Test', a: 'a'}
                    }
                }
            ],
            /// endregion
            /// region property constraint
            [
                [{
                    [typeName]: 'Test',
                    a: 'b',
                    b: {[typeName]: 'Test', a: 'b'}
                }],
                {
                    entities: {
                        Test: {
                            a: {
                                constraintExpression: {
                                    evaluation: 'newValue === "b"'
                                }
                            },
                            b: {type: 'Test'}
                        }
                    }
                },
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
                    replace: {
                        [typeName]: 'Test',
                        a: 'b',
                        b: {[typeName]: 'Test', a: 'b'}
                    }
                }
            ],
            /// endregion
            // endregion
            [
                [{[typeName]: 'Test1', a: '2'}],
                {
                    entities: {
                        Test1: {a: {type: 'foreignKey:Test2'}},
                        Test2: {[idName]: {type: 'string'}}
                    }
                },
                {
                    fillUp: {[typeName]: 'Test1', a: '2'},
                    incremental: {[typeName]: 'Test1', a: '2'},
                    replace: {[typeName]: 'Test1', a: '2'}
                }
            ],
            [
                [{[typeName]: 'Test', a: 2}, {[typeName]: 'Test'}],
                {entities: {Test: {a: {type: 2}}}},
                {
                    fillUp: {[typeName]: 'Test', a: 2},
                    incremental: {a: 2},
                    replace: {[typeName]: 'Test', a: 2}
                }
            ],
            [
                [{[typeName]: 'Test', a: 2}, {[typeName]: 'Test'}],
                {entities: {Test: {a: {type: [2, 'boolean']}}}},
                {
                    fillUp: {[typeName]: 'Test', a: 2},
                    incremental: {a: 2},
                    replace: {[typeName]: 'Test', a: 2}
                }
            ],
            [
                [{[typeName]: 'Test', a: false}, {[typeName]: 'Test'}],
                {entities: {Test: {a: {type: [2, 'boolean']}}}},
                {
                    fillUp: {[typeName]: 'Test', a: false},
                    incremental: {a: false},
                    replace: {[typeName]: 'Test', a: false}
                }
            ]
        ]))(
            '%#. allowed property type validateDocumentUpdate ' +
            `(with update strategy "${updateStrategy}")`,
            allowedTester
        )
        /// endregion
        /// region property range
        test.each(adaptTests([
            [
                [{[typeName]: 'Test'}],
                {entities: {Test: {a: {type: 'number', default: 2}}}},
                {
                    fillUp: {[typeName]: 'Test', a: 2},
                    incremental: {[typeName]: 'Test', a: 2},
                    replace: {[typeName]: 'Test', a: 2}
                }
            ],
            [
                [{[typeName]: 'Test', a: 3}, {[typeName]: 'Test'}],
                {entities: {Test: {a: {type: 'number', minimum: 3}}}},
                {
                    fillUp: {[typeName]: 'Test', a: 3},
                    incremental: {a: 3},
                    replace: {[typeName]: 'Test', a: 3}
                }
            ],
            [
                [{[typeName]: 'Test', a: 1}, {[typeName]: 'Test'}],
                {entities: {Test: {a: {type: 'number', maximum: 1}}}},
                {
                    fillUp: {[typeName]: 'Test', a: 1},
                    incremental: {a: 1},
                    replace: {[typeName]: 'Test', a: 1}
                }
            ],
            [
                [{[typeName]: 'Test', a: '123'}, {[typeName]: 'Test'}],
                {entities: {Test: {a: {minimumLength: 3}}}},
                {
                    fillUp: {[typeName]: 'Test', a: '123'},
                    incremental: {a: '123'},
                    replace: {[typeName]: 'Test', a: '123'}
                }
            ],
            [
                [{[typeName]: 'Test', a: '1'}],
                {entities: {Test: {a: {maximumLength: 1}}}},
                {
                    fillUp: {[typeName]: 'Test', a: '1'},
                    incremental: {[typeName]: 'Test', a: '1'},
                    replace: {[typeName]: 'Test', a: '1'}
                }
            ]
        ]))(
            '%#. allowed property range validateDocumentUpdate ' +
            `(with update strategy "${updateStrategy}")`,
            allowedTester
        )
        /// endregion
        /// region selection
        test.each(adaptTests([
            [
                [{[typeName]: 'Test', a: 2}],
                {entities: {Test: {a: {selection: [2], type: 'number'}}}},
                {
                    fillUp: {[typeName]: 'Test', a: 2},
                    incremental: {[typeName]: 'Test', a: 2},
                    replace: {[typeName]: 'Test', a: 2}
                }
            ],
            [
                [{[typeName]: 'Test', a: 2}],
                {
                    entities: {
                        Test: {
                            a: {
                                selection: [1, 2], type: 'number'
                            }
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: 2},
                    incremental: {[typeName]: 'Test', a: 2},
                    replace: {[typeName]: 'Test', a: 2}
                }
            ],
            [
                [{[typeName]: 'Test', a: '2'}],
                {
                    entities: {
                        Test: {
                            a: {
                                selection: {'1': 'a', '2': 'b'}, type: 'string'
                            }
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: '2'},
                    incremental: {[typeName]: 'Test', a: '2'},
                    replace: {[typeName]: 'Test', a: '2'}
                }
            ],
            [
                [{[typeName]: 'Test', a: 2}],
                {
                    entities: {
                        Test: {
                            a: {
                                selection: [
                                    {label: 'a', value: 1}, {
                                        label: 'b',
                                        value: 2
                                    }
                                ],
                                type: 'number'
                            }
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: 2},
                    incremental: {[typeName]: 'Test', a: 2},
                    replace: {[typeName]: 'Test', a: 2}
                }
            ]
        ]))(
            '%#. allowed selection validateDocumentUpdate ' +
            `(with update strategy "${updateStrategy}")`,
            allowedTester
        )
        /// endregion
        /// region property pattern
        test.each(adaptTests([
            [
                [{[typeName]: 'Test', a: 'a'}],
                {entities: {Test: {a: {pattern: 'a'}}}},
                {
                    fillUp: {[typeName]: 'Test', a: 'a'},
                    incremental: {[typeName]: 'Test', a: 'a'},
                    replace: {[typeName]: 'Test', a: 'a'}
                }
            ],
            [
                [{[typeName]: 'Test', a: 'a'}],
                {entities: {Test: {a: {pattern: ['b', 'a']}}}},
                {
                    fillUp: {[typeName]: 'Test', a: 'a'},
                    incremental: {[typeName]: 'Test', a: 'a'},
                    replace: {[typeName]: 'Test', a: 'a'}
                }
            ],
            [
                [{[typeName]: 'Test', a: 'a'}],
                {entities: {Test: {a: {invertedPattern: 'b'}}}},
                {
                    fillUp: {[typeName]: 'Test', a: 'a'},
                    incremental: {[typeName]: 'Test', a: 'a'},
                    replace: {[typeName]: 'Test', a: 'a'}
                }
            ],
            [
                [{[typeName]: 'Test', a: 'a'}],
                {entities: {Test: {a: {invertedPattern: ['b', 'c']}}}},
                {
                    fillUp: {[typeName]: 'Test', a: 'a'},
                    incremental: {[typeName]: 'Test', a: 'a'},
                    replace: {[typeName]: 'Test', a: 'a'}
                }
            ]
        ]))(
            '%#. allowed property pattern validateDocumentUpdate ' +
            `(with update strategy "${updateStrategy}")`,
            allowedTester
        )
        /// endregion
        /// region property constraint
        test.each(adaptTests([
            [
                [{[typeName]: 'Test', a: 'b'}],
                {
                    entities: {
                        Test: {
                            a: {
                                constraintExpression: {
                                    evaluation: 'true'
                                }
                            }
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: 'b'},
                    incremental: {[typeName]: 'Test', a: 'b'},
                    replace: {[typeName]: 'Test', a: 'b'}
                }
            ],
            [
                [{[typeName]: 'Test', a: 'a'}],
                {
                    entities: {
                        Test: {
                            a: {
                                constraintExpression: {
                                    evaluation: 'newValue === "a"'
                                }
                            }
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: 'a'},
                    incremental: {[typeName]: 'Test', a: 'a'},
                    replace: {[typeName]: 'Test', a: 'a'}
                }
            ],
            [
                [{[typeName]: 'Test', a: 'a'}],
                {
                    entities: {
                        Test: {
                            a: {
                                constraintExecution: {
                                    evaluation: 'return newValue === "a"'
                                }
                            }
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: 'a'},
                    incremental: {[typeName]: 'Test', a: 'a'},
                    replace: {[typeName]: 'Test', a: 'a'}
                }
            ],
            [
                [{[typeName]: 'Test', a: 'a'}],
                {
                    entities: {
                        Test: {
                            a: {
                                constraintExecution: {
                                    evaluation: 'return newValue === "a"'
                                },
                                description:
                                    '`Value have to be "a" not "${newValue}".`'
                            }
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: 'a'},
                    incremental: {[typeName]: 'Test', a: 'a'},
                    replace: {[typeName]: 'Test', a: 'a'}
                }
            ]
        ]))(
            '%#. allowed property constraint validateDocumentUpdate ' +
            `(with update strategy "${updateStrategy}")`,
            allowedTester
        )
        /// endregion
        /// region constraint
        test.each(adaptTests([
            [
                [{[typeName]: 'Test', a: 'a', b: 'b'}],
                {
                    entities: {
                        Test: {
                            _constraintExpressions: [{evaluation: 'true'}],
                            a: {},
                            b: {}
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: 'a', b: 'b'},
                    incremental: {[typeName]: 'Test', a: 'a', b: 'b'},
                    replace: {[typeName]: 'Test', a: 'a', b: 'b'}
                }
            ],
            [
                [{[typeName]: 'Test', a: 'a', b: 'b'}],
                {
                    entities: {
                        Test: {
                            _constraintExecutions: [{
                                description:
                                    '`Always valid: "${newDocument.a}".`',
                                evaluation: 'return true'
                            }],
                            a: {},
                            b: {}
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: 'a', b: 'b'},
                    incremental: {[typeName]: 'Test', a: 'a', b: 'b'},
                    replace: {[typeName]: 'Test', a: 'a', b: 'b'}
                }
            ],
            [
                [{[typeName]: 'Test', a: 'a', b: 'a'}],
                {
                    entities: {
                        Test: {
                            _constraintExpressions: [{
                                evaluation: 'newDocument.a === newDocument.b'
                            }],
                            a: {},
                            b: {}
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test', a: 'a', b: 'a'},
                    incremental: {[typeName]: 'Test', a: 'a', b: 'a'},
                    replace: {[typeName]: 'Test', a: 'a', b: 'a'}
                }
            ]
        ]))(
            '%#. allowed constraint validateDocumentUpdate ' +
            `(with update strategy "${updateStrategy}")`,
            allowedTester
        )
        /// endregion
        /// region attachment
        test.each(adaptTests([
            [
                [{[typeName]: 'Test'}],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                data: {
                                    minimumNumber: 1
                                }
                            }
                        }
                    }
                },
                {
                    fillUp: {[typeName]: 'Test'},
                    incremental: {[typeName]: 'Test'},
                    replace: {[typeName]: 'Test'}
                }
            ],
            [
                [{
                    [typeName]: 'Test',
                    [attachmentName]: {
                        test: {
                            /* eslint-disable camelcase */
                            content_type: 'text/plain',
                            /* eslint-enable camelcase */
                            data: ''
                        }
                    }
                }],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                test: {
                                    maximumNumber: 1
                                }
                            }
                        }
                    }
                },
                {
                    fillUp: {
                        [typeName]: 'Test', [attachmentName]: {
                            test: {
                                /* eslint-disable camelcase */
                                content_type: 'text/plain',
                                /* eslint-enable camelcase */
                                data: ''
                            }
                        }
                    },
                    incremental: {
                        [typeName]: 'Test', [attachmentName]: {
                            test: {
                                /* eslint-disable camelcase */
                                content_type: 'text/plain',
                                /* eslint-enable camelcase */
                                data: ''
                            }
                        }
                    },
                    replace: {
                        [typeName]: 'Test', [attachmentName]: {
                            test: {
                                /* eslint-disable camelcase */
                                content_type: 'text/plain',
                                /* eslint-enable camelcase */
                                data: ''
                            }
                        }
                    }
                }
            ],
            [
                [{
                    [typeName]: 'Test',
                    [attachmentName]: {
                        'favicon.png': {
                            /* eslint-disable camelcase */
                            content_type: 'image/png',
                            /* eslint-enable camelcase */
                            data: 'abc'
                        }
                    }
                }],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                data: {
                                    contentTypePattern:
                                        'image/(?:p?jpe?g|png|svg)',
                                    fileName:
                                        {pattern: '.+\\.(?:jpe?g|png|svg)'},
                                    maximumNumber: 1,
                                    nullable: false
                                }
                            }
                        }
                    }
                },
                {
                    fillUp: {
                        [typeName]: 'Test', [attachmentName]: {
                            'favicon.png': {
                                /* eslint-disable camelcase */
                                content_type: 'image/png',
                                /* eslint-enable camelcase */
                                data: 'abc'
                            }
                        }
                    },
                    incremental: {
                        [typeName]: 'Test', [attachmentName]: {
                            'favicon.png': {
                                /* eslint-disable camelcase */
                                content_type: 'image/png',
                                /* eslint-enable camelcase */
                                data: 'abc'
                            }
                        }
                    },
                    replace: {
                        [typeName]: 'Test', [attachmentName]: {
                            'favicon.png': {
                                /* eslint-disable camelcase */
                                content_type: 'image/png',
                                /* eslint-enable camelcase */
                                data: 'abc'
                            }
                        }
                    }
                }
            ],
            [
                [{
                    [typeName]: 'Test',
                    [attachmentName]: {
                        'favicon.png': {
                            /* eslint-disable camelcase */
                            content_type: 'image/png',
                            /* eslint-enable camelcase */
                            data: 'abc'
                        }
                    }
                }],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                data: {
                                    contentTypePattern: [
                                        'image/(?:p?jpe?g)', 'image/(?:png|svg)'
                                    ],
                                    fileName: {
                                        pattern: [
                                            '.+\\.(?:jpe?g|svg)',
                                            '.+\\.(?:jpe?g|png)'
                                        ]
                                    },
                                    maximumNumber: 1,
                                    nullable: false
                                }
                            }
                        }
                    }
                },
                {
                    fillUp: {
                        [typeName]: 'Test', [attachmentName]: {
                            'favicon.png': {
                                /* eslint-disable camelcase */
                                content_type: 'image/png',
                                /* eslint-enable camelcase */
                                data: 'abc'
                            }
                        }
                    },
                    incremental: {
                        [typeName]: 'Test', [attachmentName]: {
                            'favicon.png': {
                                /* eslint-disable camelcase */
                                content_type: 'image/png',
                                /* eslint-enable camelcase */
                                data: 'abc'
                            }
                        }
                    },
                    replace: {
                        [typeName]: 'Test', [attachmentName]: {
                            'favicon.png': {
                                /* eslint-disable camelcase */
                                content_type: 'image/png',
                                /* eslint-enable camelcase */
                                data: 'abc'
                            }
                        }
                    }
                }
            ],
            [
                [{
                    [typeName]: 'Test',
                    [attachmentName]: {
                        test: {
                            /* eslint-disable camelcase */
                            content_type: 'text/plain',
                            /* eslint-enable camelcase */
                            data: ''
                        }
                    }
                }],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                test: {
                                    nullable: false
                                }
                            }
                        }
                    }
                },
                {
                    fillUp: {
                        [typeName]: 'Test', [attachmentName]: {
                            test: {
                                /* eslint-disable camelcase */
                                content_type: 'text/plain',
                                /* eslint-enable camelcase */
                                data: ''
                            }
                        }
                    },
                    incremental: {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            test: {
                                /* eslint-disable camelcase */
                                content_type: 'text/plain',
                                /* eslint-enable camelcase */
                                data: ''
                            }
                        }
                    },
                    replace: {
                        [typeName]: 'Test', [attachmentName]: {
                            test: {
                                /* eslint-disable camelcase */
                                content_type: 'text/plain',
                                /* eslint-enable camelcase */
                                data: ''
                            }
                        }
                    }
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
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                data: {
                                    fileName: {pattern: /[ab]/},
                                    maximumNumber: 2,
                                    minimumNumber: 2
                                }
                            }
                        }
                    }
                },
                {
                    fillUp: {
                        [typeName]: 'Test', [attachmentName]: {
                            /* eslint-disable camelcase */
                            a: {content_type: 'text/plain', data: ''},
                            b: {content_type: 'text/plain', data: ''}
                            /* eslint-enable camelcase */
                        }
                    },
                    incremental: {
                        [typeName]: 'Test', [attachmentName]: {
                            /* eslint-disable camelcase */
                            a: {content_type: 'text/plain', data: ''},
                            b: {content_type: 'text/plain', data: ''}
                            /* eslint-enable camelcase */
                        }
                    },
                    replace: {
                        [typeName]: 'Test', [attachmentName]: {
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
                        a: {content_type: 'text/plain', data: ''},
                        b: {content_type: 'text/plain', data: ''}
                        /* eslint-enable camelcase */
                    }
                }],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                data: {
                                    fileName: {pattern: [/[cd]/, /[ab]/]},
                                    maximumNumber: 2,
                                    minimumNumber: 2
                                }
                            }
                        }
                    }
                },
                {
                    fillUp: {
                        [typeName]: 'Test', [attachmentName]: {
                            /* eslint-disable camelcase */
                            a: {content_type: 'text/plain', data: ''},
                            b: {content_type: 'text/plain', data: ''}
                            /* eslint-enable camelcase */
                        }
                    },
                    incremental: {
                        [typeName]: 'Test', [attachmentName]: {
                            /* eslint-disable camelcase */
                            a: {content_type: 'text/plain', data: ''},
                            b: {content_type: 'text/plain', data: ''}
                            /* eslint-enable camelcase */
                        }
                    },
                    replace: {
                        [typeName]: 'Test', [attachmentName]: {
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
                        a: {content_type: 'text/plain', data: ''},
                        b: {content_type: 'text/plain', data: ''}
                        /* eslint-enable camelcase */
                    }
                }],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                data: {
                                    fileName: {pattern: 'a|b'},
                                    maximumNumber: 2
                                }
                            }
                        }
                    }
                },
                {
                    fillUp: {
                        [typeName]: 'Test', [attachmentName]: {
                            /* eslint-disable camelcase */
                            a: {content_type: 'text/plain', data: ''},
                            b: {content_type: 'text/plain', data: ''}
                            /* eslint-enable camelcase */
                        }
                    },
                    incremental: {
                        [typeName]: 'Test', [attachmentName]: {
                            /* eslint-disable camelcase */
                            a: {content_type: 'text/plain', data: ''},
                            b: {content_type: 'text/plain', data: ''}
                            /* eslint-enable camelcase */
                        }
                    },
                    replace: {
                        [typeName]: 'Test', [attachmentName]: {
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
                        a: {content_type: 'text/plain', data: ''},
                        b: {content_type: 'text/plain', data: ''}
                        /* eslint-enable camelcase */
                    }
                }],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                data: {
                                    fileName: {
                                        invertedPattern: ['c|d'],
                                        pattern: /.*/
                                    },
                                    maximumNumber: 2
                                }
                            }
                        }
                    }
                },
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
                    replace: {
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
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                data: {
                                    contentTypePattern: /image\/.+/,
                                    fileName: {pattern: 'a|b'}
                                }
                            }
                        }
                    }
                },
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
                    replace: {
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
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                data: {
                                    fileName: {pattern: '.*'}
                                }
                            }
                        }
                    }
                },
                {
                    fillUp: {
                        [typeName]: 'Test', [attachmentName]: {
                            /* eslint-disable camelcase */
                            a: {content_type: 'image/png', data: ''},
                            b: {content_type: 'image/jpeg', data: ''}
                            /* eslint-enable camelcase */
                        }
                    },
                    incremental: {
                        [attachmentName]: {
                            /* eslint-disable camelcase */
                            a: {content_type: 'image/png', data: ''}
                            /* eslint-enable camelcase */
                        }
                    },
                    replace: {
                        [typeName]: 'Test', [attachmentName]: {
                            /* eslint-disable camelcase */
                            a: {content_type: 'image/png', data: ''}
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
                            a: {data: null} as unknown as Attachment
                        },
                        b: 'b'
                    },
                    {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            a: {
                                /* eslint-disable camelcase */
                                content_type: 'image/jpeg',
                                /* eslint-enable camelcase */
                                data: ''
                            }
                        }
                    }
                ],
                {entities: {Test: {[attachmentName]: {a: {}}, b: {}}}},
                {
                    fillUp: {[typeName]: 'Test', b: 'b'},
                    incremental: {b: 'b'},
                    replace: {[typeName]: 'Test', b: 'b'}
                }
            ],
            [
                [
                    {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            a: {data: null} as unknown as Attachment
                        },
                        b: 'b'
                    },
                    {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            a: {
                                /* eslint-disable camelcase */
                                content_type: 'image/jpeg',
                                /* eslint-enable camelcase */
                                data: ''
                            }
                        }
                    }
                ],
                {entities: {Test: {[attachmentName]: {a: {}}, b: {}}}},
                {
                    fillUp: {[typeName]: 'Test', b: 'b'},
                    incremental: {b: 'b'},
                    replace: {[typeName]: 'Test', b: 'b'}
                }
            ],
            [
                [
                    {[typeName]: 'Test', a: 'a'},
                    {
                        [typeName]: 'Test', [attachmentName]: {
                            a: {
                                /* eslint-disable camelcase */
                                content_type: 'image/jpeg',
                                /* eslint-enable camelcase */
                                data: ''
                            }
                        }
                    }
                ],
                {entities: {Test: {[attachmentName]: {a: {}}, a: {}}}},
                {
                    fillUp: {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            a: {
                                /* eslint-disable camelcase */
                                content_type: 'image/jpeg',
                                /* eslint-enable camelcase */
                                data: ''
                            }
                        },
                        a: 'a'
                    },
                    incremental: {a: 'a'},
                    replace: {[typeName]: 'Test', a: 'a'}
                }
            ],
            [
                [
                    {[typeName]: 'Test', a: 'a'},
                    {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            a: {
                                /* eslint-disable camelcase */
                                content_type: 'image/jpeg',
                                /* eslint-enable camelcase */
                                data: ''
                            }
                        }
                    }
                ],
                {entities: {Test: {[attachmentName]: {a: {}}, a: {}}}},
                {
                    fillUp: {
                        [typeName]: 'Test', [attachmentName]: {
                            a: {
                                /* eslint-disable camelcase */
                                content_type: 'image/jpeg',
                                /* eslint-enable camelcase */
                                data: ''
                            }
                        },
                        a: 'a'
                    },
                    incremental: {a: 'a'},
                    replace: {[typeName]: 'Test', a: 'a'}
                }
            ],
            [
                [
                    {[typeName]: 'Test', a: 'a'},
                    {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            a: {
                                /* eslint-disable camelcase */
                                content_type: 'image/jpeg',
                                /* eslint-enable camelcase */
                                data: ''
                            }
                        }
                    }
                ],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                a: {
                                    minimumNumber: 0, nullable: false
                                }
                            },
                            a: {}
                        }
                    }
                },
                {
                    fillUp: {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            a: {
                                /* eslint-disable camelcase */
                                content_type: 'image/jpeg',
                                /* eslint-enable camelcase */
                                data: ''
                            }
                        },
                        a: 'a'
                    },
                    incremental: {a: 'a'},
                    replace: {[typeName]: 'Test', a: 'a'}
                }
            ],
            [
                [{
                    [typeName]: 'Test',
                    [attachmentName]: {
                        a: {data: 'a', length: 1} as unknown as Attachment
                    }
                }],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                a: {
                                    minimumSize: 1
                                }
                            }
                        }
                    }
                },
                {
                    fillUp: {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            a: {data: 'a', length: 1} as unknown as Attachment
                        }
                    },
                    incremental: {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            a: {data: 'a', length: 1} as unknown as Attachment
                        }
                    },
                    replace: {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            a: {data: 'a', length: 1} as unknown as Attachment
                        }
                    }
                }
            ],
            [
                [{
                    [typeName]: 'Test',
                    [attachmentName]: {
                        a: {data: 'abc', length: 3} as unknown as Attachment
                    }
                }],
                {
                    entities: {
                        Test: {
                            [attachmentName]: {
                                a: {
                                    maximumSize: 3, minimumSize: 2
                                }
                            }
                        }
                    }
                },
                {
                    fillUp: {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            a: {data: 'abc', length: 3} as
                                unknown as
                                Attachment
                        }
                    },
                    incremental: {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            a: {data: 'abc', length: 3} as
                                unknown as
                                Attachment
                        }
                    },
                    replace: {
                        [typeName]: 'Test',
                        [attachmentName]: {
                            a: {data: 'abc', length: 3} as
                                unknown as
                                Attachment
                        }
                    }
                }
            ]
        ]))(
            '%#. allowed attachment validateDocumentUpdate ' +
            `(with update strategy "${updateStrategy}")`,
            allowedTester
        )
        /// endregion
        // endregion
    }
    /// region migration writes
    test.each([
        // Remove obsolete properties.
        [
            {[typeName]: 'Test'},
            {[typeName]: 'Test', a: 2},
            {entities: {Test: {}}}
        ],
        // Create missing properties with default value.
        [
            {[typeName]: 'Test', a: '2'},
            {[typeName]: 'Test'},
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
            {[typeName]: 'Test', a: '2'},
            {[typeName]: 'Test', a: null},
            {entities: {Test: {a: {default: '2'}}}}
        ],
        /*
            Set property to default value if explicitly set to "null" by
            ignoring maybe existing old documents value.
        */
        [
            {[typeName]: 'Test', a: '2'},
            {[typeName]: 'Test', a: null},
            {entities: {Test: {a: {default: '2'}}}},
            {[typeName]: 'Test', a: '1'}
        ],
        /*
            Set property to default value if property is missing which has a
            specified default (string) value.
        */
        [
            {[typeName]: 'Test', a: '2'},
            {[typeName]: 'Test'},
            {entities: {Test: {a: {default: '2'}}}},
            {[typeName]: 'Test', a: '1'}
        ],
        /*
            Set property to default value if property is missing which has a
            specified default value and remove not existing properties.
        */
        [
            {[typeName]: 'Test', a: '2'},
            {[typeName]: 'Test', b: '3'},
            {entities: {Test: {a: {default: '2'}}}},
            {[typeName]: 'Test', a: '1'}
        ],
        /*
            Set property to default value if property is missing which has a
            specified default (number) value.
        */
        [
            {[typeName]: 'Test', a: 2},
            {[typeName]: 'Test'},
            {entities: {Test: {a: {default: 2, type: 'number'}}}}
        ],
        /*
            Set property to default value if property is missing which has a
            specified default (any) value.
        */
        [
            {[typeName]: 'Test', a: 2},
            {[typeName]: 'Test'},
            {entities: {Test: {a: {default: 2, type: 'any'}}}}
        ],
        /*
            Set property to default value if property is missing which has a
            specified default value (where on is any).
        */
        [
            {[typeName]: 'Test', a: 2},
            {[typeName]: 'Test'},
            {entities: {Test: {a: {default: 2, type: ['any']}}}}
        ],
        /*
            Set property to default value if property is missing which has a
            specified default value (where a selection of types is provided).
        */
        [
            {[typeName]: 'Test', a: 2},
            {[typeName]: 'Test'},
            {entities: {Test: {a: {default: 2, type: ['any', 'boolean']}}}}
        ],
        [
            {[typeName]: 'Test', a: 2},
            {[typeName]: 'Test'},
            {entities: {Test: {a: {default: 2, type: ['number', 'boolean']}}}}
        ],
        // Migrate model type if old one is provided.
        [
            {[typeName]: 'Test'},
            {[typeName]: 'OldTest'},
            {entities: {Test: {[specialNames.oldType]: 'OldTest'}}}
        ],
        // Migrate nested property model type if old one is provided.
        [
            {[typeName]: 'Test', a: {[typeName]: 'Test', b: 'b'}},
            {[typeName]: 'Test', a: {[typeName]: 'OldTest', b: 'b'}},
            {entities: {Test: {
                a: {type: 'Test'},
                [specialNames.oldType]: 'OldTest',
                b: {}
            }}}
        ],
        // Migrate nested array model type if old one is provided.
        [
            {[typeName]: 'Test', a: [{[typeName]: 'Test', b: 'b'}]},
            {[typeName]: 'Test', a: [{[typeName]: 'OldTest', b: 'b'}]},
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
                    a: [{[typeName]: 'Test', b: 'b'}]
                }]
            },
            {
                [typeName]: 'Test',
                a: [{
                    [typeName]: 'Test',
                    a: [{[typeName]: 'OldTest', b: 'b'}]
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
            {[typeName]: 'Test', b: 'a'},
            {[typeName]: 'Test', a: 'a'},
            {entities: {Test: {b: {oldName: 'a'}}}}
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
                    // eslint-disable-next-line camelcase
                    test: {data: '', content_type: 'text/plain'}
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
            {entities: {Test: {[attachmentName]: {test: {default: {test: {
                // eslint-disable-next-line camelcase
                data: '', content_type: 'text/plain'
            }}}}}}},
            {
                [typeName]: 'Test',
                [attachmentName]: {test: {
                    // eslint-disable-next-line camelcase
                    data: '', content_type: 'text/plain'
                }}
            }
        ]
    ])(
        '%#. validateDocumentUpdate(%p, ...) === %p (with update strategy "' +
        'migration")',
        (
            expected: PartialFullDocument,
            newDocument: PartialFullDocument,
            modelConfiguration: PlainObject,
            oldDocument: null | PartialFullDocument = null
        ): void => {
            const defaultModelConfiguration: ModelConfiguration = {
                ...copy(configuration.couchdb.model),
                updateStrategy: 'migrate'
            }

            for (const propertyName of Object.keys(
                defaultModelConfiguration.entities._base
            ))
                if (propertyName !== typeName)
                    delete defaultModelConfiguration.entities._base[
                        propertyName as keyof BaseModel
                    ]

            const models = extendModels(extend(
                true,
                copy(defaultModelConfiguration),
                modelConfiguration as Partial<ModelConfiguration>
            ))
            const testModelConfiguration: ModelConfiguration = extend(
                true,
                copy(defaultModelConfiguration),
                modelConfiguration as Partial<ModelConfiguration>
            )

            delete (
                testModelConfiguration.property as
                    Partial<ModelConfiguration['property']>
            ).defaultSpecification
            delete (testModelConfiguration as Partial<ModelConfiguration>)
                .entities

            expect(validateDocumentUpdate(
                newDocument,
                oldDocument,
                {},
                {},
                testModelConfiguration,
                models
            )).toStrictEqual(expected)
        }
    )
    /// endregion
    // endregion
})
