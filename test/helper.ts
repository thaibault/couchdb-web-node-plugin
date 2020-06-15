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
    See https://creativecommons.org/licenses/by/3.0/deed.de
    endregion
*/
// region imports
import Tools from 'clientnode'

import Helper from '../helper'
import packageConfiguration from '../package.json'
import {ModelConfiguration, Models, SpecialPropertyNames} from '../type'
// endregion
describe('helper', ():void => {
    // region prepare environment
    const configuration:Configuration =
        packageConfiguration.webNode as Configuration
    const specialNames:SpecialPropertyNames =
        configuration.database.model.property.name.special
    // endregion
    // region tests
    test.each([
        [{}, 1, 1, 'DOCUMENT IS TOO BIG TO REPRESENT'],
        [{}, 2, 2, '{}'],
        [{}, 1000, 100, '{}'],
        [
            {a: 2, b: 3},
            100,
            15,
            `{
                a: 2,
            ...`.replace(/ {12}/g, '')
        ]
    ])(
        `mayStripRepresentation(%p, %d, %d) === '%s'`,
        (
            object:any,
            maximumRepresentationTryLength:number,
            maximumRepresentationLength:number,
            expected:string
        ):void =>
            expect(Helper.mayStripRepresentation(
                object, maximumRepresentationTryLength, maximumRepresentationLength
            )).toStrictEqual(expected)
    )
    test.each([
        [
            {put: ():Promise<void> =>
                new Promise((resolve:Function):Promise<boolean> =>
                    Tools.timeout(resolve))
            },
            'test',
            {data: 'data'},
            'Description',
            false
        ]
    ])(
        `ensureValidationDocumentPresence(%p, '%s', %p, '%s', %p)`,
        (
            databaseConnection:Connection,
            documentName:string,
            documentData:Mapping,
            description:string,
            log:boolean
        ):void =>
            expect(Helper.ensureValidationDocumentPresence(
                databaseConnection,
                documentName,
                documentData,
                description,
                log
            )).resolves.not.toBeDefined()
    )
    // / region model
    /* TODO
    test('determineAllowedModelRolesMapping', ():void => {
        const modelConfiguration:ModelConfiguration = Tools.copy(
            configuration.database.model
        )
        modelConfiguration.entities = {}
        for (const test:Array<any> of [
            [{}, {}],
            [{
                property: {name: {special: {allowedRole: 'roles'}}},
                entities: {Test: {}}
            }, {Test: {properties: {}, read: [], write: []}}],
            [{
                property: {name: {special: {allowedRole: 'roles'}}},
                entities: {Test: {roles: []}}
            }, {Test: {properties: {}, read: [], write: []}}],
            [{
                property: {name: {special: {allowedRole: 'roles'}}},
                entities: {Test: {roles: ['a']}}
            }, {Test: {properties: {}, read: ['a'], write: ['a']}}],
            [{
                property: {name: {special: {allowedRole: 'roles'}}},
                entities: {Test: {roles: 'a'}}
            }, {Test: {properties: {}, read: ['a'], write: ['a']}}],
            [{
                property: {name: {special: {allowedRole: 'roles'}}},
                entities: {Test: {roles: {read: ['a']}}}
            }, {Test: {properties: {}, read: ['a'], write: []}}],
            [{
                property: {name: {special: {allowedRole: 'roles'}}},
                entities: {Test: {roles: {read: 'a'}}}
            }, {Test: {properties: {}, read: ['a'], write: []}}],
            [{
                property: {name: {special: {allowedRole: 'roles'}}},
                entities: {Test: {roles: {read: 'a', write: ['b']}}}
            }, {Test: {properties: {}, read: ['a'], write: ['b']}}]
        ])
            assert.deepEqual(
                Helper.determineAllowedModelRolesMapping(
                    Tools.extend(true, {}, modelConfiguration, test[0])
                ),
                test[1]
            )
    })
    test('determineGenericIndexablePropertyNames', ():void => {
        for (const test of [
            [{}, {}, [specialNames.id, specialNames.revision]],
            [{}, {a: {}}, [specialNames.id, specialNames.revision, 'a']],
            [{}, {a: {}, b: {}}, [
                specialNames.id, specialNames.revision, 'a', 'b'
            ]]
        ])
            assert.deepEqual(Helper.determineGenericIndexablePropertyNames(
                Tools.extend(true, {}, configuration.database.model, test[0]),
                test[1]
            ).sort(), test[2])
    })
    test('extendModel', ():void => {
        for (const test:Array<any> of [
            ['A', {A: {}}, {}],
            ['Test', {
                _baseTest: {b: {}},
                Test: {a: {}, [specialNames.extend]: '_baseTest'}
            }, {a: {}, b: {}}],
            ['Test', {
                baseTest: {b: {}},
                Test: {a: {}, [specialNames.extend]: 'baseTest'}
            }, {a: {}, b: {}}],
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
    test('extendModels', ():void => {
        const modelConfiguration:ModelConfiguration = Tools.copy(
            configuration.database.model
        )
        modelConfiguration.entities = {}
        modelConfiguration.property.defaultSpecification = {}
        for (const test:Array<any> of [
            [{}, {}],
            [{entities: {}}, {}],
            [{entities: {Test: {}}}, {Test: {}}],
            [{entities: {Test: {}}}, {Test: {}}],
            [
                {entities: {
                    Base: {b: {}},
                    Test: {a: {}, [specialNames.extend]: 'Base'}}
                },
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
            assert.deepEqual(
                Helper.extendModels(
                    Tools.extend(true, {}, modelConfiguration, test[0])),
                test[1]
            )
        assert.throws(():Models => Helper.extendModels(Tools.extend(
            true, {}, modelConfiguration, {entities: {a: {}}})))
        assert.deepEqual(
            Helper.extendModels(Tools.extend(
                true,
                {},
                modelConfiguration,
                {
                    property: {name: {typeRegularExpressionPattern: {
                        public: 'a'
                    }}},
                    entities: {a: {}}
                }
            )),
            {a: {}}
        )
    })
    test('normalizeAllowedModelRoles', ():void => {
        for (const test:Array<any> of [
            ['a', {read: ['a'], write: ['a']}],
            [[], {read: [], write: []}],
            [['a'], {read: ['a'], write: ['a']}],
            [['a', 'b'], {read: ['a', 'b'], write: ['a', 'b']}],
            [{read: ['a', 'b']}, {read: ['a', 'b'], write: []}],
            [{read: 'a'}, {read: ['a'], write: []}],
            [{read: 'a', write: []}, {read: ['a'], write: []}],
            [{read: 'a', write: ['b']}, {read: ['a'], write: ['b']}]
        ])
            assert.deepEqual(
                Helper.normalizeAllowedModelRoles(test[0]), test[1])
    })
    */
    // / endregion
    // endregion
})
// region vim modline
// vim: set tabstop=4 shiftwidth=4 expandtab:
// vim: foldmethod=marker foldmarker=region,endregion:
// endregion
