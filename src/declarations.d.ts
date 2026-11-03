 // -*- coding: utf-8 -*-
/** @module declarations */
declare module 'express-pouchdb'
declare module 'express-pouchdb/lib/routes/bulk-get.js'
declare module 'express-pouchdb/lib/routes/all-docs.js'
declare module 'express-pouchdb/lib/routes/changes.js'
declare module 'express-pouchdb/lib/routes/compact.js'
declare module 'express-pouchdb/lib/routes/revs-diff.js'
declare module 'express-pouchdb/lib/routes/security.js'
declare module 'express-pouchdb/lib/routes/view-cleanup.js'
declare module 'express-pouchdb/lib/routes/temp-views.js'
declare module 'express-pouchdb/lib/routes/find.js'
declare module 'express-pouchdb/lib/routes/documents.js'
declare module 'express-pouchdb/lib/routes/404.js'
declare module 'express-pouchdb/lib/routes/views.js'
declare module 'express-pouchdb/lib/routes/ddoc-info.js'
declare module 'express-pouchdb/lib/routes/show.js'
declare module 'express-pouchdb/lib/routes/list.js'
declare module 'express-pouchdb/lib/routes/update.js'
declare module 'express-pouchdb/lib/routes/attachments.js'
declare module 'express-pouchdb/lib/validation.js'

declare module 'express-pouchdb/lib/utils.js' {
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

declare module 'pouchdb-security'
declare module 'pouchdb-validation'

// eslint-disable-next-line no-var
declare var COUCHDB_WEBNODE_PLUGIN_EXPRESS_INSTANCES: (
    Record<string, unknown> | undefined
)
