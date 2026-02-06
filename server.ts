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
    Logger,
    ProcessCloseCallback,
    ProcessCloseReason,
    ProcessErrorCallback
} from 'clientnode'
import {Server as HTTPServer} from 'http'
import nodeFetch from 'node-fetch'
import {promises as fileSystem} from 'fs'
import {dirname} from 'path'

import {
    getEffectiveURL,
    initializeConnection,
    initializeExpress
} from './helper'
import {
    BinaryRunner, Configuration, InPlaceRunner, Services, State
} from './type'
// endregion
globalContext.fetch = nodeFetch as unknown as typeof fetch

export const log = new Logger({name: 'web-node.couchdb.server'})
// region functions
/**
 * Starts server process.
 * @param state - Application state.
 * @param expressUtilities - Optional express related utilities.
 * @returns A promise representing the server process wrapped in a promise
 * which resolves after server is reachable.
 */
export const start = async (
    state: State,
    expressUtilities?: (typeof import('./loadExpress'))['default']
): Promise<void> => {
    const {
        configuration, pluginAPI, services: {couchdb: {connector, server}}
    } = state
    const {
        couchdb: {
            backend: {configuration: backendConfiguration},
            runner: runnerConfiguration
        }
    } = configuration
    const {runner} = server

    // region create configuration file if needed
    if (runner.configurationFile) {
        try {
            await fileSystem.mkdir(
                dirname(runner.configurationFile.path), {recursive: true}
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

    const name = ([] as Array<string>).concat(runner.names)[0]
    if ((runner as InPlaceRunner).packages) {
        /*
            We run into memory leaks and ongoing background tasks if we try to
            fully reinitialize express with pouchdb here.
        */
        if (!server.expressInstance) {
            const {expressInstance, expressPouchDBInstance} =
                await initializeExpress(
                    name,
                    state,
                    connector,
                    configuration.couchdb,
                    pluginAPI,
                    expressUtilities
                )
            server.expressInstance = expressInstance
            server.expressPouchDBInstance = expressPouchDBInstance
        }

        await new Promise((resolve) => {
            server.process = server.expressInstance?.listen(
                backendConfiguration['httpd/port'], resolve
            )
            server.process?.on('close', () => {
                server.resolve.call(this)
            })
            server.process?.on('error', (error: Error) => {
                server.reject.call(this, error)
            })
        })
    } else {
        log.info(`Couchdb runner is: "${name}".`)

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
                    server.resolve.call(this, value)
                },
                (reason: unknown) => {
                    server.reject.call(this, reason as ProcessCloseReason)
                }
            )
    }

    await checkReachability(
        getEffectiveURL(configuration.couchdb), {wait: true}
    )
}
/**
 * Stops open database connection if exists, stops server process, restarts
 * server process and re-initializes server connection.
 * @param state - Application state.
 * @param destroy - Defined whether the database should be destroyed or just
 * closed.
 * @param expressUtilities - Optional express related utilities.
 * @returns Given object of services wrapped in a promise resolving after
 * finish.
 */
export const restart = async (
    state: State,
    destroy = false,
    expressUtilities?: (typeof import('./loadExpress'))['default']
): Promise<void> => {
    const {configuration, pluginAPI, services} = state
    const {couchdb: {server}} = services

    const resolveServerProcessBackup = server.resolve
    const rejectServerProcessBackup = server.reject

    // Avoid to notify web node about server process stop.
    const temporaryServerPromise = new Promise((resolve, reject) => {
        server.resolve = resolve
        server.reject = reject
    })
    await stop(services, configuration, destroy)

    // NOTE: Pouchdb needs some time finished further microtasks.
    await temporaryServerPromise

    // Reattach server process to web nodes process pool.
    server.resolve = resolveServerProcessBackup
    server.reject = rejectServerProcessBackup

    await initializeConnection(services, configuration, false)

    await start(state, expressUtilities)

    await pluginAPI.callStack<State>({...state, hook: 'restartCouchdb'})
}
/**
 * Stops open database connection if exists and stops server process.
 * @param services - An object with stored service instances.
 * @param services.couchdb - Couchdb service instance.
 * @param configuration - Mutable by plugins extended configuration object.
 * @param configuration.couchdb - Mutable by plugins extended configuration
 * object.
 * @param destroy - Defined whether the database should be destroyed or just
 * closed.
 * @returns Given object of services wrapped in a promise resolving after
 * finish.
 */
export const stop = async (
    {couchdb}: Services,
    {couchdb: configuration}: Configuration,
    destroy = false
): Promise<void> => {
    if (destroy)
        await couchdb.connection.destroy()
    else {
        const promise = couchdb.connection.close() as Promise<void> | undefined
        if (promise?.catch)
            /*
                NOTE: Waiting for close promise to resolved often takes endless
                time.
            */
            promise.catch((error: unknown) => {
                log.error(
                    'Couchdb connection could not be gracefully closed:',
                    error
                )
            })
    }

    if (couchdb.server.process)
        if ((couchdb.server.runner as InPlaceRunner).packages)
            (couchdb.server.process as HTTPServer).close()
        else
            (couchdb.server.process as ChildProcess).kill('SIGINT')

    await checkUnreachability(getEffectiveURL(configuration), {wait: true})
}
