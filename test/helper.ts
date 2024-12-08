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
    testEach,
    testEachPromiseAgainstSameExpectation,
    TEST_UNDEFINED_SYMBOL,
    timeout
} from 'clientnode'

import {
    determineAllowedModelRolesMapping,
    determineGenericIndexablePropertyNames,
    ensureValidationDocumentPresence,
    extendModel,
    extendModels,
    mayStripRepresentation,
    normalizeAllowedRoles
} from '../helper'
import packageConfiguration from '../package.json'
import {
    AllowedModelRolesMapping,
    Configuration,
    Connection,
    DatabaseResponse,
    ModelConfiguration,
    Model,
    Models,
    SpecialPropertyNames
} from '../type'
// endregion
describe('helper', (): void => {
    // region prepare environment
    const configuration: Configuration =
        packageConfiguration.webNode as unknown as Configuration
    const specialNames: SpecialPropertyNames =
        configuration.couchdb.model.property.name.special
    // endregion
    // region tests
    testEach<typeof mayStripRepresentation>(
        'mayStripRepresentation',
        mayStripRepresentation,

        ['DOCUMENT IS TOO BIG TO REPRESENT', {}, 1, 1],
        ['{}', {}, 2, 2],
        ['{}', {}, 1000, 100],
        [
            `{
                a: 2,
            ...`.replace(/ {12}/g, ''),
            {a: 2, b: 3},
            100,
            15
        ]
    )
    testEachPromiseAgainstSameExpectation<
        typeof ensureValidationDocumentPresence
    >(
        'ensureValidationDocumentPresence',
        ensureValidationDocumentPresence,
        TEST_UNDEFINED_SYMBOL,

        [
            {put: (): Promise<DatabaseResponse> =>
                new Promise<DatabaseResponse>((
                    resolve: (value: DatabaseResponse) => void
                ) => {
                    void timeout().then(() => {
                        resolve(null as unknown as DatabaseResponse)
                    })
                })
            } as unknown as Connection,
            'test',
            {data: 'data'},
            'Description',
            false
        ]
    )
    /// region model
    const mockModelConfiguration: ModelConfiguration =
        copy(configuration.couchdb.model)
    mockModelConfiguration.entities = {}

    testEach<typeof determineAllowedModelRolesMapping>(
        'determineAllowedModelRolesMapping',
        determineAllowedModelRolesMapping,

        ...[
            [{}, {property: {}}],
            [
                {Test: {properties: {}, read: [], write: []}},
                {
                    property: {name: {special: {allowedRole: 'roles'}}},
                    entities: {Test: {}}
                }
            ],
            [
                {Test: {properties: {}, read: [], write: []}},
                {
                    property: {name: {special: {allowedRole: 'roles'}}},
                    entities: {Test: {roles: []}}
                }
            ],
            [
                {Test: {properties: {}, read: ['a'], write: ['a']}},
                {
                    property: {name: {special: {allowedRole: 'roles'}}},
                    entities: {Test: {roles: ['a']}}
                }
            ],
            [
                {Test: {properties: {}, read: ['a'], write: ['a']}},
                {
                    property: {name: {special: {allowedRole: 'roles'}}},
                    entities: {Test: {roles: 'a'}}
                }
            ],
            [
                {Test: {properties: {}, read: ['a'], write: []}},
                {
                    property: {name: {special: {allowedRole: 'roles'}}},
                    entities: {Test: {roles: {read: ['a']}}}
                }
            ],
            [
                {Test: {properties: {}, read: ['a'], write: []}},
                {
                    property: {name: {special: {allowedRole: 'roles'}}},
                    entities: {Test: {roles: {read: 'a'}}}
                }
            ],
            [
                {Test: {properties: {}, read: ['a'], write: ['b']}},
                {
                    property: {name: {special: {allowedRole: 'roles'}}},
                    entities: {Test: {roles: {read: 'a', write: ['b']}}}
                }
            ]
        ].map(([expected, modelConfiguration]): [
            AllowedModelRolesMapping, ModelConfiguration
        ] => [
            expected as AllowedModelRolesMapping,
            extend(
                true,
                copy(mockModelConfiguration),
                modelConfiguration
            ) as ModelConfiguration
        ])
    )
    testEach<typeof determineGenericIndexablePropertyNames>(
        'determineGenericIndexablePropertyNames',
        determineGenericIndexablePropertyNames,

        ...[
            [[specialNames.id, specialNames.revision], {}, {}],
            [[specialNames.id, specialNames.revision, 'a'], {}, {a: {}}],
            [
                [specialNames.id, specialNames.revision, 'a', 'b'],
                {},
                {a: {}, b: {}}
            ]
        ].map(([expected, modelConfiguration, model]): [
            Array<string>, ModelConfiguration, Model
        ] => [
            expected as Array<string>,
            extend(
                true,
                copy(configuration.couchdb.model),
                modelConfiguration as Partial<ModelConfiguration>
            ),
            model as Model
        ])
    )
    testEach<typeof extendModel>(
        'extendModel',
        extendModel,

        ...[
            [{}, 'A', {A: {}}],
            [
                {a: {}, b: {}},
                'Test',
                {
                    _baseTest: {b: {}},
                    Test: {a: {}, [specialNames.extend]: '_baseTest'}
                }
            ],
            [
                {a: {}, b: {}},
                'Test',
                {
                    baseTest: {b: {}},
                    Test: {a: {}, [specialNames.extend]: 'baseTest'}
                }
            ],
            [
                {a: {}, b: {}, c: {}},
                'C',
                {
                    A: {a: {}},
                    B: {b: {}},
                    C: {c: {}, [specialNames.extend]: ['A', 'B']}
                }
            ],
            [
                {a: {}, b: {}, c: {}},
                'C',
                {
                    A: {a: {}},
                    B: {b: {}, [specialNames.extend]: 'A'},
                    C: {c: {}, [specialNames.extend]: 'B'}
                }
            ],
            [
                {a: {}, b: {}, c: {}, d: {type: 'number'}},
                'C',
                {
                    _base: {d: {type: 'number'}},
                    A: {a: {}},
                    B: {b: {}, [specialNames.extend]: 'A'},
                    C: {c: {}, [specialNames.extend]: 'B'}
                }
            ]
        ] as Array<[
            ReturnType<typeof extendModel>, ...Parameters<typeof extendModel>
        ]>
    )
    test('extendModels', (): void => {
        const modelConfiguration: ModelConfiguration =
            copy(configuration.couchdb.model)
        modelConfiguration.entities = {}
        modelConfiguration.property.defaultSpecification = {}

        for (const [expected, parameter] of [
            [{}, {}],
            [{}, {entities: {}}],
            [{Test: {}}, {entities: {Test: {}}}],
            [{Test: {}}, {entities: {Test: {}}}],
            [
                {
                    Base: {b: {}},
                    Test: {a: {}, b: {}}
                },
                {entities: {
                    Base: {b: {}},
                    Test: {a: {}, [specialNames.extend]: 'Base'}}
                }
            ],
            [
                {
                    _base: {b: {}},
                    Test: {
                        a: {},
                        b: {}
                    }
                },
                {entities: {_base: {b: {}}, Test: {a: {}}}}
            ],
            [
                {
                    _base: {},
                    Test: {a: {maximum: 3}}
                },
                {
                    property: {defaultSpecification: {maximum: 3}},
                    entities: {_base: {}, Test: {a: {}}}
                }
            ],
            [
                {Test: {[specialNames.attachment]: {}}},
                {entities: {Test: {[specialNames.attachment]: {}}}}
            ],
            [
                {Test: {[specialNames.attachment]: {a: {minimum: 1}}}},
                {
                    entities: {Test: {[specialNames.attachment]: {a: {}}}},
                    property: {defaultSpecification: {minimum: 1}}
                }
            ]
        ] as const)
            expect(extendModels(
                extend(
                    true,
                    copy(modelConfiguration),
                    parameter as Partial<ModelConfiguration>
                )
            )).toStrictEqual(expected)

        expect((): Models => extendModels(
            extend(
                true,
                copy(modelConfiguration),
                {entities: {a: {} as Model}} as Partial<ModelConfiguration>
            )
        )).toThrow()

        expect(extendModels(
            extend(
                true,
                copy(modelConfiguration),
                {
                    property: {name: {typePattern: {public: 'a'}}},
                    entities: {a: {}}
                } as unknown as Partial<ModelConfiguration>
            )
        )).toStrictEqual({a: {}})
    })
    testEach<typeof normalizeAllowedRoles>(
        'normalizeAllowedRoles',
        normalizeAllowedRoles,

        [{read: ['a'], write: ['a']}, 'a'],
        [{read: [], write: []}, []],
        [{read: ['a'], write: ['a']}, ['a']],
        [{read: ['a', 'b'], write: ['a', 'b']}, ['a', 'b']],
        [{read: ['a', 'b'], write: []}, {read: ['a', 'b']}],
        [{read: ['a'], write: []}, {read: 'a'}],
        [{read: ['a'], write: []}, {read: 'a', write: []}],
        [{read: ['a'], write: ['b']}, {read: 'a', write: ['b']}]
    )
    /// endregion
    // endregion
})
