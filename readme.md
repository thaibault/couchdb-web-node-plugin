<!-- !/usr/bin/env markdown
-*- coding: utf-8 -*-
region header
Copyright Torben Sickert (info["~at~"]torben.website) 16.12.2012

License
-------

This library written by Torben Sickert stand under a creative commons naming
3.0 unported license. See https://creativecommons.org/licenses/by/3.0/deed.de
endregion -->

Project status
--------------

[![npm](https://img.shields.io/npm/v/couchdb-web-node-plugin?color=%23d55e5d&label=npm%20package%20version&logoColor=%23d55e5d&style=for-the-badge)](https://www.npmjs.com/package/couchdb-web-node-plugin)
[![npm downloads](https://img.shields.io/npm/dy/couchdb-web-node-plugin.svg?style=for-the-badge)](https://www.npmjs.com/package/couchdb-web-node-plugin)

[![build](https://img.shields.io/github/actions/workflow/status/thaibault/couchdb-web-node-plugin/build.yaml?style=for-the-badge)](https://github.com/thaibault/couchdb-web-node-plugin/actions/workflows/build.yaml)
[![build push package](https://img.shields.io/github/actions/workflow/status/thaibault/couchdb-web-node-plugin/build-package-and-push.yaml?label=build%20push%20package&style=for-the-badge)](https://github.com/thaibault/couchdb-web-node-plugin/actions/workflows/build-package-and-push.yaml)

[![check types](https://img.shields.io/github/actions/workflow/status/thaibault/couchdb-web-node-plugin/check-types.yaml?label=check%20types&style=for-the-badge)](https://github.com/thaibault/couchdb-web-node-plugin/actions/workflows/check-types.yaml)
[![lint](https://img.shields.io/github/actions/workflow/status/thaibault/couchdb-web-node-plugin/lint.yaml?label=lint&style=for-the-badge)](https://github.com/thaibault/couchdb-web-node-plugin/actions/workflows/lint.yaml)
[![test](https://img.shields.io/github/actions/workflow/status/thaibault/couchdb-web-node-plugin/test-coverage-report.yaml?label=test&style=for-the-badge)](https://github.com/thaibault/couchdb-web-node-plugin/actions/workflows/test-coverage-report.yaml)

[![code coverage](https://img.shields.io/coverallsCoverage/github/thaibault/couchdb-web-node-plugin?label=code%20coverage&style=for-the-badge)](https://coveralls.io/github/thaibault/couchdb-web-node-plugin)

[![deploy documentation website](https://img.shields.io/github/actions/workflow/status/thaibault/couchdb-web-node-plugin/deploy-documentation-website.yaml?label=deploy%20documentation%20website&style=for-the-badge)](https://github.com/thaibault/couchdb-web-node-plugin/actions/workflows/deploy-documentation-website.yaml)
[![documentation website](https://img.shields.io/website-up-down-green-red/https/torben.website/couchdb-web-node-plugin.svg?label=documentation-website&style=for-the-badge)](https://torben.website/couchdb-web-node-plugin)

Use case
--------

PouchDB with model specification/checking, user authentication and right
management as web-node plugin.

Foreign Key management
----------------------

The plugin provides a foreign key management for PouchDB. It allows to define
foreign keys in the model specification and automatically checks the existence 
of the referenced documents when creating or updating documents. It also
provides a way to automatically delete or update the referenced documents when
the referencing document is deleted or updated.

### Mechanism

#### Initialization

During application start the plugin analyzes the model specification and
creates a map of model types to properties that are defined as foreign keys and
which model type they reference.

It than goes through all documents having referencing properties and checks if
the referenced documents exist. If not, it deletes the reference and if yes, it
stores the reference in an internal map of referenced documents to referencing
documents.

#### Document creation and update

When creating or updating a document, the plugin checks if the document has
referencing properties. If yes, it checks if the referenced documents exist. If
not, it deletes the reference and if yes, it stores the reference in the
internal map of referenced documents to referencing documents. It also removes
references from the internal map if they are no longer present.
