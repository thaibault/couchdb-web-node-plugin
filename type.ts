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
import {
    Configuration as BaseConfiguration,
    PluginHandler as BasePluginHandler,
    ServicePromises as BaseServicePromises,
    Services as BaseServices,
    ServicePromisesState as BaseServicePromisesState,
    ServicesState as BaseServicesState
} from 'web-node/type'

import DatabaseHelper from './databaseHelper'
// endregion
// region exports
/// region database implementation
export type Attachment =
    PouchDB.Core.Attachment &
    {
        content_type?:PouchDB.Core.Attachment['content_type']
        contentType?:PouchDB.Core.Attachment['content_type']
    }
export interface Attachments {
    [attachmentId:string]:Attachment
}
export type FullAttachment = PouchDB.Core.FullAttachment
export type StubAttachment = PouchDB.Core.StubAttachment

export type ChangesMeta = PouchDB.Core.ChangesMeta
export type ChangesResponseChange<Type extends object = Mapping<unknown>> =
    PouchDB.Core.ChangesResponseChange<Type>
export type ChangesStream<Type extends object = Mapping<unknown>> =
    PouchDB.Core.Changes<Type>
export type ChangesStreamOptions = PouchDB.Core.ChangesOptions

export type Connection<Type extends object = Mapping<unknown>> =
    PouchDB.Database<Type>
export type Connector = PouchDB.Static
export type DatabaseConnectorConfiguration =
    PouchDB.Configuration.RemoteDatabaseConfiguration

export type DatabaseError = PouchDB.Core.Error
export type DatabaseFetch = PouchDB.Core.Options['fetch']
export type DatabaseResponse = PouchDB.Core.Response

export type Document<Type extends object = PlainObject> =
    PouchDB.Core.Document<Type>
export type ExistingDocument<Type extends object = PlainObject> =
    PouchDB.Core.ExistingDocument<Type>
export type DocumentGetMeta = PouchDB.Core.GetMeta
export type DocumentIDMeta = PouchDB.Core.IdMeta
export type DocumentRevisionIDMeta = PouchDB.Core.RevisionIdMeta

export type FindRequest<Type extends object> = PouchDB.Find.FindRequest<Type>
export type DeleteIndexOptions = PouchDB.Find.DeleteIndexOptions
export type GetOptions = PouchDB.Core.GetOptions
export type PutOptions = PouchDB.Core.Options;
export type PutDocument<Type extends object> = PouchDB.Core.PutDocument<Type>;

export type Index = PouchDB.Find.Index

export type DatabasePlugin = AnyFunction
/// endregion
/// region model
// Represents a properties read and write roles.
export type AllowedRoles = (
    Array<string> |
    string |
    {
        read?:Array<string>|string
        write?:Array<string>|string
    }
)
export interface NormalizedAllowedRoles {
    read:Array<string>
    write:Array<string>
}
/*
    Recursive mapping from model and properties to their allowed read and write
    roles.
*/
export interface NormalizedAllowedModelRoles extends NormalizedAllowedRoles {
    properties:Mapping<NormalizedAllowedRoles>
}
/*
    Maps an artefact (usually type or property) to corresponding operations
    mapped to their allowed roles.
*/
export type AllowedModelRolesMapping = Mapping<NormalizedAllowedModelRoles>

export interface Constraint {
    description?:string
    evaluation:string
}
export const PrimitiveTypes = [
    'boolean',

    'DateTime',

    'integer',
    'number',

    'string'
] as const
export type PrimitiveType = typeof PrimitiveTypes[number]
export type Type = string // |'any'|PrimitiveType
export type TypeSpecification = Array<Type>|Type

export type ConstraintKey =
    'arrayConstraintExecution'|'arrayConstraintExpression'|
    'conflictingConstraintExecution'|'conflictingConstraintExpression'|
    'constraintExecution'|'constraintExpression'
