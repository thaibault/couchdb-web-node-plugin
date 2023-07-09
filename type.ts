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
import Tools from 'clientnode'
import {
    AnyFunction, Mapping, PlainObject, Primitive, ProcessCloseReason
} from 'clientnode/type'
import PouchDB from 'pouchdb-node'
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
export type Attachment = PouchDB.Core.Attachment
export type Attachments = PouchDB.Core.Attachments
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
    description?:null|string
    evaluation:string
}
export type PrimitiveType = 'boolean'|'integer'|'number'|'string'|'DateTime'
export type Type = 'any'|PrimitiveType|string
export type TypeSpecification = Array<Type>|Type
export const PrimitiveTypes = [
    'boolean',
    'DateTime',
    'integer',
    'number',
    'string'
] as const

export type ConstraintKey =
    'arrayConstraintExecution'|'arrayConstraintExpression'|
    'conflictingConstraintExecution'|'conflictingConstraintExpression'|
    'constraintExecution'|'constraintExpression'
export interface SelectionMapping {
    label:string
    value:unknown
}
export interface PropertySpecification<
    Type = unknown, AdditionalSpecifications extends object = Mapping<unknown>
> {
    allowedRoles?:AllowedRoles|null
    computed?:boolean
    // region expression
    arrayConstraintExecution?:Constraint|null
    arrayConstraintExpression?:Constraint|null

    conflictingConstraintExecution?:Constraint|null
    conflictingConstraintExpression?:Constraint|null

    constraintExecution?:Constraint|null
    constraintExpression?:Constraint|null

    onCreateExecution?:null|string
    onCreateExpression?:null|string
    onUpdateExecution?:null|string
    onUpdateExpression?:null|string
    // endregion
    // region validation
    regularExpressionPattern?:null|RegExp|string
    invertedRegularExpressionPattern?:null|RegExp|string

    contentTypeRegularExpressionPattern?:null|string
    invertedContentTypeRegularExpressionPattern?:null|string

    maximum?:null|number
    minimum?:null|number

    maximumAggregatedSize?:null|number
    minimumAggregatedSize?:null|number

    maximumLength?:null|number
    minimumLength?:null|number

    maximumNumber?:null|number
    minimumNumber?:null|number

    maximumSize?:null|number
    minimumSize?:null|number

    mutable?:boolean|null
    nullable?:boolean|null
    writable?:boolean|null

    selection?:Array<unknown>|Array<SelectionMapping>|Mapping<unknown>|null

    type?:TypeSpecification|null
    // endregion
    // region simple transformation
    default?:unknown
    emptyEqualsToNull?:boolean|null
    trim?:boolean|null
    // endregion
    // region representation
    // NOTE: Can als be defined via key in parent data structure.
    name?:string
    declaration?:string
    description?:string
    // endregion
    index?:boolean|null

    // NOTE: Actual name is usually specified via key parent data structure.
    oldName?:Array<string>|null|string

    value?:null|Type

    additionalSpecifications?:AdditionalSpecifications
}
export interface FileSpecification<
    Type = Attachment,
    AdditionalSpecifications extends object = Mapping<unknown>
> extends PropertySpecification<Type, AdditionalSpecifications> {
    fileName?:PropertySpecification<string, AdditionalSpecifications>
}
export interface BaseModel<
    AttachmentType = Attachment,
    AdditionalSpecifications extends object = Mapping<unknown>,
    AdditionalPropertiesType = unknown
> {
    _additional?:PropertySpecification<AdditionalPropertiesType>

    _allowedRoles?:AllowedRoles|null

    _attachments?:(
        Mapping<FileSpecification<AttachmentType, AdditionalSpecifications>> |
        null
    )

    _constraintExecutions?:Array<Constraint>|Constraint|null
    _constraintExpressions?:Array<Constraint>|Constraint|null

    _createExecution?:null|string
    _createExpression?:null|string

    _extends?:Array<string>|null|string

    _maximumAggregatedSize?:null|number
    _minimumAggregatedSize?:null|number

    _oldType?:Array<string>|null|string

    _onUpdateExecution?:null|string
    _onUpdateExpression?:null|string

    _id:PropertySpecification<string>
}
export type Model<
    Type extends object = object,
    AttachmentType = Attachment,
    AdditionalSpecifications extends object = Mapping<unknown>,
    AdditionalPropertiesType = unknown
> =
    BaseModel<
        AttachmentType, AdditionalSpecifications, AdditionalPropertiesType
    > &
    {
        [Property in keyof Type]:PropertySpecification<
            Type[Property], AdditionalSpecifications
        >
    }
export type Models<
    Type extends object = object,
    AttachmentType = Attachment,
    AdditionalSpecifications extends object = Mapping<unknown>,
    AdditionalPropertiesType = unknown
> = Mapping<Model<
    Type, AttachmentType, AdditionalSpecifications, AdditionalPropertiesType
>>

export type UpdateStrategy = ''|'fillUp'|'incremental'|'migrate'

