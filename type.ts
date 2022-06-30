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
import PouchDB from 'pouchdb'
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
export type Attachments = PouchDB.Core.Attachments
export type FullAttachment = PouchDB.Core.FullAttachment
export type StubAttachment = PouchDB.Core.StubAttachment

export type ChangesMeta = PouchDB.Core.ChangesMeta
export type ChangesResponseChange<Type = unknown> =
    PouchDB.Core.ChangesResponseChange<Type>
export type ChangesStream<Type = unknown> = PouchDB.Core.Changes<Type>
export type ChangesStreamOptions = PouchDB.Core.ChangesOptions

export type Connection = PouchDB.Database
export type Connector = PouchDB.Static
export type DatabaseConnectorConfiguration =
    PouchDB.Configuration.RemoteDatabaseConfiguration

export type DatabaseError = PouchDB.Core.Error
export type DatabaseFetch = PouchDB.Core.Options['fetch']
export type DatabaseResponse = PouchDB.Core.Response

export type DeleteIndexOptions = PouchDB.Find.DeleteIndexOptions

export type Document<Type = PlainObject> = PouchDB.Core.Document<Type>
export type ExistingDocument<Type = PlainObject> =
    PouchDB.Core.ExistingDocument<Type>
export type DocumentGetMeta = PouchDB.Core.GetMeta
export type DocumentIDMeta = PouchDB.Core.IdMeta
export type DocumentRevisionIDMeta = PouchDB.Core.RevisionIdMeta

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
export type Type = string|'any'|'boolean'|'integer'|'number'|'string'|'DateTime'
export type TypeSpecification = Array<Type>|Type

export type ConstraintKey =
    'arrayConstraintExecution'|'arrayConstraintExpression'|
    'conflictingConstraintExecution'|'conflictingConstraintExpression'|
    'constraintExecution'|'constraintExpression'
export interface SelectionMapping {
    label:string
    value:unknown
}
export interface PropertySpecification {
    allowedRoles?:AllowedRoles|null
    arrayConstraintExecution?:Constraint|null
    arrayConstraintExpression?:Constraint|null
    conflictingConstraintExecution?:Constraint|null
    conflictingConstraintExpression?:Constraint|null
    constraintExecution?:Constraint|null
    constraintExpression?:Constraint|null
    contentTypeRegularExpressionPattern?:null|string
    default?:unknown
    emptyEqualsToNull?:boolean|null
    index?:boolean|null
    invertedContentTypeRegularExpressionPattern?:null|string
    invertedRegularExpressionPattern?:null|string
    maximum?:null|number
    maximumAggregatedSize?:null|number
    maximumLength?:null|number
    maximumNumber?:null|number
    maximumSize?:null|number
    minimum?:null|number
    minimumAggregatedSize?:null|number
    minimumLength?:null|number
    minimumNumber?:null|number
    minimumSize?:null|number
    mutable?:boolean|null
    nullable?:boolean|null
    onCreateExecution?:null|string
    onCreateExpression?:null|string
    oldName?:Array<string>|null|string
    onUpdateExecution?:null|string
    onUpdateExpression?:null|string
    regularExpressionPattern?:null|string
    selection?:Array<unknown>|Array<SelectionMapping>|Mapping<unknown>|null
    trim?:boolean|null
    type?:TypeSpecification|null
    value?:unknown
    writable?:boolean|null
}
export interface FileSpecification extends PropertySpecification {
    fileName?:PropertySpecification
}
export interface BaseModel {
    _allowedRoles?:AllowedRoles|null
    _attachments?:Mapping<FileSpecification>|null
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
}
export type Model = BaseModel & Mapping<PropertySpecification>
export type Models = Mapping<Model>

export const PrimitiveTypes = [
    'boolean',
    'DateTime',
    'integer',
    'number',
    'string'
] as const

export type UpdateStrategy = ''|'fillUp'|'incremental'|'migrate'

export type DocumentContent =
    Array<DocumentContent>|PlainObject<Primitive>|Primitive
export type DocumentStrategyMeta = {_updateStrategy?:UpdateStrategy}
export type DocumentTypeMeta = {'-type':string}
export type BaseDocument =
    ChangesMeta &
    DocumentGetMeta &
    DocumentIDMeta &
    DocumentRevisionIDMeta &
    DocumentStrategyMeta &
    DocumentTypeMeta
export type FullDocument = BaseDocument & PlainObject
export type PartialFullDocument = Partial<BaseDocument> & PlainObject