export interface SelectionMapping {
    label:string
    value:unknown
}
export type Pattern = Array<RegExp|string>|RegExp|string
export interface PropertySpecification<
    Type = unknown, AdditionalSpecifications extends object = object
> {
    allowedRoles?:AllowedRoles
    computed?:boolean
    // region expression
    arrayConstraintExecution?:Constraint
    arrayConstraintExpression?:Constraint

    conflictingConstraintExecution?:Constraint
    conflictingConstraintExpression?:Constraint

    constraintExecution?:Constraint
    constraintExpression?:Constraint

    onCreateExecution?:string
    onCreateExpression?:string
    onUpdateExecution?:string
    onUpdateExpression?:string
    // endregion
    // region validation
    pattern?:Pattern
    invertedPattern?:Pattern

    contentTypePattern?:Pattern
    invertedContentTypePattern?:Pattern

    maximum?:number
    minimum?:number

    maximumAggregatedSize?:number
    minimumAggregatedSize?:number

    maximumLength?:number
    minimumLength?:number

    maximumNumber?:number
    minimumNumber?:number

    maximumSize?:number
    minimumSize?:number

    mutable?:boolean
    nullable?:boolean
    writable?:boolean

    selection?:Array<SelectionMapping>|Array<unknown>|Mapping<unknown>

    type?:TypeSpecification
    // endregion
    // region simple transformation
    default?:Type
    emptyEqualsNull?:boolean
    trim?:boolean
    // endregion
    // region representation
    // NOTE: Can als be defined via key in parent data structure.
    name?:string
    declaration?:string
    description?:string
    // endregion
    index?:boolean

    // NOTE: Actual name is usually specified via key parent data structure.
    oldName?:Array<string>|string

    value?:Type

    additionalSpecifications?:AdditionalSpecifications
}
export interface FileSpecification<
    Type extends Attachment = Attachment,
    AdditionalSpecifications extends object = object
> extends PropertySpecification<null|Type, AdditionalSpecifications> {
    fileName?:PropertySpecification<string, AdditionalSpecifications>
}
export interface BaseModel<
    AttachmentType extends Attachment = Attachment,
    AdditionalSpecifications extends object = object,
    AdditionalPropertiesType = unknown
> {
    _additional?:PropertySpecification<
        AdditionalPropertiesType, AdditionalSpecifications
    >

    _allowedRoles?:AllowedRoles

    _attachments?:(
        Mapping<FileSpecification<AttachmentType, AdditionalSpecifications>> |
        null
    )

    _constraintExecutions?:Array<Constraint>|Constraint
    _constraintExpressions?:Array<Constraint>|Constraint

    _createExecution?:string
    _createExpression?:string

    _extends?:Array<string>|string

    _maximumAggregatedSize?:number
    _minimumAggregatedSize?:number

    _oldType?:Array<string>|string

    _onUpdateExecution?:string
    _onUpdateExpression?:string

    _id:PropertySpecification<string, AdditionalSpecifications>
    _rev:PropertySpecification<string, AdditionalSpecifications>
}
export type Model<
    Type extends object|undefined = object,
    AttachmentType extends Attachment = Attachment,
    AdditionalSpecifications extends object = object,
    AdditionalPropertiesType = unknown
> =
    BaseModel<
        AttachmentType, AdditionalSpecifications, AdditionalPropertiesType
    > &
    {
        [Property in keyof Type]:PropertySpecification<
            Type[Property] extends Array<unknown> ?
                (
                    Type[Property][number] extends object|undefined ?
                        Array<Model<
                            Type[Property][number],
                            AttachmentType,
                            AdditionalSpecifications,
                            AdditionalPropertiesType
                        >> :
                        Type[Property]
                ) :
                Type[Property] extends object|undefined ?
                    (
                        Type[Property] extends Date|undefined ?
                            Type[Property] :
                            Model<
                                Type[Property],
                                AttachmentType,
                                AdditionalSpecifications,
                                AdditionalPropertiesType
                            >
                    ) :
                    Type[Property],
            AdditionalSpecifications
        >
    }