export type DocumentContent =
    Array<DocumentContent>|PlainObject|Primitive
export type DocumentStrategyMeta = {_updateStrategy?:UpdateStrategy}
export type DocumentTypeMeta = {'-type':string}
export type BaseDocument =
    ChangesMeta &
    DocumentGetMeta &
    DocumentIDMeta &
    DocumentRevisionIDMeta &
    DocumentStrategyMeta &
    DocumentTypeMeta
export type FullDocument<Type extends object = Mapping<unknown>> =
    BaseDocument & Document<Type>
export type PartialFullDocument<Type extends object = Mapping<unknown>> =
    Partial<BaseDocument> & Partial<Document<Type>>

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
    typeRegularExpressionPattern:{
        private:string
        public:string
    }
    validatedDocumentsCache:string
}
export interface BaseModelConfiguration<
    Type = unknown, AdditionalSpecifications extends object = Mapping<unknown>
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
    AttachmentType = Attachment,
    AdditionalSpecifications extends object = Mapping<unknown>
> extends BaseModelConfiguration<Type, AdditionalSpecifications> {
    autoMigrationPath:string
    entities:Models<Type, AttachmentType, AdditionalSpecifications>
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
    Type extends object = object,
    AttachmentType = Attachment,
    AdditionalSpecifications extends object = Mapping<unknown>
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
    model:ModelConfiguration<Type, AttachmentType, AdditionalSpecifications>
    path:string
    security:SecuritySettings
    skipIDDetermining:boolean
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
     *
     * @returns Promise resolving to nothing.
     */
    couchdbInitializeChangesStream?(state:State<ChangesStream>):Promise<void>
    /**
     * Hook after each data base restart.
     * @param state - Application state.
     *
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
    Type extends object = object,
    AttachmentType = Attachment,
    AdditionalSpecifications extends object = Mapping<unknown>
> {
    attachmentWithPrefixExists:(namePrefix:string) => boolean
    checkDocument:(
        newDocument:PartialFullDocument<Type>,
        oldDocument:PartialFullDocument<Type>|null,
        parentNames:Array<string>
    ) => CheckedDocumentResult<Type>
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
    models:Models<Type, AttachmentType, AdditionalSpecifications>

    now:Date
    nowUTCTimestamp:number

    securitySettings:Partial<SecuritySettings>

    userContext:Partial<UserContext>
}
export interface CommonScope<
    ObjectType extends object = object,
    Type = unknown,
    AttachmentType = Attachment,
    AdditionalSpecifications extends object = Mapping<unknown>
> {
    checkPropertyContent:(
        newValue:Type,
        name:string,
        propertySpecification:PropertySpecification<
            Type, AdditionalSpecifications
        >,
        oldValue:Type
    ) => CheckedPropertyResult

    model:Model<ObjectType, AttachmentType, AdditionalSpecifications>
    modelName:string
    type:Array<string>|string

    newDocument:Attachments|PartialFullDocument
    oldDocument:Attachments|null|PartialFullDocument

    parentNames:Array<string>
    pathDescription:string
}
export interface PropertyScope<
    ObjectType extends object = object,
    Type = unknown,
    AttachmentType = Attachment,
    AdditionalSpecifications extends object = Mapping<unknown>
> extends CommonScope<
    ObjectType, Type, AttachmentType, AdditionalSpecifications
> {
    name:string

    newValue:Type
    oldValue?:Type

    propertySpecification:PropertySpecification<Type, AdditionalSpecifications>
}
//// endregion
export interface EvaluationResult<
    ObjectType extends object = object,
    Type = unknown,
    Scope = BasicScope<ObjectType> & CommonScope<ObjectType, Type>
> {
    code:string
    result:Type
    scope:Scope
}
export type Evaluate<R = unknown, P = unknown> = (...parameters:Array<P>) => R
/// endregion
/// region checker results
export interface CheckedResult {
    changedPath:Array<string>
}
export interface CheckedPropertyResult extends CheckedResult {
    newValue:unknown
}
export interface CheckedDocumentResult<
    ObjectType extends object
> extends CheckedResult {
    newDocument:PartialFullDocument<ObjectType>
}
/// endregion
export type Migrator<
    Type extends object = object,
    AttachmentType = Attachment,
    AdditionalSpecifications extends object = Mapping<unknown>
> = (
    document:Document,
    scope:{
        configuration:Configuration

        databaseHelper:DatabaseHelper
        Tools:typeof Tools

        idName:string
        typeName:string

        migrater:Mapping<Migrator<Type>>
        models:Models<Type, AttachmentType, AdditionalSpecifications>
        modelConfiguration:ModelConfiguration<
            Type, Attachment, AdditionalSpecifications
        >

        selfFilePath:string

        services:Services
    }
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
// region vim modline
// vim: set tabstop=4 shiftwidth=4 expandtab:
// vim: foldmethod=marker foldmarker=region,endregion:
// endregion
