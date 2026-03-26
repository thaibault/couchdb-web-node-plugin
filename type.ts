// -*- coding: utf-8 -*-
/** @module type */
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
import {ChildProcess} from 'child_process'
import {
    AnyFunction,
    Mapping,
    PlainObject,
    Primitive,
    ProcessCloseReason,
    UTILITY_SCOPE
} from 'clientnode'
import {Express} from 'express-serve-static-core'
import {
    IncomingMessage as IncomingHTTPMessage,
    Server as HTTPServer,
    ServerResponse as HTTP1ServerResponse
} from 'http'
import {
    Configuration as BaseConfiguration,
    PluginHandler as BasePluginHandler,
    ServicePromises as BaseServicePromises,
    Services as BaseServices,
    ServicePromisesState as BaseServicePromisesState,
    ServicesState as BaseServicesState
} from 'web-node/type'
// endregion
// region exports
/// region database implementation
export type Attachment =
    PouchDB.Core.Attachment &
    {
        content_type?: PouchDB.Core.Attachment['content_type']
        contentType?: PouchDB.Core.Attachment['content_type']
    }
export type AttachmentData = PouchDB.Core.AttachmentData
export type Attachments = Record<string, Attachment | null>

export type FullAttachment =
    Omit<PouchDB.Core.FullAttachment, 'data'> &
    {data?: null | PouchDB.Core.FullAttachment['data']}
export type StubAttachment = PouchDB.Core.StubAttachment

export type Changes = PouchDB.Core.Changes<Mapping<unknown>>

export type ChangesMeta = PouchDB.Core.ChangesMeta
export type ChangesResponse = PouchDB.Core.ChangesResponse<Mapping<unknown>>
export type ChangesResponseChange<Type extends object = Mapping<unknown>> =
    PouchDB.Core.ChangesResponseChange<Type>
export type ChangesStream<Type extends object = Mapping<unknown>> =
    PouchDB.Core.Changes<Type>
export type ChangesStreamOptions = PouchDB.Core.ChangesOptions

export interface Connection<Type extends object = Mapping<unknown>>
    extends
PouchDB.Database<Type> {
    // NOTE: "pouchdb-security" does not have a typings yet.
    installSecurityMethods: () => void
    // NOTE: "pouchdb-validation" does not have a typings yet.
    installValidationMethods: () => void

    installCouchDBWebNodePlugin: (description: string) => void

    bulkDocs<Model>(
        docs: Array<PutDocument<Type & Model>>,
        options?: PouchDB.Core.BulkDocsOptions | null,
    ): Promise<Array<PouchDB.Core.Response | PouchDB.Core.Error>>

    remove(
        id: string | (DocumentIDMeta & DocumentRevisionIDMeta),
        ...parameters: Array<unknown>
    ): Promise<PouchDB.Core.Response>

    post<Model>(
        doc: PostDocument<Type & Model>,
        options?: PouchDB.Core.Options | null
    ): Promise<PouchDB.Core.Response>

    put<Model>(
        doc: PutDocument<Type & Model>,
        options?: PouchDB.Core.PutOptions | null
    ): Promise<PouchDB.Core.Response>

    putAttachment(
        id: string,
        attachmentName: string,
        attachment: AttachmentData,
        type: string
    ): Promise<PouchDB.Core.Response>

    putAttachment(
        id: string,
        attachmentName: string,
        revision: string,
        attachment: AttachmentData,
        type: string
    ): Promise<PouchDB.Core.Response>
}
export type Connector = PouchDB.Static
export type DatabaseConnectorConfiguration =
    PouchDB.Configuration.RemoteDatabaseConfiguration
export type LocalDatabaseConfiguration =
    PouchDB.Configuration.LocalDatabaseConfiguration

export type DatabaseError = PouchDB.Core.Error
export type DatabaseFetch = PouchDB.Core.Options['fetch']
export type DatabaseResponse = PouchDB.Core.Response

export type Document<Type extends object = PlainObject> =
    PouchDB.Core.Document<Type>
