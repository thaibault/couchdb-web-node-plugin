// #!/usr/bin/env babel-node
// -*- coding: utf-8 -*-
'use strict'
/* !
    region header
    Copyright Torben Sickert (info["~at~"]tsickert.com) 16.12.2012

    License
    -------

    This library written by Torben Sickert stands under a creative commons
    naming 3.0 unported license.
    See https://creativecommons.org/licenses/by/3.0/deed.de
    endregion
*/
// region imports
import type {Mapping} from 'clientnode'
import type {AddressInfo} from 'net'

import type {
    AbortControllerStack,
    ModelRolesMapping,
    Configuration,
    Connection,
    ConnectorConfiguration,
    DatabaseError,
    DatabaseResponse,
    ModelConfiguration,
    Model,
    Models,
    Services,
    SpecialPropertyNames
} from '../type'

import {copy, extend, NOOP, timeout} from 'clientnode'
import {createServer, IncomingMessage, ServerResponse} from 'http'
import {
    testEach,
    testEachResolvedPromiseAgainstSameExpectation,
    TEST_UNDEFINED_SYMBOL
} from 'clientnode/test-helper'

import {
    afterAll, beforeAll, beforeEach, describe, expect, jest, test
} from '@jest/globals'

import {
    determineModelRolesMapping,
    determineGenericIndexablePropertyNames,
    ensureValidationDocumentPresence,
    getConnectorOptions,
    getPouchDBPlugin,
    initializeConnection,
    removeDeprecatedIndexes,
    TOGGLE_LATEST_REVISION_DETERMINING,
    waitWithTimeout,
    applyDefaultPropertyConfigurations,
    applyModelInheritance,
    applyModelsInheritance,
    mayStripRepresentation,
    normalizeRoles
} from '../helper'
import packageConfiguration from '../package.json'
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
    const {defaultDefinition} = mockModelConfiguration.property
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
    testEachResolvedPromiseAgainstSameExpectation<
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
    test('ensureValidationDocumentPresence: update/create', async (
    ): Promise<void> => {
        const putDocuments: Array<Mapping<unknown>> = []
        let getError: unknown = null
        let putError: unknown = null
        const connection = {
            get: (): Promise<unknown> =>
                getError ?
                    Promise.reject(getError) :
                    Promise.resolve({_id: '_design/test', _rev: '1-a'}),
            put: (document: Mapping<unknown>): Promise<unknown> => {
                putDocuments.push(document)

                return putError ?
                    Promise.reject(putError) :
                    Promise.resolve({ok: true})
            }
        } as unknown as Connection

        // Update existing document.
        await expect(ensureValidationDocumentPresence(
            connection, 'test', {data: 'data'}, 'Description'
        )).resolves.toBeUndefined()
        expect(putDocuments).toHaveLength(1)
        expect(putDocuments[0]).toHaveProperty('_rev', '1-a')
        expect(putDocuments[0]).toHaveProperty('_id', '_design/test')
        expect(putDocuments[0]).toHaveProperty('data', 'data')

        // Create missing document.
        getError = {name: 'not_found'}
        await expect(ensureValidationDocumentPresence(
            connection, 'test', {data: 'data'}, 'Description'
        )).resolves.toBeUndefined()
        expect(putDocuments).toHaveLength(2)
        expect(putDocuments[1]).not.toHaveProperty('_rev')

        // Unknown error retrieving and failing creation.
        getError = new Error('unknown')
        putError = new Error('broken')
        await expect(ensureValidationDocumentPresence(
            connection, 'test', {data: 'data'}, 'Description'
        )).rejects.toThrow(/^Description couldn't be installed\/updated: /)
    })
    test('waitWithTimeout', async (): Promise<void> => {
        await expect(waitWithTimeout(
            new Promise<void>(NOOP), .01, 'never resolving promise'
        )).resolves.toBeUndefined()

        jest.useFakeTimers()
        try {
            // Timer has to be cleared if given promise settles in time.
            await expect(waitWithTimeout(Promise.resolve(), 60, 'test'))
                .resolves.toBeUndefined()
            expect(jest.getTimerCount()).toStrictEqual(0)

            await expect(waitWithTimeout(
                Promise.reject(new Error('failed')), 60, 'test'
            )).rejects.toThrow('failed')
            expect(jest.getTimerCount()).toStrictEqual(0)
        } finally {
            jest.useRealTimers()
        }
    })
    test('removeDeprecatedIndexes', async (): Promise<void> => {
        const deletedIndexNames: Array<string> = []
        const connection = {
            getIndexes: () => Promise.resolve({indexes: [
                {name: 'Test-GenericIndex'},
                {name: 'Test-a-GenericIndex'},
                {name: 'Test-old-GenericIndex'},
                {name: 'Removed-GenericIndex'},
                {name: 'customIndex'}
            ]}),
            deleteIndex: ({name}: {name: string}): Promise<void> => {
                deletedIndexNames.push(name)

                return Promise.resolve()
            }
        } as unknown as Connection<object>

        await removeDeprecatedIndexes(
            connection, {Test: {a: {}}} as unknown as Models,
            configuration.couchdb.model
        )

        expect(deletedIndexNames).toStrictEqual(
            ['Test-old-GenericIndex', 'Removed-GenericIndex']
        )
    })
    test('initializeConnection', async (): Promise<void> => {
        const calls: Array<string> = []
        let allDocsError: unknown = null
        class Connector {
            parameters: Array<unknown>
            constructor(...parameters: Array<unknown>) {
                this.parameters = parameters
            }
            allDocs(): Promise<unknown> {
                return allDocsError ?
                    Promise.reject(allDocsError) :
                    Promise.resolve({rows: []})
            }
            installCouchDBWebNodePlugin(description: string): void {
                calls.push(`installCouchDBWebNodePlugin:${description}`)
            }
            installValidationMethods(): void {
                calls.push('installValidationMethods')
            }
            setMaxListeners(): void {
                calls.push('setMaxListeners')
            }
        }
        const getServices = (server: Mapping<unknown> = {}): Services =>
            ({couchdb: {connector: Connector, server}}) as
                unknown as
                Services

        // Remote connection.
        let services = await initializeConnection(
            getServices(), configuration
        )
        expect((services.couchdb.connection as unknown as Connector)
            .parameters[0]).toMatch(/^http:\/\/.+\/main$/)
        expect(calls).toStrictEqual(
            ['installCouchDBWebNodePlugin:backend', 'setMaxListeners']
        )

        // In place connection.
        calls.length = 0
        const runnerConfiguration = {adapter: 'memory'}
        services = await initializeConnection(
            getServices({
                expressPouchDBInstance: {},
                runner: {configuration: runnerConfiguration}
            }),
            configuration,
            false
        )
        expect((services.couchdb.connection as unknown as Connector)
            .parameters).toStrictEqual(
            [configuration.couchdb.databaseName, runnerConfiguration]
        )
        expect(calls).toStrictEqual([
            'installValidationMethods',
            'installCouchDBWebNodePlugin:backend',
            'setMaxListeners'
        ])

        // Unreachable database.
        allDocsError = new Error('unreachable')
        await expect(initializeConnection(getServices(), configuration))
            .rejects.toThrow(/^Database has not been installed yet: /)
    })
    describe('getPouchDBPlugin', (): void => {
        const {id: idName, revision: revisionName} = specialNames

        type Result = DatabaseError | DatabaseResponse
        interface NativeCall {
            data: Array<Mapping<unknown>>
            parameters: Array<unknown>
        }
        /**
         * Creates a mocked connection with installed plugin.
         * @param nativeResults - Results to return by subsequent native bulk
         * operations. Successful results will be generated if exhausted.
         * @param givenConfiguration - Plugin configuration to use.
         * @returns Connection and list of native "bulkDocs" calls.
         */
        const createConnection = (
            nativeResults: Array<Array<Partial<Result>>> = [],
            givenConfiguration: Partial<Configuration['couchdb']> = {}
        ): {connection: Connection, nativeCalls: Array<NativeCall>} => {
            const nativeCalls: Array<NativeCall> = []
            const connection = {
                bulkDocs: (
                    data: Array<Mapping<unknown>>,
                    ...parameters: Array<unknown>
                ): Promise<Array<Partial<Result>>> => {
                    nativeCalls.push({data, parameters})

                    return Promise.resolve(
                        nativeResults.shift() ??
                        data.map((document) => ({
                            id: document[idName] as string,
                            ok: true,
                            rev: '1-generated'
                        }))
                    )
                },
                get: (id: string) => Promise.resolve(
                    {[idName]: id, [revisionName]: '2-latest'}
                ),
                putAttachment: NOOP,
                removeAttachment: NOOP
            } as unknown as Connection

            getPouchDBPlugin({...configuration.couchdb, ...givenConfiguration})
                .installCouchDBWebNodePlugin.call(connection, 'test')

            return {connection, nativeCalls}
        }

        test('bulkDocs normalizes and chunks given documents', async (
        ): Promise<void> => {
            const {connection, nativeCalls} = createConnection(
                [], {maximumNumberOfEntitiesInBulkOperation: 2}
            )

            await expect(connection.bulkDocs({docs: [
                {[idName]: 'a'}, {[idName]: 'b'}, {[idName]: 'c'}
            ]} as unknown as Array<Mapping<unknown>>)).resolves.toStrictEqual([
                {id: 'a', ok: true, rev: '1-generated'},
                {id: 'b', ok: true, rev: '1-generated'},
                {id: 'c', ok: true, rev: '1-generated'}
            ])
            expect(nativeCalls.map(({data}) => data.length))
                .toStrictEqual([2, 1])

            await expect(connection.bulkDocs(
                {[idName]: 'single'} as unknown as Array<Mapping<unknown>>
            )).resolves.toStrictEqual(
                [{id: 'single', ok: true, rev: '1-generated'}]
            )
            expect(nativeCalls[2].data).toStrictEqual([{[idName]: 'single'}])
        })
        test('bulkDocs retries conflicting latest revisions', async (
        ): Promise<void> => {
            const {connection, nativeCalls} = createConnection([[
                {name: 'conflict', status: 409},
                {id: 'b', ok: true, rev: '1-b'},
                {name: 'conflict', status: 409}
            ]])

            await expect(connection.bulkDocs(
                [
                    {[idName]: 'a', [revisionName]: '0-latest'},
                    {[idName]: 'b'},
                    {[idName]: 'c', [revisionName]: '1-c'}
                ],
                {},
                // @ts-expect-error Additional internal parameter.
                TOGGLE_LATEST_REVISION_DETERMINING
            )).resolves.toStrictEqual([
                {id: 'a', ok: true, rev: '1-generated'},
                {id: 'b', ok: true, rev: '1-b'},
                // Conflicts with explicit revisions are not retried.
                {name: 'conflict', status: 409}
            ])

            expect(nativeCalls).toHaveLength(2)
            // Toggle token is never forwarded to the native implementation.
            expect(nativeCalls[0].parameters).toStrictEqual([{}])
            expect(nativeCalls[1].parameters).toStrictEqual([{}])
            expect(nativeCalls[1].data).toStrictEqual(
                [{[idName]: 'a', [revisionName]: '0-latest'}]
            )
        })
        test('bulkDocs ignores "NoChange" errors', async (
        ): Promise<void> => {
            const noChange = {
                name: 'forbidden', message: 'NoChange: nothing to update.'
            }
            const documents = [
                {[idName]: 'a', [revisionName]: '1-a'},
                {[idName]: 'b', [revisionName]: '0-latest'},
                {[idName]: 'c'}
            ]

            // Skipping revision determination (configured default).
            let {connection} =
                createConnection([[noChange, noChange, noChange]])
            await expect(connection.bulkDocs(documents)).resolves
                .toStrictEqual([
                    {id: 'a', ok: true},
                    {id: 'b', ok: true},
                    {id: 'c', ok: true}
                ])

            // Toggled revision determination.
            ;({connection} =
                createConnection([[noChange, noChange, noChange]]))
            await expect(connection.bulkDocs(
                documents,
                // @ts-expect-error Additional internal parameter.
                TOGGLE_LATEST_REVISION_DETERMINING
            )).resolves.toStrictEqual([
                {id: 'a', ok: true, rev: '1-a'},
                {id: 'b', ok: true, rev: '2-latest'},
                {id: 'c', ok: true, rev: '2-latest'}
            ])

            // Disabled ignoring.
            ;({connection} = createConnection(
                [[noChange]], {ignoreNoChangeError: false}
            ))
            await expect(connection.bulkDocs([documents[0]])).resolves
                .toStrictEqual([noChange])
        })
        test('put/post/remove', async (): Promise<void> => {
            const {connection, nativeCalls} = createConnection([
                [{id: 'a', ok: true, rev: '1-a'}],
                [{name: 'forbidden', message: 'Not allowed.'}]
            ])

            await expect(connection.put({[idName]: 'a'})).resolves
                .toStrictEqual({id: 'a', ok: true, rev: '1-a'})
            await expect(connection.post({[idName]: 'b'})).rejects
                .toStrictEqual({name: 'forbidden', message: 'Not allowed.'})
            await expect(connection.remove('c', '1-c')).resolves
                .toStrictEqual({id: 'c', ok: true, rev: '1-generated'})
            expect(nativeCalls[2].data).toStrictEqual([{
                [idName]: 'c',
                [revisionName]: '1-c',
                [specialNames.deleted]: true
            }])
        })
        test('putAttachment/removeAttachment', async (
        ): Promise<void> => {
            const {connection, nativeCalls} = createConnection()
            const attachmentName = specialNames.attachment

            await connection.putAttachment(
                'a', 'file.txt', '1-a', 'data', 'text/plain'
            )
            expect(nativeCalls[0].data).toStrictEqual([{
                [idName]: 'a',
                [revisionName]: '1-a',
                [attachmentName]: {'file.txt': {
                    // eslint-disable-next-line camelcase
                    content_type: 'text/plain', data: 'data'
                }}
            }])

            const blob = new Blob(['data'], {type: 'text/markdown'})
            await connection.putAttachment(
                'a', 'file.md', blob as unknown as string, ''
            )
            expect(nativeCalls[1].data).toStrictEqual([{
                [idName]: 'a',
                [revisionName]: '0-latest',
                [attachmentName]: {'file.md': {
                    // eslint-disable-next-line camelcase
                    content_type: 'text/markdown', data: blob
                }}
            }])

            await connection.removeAttachment('a', 'file.txt', '2-a')
            expect(nativeCalls[2].data).toStrictEqual([{
                [idName]: 'a',
                [revisionName]: '2-a',
                [attachmentName]: {'file.txt': {
                    // eslint-disable-next-line camelcase
                    content_type: 'application/octet-stream', data: null
                }}
            }])
        })
    })
    describe('getConnectorOptions', (): void => {
        type Reply = [number, Mapping?]
        let replies: Array<Reply> = []
        let numberOfRequests = 0
        const server = createServer((
            _request: IncomingMessage, response: ServerResponse
        ): void => {
            numberOfRequests += 1
            const [status, headers = {}] = replies.shift() ?? [200]
            response.writeHead(status, headers)
            response.end(String(status))
        })
        let url = ''

        beforeAll((): Promise<void> => new Promise<void>((
            resolve: () => void
        ): void => {
            server.listen(0, '127.0.0.1', (): void => {
                url = 'http://127.0.0.1:' +
                    String((server.address() as AddressInfo).port)
                resolve()
            })
        }))
        afterAll((): Promise<void> => new Promise<void>((
            resolve: () => void
        ): void => {
            server.close((): void => {
                resolve()
            })
        }))
        beforeEach((): void => {
            numberOfRequests = 0
            replies = []
        })

        const getFetch = (
            interceptorConfiguration: Partial<
                ConnectorConfiguration['fetchInterceptor']
            > = {},
            abortControllerStack?: AbortControllerStack
        ) => getConnectorOptions(
            {
                fetch: {},
                fetchInterceptor: {
                    exponentialBackoff: true,
                    maximumRetryIntervalInSeconds: 1,
                    numberOfRetries: 3,
                    retryIntervalInSeconds: .01,
                    ...interceptorConfiguration
                }
            } as ConnectorConfiguration,
            abortControllerStack
        ).fetch as (url: string, options?: RequestInit) => Promise<Response>

        test('passes through successful and unknown responses', async (
        ): Promise<void> => {
            await expect(getFetch()(url)).resolves
                .toHaveProperty('status', 200)

            replies = [[500]]
            await expect(getFetch()(url)).resolves
                .toHaveProperty('status', 500)
            expect(numberOfRequests).toStrictEqual(2)
        })
        test('retries known errors with backoff', async (
        ): Promise<void> => {
            replies = [[503], [429], [502]]
            await expect(getFetch()(url)).resolves
                .toHaveProperty('status', 200)
            expect(numberOfRequests).toStrictEqual(4)

            numberOfRequests = 0
            replies = [[503], [504]]
            await expect(getFetch({exponentialBackoff: false})(url))
                .resolves.toHaveProperty('status', 200)
            expect(numberOfRequests).toStrictEqual(3)
        })
        test('gives up after configured number of retries', async (
        ): Promise<void> => {
            replies = [[503], [503], [503]]
            await expect(getFetch({numberOfRetries: 2})(url)).rejects
                .toHaveProperty('status', 503)
            expect(numberOfRequests).toStrictEqual(3)
        })
        test('respects "retry-after" header', async (): Promise<void> => {
            // Delay in seconds.
            replies = [[503, {'retry-after': '0'}]]
            await expect(getFetch()(url)).resolves
                .toHaveProperty('status', 200)

            // Date in the past.
            replies = [[429, {
                'retry-after': new Date(Date.now() - 60000).toUTCString()
            }]]
            await expect(getFetch()(url)).resolves
                .toHaveProperty('status', 200)

            // Invalid value.
            replies = [[429, {'retry-after': 'soon'}]]
            await expect(getFetch()(url)).resolves
                .toHaveProperty('status', 200)

            // Future dates (near and beyond maximum retry interval).
            for (const maximumRetryIntervalInSeconds of [.5, 30]) {
                replies = [[503, {
                    'retry-after': new Date(Date.now() + 2000).toUTCString()
                }]]
                await expect(getFetch({maximumRetryIntervalInSeconds})(url))
                    .resolves.toHaveProperty('status', 200)
            }

            expect(numberOfRequests).toStrictEqual(10)
        })
        test('forwards client side errors without retrying', async (
        ): Promise<void> => {
            const closedServer = createServer()
            const closedURL = await new Promise<string>((
                resolve: (url: string) => void
            ): void => {
                closedServer.listen(0, '127.0.0.1', (): void => {
                    const {port} = closedServer.address() as AddressInfo
                    closedServer.close((): void => {
                        resolve(`http://127.0.0.1:${String(port)}`)
                    })
                })
            })

            await expect(getFetch()(closedURL)).rejects
                .toBeInstanceOf(Error)
        })
        test('uses provided abort controller', async (): Promise<void> => {
            const controller = new AbortController()
            controller.abort()
            const abortControllerStack: AbortControllerStack =
                [{controller, id: 'test', name: 'test'}]

            await expect(getFetch({}, abortControllerStack)(url)).rejects
                .toHaveProperty('name', 'AbortError')
            expect(abortControllerStack).toHaveLength(0)
            expect(numberOfRequests).toStrictEqual(0)
        })
    })
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
                {a: {...defaultDefinition}, b: {...defaultDefinition}},
                {a: {}, [specialNames.extend]: '_baseTest'},
                {_baseTest: {b: {}}}
            ],
            [
                {a: {...defaultDefinition}, b: {...defaultDefinition}},
                {a: {}, [specialNames.extend]: 'baseTest'},
                {baseTest: {b: {}}}
            ],
            [
                {
                    a: {...defaultDefinition},
                    b: {...defaultDefinition},
                    c: {...defaultDefinition}
                },
                {c: {}, [specialNames.extend]: ['A', 'B']},
                {A: {a: {}}, B: {b: {}}}
            ],
            [
                {
                    a: {...defaultDefinition},
                    b: {...defaultDefinition},
                    c: {...defaultDefinition}
                },
                {c: {}, [specialNames.extend]: 'B'},
                {
                    A: {a: {}},
                    B: {b: {}, [specialNames.extend]: 'A'}
                }
            ],
            [
                {
                    a: {...defaultDefinition},
                    b: {...defaultDefinition},
                    c: {...defaultDefinition},
                    d: {...defaultDefinition, type: 'number'}
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
                        ...defaultDefinition,
                        type: {
                            inPlaceProperty: {...defaultDefinition},
                            b: {...defaultDefinition},
                            c: {...defaultDefinition},
                            d: {...defaultDefinition, type: 'number'}
                        }
                    },
                    d: {...defaultDefinition, type: 'number'}
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
        modelConfiguration.property.defaultDefinition = {}

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
                    property: {defaultDefinition: {maximum: 3}},
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
                    property: {defaultDefinition: {minimum: 1}}
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
                {entities: {a: {}}} as Partial<ModelConfiguration>
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