export type Models<
    Type extends object = object,
    AttachmentType extends Attachment = Attachment,
    AdditionalSpecifications extends object = object,
    AdditionalPropertiesType = unknown
> = Mapping<Model<
    Type, AttachmentType, AdditionalSpecifications, AdditionalPropertiesType
>>

export type UpdateStrategy = ''|'fillUp'|'incremental'|'migrate'

export type DocumentContent =
    Array<DocumentContent>|PlainObject|Primitive
export interface DocumentStrategyMeta {_updateStrategy?:UpdateStrategy}
export interface DocumentTypeMeta {'-type':string}
export type BaseDocument =
    ChangesMeta &
    DocumentGetMeta &
    DocumentIDMeta &
    DocumentRevisionIDMeta &
    DocumentStrategyMeta &
    DocumentTypeMeta &
    {_attachments?:Attachments}
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
    additional:'_additional'
    allowedRole:'_allowedRoles'
    attachment:'_attachments'
    conflict:'_conflicts'
    deleted:'_deleted'
    deletedConflict:'_deleted_conflict'
    extend:'_extends'
    id:'_id'
    revision:'_rev'
    revisions:'_revisions'
    revisionsInformation:'_revs_info'
    strategy:'_updateStrategy'
    type:'-type'

    constraint:{
        execution:'_constraintExecutions'
        expression:'_constraintExpressions'
    }
    create:{
        execution:'_createExecution'
        expression:'_createExecution'
    }

    designDocumentNamePrefix:string

    localSequence:'_local_seq'

    maximumAggregatedSize:'_maximumAggregatedSize'
    minimumAggregatedSize:'_minimumAggregatedSize'

    oldType:'_oldType'

    update:{
        execution:'_onUpdateExecution'
        expression:'_onUpdateExpression'
    }
}
export interface PropertyNameConfiguration {
    reserved:Array<string>
    special:SpecialPropertyNames
    typePattern:{
        private:string
        public:string
    }
    validatedDocumentsCache:string
}
export interface BaseModelConfiguration<
    Type, AdditionalSpecifications extends object
> {
    dateTimeFormat:'iso'|'iso8601'|'number'
    property:{
        defaultSpecification:PropertySpecification<
            Type, AdditionalSpecifications
        >
        name:PropertyNameConfiguration
    }
    updateStrategy:UpdateStrategy
}
export interface ModelConfiguration<
    Type extends object = object,
    AttachmentType extends Attachment = Attachment,
    AdditionalSpecifications extends object = object,
    AdditionalPropertiesType = unknown
> extends BaseModelConfiguration<Type, AdditionalSpecifications> {
    autoMigrationPath:string
    entities:Models<
        Type,
        AttachmentType,
        AdditionalSpecifications,
        AdditionalPropertiesType
    >
    triggerInitialCompaction:boolean
    updateConfiguration:boolean
    updateValidation:boolean
}
/// endregion
/// region web-node api
//// region configuration
export interface UserContext {
    db:string
    name?:string
    roles:Array<string>
}
export interface DatabaseUserConfiguration {
    names:Array<string>
    roles:Array<string>
}
export interface Runner {
    adminUserConfigurationPath:string
    arguments?:Array<string>|null|string
    binaryFilePath?:null|string
    configurationFile?:null|{
        content:string
        path:string
    }
    environment?:null|Mapping
    location:Array<string>|string
    name:Array<string>|string
}
export interface SecuritySettings {
    admins:DatabaseUserConfiguration
    members:DatabaseUserConfiguration

    _validatedDocuments?:Set<string>
}
export type AdvancedFetchOptions = RequestInit & {timeout?:number}
export type ConnectorConfiguration = DatabaseConnectorConfiguration & {
    // NOTE: "pouchdb`s" version supports timeout parameter.
    fetch?:AdvancedFetchOptions|null
}
export interface CoreConfiguration<
    Type extends object = Mapping<unknown>,
    AttachmentType extends Attachment = Attachment,
    AdditionalSpecifications extends object = object,
    AdditionalPropertiesType = unknown