export type ExistingDocument<Type extends object = PlainObject> =
    PouchDB.Core.ExistingDocument<Type>
export type DocumentDeleteMeta = PouchDB.Core.IdMeta & {_deleted: boolean}
export type DocumentGetMeta = PouchDB.Core.GetMeta
export type DocumentIDMeta = PouchDB.Core.IdMeta
export type DocumentRevisionIDMeta = PouchDB.Core.RevisionIdMeta

export type FindRequest<Type extends object> = PouchDB.Find.FindRequest<Type>
export type FindResponse<Type extends object> = PouchDB.Find.FindResponse<Type>

export type DeleteIndexOptions = PouchDB.Find.DeleteIndexOptions
export type GetOptions = PouchDB.Core.GetOptions
export type PutOptions = PouchDB.Core.Options;
export type PostDocument<Type extends object> =
    Omit<PouchDB.Core.PostDocument<Type>, 'attachments'> &
    {_attachments?: Attachments | null}
export type PutDocument<Type extends object> =
    Omit<PouchDB.Core.PutDocument<Type>, 'attachments'> &
    {_attachments?: Attachments | null}

export type Index = PouchDB.Find.Index

export type DatabasePlugin = AnyFunction
/// endregion
/// region model
// Represents a properties read and write roles.
export type Roles = (
    Array<string> |
    string |
    {
        read?: Array<string> | string
        write?: Array<string> | string
    }
)
export interface NormalizedRoles {
    read: Array<string>
    write: Array<string>
}
/*
    Recursive mapping from model and properties to their allowed read and write
    roles.
*/
export interface NormalizedModelRoles extends NormalizedRoles {
    attachments?: Mapping<NormalizedRoles>
    properties: Mapping<NormalizedRoles>
}
/*
    Maps an artifact (usually type or property) to corresponding operations
    mapped to their allowed roles.
*/
export type ModelRolesMapping = Mapping<NormalizedModelRoles>

export interface Constraint {
    description?: string
    evaluation: string
}
export const PrimitiveTypes = [
    'boolean',

    'DateTime',

    'integer',
    'number',

    'string'
] as const
export type PrimitiveType = typeof PrimitiveTypes[number]
export type Type =
    boolean |
    number |
    string |
    Model
    // | 'any' | PrimitiveType
export type TypeDefinition = Array<Type> | Array<Array<Type>> | Type

export type ConstraintKey =
    'arrayConstraintExecution' |
    'arrayConstraintExpression' |
    'conflictingConstraintExecution' |
    'conflictingConstraintExpression' |
    'constraintExecution' |
    'constraintExpression'
export interface SelectionOption {
    label: string
    value: Primitive
}
export type NormalizedSelection = Array<SelectionOption>
export type Selection = Array<SelectionOption> | Array<Primitive> | Mapping
export type Pattern = Array<RegExp | string> | RegExp | string
export interface BasePropertyDefinition<
    Type, AdditionalDefinition extends object
> {
    roles?: Roles

    updateStrategy?: UpdateStrategy
    preventVersionCreation?: boolean

    // region expression
    arrayConstraintExecution?: Constraint
    arrayConstraintExpression?: Constraint

    conflictingConstraintExecution?: Constraint
    conflictingConstraintExpression?: Constraint

    constraintExecution?: Constraint
    constraintExpression?: Constraint

    createExecution?: string
    createExpression?: string
    updateExecution?: string
    updateExpression?: string
    runUpdateHookAlways?: boolean
    // endregion
    // region validation
    pattern?: Pattern
    invertedPattern?: Pattern

    contentTypePattern?: Pattern
    invertedContentTypePattern?: Pattern

    maximum?: number
    minimum?: number

    maximumAggregatedSize?: number
    minimumAggregatedSize?: number

    maximumLength?: number
    minimumLength?: number

    maximumNumber?: number
    minimumNumber?: number

    maximumSize?: number
    minimumSize?: number

    mutable?: boolean
    nullable?: boolean
    writable?: boolean

    selection?: Selection

    type?: TypeDefinition
    // endregion
    // region simple transformation
    emptyEqualsNull?: boolean
    trim?: boolean
    // endregion
    // region representation
    // NOTE: Can als be defined via key in parent data structure.
    name?: string
    declaration?: string
    description?: string
    // endregion
    index?: boolean

    // NOTE: Actual name is usually specified via key parent data structure.
    oldName?: Array<string> | string

    value?: Type

    additionalDefinition?: AdditionalDefinition
}
export interface PropertyDefinition<
    Type = unknown, AdditionalDefinition extends object = object
