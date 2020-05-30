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
import {Mapping, PlainObject} from 'clientnode/type'
import {
    Configuration as BaseConfiguration,
    Plugin,
    PluginHandler as BasePluginHandler,
    Services as BaseServices
} from 'web-node/type'
// endregion
// region exports
// / region model
export type AllowedRoles = Array<string>|string|{
    read:string|Array<string>;
    write:string|Array<string>;
}
export type NormalizedAllowedRoles = {
    read:Array<string>;
    write:Array<string>;
    properties?:AllowedModelRolesMapping;
}
export type AllowedModelRolesMapping = Mapping<NormalizedAllowedRoles>
export type Constraint = {
    description?:string;
    evaluation:string;
}
export type Type = Array<Type>|string|'any'|'boolean'|'integer'|'number'|'string'|'DateTime'
export type PropertySpecification = {
    allowedRoles?:AllowedRoles;
    conflictingConstraintExecution?:Constraint;
    conflictingConstraintExpression?:Constraint;
    constraintExecution?:Constraint;
    constraintExpression?:Constraint;
    contentTypeRegularExpressionPattern?:string;
    default?:any;
    emptyEqualsToNull?:boolean;
    index?:boolean;
    invertedContentTypeRegularExpressionPattern?:string;
    invertedRegularExpressionPattern?:string;
    maximum?:number;
    minimum?:number;
    maximumLength?:number;
    minimumLength?:number;
    maximumNumber?:number;
    minimumNumber?:number;
    maximumSize?:number;
    minimumSize?:number;
    mutable?:boolean;
    nullable?:boolean;
    onCreateExecution?:string;
    onCreateExpression?:string;
    oldName?:string|Array<string>;
    onUpdateExecution?:string;
    onUpdateExpression?:string;
    regularExpressionPattern?:string;
    selection?:Array<any>;
    trim?:boolean;
    type?:Type;
    writable?:boolean;
}
export type Model = Mapping<PropertySpecification> & {
    _allowedRoles?:AllowedRoles;
    _extends?:Array<string>;
    _constraintExpressions?:Array<Constraint>;
    _constraintExecutions?:Array<Constraint>;
    _createExpression?:string;
    _createExecution?:string;
    _maximumAggregatedSize?:number;
    _minimumAggregatedSize?:number;
    _oldType?:string|Array<string>;
    _onUpdateExecution?:string;
    _onUpdateExpression?:string;
}
export type Models = {[key:string]:Model}
export type Document = Mapping<any> && {
    _id:string;
    _rev:string;
}
export type RetrievedDocument = {
    id:string;
    doc:Document;
}
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
export type ModelConfiguration = {
    entities:Models;
    property:{
        defaultSpecification:PropertySpecification;
        name:PropertyNameConfiguration;
    };
    updateStrategy:UpdateStrategy;
}
export type SimpleModelConfiguration = {
    property:{
        defaultSpecification:PropertySpecification;
        name:PropertyNameConfiguration;
    };
    updateStrategy:UpdateStrategy;
}
// / endregion
// / region configuration
export type UserContext = {
    db:string;
    name:?string;
    roles:Array<string>;
}
export type DatabaseUserConfiguration = {
    names:Array<string>;
    roles:Array<string>;
}
export type Runner = {
    adminUserConfigurationPath:string;
    arguments?:Array<string>;
    binaryFilePath?:string;
    configurationFile?:{
        content:string;
        path:string;
    };
    environment?:PlainObject;
    location:Array<string>|string;
    name:Array<string>|string;
}
export type SecuritySettings = {
    admins:DatabaseUserConfiguration;
    members:DatabaseUserConfiguration;
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
        connector:PlainObject;
        configurationFilePath:string;
        createGenericFlatIndex:boolean;
        local:boolean;
        maximumRepresentationLength:number;
        model:ModelConfiguration;
        path:string;
        port:number;
        security:SecuritySettings;
        url:string;
        user:{
            name:string;
            password:string;
        };
    };
}
// / endregion
// / region database error
export type DatabaseAuthorisationError = {
    unauthorized:string;
    toString:() => string;
}
export type DatabaseForbiddenError = {
    forbidden:string;
    toString:() => string;
}
export type DatabaseError = DatabaseAuthorisationError|DatabaseForbiddenError
// / endregion
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
    static async databaseInitializeChangesStream?() {
        changesStream:ChangesStream,
        services:Services,
        configuration:Configuration,
        plugins:Array<Plugin>
    }
}
// endregion
// region vim modline
// vim: set tabstop=4 shiftwidth=4 expandtab:
// vim: foldmethod=marker foldmarker=region,endregion:
// endregion