> {
    attachAutoRestarter:boolean

    backend:{
        configuration:PlainObject
        prefixes:Array<string>
    }

    binary:{
        memoryInMegaByte:string
        nodePath:string
        runner:Array<Runner>
    }

    changesStream:ChangesStreamOptions
    connector:ConnectorConfiguration
    security:SecuritySettings

    createGenericFlatIndex:boolean
    databaseName:string
    debug:boolean

    ensureAdminPresence:boolean
    ensureSecuritySettingsPresence:boolean
    ensureUserPresence:boolean
    ignoreNoChangeError:boolean

    local:boolean

    maximumRepresentationLength:number
    maximumRepresentationTryLength:number

    model:ModelConfiguration<
        Type,
        AttachmentType,
        AdditionalSpecifications,
        AdditionalPropertiesType
    >

    path:string

    skipLatestRevisionDetermining:boolean

    url:string

    user:{
        name:string
        password:string
    }
}
export type Configuration<ConfigurationType = Mapping<unknown>> =
    BaseConfiguration<{couchdb:CoreConfiguration}> &
    ConfigurationType
//// endregion
export interface CouchDB<Type extends object = Mapping<unknown>> {
    changesStream:ChangesStream

    connection:Connection<Type>
    connector:Connector

    server:{
        process:ChildProcess

        reject:(value:ProcessCloseReason) => void
        resolve:(reason:ProcessCloseReason) => void

        restart:(state:State) => Promise<void>
        start:(services:Services, configuration:Configuration) =>
            Promise<void>
        stop:(services:Services, configuration:Configuration) =>
            Promise<void>

        runner:Runner
    }
}

export type ServicePromises<Type = Mapping<unknown>> =
    BaseServicePromises<{couchdb:Promise<ProcessCloseReason>}> & Type
export type Services<Type = Mapping<unknown>> =
    BaseServices<{couchdb:CouchDB}> & Type

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
     * Hook after each data change.
     * @param state - Application state.
     * @returns Promise resolving to nothing.
     */
    couchdbInitializeChangesStream?(state:State<ChangesStream>):Promise<void>
    /**
     * Hook after each database restart.
     * @param state - Application state.
     * @returns Promise resolving to nothing.
     */
    restartCouchdb?(state:State):Promise<void>
}
/// endregion
/// region evaluation
export interface EmptyEvaluationErrorData {
    empty:string
}
export interface EvaluationErrorData<S = Mapping<unknown>> {
    code:string
    error:unknown
    scope:S
}
export type EvaluationError = DatabaseError & EvaluationErrorData
export interface CompilationErrorData<
    S = Mapping<unknown>
> extends EvaluationErrorData<S> {
    compilation:string
}
export interface RuntimeErrorData<
    S = Mapping<unknown>
> extends EvaluationErrorData<S> {
    runtime:string
}
//// region scopes
export interface BasicScope<
    Type extends object,
    AttachmentType extends Attachment,
    AdditionalSpecifications extends object,
    AdditionalPropertiesType
> {
    attachmentWithPrefixExists:(namePrefix:string) => boolean
    checkDocument:(
        newDocument:PartialFullDocument<Type, AdditionalPropertiesType>,
        oldDocument:PartialFullDocument<Type, AdditionalPropertiesType>|null,
        parentNames:Array<string>
    ) => CheckedDocumentResult<Type, AdditionalPropertiesType>
    getFileNameByPrefix:(
        prefix?:string, attachments?:Mapping<AttachmentType>
    ) => null|string
    serialize:(value:unknown) => string

    id:string
    revision:string

    idName:string
    revisionName:string
    specialNames:SpecialPropertyNames
    typeName:string

    modelConfiguration:BaseModelConfiguration<Type, AdditionalSpecifications>
    models:Models<
        Type,
        AttachmentType,
        AdditionalSpecifications,
        AdditionalPropertiesType
    >

    now:Date
    nowUTCTimestamp:number

    securitySettings:Partial<SecuritySettings>

    userContext:Partial<UserContext>
}
export interface CommonScope<
    ObjectType extends object,
    Type,
    AttachmentType extends Attachment,
    AdditionalSpecifications extends object,
    AdditionalPropertiesType
