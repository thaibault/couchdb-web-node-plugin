// -*- coding: utf-8 -*-
/** @module helper */
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
import {ChildProcess, spawn as spawnChildProcess} from 'child_process'
import {
    checkReachability,
    checkUnreachability,
    CLOSE_EVENT_NAMES,
    format,
    getProcessCloseHandler,
    globalContext,
    NOOP,
    ProcessCloseCallback,
    ProcessCloseReason,
    ProcessErrorCallback
} from 'clientnode'
import {Server as HTTPServer} from 'http'
import nodeFetch from 'node-fetch'
import {promises as fileSystem} from 'fs'
import {dirname, resolve} from 'path'

import {initializeConnection} from './helper'
import {
    BinaryRunner,
    Configuration,
    CouchDB,
    InPlaceRunner,
    Services,
    State
} from './type'
// endregion
globalContext.fetch = nodeFetch as unknown as typeof fetch
// region functions
/**
 * Starts server process.
 * @param services - An object with stored service instances.
 * @param configuration - Mutable by plugins extended configuration object.
 * @returns A promise representing the server process wrapped in a promise
 * which resolves after server is reachable.
 */
export const start = async (
    services: Services, configuration: Configuration
): Promise<void> => {
    const {server} = services.couchdb
    const {runner} = server
    const {runner: runnerConfiguration} = configuration.couchdb

    // region create configuration file if needed
    if (runner.configurationFile) {
        try {
            await fileSystem.mkdir(
                dirname(runner.configurationFile.path),
                {recursive: true}
            )
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
                throw error
        }

        await fileSystem.writeFile(
            runner.configurationFile.path,
            runner.configurationFile.content,
            {encoding: configuration.core.encoding}
        )
    }
    // endregion

    if ((runner as InPlaceRunner).packages) {
        const name = ([] as Array<string>).concat(runner.names)[0]
        console.info(`Couchdb runner is in-place with: "${name}".`)

        const {default: express} =
            await eval(`import('express')`) as
                {default: typeof import('express')}
        const {default: expressPouchDB} =
            await eval(`import('express-pouchdb')`) as
                {default: typeof import('express-pouchdb')}

        const {configuration: backendConfiguration} =
            configuration.couchdb.backend

        const expressServer = express()
        /*
            eslint-disable
            @typescript-eslint/no-unsafe-call,
            @typescript-eslint/no-unsafe-argument
        */
        const expressPouchDBInstance = expressPouchDB(
            services.couchdb.connector,
            {
                configPath: resolve(
                    configuration.couchdb.path, 'database.json'
                ),
                logPath: resolve(
                    configuration.couchdb.path,
                    backendConfiguration['log/file'] as string
                )
            }
        )
        expressServer.use('/', expressPouchDBInstance)
        /*
            eslint-enable
            @typescript-eslint/no-unsafe-call,
            @typescript-eslint/no-unsafe-argument
        */

        await new Promise((resolve) => {
            server.process = expressServer.listen(
                backendConfiguration['httpd/port'], resolve
            )
            server.process.on('close', () => {
                services.couchdb.server.resolve.call(this)
            })
            server.process.on('error', (error: Error) => {
                services.couchdb.server.reject.call(this, error)
            })
        })
    } else {
        const name = ([] as Array<string>).concat(runner.names)[0]
        console.info(`Couchdb runner is: "${name}".`)

        const binaryRunner = runner as BinaryRunner

        server.process = spawnChildProcess(
            (
                runnerConfiguration.memoryInMegaByte === 'default' ?
                    binaryRunner.binaryFilePath as string :
                    runnerConfiguration.nodePath
            ),
            (
                runnerConfiguration.memoryInMegaByte === 'default' ?
                    [] :
                    [
                        '--max-old-space-size=' +
                        runnerConfiguration.memoryInMegaByte,
                        binaryRunner.binaryFilePath as string
                    ]
            )
                .concat(binaryRunner.arguments ? binaryRunner.arguments : []),
            {
                cwd: (eval('process') as typeof process).cwd(),
                env: (
                    Object.prototype.hasOwnProperty.call(
                        runner, 'environment'
                    ) ?
                        {
                            ...(eval('process') as typeof process).env,
                            ...binaryRunner.environment
                        } :
                        (eval('process') as typeof process).env
                ),
                shell: true,
                stdio: 'inherit'
            }
        )

        // Forward process events to service promise.
        ;(new Promise((
            resolve: ProcessCloseCallback, reject: ProcessErrorCallback
        ): void => {
            for (const closeEventName of CLOSE_EVENT_NAMES)
                server.process?.on(
                    closeEventName,
                    getProcessCloseHandler(
                        resolve,
                        reject,
                        {process: server.process, reason: closeEventName}
                    )
                )
        }))
            .then(
                /*
                    NOTE: Please be aware of newly set server instances when
                    resolving happens here.
                 */
                (value: ProcessCloseReason) => {
                    if ((
                        services.couchdb as
                            { server?: CouchDB['server'] } | undefined
                    )?.server?.resolve)
                        services.couchdb.server.resolve.call(this, value)
                },
                (reason: unknown) => {
                    if ((
                        services.couchdb as
                            { server?: CouchDB['server'] } | undefined
                    )?.server?.reject)
                        services.couchdb.server.reject.call(
                            this, reason as ProcessCloseReason
                        )
                }
            )
    }

    await checkReachability(
        format(configuration.couchdb.url, ''), {wait: true}
    )
}
/**
 * Stops open database connection if exists, stops server process, restarts
 * server process and re-initializes server connection.
 * @param state - Application state.
 * @returns Given object of services wrapped in a promise resolving after
 * finish.
 */
export const restart = async (state: State): Promise<void> => {
    const {configuration, pluginAPI, services} = state
    const {couchdb: {server}} = services

    const resolveServerProcessBackup = server.resolve
    const rejectServerProcessBackup = server.reject

    // Avoid to notify web node about server process stop.
    server.resolve = server.reject = NOOP

    await stop(services, configuration)

    // Reattach server process to web nodes process pool.
    server.resolve = resolveServerProcessBackup
    server.reject = rejectServerProcessBackup

    await start(services, configuration)

    void initializeConnection(services, configuration)

    await pluginAPI.callStack<State>({...state, hook: 'restartCouchdb'})
}
/**
 * Stops open database connection if exists and stops server process.
 * @param services - An object with stored service instances.
 * @param services.couchdb - Couchdb service instance.
 * @param configuration - Mutable by plugins extended configuration object.
 * @param configuration.couchdb - Mutable by plugins extended configuration
 * object.
 * @returns Given object of services wrapped in a promise resolving after
 * finish.
 */
export const stop = async (
    {couchdb}: Services, {couchdb: configuration}: Configuration
): Promise<void> => {
    void couchdb.connection.close()

    if (couchdb.server.process)
        if ((couchdb.server.runner as InPlaceRunner).packages)
            (couchdb.server.process as HTTPServer).close()
        else
            (couchdb.server.process as ChildProcess).kill('SIGINT')

    await checkUnreachability(
        format(configuration.url, ''), {wait: true}
    )
}