> extends BasePropertyDefinition<Type, AdditionalDefinition> {
    default?: Type
}

export interface FileDefinition<
    Type extends Attachment = Attachment,
    AdditionalDefinition extends object = object
> extends BasePropertyDefinition<Type, AdditionalDefinition> {
    default?: Mapping<Type>
    fileName?: PropertyDefinition<string, AdditionalDefinition>
}
export interface BaseModel<
    AttachmentType extends Attachment = Attachment,
    AdditionalDefinition extends object = object,
    AdditionalPropertiesType = unknown
> {
    _additional?: PropertyDefinition<
        AdditionalPropertiesType, AdditionalDefinition
    >

    _roles?: Roles

    _attachments?:
        Mapping<FileDefinition<AttachmentType, AdditionalDefinition>> |
        null

    _constraintExecutions?: Array<Constraint> | Constraint
    _constraintExpressions?: Array<Constraint> | Constraint

    _createExecution?: string
    _createExpression?: string

    _extends?: Array<string> | string

    _maximumAggregatedSize?: number
    _minimumAggregatedSize?: number

    _oldType?: Array<string> | string
    _type?: Array<string> | string

    _updateExecution?: string
    _updateExpression?: string

    _id?: PropertyDefinition<string, AdditionalDefinition>
    _rev?: PropertyDefinition<string, AdditionalDefinition>

    _updateStrategy?: UpdateStrategy
}
export type Model<
    Type extends object | undefined = object,
    AttachmentType extends Attachment = Attachment,
    AdditionalDefinition extends object = object,
    AdditionalPropertiesType = unknown
> =
    BaseModel<
        AttachmentType, AdditionalDefinition, AdditionalPropertiesType
    > &
    {
        [Property in keyof Type]: PropertyDefinition<
            Type[Property] extends Array<unknown> ?
                (
                    Type[Property][number] extends object | undefined ?
                        Array<Model<
                            Type[Property][number],
                            AttachmentType,
                            AdditionalDefinition,
                            AdditionalPropertiesType
                        >> :
                        Type[Property]
                ) :
                Type[Property] extends object | undefined ?
                    (
                        Type[Property] extends Date | undefined ?
                            Type[Property] :
                            Model<
                                Type[Property],
                                AttachmentType,
                                AdditionalDefinition,
                                AdditionalPropertiesType
                            >
                    ) :
                    Type[Property],
            AdditionalDefinition
        >
    }
export type Models<
    Type extends object = object,
    AttachmentType extends Attachment = Attachment,
    AdditionalDefinition extends object = object,
    AdditionalPropertiesType = unknown
> = Mapping<Model<
    Type, AttachmentType, AdditionalDefinition, AdditionalPropertiesType
>>

export type UpdateStrategy = 'fillUp' | 'incremental' | 'migrate' | 'replace'

export type DocumentContent =
    Array<DocumentContent> | PlainObject | Primitive
export interface DocumentStrategyMeta {_updateStrategy?: UpdateStrategy}
export interface DocumentTypeMeta {'-type': string}
export type BaseDocument =
    Omit<ChangesMeta, '_attachments'> &
    Omit<DocumentGetMeta, '_attachments'> &
    DocumentIDMeta &
    DocumentRevisionIDMeta &
    DocumentStrategyMeta &
    DocumentTypeMeta &
    {_attachments?: Attachments | null}
export type FullDocument<
    Type extends object = object, AdditionalPropertyTypes = unknown