> {
    checkPropertyContent:(
        newValue:Type,
        name:string,
        propertySpecification:PropertySpecification<
            Type, AdditionalSpecifications
        >,
        oldValue:Type
    ) => CheckedPropertyResult<Type>

    model:Model<
        ObjectType,
        AttachmentType,
        AdditionalSpecifications,
        AdditionalPropertiesType
    >
    modelName:string
    type:Array<string>|string

    newDocument:PartialFullDocument<ObjectType, AdditionalPropertiesType>
    oldDocument:(
        null|PartialFullDocument<ObjectType, AdditionalPropertiesType>
    )

    parentNames:Array<string>
    pathDescription:string
}
export interface PropertyScope<
    ObjectType extends object,
    Type,
    PropertyType,
    AttachmentType extends Attachment,
    AdditionalSpecifications extends object,
    AdditionalPropertiesType
> extends CommonScope<
    ObjectType,
    PropertyType,
    AttachmentType,
    AdditionalSpecifications,
    AdditionalPropertiesType
> {
    name:string

    newValue:Type
    oldValue?:Type

    propertySpecification:PropertySpecification<
        Type, AdditionalSpecifications
    >,

    attachmentsTarget?:Mapping<AttachmentType>
}
//// endregion
export interface EvaluationResult<
    ObjectType extends object,
    Type,
    PropertyType,
    AttachmentType extends Attachment,
    AdditionalSpecifications extends object,
    AdditionalPropertiesType,
    Scope = (
        BasicScope<
            ObjectType,
            AttachmentType,
            AdditionalSpecifications,
            AdditionalPropertiesType
        > &
        CommonScope<
            ObjectType,
            PropertyType,
            AttachmentType,
            AdditionalSpecifications,
            AdditionalPropertiesType
        >
    )
> {
    code:string
    result:Type
    scope:Scope
}
export type Evaluate<R, P extends Array<unknown>> = (...parameters:P) => R
/// endregion
/// region checker results
export interface CheckedResult {
    changedPath:Array<string>
}
export interface CheckedPropertyResult<Type> extends CheckedResult {
    /*
     NOTE: "undefined" means no changes regarding existing data and null
    */
    newValue?:null|Type
}
export interface CheckedDocumentResult<
    ObjectType extends object, AdditionalPropertiesType
> extends CheckedResult {
    newDocument:PartialFullDocument<ObjectType, AdditionalPropertiesType>
}
/// endregion
export type Migrator<
    Type extends object = object,
    AttachmentType extends Attachment = Attachment,
    AdditionalSpecifications extends object = object,
    AdditionalPropertiesType = unknown
> = (
    document:Document,
    scope:(
        typeof UTILITY_SCOPE &
        {
            configuration:Configuration

            databaseHelper:DatabaseHelper

            idName:string
            typeName:string

            migrators:Mapping<Migrator<
                Type,
                AttachmentType,
                AdditionalSpecifications,
                AdditionalPropertiesType
            >>
            models:Models<
                Type,
                AttachmentType,
                AdditionalSpecifications,
                AdditionalPropertiesType
            >
            modelConfiguration:ModelConfiguration<
                Type,
                AttachmentType,
                AdditionalSpecifications,
                AdditionalPropertiesType
            >

            selfFilePath:string

            services:Services
        }
    )
) => Document|null

export type DateRepresentationType = Date|null|number|string
/// region pre-defined models
export type User = BaseDocument & {
    password:string
    roles:Array<string>
}
export interface Interval {
    end:number
    start:number
}
export interface Location {
    latitude:number
    longitude:number
}
/// endregion
// endregion
