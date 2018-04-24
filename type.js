// @flow
// -*- coding: utf-8 -*-
'use strict'
/* !
    region header
    Copyright Torben Sickert (info["~at~"]torben.website) 16.12.2012

    License
    -------

    This library written by Torben Sickert stand under a creative commons naming
    3.0 unported license. see http://creativecommons.org/licenses/by/3.0/deed.de
    endregion
*/
// region imports
import type {PlainObject} from 'clientnode'
// endregion
// region exports
// / region model
export type AllowedRoles = string|Array<string>|{
    read:string|Array<string>;
    write:string|Array<string>;
}
export type NormalizedAllowedRoles = {
    read:Array<string>;
    write:Array<string>;
    properties?:AllowedModelRolesMapping;
}
export type AllowedModelRolesMapping = {[key:string]:NormalizedAllowedRoles}
export type Constraint = {
    description?:string;
    evaluation:string;
}
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
    onUpdateExecution?:string;
    onUpdateExpression?:string;
    regularExpressionPattern?:string;
    selection?:Array<any>;
    trim?:boolean;
    type?:any;
    writable?:boolean;
}
export type Model = {
    _allowedRoles?:AllowedRoles;
    _extends?:Array<string>;
    _constraintExpressions?:Array<Constraint>;
    _constraintExecutions?:Array<Constraint>;
    _createExpression?:string;
    _createExecution?:string;
    _maximumAggregatedSize?:number;
    _minimumAggregatedSize?:number;
    _onUpdateExecution?:string;
    _onUpdateExpression?:string;
    [key:string]:PropertySpecification;
}
export type Models = {[key:string]:Model}
export type Document = {
    _id:string;
    _rev:string;
    [key:string]:any;
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
export type SecuritySettings = {
    admins:DatabaseUserConfiguration;
    members:DatabaseUserConfiguration;
}
export type Configuration = {
    database:{
        attachAutoRestarter:boolean;
        binary:{
            locations:Array<string>;
            name:string;
        };
        connector:PlainObject;
        configurationFilePath:string;
        createGenericFlatIndex:boolean;
        'httpd/host':string;
        local:boolean;
        'log/file':string;
        'log/level':string;
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
// endregion
// region vim modline
// vim: set tabstop=4 shiftwidth=4 expandtab:
// vim: foldmethod=marker foldmarker=region,endregion:
// endregion