> = BaseDocument & Document<Type> & Mapping<AdditionalPropertyTypes>
export type PartialFullDocument<
    Type extends object = object,
    AdditionalPropertyTypes = unknown
> =
    Partial<BaseDocument> &
    Partial<Document<Type>> &
    Mapping<AdditionalPropertyTypes>

export interface SpecialPropertyNames {
    additional: '_additional'
    role: '_roles'
    attachment: '_attachments'
    conflict: '_conflicts'
    deleted: '_deleted'
    deletedConflict: '_deleted_conflict'
    extend: '_extends'
    id: '_id'
    revision: '_rev'
    revisions: '_revisions'
    revisionsInformation: '_revs_info'
    updateStrategy: '_updateStrategy'
    type: '-type'

    constraint: {
        execution: '_constraintExecutions'
        expression: '_constraintExpressions'
    }
    create: {
        execution: '_createExecution'
        expression: '_createExecution'
    }

    designDocumentNamePrefix: string

    localSequence: '_local_seq'

    maximumAggregatedSize: '_maximumAggregatedSize'
    minimumAggregatedSize: '_minimumAggregatedSize'

    oldType: '_oldType'

    update: {
        execution: '_updateExecution'
        expression: '_updateExpression'
    }
}
export interface PropertyNameConfiguration {
    reserved: Array<string>
    special: SpecialPropertyNames
    typePattern: {
        private: string
        public: string
    }
    validatedDocumentsCache: string
}
export interface BaseModelConfiguration<
    Type, AdditionalDefinition extends object
> {
    dateTimeFormat: 'iso' | 'iso8601' | 'number'
    property: {
        defaultDefinition: PropertyDefinition<
            Type, AdditionalDefinition
        >
        name: PropertyNameConfiguration
    }
    updateStrategy: UpdateStrategy
}
export interface ModelConfiguration<
    Type extends object = object,
    AttachmentType extends Attachment = Attachment,
    AdditionalDefinition extends object = object,
    AdditionalPropertiesType = unknown
> extends BaseModelConfiguration<Type, AdditionalDefinition> {
    autoMigrationPath: string
    entities: Models<
        Type,
        AttachmentType,
        AdditionalDefinition,
        AdditionalPropertiesType
    >
    triggerInitialCompaction: boolean
    updateConfiguration: boolean
    updateValidation: boolean
}
/// endregion
/// region web-node api
//// region configuration
export interface UserContext {
    db: string
    name?: string
    roles: Array<string>
}
export interface DatabaseUserConfiguration {
    names?: Array<string>
    roles?: Array<string>
}

export interface Runner {
    adminUserConfigurationPath: string
    configurationFile?:
        null |
        {
            content: string
            path: string
        }
    names: Array<string> | string
}
export interface BinaryRunner extends Runner {
    configuration: {
        values: PlainObject
        prefixes: Array<string>
    }

    arguments?: Array<string> | null | string
    binaryFilePath?: null | string
    environment?: null | Mapping
    locations: Array<string> | string
}
export interface InPlaceRunner extends Runner {
    configuration: LocalDatabaseConfiguration
    packages: Array<string> | string
}

export interface SecuritySettings {
    admins?: DatabaseUserConfiguration
    members?: DatabaseUserConfiguration

    _validatedDocuments?: Set<string>
}
export type AdvancedFetchOptions = RequestInit & {timeout?: number}
export type ConnectorConfiguration =
    DatabaseConnectorConfiguration &
    {
        // NOTE: "pouchdb`s" version supports timeout parameter.
        fetch: AdvancedFetchOptions | null,
        fetchInterceptor: {
            numberOfRetries: number
            retryIntervalInSeconds: number
            exponentialBackoff: boolean
            maximumRetryIntervallInSeconds: number
        }
    }
export interface CoreConfiguration<
    Type extends object = Mapping<unknown>,
    AttachmentType extends Attachment = Attachment,
    AdditionalDefinition extends object = object,
    AdditionalPropertiesType = unknown
