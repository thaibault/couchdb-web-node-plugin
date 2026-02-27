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
import {copy, extend, timeout} from 'clientnode'
import {
    testEach, testEachPromiseAgainstSameExpectation, TEST_UNDEFINED_SYMBOL
} from 'clientnode/test-helper'

import {describe, expect, test} from '@jest/globals'

import {
    determineModelRolesMapping,
    determineGenericIndexablePropertyNames,
    ensureValidationDocumentPresence,
    applyDefaultPropertyConfigurations,
    applyModelInheritance,
    applyModelsInheritance,
    mayStripRepresentation,
    normalizeRoles
} from '../helper'
import packageConfiguration from '../package.json'
import {
    ModelRolesMapping,
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

    const mockModelConfiguration: ModelConfiguration =
        copy(configuration.couchdb.model)
    mockModelConfiguration.entities = {}
    const {defaultSpecification} = mockModelConfiguration.property
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
    testEach<typeof determineModelRolesMapping>(
        'determineModelRolesMapping',
        determineModelRolesMapping,

        ...[
            [{}, {property: {}}],
            [
                {},
                {
                    property: {name: {special: {role: 'roles'}}},
                    entities: {Test: {}}
                }
            ],
            [
                {Test: {properties: {}, read: [], write: []}},
                {
                    property: {name: {special: {role: 'roles'}}},
                    entities: {Test: {roles: []}}
                }
            ],
            [
                {Test: {properties: {}, read: ['a'], write: ['a']}},
                {
                    property: {name: {special: {role: 'roles'}}},
                    entities: {Test: {roles: ['a']}}
                }
            ],
            [
                {Test: {properties: {}, read: ['a'], write: ['a']}},
                {
                    property: {name: {special: {role: 'roles'}}},
                    entities: {Test: {roles: 'a'}}
                }
            ],
            [
                {Test: {properties: {}, read: ['a'], write: []}},
                {
                    property: {name: {special: {role: 'roles'}}},
                    entities: {Test: {roles: {read: ['a']}}}
                }
            ],
            [
                {Test: {properties: {}, read: ['a'], write: []}},
                {
                    property: {name: {special: {role: 'roles'}}},
                    entities: {Test: {roles: {read: 'a'}}}
                }
            ],
            [
                {Test: {properties: {}, read: ['a'], write: ['b']}},
                {
                    property: {name: {special: {role: 'roles'}}},
                    entities: {Test: {roles: {read: 'a', write: ['b']}}}
                }
            ]
        ].map(([expected, modelConfiguration]): [
            ModelRolesMapping, ModelConfiguration
        ] => [
            expected as ModelRolesMapping,
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
    testEach<typeof applyDefaultPropertyConfigurations>(
        'applyDefaultPropertyConfigurations',
        applyDefaultPropertyConfigurations,

        ...[
            [{}, {}, {}],
            [
                {a: {
                    emptyEqualsNull: true,
                    maximumAggregatedSize: 100000000,
                    maximumSize: 10000000,
                    minimumAggregatedSize: 0,
                    minimumLength: 0,
                    minimumNumber: 0,
                    minimumSize: 0,
                    mutable: true,
                    nullable: true,
                    trim: true,
                    type: 'string',
                    writable: true
                }},
                {a: {}},
                {}
            ]
        ].map(([expected, model, modelConfiguration]): [
            Model, Model, ModelConfiguration
        ] => [
            expected as Array<string>,
            model,
            extend(
                true,
                copy(mockModelConfiguration),
                modelConfiguration as ModelConfiguration
            ) as ModelConfiguration
        ]) as Array<[
            ReturnType<typeof applyDefaultPropertyConfigurations>,
            ...Parameters<typeof applyDefaultPropertyConfigurations>
        ]>
    )
    testEach<typeof applyModelInheritance>(
        'applyModelInheritance',
        applyModelInheritance,

        ...[
            [{}, {}, {}],
            [{}, {}, {A: {}}],
            [
                {a: {...defaultSpecification}, b: {...defaultSpecification}},
                {a: {}, [specialNames.extend]: '_baseTest'},
                {_baseTest: {b: {}}}
            ],
            [
                {a: {...defaultSpecification}, b: {...defaultSpecification}},
                {a: {}, [specialNames.extend]: 'baseTest'},
                {baseTest: {b: {}}}
            ],
            [
                {
                    a: {...defaultSpecification},
                    b: {...defaultSpecification},
                    c: {...defaultSpecification}
                },
                {c: {}, [specialNames.extend]: ['A', 'B']},
                {A: {a: {}}, B: {b: {}}}
            ],
            [
                {
                    a: {...defaultSpecification},
                    b: {...defaultSpecification},
                    c: {...defaultSpecification}
                },
                {c: {}, [specialNames.extend]: 'B'},
                {
                    A: {a: {}},
                    B: {b: {}, [specialNames.extend]: 'A'}
                }
            ],
            [
                {
                    a: {...defaultSpecification},
                    b: {...defaultSpecification},
                    c: {...defaultSpecification},
                    d: {...defaultSpecification, type: 'number'}
                },
                {c: {}, [specialNames.extend]: 'B'},
                {
                    _base: {d: {type: 'number'}},
                    A: {a: {}},
                    B: {b: {}, [specialNames.extend]: 'A'}
                }
            ],
            [
                {
                    [specialNames.type]: 'A',
                    a: {
                        ...defaultSpecification,
                        type: {
                            inPlaceProperty: {...defaultSpecification},
                            b: {...defaultSpecification},
                            c: {...defaultSpecification},
                            d: {...defaultSpecification, type: 'number'}
                        }
                    },
                    d: {...defaultSpecification, type: 'number'}
                },
                {
                    [specialNames.type]: 'A',
                    a: {type: {
                        [specialNames.extend]: 'B',
                        inPlaceProperty: {}
                    }}
                },
                {
                    _base: {d: {type: 'number'}},
                    B: {b: {}, [specialNames.extend]: 'C'},
                    C: {c: {}}
                }
            ]
        ].map(([expected, model, models]): [
            object, Model, ModelConfiguration
        ] => [
            expected,
            model,
            extend(
                true,
                copy(mockModelConfiguration),
                {entities: models as unknown as Models}
            ) as ModelConfiguration
        ]) as Array<[
            ReturnType<typeof applyModelInheritance>,
            ...Parameters<typeof applyModelInheritance>
        ]>
    )
    test('applyModelsInheritance', (): void => {
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
            expect(applyModelsInheritance(
                extend(
                    true,
                    copy(modelConfiguration),
                    parameter as Partial<ModelConfiguration>
                )
            )).toStrictEqual(expected)

        expect((): Models => applyModelsInheritance(
            extend(
                true,
                copy(modelConfiguration),
                {entities: {a: {} as Model}} as Partial<ModelConfiguration>
            )
        )).toThrow()

        expect(applyModelsInheritance(
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
    testEach<typeof normalizeRoles>(
        'normalizeAllowedRoles',
        normalizeRoles,

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
