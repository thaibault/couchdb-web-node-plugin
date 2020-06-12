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
import {ChildProcess} from 'child_process'
import {Mapping, PlainObject, ProcessCloseReason} from 'clientnode/type'
import PouchDB from 'pouchdb'
import {
    Configuration as BaseConfiguration,
    Plugin,
    PluginHandler as BasePluginHandler,
    Service as BaseService,
    Services as BaseServices
} from 'web-node/type'
// endregion
// region exports
// / region database implementation
export type Attachments = PouchDB.Core.Attachments
export type ChangesStream<Type=any> = PouchDB.Core.Changes<Type>
export type ChangesStreamOptions = PouchDB.Core.ChangesOptions
export type Connection = PouchDB.Database
export type Connector = PouchDB.Static
export type ConnectorConfiguration =
    PouchDB.Configuration.RemoteDatabaseConfiguration
export type DatabaseError = PouchDB.Core.Error
export type DatabaseResponse = PouchDB.Core.Response
export type FullAttachment = PouchDB.Core.FullAttachment
export type IDMeta = PouchDB.Core.IdMeta
export type RevisionIDMeta = PouchDB.Core.RevisionIdMeta
export type Index = PouchDB.Find.Index
export type RevisionIdMeta = PouchDB.Core.RevisionIdMeta
export type StubAttachment = PouchDB.Core.StubAttachment
// / endregion
// / region model
export type AllowedRoles = Array<string>|string|{
    read:Array<string>|string;
    write:Array<string>|string;
}
// Recursive mapping from operations to their allowed roles.
export type NormalizedAllowedRoles = {
    properties?:AllowedModelRolesMapping;
    read?:Array<string>|string;
    write?:Array<string>|string;
}
/*
    Maps an artefact (usually type or property) to corresponding operations
    mapped to their allowed roles.
*/
export type AllowedModelRolesMapping = Mapping<NormalizedAllowedRoles>
export type Constraint = {
    description?:string;
    evaluation:string;
}
export type Type = string|'any'|'boolean'|'integer'|'number'|'string'|'DateTime'
export type TypeSpecification = Array<Type>|Type
export type PropertySpecification = {
    allowedRoles?:AllowedRoles|null;
    arrayConstraintExecution?:Constraint|null;
    arrayConstraintExpression?:Constraint|null;
    conflictingConstraintExecution?:Constraint|null;
    conflictingConstraintExpression?:Constraint|null;
    constraintExecution?:Constraint|null;
    constraintExpression?:Constraint|null;
    contentTypeRegularExpressionPattern?:null|string;
    default?:any;
    emptyEqualsToNull?:boolean|null;
    index?:boolean|null;
    invertedContentTypeRegularExpressionPattern?:null|string;
    invertedRegularExpressionPattern?:null|string;
    maximum?:null|number;
    maximumAggregatedSize?:null|number;
    maximumLength?:null|number;
    maximumNumber?:null|number;
    maximumSize?:null|number;
    minimum?:null|number;
    minimumAggregatedSize?:null|number;
    minimumLength?:null|number;
    minimumNumber?:null|number;
    minimumSize?:null|number;
    mutable?:boolean|null;
    nullable?:boolean|null;
    onCreateExecution?:null|string;
    onCreateExpression?:null|string;
    oldName?:Array<string>|null|string;
    onUpdateExecution?:null|string;
    onUpdateExpression?:null|string;
    regularExpressionPattern?:null|string;
    selection?:Array<any>|null;
    trim?:boolean|null;
    type?:TypeSpecification|null;
    writable?:boolean|null;
}
export type Model = Mapping<PropertySpecification> & {
    _allowedRoles?:AllowedRoles|null;
    _constraintExecutions?:Array<Constraint>|Constraint|null;
    _constraintExpressions?:Array<Constraint>|Constraint|null;
    _createExecution?:null|string;
    _createExpression?:null|string;
    _extends?:Array<string>|null|string;
    _maximumAggregatedSize?:null|number;
    _minimumAggregatedSize?:null|number;
    _oldType?:Array<string>|null|string;
    _onUpdateExecution?:null|string;
    _onUpdateExpression?:null|string;
}
export type Models = Mapping<Model>
export type Document = IDMeta & PlainObject & RevisionIDMeta
export type UpdateStrategy = ''|'fillUp'|'incremental'|'migrate'
export type SpecialPropertyNames = {
    additional:string;
    allowedRole:string;
    attachment:string;
    conflict:string;
    constraint:{
        execution:string;
        expression:string;
    };
    create:{
        execution:string;
        expression:string;
    };
    deleted:string;
    deletedConflict:string;
    designDocumentNamePrefix:string;
    extend:string;
    id:string;
    localSequence:string;
    maximumAggregatedSize:string;
    minimumAggregatedSize:string;
    oldType:string;
    revision:string;
    revisions:string;
    revisionsInformation:string;
    strategy:UpdateStrategy;
    type:string;
    update:{
        execution:string;
        expression:string;
    };
}
export type PropertyNameConfiguration = {
    reserved:Array<string>;
    special:SpecialPropertyNames;
    typeRegularExpressionPattern:{
        private:string;
        public:string;
    };
    validatedDocumentsCache:string;
}
export type BaseModelConfiguration = {
    property:{
        defaultSpecification:PropertySpecification;
        name:PropertyNameConfiguration;
    };
    updateStrategy:UpdateStrategy;
}
export type ModelConfiguration = BaseModelConfiguration & {
    autoMigrationPath:string;
    entities:Models;
    triggerInitialCompaction:boolean;
    updateConfiguration:boolean;
    updateValidation:boolean;
}
// / endregion
// / region configuration
export type UserContext = {
    db:string;
    name?:string;
    roles:Array<string>;
}
export type DatabaseUserConfiguration = {
    names:Array<string>;
    roles:Array<string>;
}
export type Runner = {
    adminUserConfigurationPath:string;
    arguments?:Array<string>|null|string;
    binaryFilePath?:null|string;
    configurationFile?:null|{
        content:string;
        path:string;
    };
    environment?:null|PlainObject;
    location:Array<string>|string;
    name:Array<string>|string;
}
export type SecuritySettings = {
    admins:DatabaseUserConfiguration;
    members:DatabaseUserConfiguration;
    _validatedDocuments?:Set<string>;
}
export type Configuration = BaseConfiguration & {
    database:{
        attachAutoRestarter:boolean;
        backend:{
            configuration:PlainObject;
            prefixes:Array<string>;
        };
        binary:{
            memoryInMegaByte:string;
            nodePath:string;
            runner:Array<Runner>;
        };
        changesStream:ChangesStreamOptions;
        connector:ConnectorConfiguration;
        createGenericFlatIndex:boolean;
        debug:boolean;
        ensureAdminPresence:boolean;
        ensureSecuritySettingsPresence:boolean;
        ensureUserPresence:boolean;
        ignoreNoChangeError:boolean;
        local:boolean;
        maximumRepresentationLength:number;
        maximumRepresentationTryLength:number;
        model:ModelConfiguration;
        path:string;
        security:SecuritySettings;
        url:string;
        user:{
            name:string;
            password:string;
        }
    }
}
// / endregion
export type CheckedDocumentResult = {
    changedPath:Array<string>;
    newDocument:Document;
}
export type EvaluationResult<Type = any> = {
    code:string;
    result:Type;
    scope:object;
}
export type Service = BaseService & {
    name:'database';
    promise:null|Promise<ProcessCloseReason>;
}
export type Services = BaseServices & {
    database:{
        connection:Connection;
        connector:Connector;
        server:{
            process:ChildProcess;
            reject:Function;
            resolve:Function;
            restart:(
                services:Services,
                configuration:Configuration,
                plugins:Array<Plugin>
            ) => Promise<void>;
            runner:Runner;
            start:(services:Services, configuration:Configuration) =>
                Promise<void>;
            stop:(services:Services, configuration:Configuration) =>
                Promise<void>;
        };
    }
}
export interface PluginHandler extends BasePluginHandler {
    /**
     * Hook after each data change.
     * @param changesStream - Stream of database changes.
     * @param services - List of other web-node plugin services.
     * @param configuration - Configuration object extended by each plugin
     * specific configuration.
     * @param plugins - Topological sorted list of plugins.
     * @returns Given entry files.
     */
    databaseInitializeChangesStream?(
        changesStream:ChangesStream,
        services:Services,
        configuration:Configuration,
        plugins:Array<Plugin>
    ):ChangesStream
    /**
     * Hook after each data base restart.
     * @param services - List of other web-node plugin services.
     * @param configuration - Configuration object extended by each plugin
     * specific configuration.
     * @param plugins - Topological sorted list of plugins.
     * @returns Given entry files.
     */
    restartDatabase?(
        services:Services, configuration:Configuration, plugins:Array<Plugin>
    ):Services
}
// endregion
// region vim modline
// vim: set tabstop=4 shiftwidth=4 expandtab:
// vim: foldmethod=marker foldmarker=region,endregion:
// endregion