> {
    attachAutoRestarter: boolean

    closeTimeoutInSeconds: number

    runner: {
        memoryInMegaByte: string
        nodePath: string
        host: string
        port: number
        variants: Array<BinaryRunner | InPlaceRunner>
    }

    changesStream: ChangesStreamOptions
    changesStreamReinitializer: {
        retries: number
        retryWaitingFactorInSeconds: number
        maximumRetryWaitingTimeInSeconds: number
    }
    numberOfParallelChangesRunner: number

    removeDanglingForeignKeysChangesStream: ChangesStreamOptions
    updateForeignKeysChangesStream: ChangesStreamOptions
    updateMaterializedViewsChangesStream: ChangesStreamOptions

    connector: ConnectorConfiguration
    security: {
        _default: SecuritySettings
        _users: SecuritySettings
        [key: string]: SecuritySettings
    }

    createGenericFlatIndex: boolean
    databaseName: string
    debug: boolean

    ensureAdminPresence: boolean
    ensureSecuritySettingsPresence: boolean
    ensureUserPresence: boolean
    ignoreNoChangeError: boolean

    local: boolean

    maximumNumberOfEntitiesInBulkOperation: number

    maximumRepresentationLength: number
    maximumRepresentationTryLength: number

    model: ModelConfiguration<
        Type,
        AttachmentType,
        AdditionalDefinition,
        AdditionalPropertiesType
    >

    path: string

    skipLatestRevisionDetermining: boolean

    url: string

    admin: {
        name: string
        password: string
    }
    users: Array<{
        name: string
        password: string
        roles: Array<string>
    }>

    materializedViews: Mapping<Mapping<{
        query: PouchDB.Find.FindRequest<object>
        initialMapperExpression?: string
        updateExpression?: string
    }>>
}
export type Configuration<ConfigurationType = Mapping<unknown>> =
    BaseConfiguration<{couchdb: CoreConfiguration}> &
    ConfigurationType
//// endregion
export interface CouchDB<Type extends object = Mapping<unknown>> {
    changesStream: ChangesStream
    lastChangesSequenceIdentifier?: number | string

    reinitializeMaterializedViews?: () => Promise<void>

    foreignKeys: {
        static: Mapping<Array<[string, string]>>
        runtime: Mapping<Array<{propertyName: string; id: string}>>
    }
    removeDanglingForeignKeys?: () => Promise<void>

    updateMaterializedViewsChangesStream?: ChangesStream
    lastUpdateMaterializedViewsChangesSequenceIdentifier?: number | string

    removeDanglingForeignKeysChangesStream?: ChangesStream
    lastRemoveDanglingForeignKeysChangesSequenceIdentifier?: number | string
    updateForeignKeysChangesStream?: ChangesStream
    lastUpdateForeignKeysChangesSequenceIdentifier?: number | string

    backendConnector: Connector
    connection: Connection<Type>
    connector: Connector

    server: {
        expressInstance?: Express
        expressPouchDBInstance?: Express

        process?: ChildProcess | HTTPServer

        reject: (value: Error | ProcessCloseReason) => void
        resolve: (reason?: ProcessCloseReason) => void

        restart: (state: State) => Promise<void>
        start: (state: State) => Promise<void>
        stop: (services: Services, configuration: Configuration) =>
            Promise<void>

        runner: BinaryRunner | InPlaceRunner
    }

    validateDocument: (
        document: FullDocument,
        options: {
            checkPublicModelType?: boolean
            type?: string
            oldDocument?: FullDocument
        }
    ) => Error | true
}

export type ServicePromises<Type = Mapping<unknown>> =
    BaseServicePromises<{couchdb: Promise<ProcessCloseReason>}> & Type
export type Services<Type = Mapping<unknown>> =
    BaseServices<{
        couchdb: CouchDB
    }> &
    Type

export type ServicesState<Type = undefined> = BaseServicesState<
    Type,
    Configuration,
    Services
>
export type State<Type = undefined> = BaseServicePromisesState<
    Type,
    Configuration,
    Services,
    ServicePromises