export interface SpecialPropertyNames {
    additional:'_additional'
    allowedRoles:'_allowedRoles'
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
    type:keyof DocumentTypeMeta

    constraint:{
        execution:string
        expression:string
    }
    create:{
        execution:string
        expression:string
    }

    designDocumentNamePrefix:string

    localSequence:string

    maximumAggregatedSize:string
    minimumAggregatedSize:string

    oldType:string

    update:{
        execution:string
        expression:string
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
export interface BaseModelConfiguration {
    dateTimeFormat:'iso'|'iso8601'|'number'
    property:{
        defaultSpecification:PropertySpecification
        name:PropertyNameConfiguration
    }
    updateStrategy:UpdateStrategy
}
export interface ModelConfiguration extends BaseModelConfiguration {
    autoMigrationPath:string
    entities:Models
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
export type ConnectorConfiguration = DatabaseConnectorConfiguration & {
    // NOTE: "pouchdbs" version supports timeout parameter.
    fetch?:(RequestInit & {timeout:number})|null
}
export type Configuration<ConfigurationType = Mapping<unknown>> =
    BaseConfiguration<{
        couchdb:{
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
            model:ModelConfiguration
            path:string
            security:SecuritySettings
            url:string
            user:{
                name:string
                password:string
            }
        }
    }> &
    ConfigurationType
//// endregion
export interface CouchDB {
    changesStream:ChangesStream

    connection:Connection
    connector:Connector

    server:{
        process:ChildProcess
        reject:(value:ProcessCloseReason) => void
        resolve:(reason:ProcessCloseReason) => void
        restart:(state:State) => Promise<void>
        runner:Runner
        start:(services:Services, configuration:Configuration) =>
            Promise<void>
        stop:(services:Services, configuration:Configuration) =>
            Promise<void>
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
export interface EmptyEvaluationExceptionData {empty:string}
export type EmptyEvaluationException = Exception<EmptyEvaluationExceptionData>

export interface EvaluationExceptionData<S = Mapping<unknown>> {
    code:string, error:Error, scope:S
}
export interface CompilationExceptionData<S = Mapping<unknown>> extends
    EvaluationExceptionData<S>
{
    compilation:string
}
export interface RuntimeExceptionData<S = Mapping<unknown>> extends
    EvaluationExceptionData<S>
{
    runtime:string
}
export type EvaluationException<S = Mapping<unknown>> =
    Exception<EvaluationExceptionData<S>>
//// region scopes
export interface BasicScope {
    attachmentWithPrefixExists:(namePrefix:string) => boolean
    checkDocument:(
        newDocument:PartialFullDocument,
        oldDocument:PartialFullDocument|null,
        parentNames:Array<string>
    ) => CheckedDocumentResult
    getFileNameByPrefix:(prefix?:string, attachments?:Attachments) =>
        null|string
    serialize:(value:unknown) => string

    id:string
    revision:string

    idName:string
    revisionName:string
    specialNames:SpecialPropertyNames
    typeName:string

    modelConfiguration:BaseModelConfiguration
    models:Models

    now:Date
    nowUTCTimestamp:number

    securitySettings:Partial<SecuritySettings>

    userContext:Partial<UserContext>
}
export interface CommonScope {
    checkPropertyContent:(
        newValue:unknown,
        name:string,
        propertySpecification:PropertySpecification,
        oldValue:unknown
    ) => CheckedPropertyResult

    model:Model
    modelName:string
    type:string

    newDocument:Attachments|PartialFullDocument
    oldDocument:Attachments|null|PartialFullDocument

    parentNames:Array<string>
    pathDescription:string
}
export interface PropertyScope extends CommonScope {
    name:string

    newValue:unknown
    oldValue:unknown

    propertySpecification:PropertySpecification
}
//// endregion
export interface EvaluationResult<T = unknown, S = BasicScope & CommonScope> {
    code:string
    result:T
    scope:S
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
export interface CheckedDocumentResult extends CheckedResult {
    newDocument:PartialFullDocument
}
/// endregion
export type Exception<DataType = Mapping<unknown>> =
    {
        message:string
        name:string
    } &
    DataType

export type Migrator = (
    document:Document,
    scope:{
        configuration:Configuration

        databaseHelper:DatabaseHelper
        tools:typeof Tools

        idName:string
        typeName:string

        migrater:Mapping<Migrator>
        models:Models
        modelConfiguration:ModelConfiguration

        selfFilePath:string

        services:Services
    }
) => Document|null

export type DateRepresentationType = Date|null|number|string
/// region models
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
