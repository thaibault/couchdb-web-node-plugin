<!-- !/usr/bin/env markdown
-*- coding: utf-8 -*-
region header
Copyright Torben Sickert (info["~at~"]tsickert.com) 16.12.2012

License
-------

This library written by Torben Sickert stands under a creative commons naming
3.0 unported license. See https://creativecommons.org/licenses/by/3.0/deed.de
endregion -->

<!--|deDE:Projektstatus-->
<!--|frFR:État du projet-->
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

[![deploy web documentation](https://img.shields.io/github/actions/workflow/status/thaibault/couchdb-web-node-plugin/deploy-web-documentation.yaml?label=deploy%20web%20documentation&style=for-the-badge)](https://github.com/thaibault/couchdb-web-node-plugin/actions/workflows/deploy-web-documentation.yaml)
[![web documentation](https://img.shields.io/website-up-down-green-red/https/tsickert.com/couchdb-web-node-plugin.svg?label=web-documentation&style=for-the-badge)](https://tsickert.com/couchdb-web-node-plugin)

<!--|deDE:Einsatzmöglichkeiten-->
<!--|frFR:Cas d'utilisation-->
Use case
--------

This [web-node](https://tsickert.com/web-node) plugin runs a
[CouchDB](https://couchdb.apache.org) compatible database server and
connects your application via [PouchDB](https://pouchdb.com). You describe
your data model in the configuration. The plugin turns it into server side
validation, so every write is checked no matter which client sends it.
<!--deDE:
    Dieses [web-node](https://tsickert.com/web-node)-Plugin betreibt einen
    [CouchDB](https://couchdb.apache.org)-kompatiblen Datenbankserver und
    verbindet Ihre Anwendung über [PouchDB](https://pouchdb.com). Sie
    beschreiben Ihr Datenmodell in der Konfiguration. Das Plugin macht daraus
    eine serverseitige Validierung, sodass jeder Schreibzugriff geprüft wird,
    egal welcher Client ihn sendet.
-->
<!--frFR:
    Ce plugin [web-node](https://tsickert.com/web-node) exécute un serveur de
    base de données compatible [CouchDB](https://couchdb.apache.org) et y
    connecte votre application via [PouchDB](https://pouchdb.com). Vous
    décrivez votre modèle de données dans la configuration. Le plugin le
    transforme en validation côté serveur, de sorte que chaque écriture est
    vérifiée quel que soit le client qui l'envoie.
-->

Features included:
<!--deDE:Enthaltene Funktionen:-->
<!--frFR:Fonctionnalités incluses:-->

- Starts CouchDB, "pouchdb-server" or an in-process "express-pouchdb",
  whichever is available.<!--deDE:Startet CouchDB, "pouchdb-server" oder ein im Prozess laufendes "express-pouchdb", je nachdem, was verfügbar ist.--><!--frFR:Démarre CouchDB, "pouchdb-server" ou un "express-pouchdb" dans le processus, selon ce qui est disponible.-->
- Declarative model specification with types, constraints, defaults,
  computed values, inheritance and attachments.<!--deDE:Deklarative Modellspezifikation mit Typen, Einschränkungen, Standardwerten, berechneten Werten, Vererbung und Anhängen.--><!--frFR:Spécification déclarative des modèles avec types, contraintes, valeurs par défaut, valeurs calculées, héritage et pièces jointes.-->
- Role based read and write permissions per model and property.<!--deDE:Rollenbasierte Lese- und Schreibrechte pro Modell und Eigenschaft.--><!--frFR:Droits de lecture et d'écriture basés sur les rôles par modèle et par propriété.-->
- Automatic setup of admin, users, security settings and indexes.<!--deDE:Automatische Einrichtung von Administrator, Benutzern, Sicherheitseinstellungen und Indizes.--><!--frFR:Configuration automatique de l'administrateur, des utilisateurs, des paramètres de sécurité et des index.-->
- Foreign keys between documents and materialized views.<!--deDE:Fremdschlüssel zwischen Dokumenten und materialisierte Sichten.--><!--frFR:Clés étrangères entre documents et vues matérialisées.-->
- Migration of existing documents when the model changes.<!--deDE:Migration bestehender Dokumente bei Modelländerungen.--><!--frFR:Migration des documents existants lorsque le modèle change.-->
- Changes stream with hooks and automatic restart on failures.<!--deDE:Änderungsstrom mit Hooks und automatischem Neustart bei Fehlern.--><!--frFR:Flux de modifications avec hooks et redémarrage automatique en cas d'erreur.-->

<div class="wd-table-of-contents">
    <h2 id="content">Content<!--deDE:Inhalt--><!--frFR:Contenu--></h2>
    <!--wd-table-of-contents-->
</div>

Installation
------------

Install the plugin next to web-node. web-node discovers every installed
package whose name ends with "-web-node-plugin" automatically:
<!--deDE:
    Installieren Sie das Plugin neben web-node. web-node erkennt jedes
    installierte Paket, dessen Name auf "-web-node-plugin" endet,
    automatisch:
-->
<!--frFR:
    Installez le plugin à côté de web-node. web-node détecte automatiquement
    chaque paquet installé dont le nom se termine par "-web-node-plugin":
-->

```bash
yarn add web-node couchdb-web-node-plugin
```

You also need one database server. The plugin uses the first one it finds in
this order:
<!--deDE:
    Zusätzlich benötigen Sie einen Datenbankserver. Das Plugin verwendet den
    ersten, den es in dieser Reihenfolge findet:
-->
<!--frFR:
    Il vous faut également un serveur de base de données. Le plugin utilise
    le premier qu'il trouve dans cet ordre:
-->

1. CouchDB installed on the system at "/usr/lib/couchdb/bin/couchdb".<!--deDE:Auf dem System installiertes CouchDB unter "/usr/lib/couchdb/bin/couchdb".--><!--frFR:CouchDB installé sur le système dans "/usr/lib/couchdb/bin/couchdb".-->
2. "pouchdb-server" installed as dependency.<!--deDE:Als Abhängigkeit installiertes "pouchdb-server".--><!--frFR:"pouchdb-server" installé comme dépendance.-->
3. "express" and "express-pouchdb" installed as dependencies, running inside
   your application process.<!--deDE:Als Abhängigkeiten installierte "express" und "express-pouchdb", die im Prozess Ihrer Anwendung laufen.--><!--frFR:"express" et "express-pouchdb" installés comme dépendances, exécutés dans le processus de votre application.-->

```bash
yarn add pouchdb-server
# or
yarn add express express-pouchdb
```

<!--|deDE:Konfiguration-->
<!--|frFR:Configuration-->
Configuration
-------------

All options live below "webNode.couchdb" in your application's
"package.json". The most important ones:
<!--deDE:
    Alle Optionen liegen unterhalb von "webNode.couchdb" in der
    "package.json" Ihrer Anwendung. Die wichtigsten:
-->
<!--frFR:
    Toutes les options se trouvent sous "webNode.couchdb" dans le
    "package.json" de votre application. Les plus importantes:
-->

```JSON
{
    "webNode": {
        "couchdb": {
            "admin": {"name": "admin", "password": "change-me"},
            "databaseName": "main",
            "path": "database",
            "runner": {"host": "127.0.0.1", "port": 5984},
            "users": [
                {"name": "editor", "password": "secret", "roles": ["editor"]}
            ]
        }
    }
}
```

- "admin": Database administrator, created if missing. Defaults to "admin"
  with password "admin", so change it for anything public.<!--deDE:"admin": Datenbankadministrator, wird angelegt, falls er fehlt. Standardmäßig "admin" mit Passwort "admin", ändern Sie dies daher für alles Öffentliche.--><!--frFR:"admin": Administrateur de la base de données, créé s'il manque. Par défaut "admin" avec le mot de passe "admin", changez-le donc pour tout usage public.-->
- "users": Additional users with their roles, created if missing.<!--deDE:"users": Zusätzliche Benutzer mit ihren Rollen, werden angelegt, falls sie fehlen.--><!--frFR:"users": Utilisateurs supplémentaires avec leurs rôles, créés s'ils manquent.-->
- "databaseName": Name of the application database. Defaults to "main".<!--deDE:"databaseName": Name der Anwendungsdatenbank. Standardmäßig "main".--><!--frFR:"databaseName": Nom de la base de données de l'application. Par défaut "main".-->
- "path": Directory holding the database files. Defaults to "database".<!--deDE:"path": Verzeichnis mit den Datenbankdateien. Standardmäßig "database".--><!--frFR:"path": Répertoire contenant les fichiers de la base de données. Par défaut "database".-->
- "runner.host" and "runner.port": Address of the database server. Default to
  "0.0.0.0" and "5984".<!--deDE:"runner.host" und "runner.port": Adresse des Datenbankservers. Standardmäßig "0.0.0.0" und "5984".--><!--frFR:"runner.host" et "runner.port": Adresse du serveur de base de données. Par défaut "0.0.0.0" et "5984".-->
- "security": Admin and member roles per database.<!--deDE:"security": Administrator- und Mitgliedsrollen pro Datenbank.--><!--frFR:"security": Rôles d'administrateur et de membre par base de données.-->
- "model": The data model, see below.<!--deDE:"model": Das Datenmodell, siehe unten.--><!--frFR:"model": Le modèle de données, voir ci-dessous.-->

<!--|deDE:Datenmodell-->
<!--|frFR:Modèle de données-->
Data model
----------

Models live below "model.entities". Public model names start with an upper
case letter, names starting with "_" are abstract models to inherit from.
Every model inherits from "_base", which adds the type property "-type". A
document's "-type" selects the model it is validated against:
<!--deDE:
    Modelle liegen unterhalb von "model.entities". Öffentliche Modellnamen
    beginnen mit einem Großbuchstaben, Namen mit "_" sind abstrakte Modelle
    zum Erben. Jedes Modell erbt von "_base", das die Typ-Eigenschaft "-type"
    hinzufügt. Das "-type" eines Dokuments bestimmt, gegen welches Modell es
    validiert wird:
-->
<!--frFR:
    Les modèles se trouvent sous "model.entities". Les noms de modèles
    publics commencent par une majuscule, les noms commençant par "_" sont des
    modèles abstraits dont on peut hériter. Chaque modèle hérite de "_base",
    qui ajoute la propriété de type "-type". Le "-type" d'un document
    détermine le modèle utilisé pour sa validation:
-->

```JSON
{
    "webNode": {
        "couchdb": {
            "model": {
                "entities": {
                    "Author": {
                        "_extends": "_timeTrackable",
                        "_roles": {"read": ["editor", "reader"], "write": ["editor"]},
                        "name": {
                            "maximumLength": 100,
                            "minimumLength": 1,
                            "nullable": false
                        }
                    },
                    "Book": {
                        "author": {"type": "foreignKey:Author"},
                        "genre": {"selection": ["novel", "poetry"]},
                        "pages": {"minimum": 1, "type": "integer"},
                        "title": {"index": true, "nullable": false}
                    }
                }
            }
        }
    }
}
```

```JavaScript
await services.couchdb.connection.put({
    _id: 'dune',
    '-type': 'Book',
    title: 'Dune',
    pages: 412
})
```

Frequently used property options:
<!--deDE:Häufig verwendete Eigenschaftsoptionen:-->
<!--frFR:Options de propriété fréquemment utilisées:-->

- "type": "string" (default), "number", "integer", "boolean", "DateTime",
  another model name or "foreignKey:&lt;Model&gt;".<!--deDE:"type": "string" (Standard), "number", "integer", "boolean", "DateTime", ein anderer Modellname oder "foreignKey:&lt;Model&gt;".--><!--frFR:"type": "string" (par défaut), "number", "integer", "boolean", "DateTime", un autre nom de modèle ou "foreignKey:&lt;Model&gt;".-->
- "nullable", "mutable", "writable", "default": Presence and mutability.<!--deDE:"nullable", "mutable", "writable", "default": Vorhandensein und Veränderbarkeit.--><!--frFR:"nullable", "mutable", "writable", "default": Présence et mutabilité.-->
- "minimum", "maximum", "minimumLength", "maximumLength", "pattern",
  "selection": Value constraints.<!--deDE:"minimum", "maximum", "minimumLength", "maximumLength", "pattern", "selection": Werteinschränkungen.--><!--frFR:"minimum", "maximum", "minimumLength", "maximumLength", "pattern", "selection": Contraintes de valeur.-->
- "constraintExpression", "createExpression", "updateExpression": JavaScript
  expressions to validate or compute values.<!--deDE:"constraintExpression", "createExpression", "updateExpression": JavaScript-Ausdrücke zum Validieren oder Berechnen von Werten.--><!--frFR:"constraintExpression", "createExpression", "updateExpression": Expressions JavaScript pour valider ou calculer des valeurs.-->
- "roles": Read and write permissions for a single property.<!--deDE:"roles": Lese- und Schreibrechte für eine einzelne Eigenschaft.--><!--frFR:"roles": Droits de lecture et d'écriture pour une seule propriété.-->
- "index": Creates a database index for the property.<!--deDE:"index": Legt einen Datenbankindex für die Eigenschaft an.--><!--frFR:"index": Crée un index de base de données pour la propriété.-->

The predefined abstract models "_timeTrackable" (creation and update time),
"_userTrackable" (last editing user), "_interval" and "_location" can be
extended via "_extends". JSON files in the folder "migration" are written to
the database on startup, e.g. to provide initial documents.
<!--deDE:
    Die vordefinierten abstrakten Modelle "_timeTrackable" (Erstellungs- und
    Änderungszeit), "_userTrackable" (letzter bearbeitender Benutzer),
    "_interval" und "_location" lassen sich über "_extends" erweitern.
    JSON-Dateien im Ordner "migration" werden beim Start in die Datenbank
    geschrieben, z. B. um initiale Dokumente bereitzustellen.
-->
<!--frFR:
    Les modèles abstraits prédéfinis "_timeTrackable" (dates de création et de
    modification), "_userTrackable" (dernier utilisateur ayant modifié),
    "_interval" et "_location" peuvent être étendus via "_extends". Les
    fichiers JSON du dossier "migration" sont écrits dans la base de données
    au démarrage, par exemple pour fournir des documents initiaux.
-->

<!--|deDE:Fremdschlüsselverwaltung-->
<!--|frFR:Gestion des clés étrangères-->
Foreign key management
----------------------

The plugin provides a foreign key management for PouchDB. It allows to define
foreign keys in the model specification and automatically checks the
existence of the referenced documents when creating or updating documents. It
also provides a way to automatically delete or update the referenced
documents when the referencing document is deleted or updated.
<!--deDE:
    Das Plugin bietet eine Fremdschlüsselverwaltung für PouchDB. Fremdschlüssel
    werden in der Modellspezifikation definiert, und beim Anlegen oder
    Aktualisieren von Dokumenten wird automatisch geprüft, ob die
    referenzierten Dokumente existieren. Außerdem können referenzierte
    Dokumente automatisch gelöscht oder aktualisiert werden, wenn das
    referenzierende Dokument gelöscht oder aktualisiert wird.
-->
<!--frFR:
    Le plugin fournit une gestion des clés étrangères pour PouchDB. Les clés
    étrangères sont définies dans la spécification du modèle, et l'existence
    des documents référencés est vérifiée automatiquement lors de la création
    ou de la mise à jour de documents. Il permet également de supprimer ou de
    mettre à jour automatiquement les documents référencés lorsque le document
    référençant est supprimé ou mis à jour.
-->

<!--|deDE:Initialisierung-->
<!--|frFR:Initialisation-->
### Initialization

During application start the plugin analyzes the model specification and
creates a map of model types to properties that are defined as foreign keys
and which model type they reference.
<!--deDE:
    Beim Start der Anwendung analysiert das Plugin die Modellspezifikation und
    erstellt eine Zuordnung von Modelltypen zu den Eigenschaften, die als
    Fremdschlüssel definiert sind, und zu dem Modelltyp, den sie
    referenzieren.
-->
<!--frFR:
    Au démarrage de l'application, le plugin analyse la spécification du
    modèle et crée une table associant les types de modèles aux propriétés
    définies comme clés étrangères et au type de modèle qu'elles référencent.
-->

It then goes through all documents having referencing properties and checks
if the referenced documents exist. If not, it deletes the reference and if
yes, it stores the reference in an internal map of referenced documents to
referencing documents.
<!--deDE:
    Anschließend durchläuft es alle Dokumente mit referenzierenden
    Eigenschaften und prüft, ob die referenzierten Dokumente existieren. Falls
    nicht, wird die Referenz gelöscht, falls ja, wird sie in einer internen
    Zuordnung von referenzierten zu referenzierenden Dokumenten gespeichert.
-->
<!--frFR:
    Il parcourt ensuite tous les documents ayant des propriétés de référence
    et vérifie si les documents référencés existent. Si ce n'est pas le cas,
    la référence est supprimée, sinon elle est enregistrée dans une table
    interne associant les documents référencés aux documents référençants.
-->

<!--|deDE:Anlegen und Aktualisieren von Dokumenten-->
<!--|frFR:Création et mise à jour de documents-->
### Document creation and update

When creating or updating a document, the plugin checks if the document has
referencing properties. If yes, it checks if the referenced documents exist.
If not, it deletes the reference and if yes, it stores the reference in the
internal map of referenced documents to referencing documents. It also
removes references from the internal map if they are no longer present.
<!--deDE:
    Beim Anlegen oder Aktualisieren eines Dokuments prüft das Plugin, ob das
    Dokument referenzierende Eigenschaften hat. Falls ja, prüft es, ob die
    referenzierten Dokumente existieren. Falls nicht, wird die Referenz
    gelöscht, falls ja, wird sie in der internen Zuordnung von referenzierten
    zu referenzierenden Dokumenten gespeichert. Nicht mehr vorhandene
    Referenzen werden außerdem aus der internen Zuordnung entfernt.
-->
<!--frFR:
    Lors de la création ou de la mise à jour d'un document, le plugin vérifie
    si le document possède des propriétés de référence. Si oui, il vérifie si
    les documents référencés existent. Si ce n'est pas le cas, la référence
    est supprimée, sinon elle est enregistrée dans la table interne associant
    les documents référencés aux documents référençants. Les références qui
    ne sont plus présentes sont également retirées de cette table.
-->

<!--|deDE:Hooks und Dienste-->
<!--|frFR:Hooks et services-->
Hooks and services
------------------

- "services.couchdb.connection": PouchDB connection to the application
  database.<!--deDE:"services.couchdb.connection": PouchDB-Verbindung zur Anwendungsdatenbank.--><!--frFR:"services.couchdb.connection": Connexion PouchDB à la base de données de l'application.-->
- "services.couchdb.validateDocument": Validates a document against the model
  without writing it.<!--deDE:"services.couchdb.validateDocument": Validiert ein Dokument gegen das Modell, ohne es zu schreiben.--><!--frFR:"services.couchdb.validateDocument": Valide un document par rapport au modèle sans l'écrire.-->
- "services.couchdb.server.restart": Restarts the database server.<!--deDE:"services.couchdb.server.restart": Startet den Datenbankserver neu.--><!--frFR:"services.couchdb.server.restart": Redémarre le serveur de base de données.-->
- "couchdbChange": Hook called for each change in the database.<!--deDE:"couchdbChange": Hook, der bei jeder Änderung in der Datenbank aufgerufen wird.--><!--frFR:"couchdbChange": Hook appelé à chaque modification dans la base de données.-->
- "couchdbInitializeChangesStream": Hook called after the changes stream was
  (re)initialized.<!--deDE:"couchdbInitializeChangesStream": Hook, der nach der (Neu-)Initialisierung des Änderungsstroms aufgerufen wird.--><!--frFR:"couchdbInitializeChangesStream": Hook appelé après la (ré)initialisation du flux de modifications.-->
- "restartCouchdb": Hook called after each database restart.<!--deDE:"restartCouchdb": Hook, der nach jedem Neustart der Datenbank aufgerufen wird.--><!--frFR:"restartCouchdb": Hook appelé après chaque redémarrage de la base de données.-->
- "initializeExpressPouchDB" and "onPouchDBFind": Hooks to extend the
  in-process "express-pouchdb" server.<!--deDE:"initializeExpressPouchDB" und "onPouchDBFind": Hooks zur Erweiterung des im Prozess laufenden "express-pouchdb"-Servers.--><!--frFR:"initializeExpressPouchDB" et "onPouchDBFind": Hooks permettant d'étendre le serveur "express-pouchdb" exécuté dans le processus.-->

<!--|deDE:Entwicklung-->
<!--|frFR:Développement-->
Development
-----------

```bash
yarn install
yarn build
yarn test
```