>

export interface PluginHandler extends BasePluginHandler {
    /**
     * Hook after changes stream initialization.
     * @param state - Application state.
     * @returns Promise resolving to nothing.
     */
    couchdbInitializeChangesStream?(state: State<ChangesStream>): Promise<void>
    /**
     * Hook after each data change.
     * @param state - Application state.
     * @returns Promise resolving to nothing.
     */
    couchdbChange?(state: State<ChangesResponseChange>): Promise<void>
    /**
     * Hook after each database restart.
     * @param state - Application state.
     * @returns Promise resolving to nothing.
     */
    restartCouchdb?(state: State): Promise<void>

    /**
     * Hook before registering pouchdb routes into the express server
     * instance.
     * @param state - Application state.
     * @returns Promise resolving to find result.
     */
    onPouchDBFind?(
        state: State<{
            request: IncomingHTTPMessage & {body: FindRequest<PlainObject>},
            response: HTTP1ServerResponse
        }>
    ): Promise<FindResponse<object> | undefined>

    /**
     * Hook before registering pouchdb routes into the express server
     * instance.
     * @param state - Application state.
     * @returns Promise resolving to nothing.
     */
    initializeExpressPouchDB?(
        state: State<{
            expressInstance: Express, expressPouchDBInstance: Express
        }>
    ): Promise<void>
}
/// endregion
/// region evaluation
export interface EmptyEvaluationErrorData {
    empty: string
}
export interface EvaluationErrorData<S = Mapping<unknown>> {
    code: string
    error: unknown
    scope: S
}
export type EvaluationError = DatabaseError & EvaluationErrorData
export interface CompilationErrorData<
    S = Mapping<unknown>
> extends EvaluationErrorData<S> {
    compilation: string
}
export interface RuntimeErrorData<
    S = Mapping<unknown>
> extends EvaluationErrorData<S> {
    runtime: string
}
//// region scopes
export interface BasicScope<
    Type extends object,
    AttachmentType extends Attachment,
    AdditionalDefinition extends object,
    AdditionalPropertiesType
> {
    attachmentWithPrefixExists: (namePrefix: string) => boolean
    checkDocument: (
        newDocument: PartialFullDocument<Type, AdditionalPropertiesType>,
        oldDocument:
            PartialFullDocument<Type, AdditionalPropertiesType> |
            null,
        modelName: string,
        model: Model<
            Type,
            AttachmentType,
            AdditionalDefinition,
            AdditionalPropertiesType
        >,
        parentNames: Array<string>
    ) => CheckedDocumentResult<Type, AdditionalPropertiesType>
    deepCopy: <T>(data: T) => T
    getDateTime: (value: number | string) => Date
    getEffectiveValue: (
        name: string,
        newDocument: PartialFullDocument<Type, AdditionalPropertiesType>,
        oldDocument: (
            null | PartialFullDocument<Type, AdditionalPropertiesType>
        )
    ) => unknown
    getFileNameByPrefix: (
        prefix?: string, attachments?: Mapping<AttachmentType>
    ) => null | string
    isDefinedPropertyValue: (
        name: keyof object,
        document: PartialFullDocument<Type, AdditionalPropertiesType>
    ) => boolean
    require: null | typeof require
    serialize: (value: unknown) => string

    id: string
    revision: string

    idName: string
    revisionName: string
    specialNames: SpecialPropertyNames
    typeName: string

    modelConfiguration: BaseModelConfiguration<Type, AdditionalDefinition>
    models: Models<
        Type,
        AttachmentType,
        AdditionalDefinition,
        AdditionalPropertiesType
    >

    now: Date
    nowUTCTimestamp: number

    securitySettings: Partial<SecuritySettings>

    userContext: Partial<UserContext>

    originalNewDocument?: PartialFullDocument<Type, AdditionalPropertiesType>
}
export interface CommonScope<
    ObjectType extends object,
    Type,
    AttachmentType extends Attachment,
    AdditionalDefinition extends object,
    AdditionalPropertiesType
