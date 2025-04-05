 // -*- coding: utf-8 -*-
/** @module declarations */
/*
 NOTE: Already defined in weboptimizer's generic declaration. but currently
 only needed for intellij only.
*/
declare module 'express-pouchdb' {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    declare const main = (_pouchDB?: object, _opts?: object) =>
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        ((..._handlers: Array<import('express').RequestHandlerParams>) =>
            undefined)

    export = main
}
 declare module 'pouchdb-validation'
