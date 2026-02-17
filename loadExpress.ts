// -*- coding: utf-8 -*-
/** @module loadExpress */
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
import express from 'express'
import expressPouchDB from 'express-pouchdb'

import bulkGet from 'express-pouchdb/lib/routes/bulk-get'
import allDocs from 'express-pouchdb/lib/routes/all-docs'
import changes from 'express-pouchdb/lib/routes/changes'
import compact from 'express-pouchdb/lib/routes/compact'
import revsDiff from 'express-pouchdb/lib/routes/revs-diff'
import security from 'express-pouchdb/lib/routes/security'
import viewCleanup from 'express-pouchdb/lib/routes/view-cleanup'
import tempViews from 'express-pouchdb/lib/routes/temp-views'
import find from 'express-pouchdb/lib/routes/find'
import views from 'express-pouchdb/lib/routes/views'
import ddocInfo from 'express-pouchdb/lib/routes/ddoc-info'
import show from 'express-pouchdb/lib/routes/show'
import list from 'express-pouchdb/lib/routes/list'
import update from 'express-pouchdb/lib/routes/update'
import attachments from 'express-pouchdb/lib/routes/attachments'
import documents from 'express-pouchdb/lib/routes/documents'
import validation from 'express-pouchdb/lib/validation'
import notFoundError from 'express-pouchdb/lib/routes/404'
// endregion
export const utilities = {
    express,
    expressPouchDB,
    bulkGet,
    allDocs,
    changes,
    compact,
    revsDiff,
    security,
    viewCleanup,
    tempViews,
    find,
    views,
    ddocInfo,
    show,
    list,
    update,
    attachments,
    documents,
    validation,
    notFoundError
}

export default utilities
