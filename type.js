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
export type AllowedModelRolesMapping = {[key:string]:Array<string>}
export type PropertySpecification = {
    conflictingConstraintExpression:?string;
    conflictingConstraintExecution:?string;
    constraintExpression:?string;
    constraintExecution:?string;
    contentTypeRegularExpressionPattern:?string;
    default:any;
    maximum:number;
    minimum:number;
    mutable:boolean;
    nullable:boolean;
    onCreateExpression:?string;
    onCreateExecution:?string;
    onUpdateExpression:?string;
    onUpdateExecution:?string;
    regularExpressionPattern:?string;
    selection:?Array<any>;
    type:string;
    writable:boolean;
}
export type Model = {
    _allowedRoles:?Array<string>;
    _extends:?Array<string>;
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
export type SpecialPropertyNames = {
    allowedRoles:string;
    attachments:string;
    constraints:{
        expression:string;
        execution:string;
    },
    extend:string;
    type:string;
    typeNameRegularExpressionPattern:string;
    validatedDocumentsCache:string;
}
export type UpdateStrategy = ''|'fillUp'|'incremental'|'migrate'
export type ModelConfiguration = {
    default:{
        attachments:{
            maximum:number;
            minimum:number;
            name:PropertySpecification;
        };
        propertySpecification:PropertySpecification;
    },
    models:Models;
    reservedPropertyNames:Array<string>;
    specialPropertyNames:SpecialPropertyNames;
    updateStrategy:UpdateStrategy;
}
export type SimpleModelConfiguration = {
    reservedPropertyNames:Array<string>;
    specialPropertyNames:SpecialPropertyNames;
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
    context:{
        path:string;
        type:string;
    };
    database:{
        configFilePath:string;
        'httpd/host':string;
        'log/file':string;
        'log/level':string;
        path:string;
        port:number;
        security:SecuritySettings;
        url:string;
        user:{
            name:string;
            password:string;
        };
    };
    debug:boolean;
    encoding:string;
    modelConfiguration:ModelConfiguration;
    name:string;
    package:PlainObject;
    plugin:{
        configurationPropertyNames:Array<string>;
        directories:{
            internal:{
                path:string;
                nameRegularExpressionPattern:string;
            };
            external:{
                path:string;
                nameRegularExpressionPattern:string;
            };
        };
    };
    server:{
        application:{
            rootPath:string;
            options:PlainObject;
            port:number;
            hostName:string;
        };
        proxy:{
            logFilePath:{
                access:string;
                error:string;
            };
        };
    };
    template:{
        extensions:Array<string>;
        options:PlainObject;
    }
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
