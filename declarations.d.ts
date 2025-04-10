 // -*- coding: utf-8 -*-
/** @module declarations */
/*
 NOTE: Already defined in weboptimizer's generic declaration. but currently
 only needed for intellij only.
*/
declare module 'express-pouchdb'
declare module 'express-pouchdb/lib/routes/bulk-get'
declare module 'express-pouchdb/lib/routes/all-docs'
declare module 'express-pouchdb/lib/routes/changes'
declare module 'express-pouchdb/lib/routes/compact'
declare module 'express-pouchdb/lib/routes/revs-diff'
declare module 'express-pouchdb/lib/routes/security'
declare module 'express-pouchdb/lib/routes/view-cleanup'
declare module 'express-pouchdb/lib/routes/temp-views'
declare module 'express-pouchdb/lib/routes/find'
declare module 'express-pouchdb/lib/routes/documents'
declare module 'express-pouchdb/lib/routes/404'
declare module 'express-pouchdb/lib/routes/views'
declare module 'express-pouchdb/lib/routes/ddoc-info'
declare module 'express-pouchdb/lib/routes/show'
declare module 'express-pouchdb/lib/routes/list'
declare module 'express-pouchdb/lib/routes/update'
declare module 'express-pouchdb/lib/routes/attachments'
declare module 'express-pouchdb/lib/validation'

declare module 'express-pouchdb/lib/utils' {
    export function jsonParser(
        request: IncomingMessage,
        response: http.ServerResponse,
        next: NextFunction
    ): void

    export function sendError(
        response, error: unknown, code: number
    ): void

    export function sendJSON(
        response, code: number, result: unknown
    ): void
}

declare module 'pouchdb-validation'