> {
    checkPropertyContent: (
        newValue: Type,
        name: string,
        propertyDefinition: PropertyDefinition<Type, AdditionalDefinition>,
        oldValue: Type
    ) => CheckedPropertyResult<Type>

    model: Model<
        ObjectType,
        AttachmentType,
        AdditionalDefinition,
        AdditionalPropertiesType
    >
    modelName: string
    type: Array<string> | string

    newDocument: PartialFullDocument<ObjectType, AdditionalPropertiesType>
    oldDocument:
        null | PartialFullDocument<ObjectType, AdditionalPropertiesType>

    parentNames: Array<string>
    pathDescription: string

    updateStrategy: UpdateStrategy
}
export interface PropertyScope<
    ObjectType extends object,
    Type,
    PropertyType,
    AttachmentType extends Attachment,
    AdditionalDefinition extends object,
    AdditionalPropertiesType
> extends CommonScope<
    ObjectType,
    PropertyType,
    AttachmentType,
    AdditionalDefinition,
    AdditionalPropertiesType
> {
    name: string

    newValue: Type
    oldValue?: Type

    propertyDefinition: PropertyDefinition<
        Type, AdditionalDefinition
    >,

    attachmentsTarget?: Mapping<AttachmentType | null>
}
//// endregion
export interface EvaluationResult<
    ObjectType extends object,
    Type,
    PropertyType,
    AttachmentType extends Attachment,
    AdditionalDefinition extends object,
    AdditionalPropertiesType,
    Scope = (
        BasicScope<
            ObjectType,
            AttachmentType,
            AdditionalDefinition,
            AdditionalPropertiesType
        > &
        CommonScope<
            ObjectType,
            PropertyType,
            AttachmentType,
            AdditionalDefinition,
            AdditionalPropertiesType
        >
    )
> {
    code: string
    result: Type
    scope: Scope
}
export type Evaluate<R, P extends Array<unknown>> = (...parameters: P) => R
/// endregion
/// region checker results
export interface CheckedResult {
    changedPath: Array<string>
}
export interface CheckedPropertyResult<Type> extends CheckedResult {
    /*
     NOTE: "undefined" means no changes regarding existing data and null
    */
    newValue?: null | Type
}
export interface CheckedDocumentResult<
    ObjectType extends object, AdditionalPropertiesType
> extends CheckedResult {
    newDocument: PartialFullDocument<ObjectType, AdditionalPropertiesType>
}
/// endregion
export type AbortControllerStack = Array<{
    name: string
    id: string
    controller: AbortController
}>
export interface InitializeExpressPouchDBStateData {
    expressInstance: Express,
    expressPouchDBInstance: Express
}

export type Migrator<
    Type extends object = object,
    AttachmentType extends Attachment = Attachment,
    AdditionalDefinition extends object = object,
    AdditionalPropertiesType = unknown
> = (
    document: Document,
    scope:(
        typeof UTILITY_SCOPE &
        {
            configuration: Configuration

            databaseHelper: Mapping<unknown>

            idName: string
            typeName: string

            migrators: Mapping<Migrator<
                Type,
                AttachmentType,
                AdditionalDefinition,
                AdditionalPropertiesType
            >>
            models: Models<
                Type,
                AttachmentType,
                AdditionalDefinition,
                AdditionalPropertiesType
            >
            modelConfiguration: ModelConfiguration<
                Type,
                AttachmentType,
                AdditionalDefinition,
                AdditionalPropertiesType
            >

            selfFilePath: string

            services: Services
        }
    )
) => Document | null

export type DateRepresentationType = Date | null | number | string
/// region pre-defined models
export type User =
    BaseDocument &
    {
        password: string
        roles: Array<string>
    }
export type MaterializedViewDocument = BaseDocument & Record<string, unknown>
/*
    Start and end time can be represented as number (of seconds) or an iso
    based datetime string.
*/
export interface Interval {
    end: number | string
    start: number | string
}
export interface Location {
    latitude: number
    longitude: number
}
/// endregion
// endregion
