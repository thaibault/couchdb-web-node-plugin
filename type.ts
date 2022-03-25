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
    Mapping, PlainObject, Primitive, ProcessCloseReason
} from 'clientnode/type'
import PouchDB from 'pouchdb'
import {PluginAPI} from 'web-node'
import {
    Configuration as BaseConfiguration,
    Plugin,
    PluginHandler as BasePluginHandler,
    Service as BaseService,
    ServicePromises as BaseServicePromises,
    Services as BaseServices
} from 'web-node/type'
// endregion
// region exports
/// region database implementation
export type Attachments = PouchDB.Core.Attachments
export type FullAttachment = PouchDB.Core.FullAttachment
export type StubAttachment = PouchDB.Core.StubAttachment

export type ChangesMeta = PouchDB.Core.ChangesMeta
export type ChangesResponseChange<Type = any> =
    PouchDB.Core.ChangesResponseChange<Type>
export type ChangesStream<Type = any> = PouchDB.Core.Changes<Type>
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

export type DatabasePlugin = any
/// endregion
/// region model
// Represents a properties read and write roles.
export type AllowedRoles = (
    Array<string> |
    string |
    {
        read:Array<string>|string
        write:Array<string>|string
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
export type Model =
    Mapping<PropertySpecification> &
    {
        _allowedRoles?:AllowedRoles|null
        _attachments?:null|Mapping<FileSpecification>
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

export interface SpecialPropertyNames {
    additional:'_additional'
    allowedRoles:'_allowedRoles'
    attachment:'_attachments'
    conflict:'_conflicts'
    deleted:'_deleted'
    deletedConflict:'_deleted_conflict'
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

    extend:string

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
    environment?:null|PlainObject
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
export interface Service extends BaseService {
    name:'couchdb'
    promise:null|Promise<ProcessCloseReason>
}
export type ServicePromises<ServicePromiseType = Mapping<unknown>> =
    BaseServicePromises<{couchdb:Promise<ProcessCloseReason>}> &
    ServicePromiseType
export type Services<ServiceType = Mapping<unknown>> =
    BaseServices<{
        couchdb:{
            connection:Connection
            connector:Connector
            server:{
                process:ChildProcess
                reject:Function
                resolve:Function
                restart:(
                    _services:Services,
                    _configuration:Configuration,
                    _plugins:Array<Plugin>,
                    _pluginAPI:typeof PluginAPI
                ) => Promise<void>
                runner:Runner
                start:(_services:Services, _configuration:Configuration) =>
                    Promise<void>
                stop:(_services:Services, _configuration:Configuration) =>
                    Promise<void>
            }
        }
    }> &
    ServiceType

export interface PluginHandler extends BasePluginHandler {
    /**
     * Hook after each data change.
     * @param _changesStream - Stream of database changes.
     * @param _services - List of other web-node plugin services.
     * @param _configuration - Configuration object extended by each plugin
     * specific configuration.
     * @param _plugins - Topological sorted list of plugins.
     * @param _pluginAPI - Plugin api reference.
     *
     * @returns Given entry files.
     */
    couchdbInitializeChangesStream?(
        _changesStream:ChangesStream,
        _services:Services,
        _configuration:Configuration,
        _plugins:Array<Plugin>,
        _pluginAPI:typeof PluginAPI
    ):ChangesStream
    /**
     * Hook after each data base restart.
     * @param _services - List of other web-node plugin services.
     * @param _configuration - Configuration object extended by each plugin
     * specific configuration.
     * @param _plugins - Topological sorted list of plugins.
     * @param _pluginAPI - Plugin api reference.
     *
     * @returns Given entry files.
     */
    restartCouchdb?(
        _services:Services,
        _configuration:Configuration,
        _plugins:Array<Plugin>,
        _pluginAPI:typeof PluginAPI
    ):Services
}
/// endregion
export type Exception<DataType = Mapping<unknown>> =
    {
        message:string
        name:string
    } &
    DataType

export interface EmptyEvaluationExceptionData {empty:string}
export type EmptyEvaluationException = Exception<EmptyEvaluationExceptionData>

export interface EvaluationExceptionData {
    code:string, error:Error, scope:Mapping<unknown>
}
export type CompilationExceptionData =
    EvaluationExceptionData & {compilation:string}
export type RuntimeExceptionData =
    EvaluationExceptionData & {runtime:string}

export type EvaluationException = Exception<EvaluationExceptionData>

export interface CheckedDocumentResult {
    changedPath:Array<string>
    newDocument:FullDocument
}

export interface EvaluationResult<Type = any> {
    code:string
    result:Type
    scope:object
}

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
// endregion
// region vim modline
// vim: set tabstop=4 shiftwidth=4 expandtab:
// vim: foldmethod=marker foldmarker=region,endregion:
// endregion
