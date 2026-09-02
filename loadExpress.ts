// -*- coding: utf-8 -*-
/** @module loadExpress */
'use strict'
/* !
    region header
    Copyright Torben Sickert (info["~at~"]torben.website) 16.12.2012

    License
    -------

    This library written by Torben Sickert stands under a creative commons
    naming 3.0 unported license.
    See https://creativecommons.org/licenses/by/3.0/deed.de
    endregion
*/
// region imports
import express from 'express'
import expressPouchDB from 'express-pouchdb'

import bulkGet from 'express-pouchdb/lib/routes/bulk-get.js'
import allDocs from 'express-pouchdb/lib/routes/all-docs.js'
import changes from 'express-pouchdb/lib/routes/changes.js'
import compact from 'express-pouchdb/lib/routes/compact.js'
import revsDiff from 'express-pouchdb/lib/routes/revs-diff.js'
import security from 'express-pouchdb/lib/routes/security.js'
import viewCleanup from 'express-pouchdb/lib/routes/view-cleanup.js'
import tempViews from 'express-pouchdb/lib/routes/temp-views.js'
import find from 'express-pouchdb/lib/routes/find.js'
import views from 'express-pouchdb/lib/routes/views.js'
import ddocInfo from 'express-pouchdb/lib/routes/ddoc-info.js'
import show from 'express-pouchdb/lib/routes/show.js'
import list from 'express-pouchdb/lib/routes/list.js'
import update from 'express-pouchdb/lib/routes/update.js'
import attachments from 'express-pouchdb/lib/routes/attachments.js'
import documents from 'express-pouchdb/lib/routes/documents.js'
import validation from 'express-pouchdb/lib/validation.js'
import notFoundError from 'express-pouchdb/lib/routes/404.js'
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
