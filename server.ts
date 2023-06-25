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
import {spawn as spawnChildProcess} from 'child_process'
import Tools, {CloseEventNames, globalContext} from 'clientnode'
import {
    ProcessCloseCallback, ProcessCloseReason, ProcessErrorCallback
} from 'clientnode/type'
import nodeFetch from 'node-fetch'
import {promises as fileSystem} from 'fs'
import {dirname} from 'path'

import {initializeConnection} from './helper'
import {Configuration, Services, State} from './type'
// endregion
globalContext.fetch = nodeFetch as unknown as typeof fetch
// region functions
/**
 * Starts server process.
 * @param services - An object with stored service instances.
 * @param configuration - Mutable by plugins extended configuration object.
 *
 * @returns A promise representing the server process wrapped in a promise
 * which resolves after server is reachable.
 */
export const start = async (
    services:Services, configuration:Configuration
):Promise<void> => {
    const {server} = services.couchdb
    const {runner} = server
    const {binary} = configuration.couchdb

    // region  create configuration file if needed
    if (Object.prototype.hasOwnProperty.call(runner, 'configurationFile')) {
        try {
            await fileSystem.mkdir(
                dirname(runner.configurationFile!.path), {recursive: true}
            )
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
                throw error
        }

        await fileSystem.writeFile(
            runner.configurationFile!.path,
            runner.configurationFile!.content,
            {encoding: configuration.core.encoding}
        )
    }
    // endregion
    server.process = spawnChildProcess(
        (
            binary.memoryInMegaByte === 'default' ?
                runner.binaryFilePath as string :
                binary.nodePath
        ),
        (
            binary.memoryInMegaByte === 'default' ?
                [] :
                [
                    `--max-old-space-size=${binary.memoryInMegaByte}`,
                    runner.binaryFilePath!
                ]
        )
            .concat(runner.arguments ? runner.arguments : []),
        {
            cwd: (eval('process') as typeof process).cwd(),
            env: (
                Object.prototype.hasOwnProperty.call(runner, 'environment') ?
                    {
                        ...(eval('process') as typeof process).env,
                        ...runner.environment
                    } :
                    (eval('process') as typeof process).env
            ),
            shell: true,
            stdio: 'inherit'
        }
    )

    ;(new Promise((
        resolve:ProcessCloseCallback, reject:ProcessErrorCallback
    ):void => {
        for (const closeEventName of CloseEventNames)
            server.process.on(
                closeEventName,
                Tools.getProcessCloseHandler(
                    resolve,
                    reject,
                    {
                        process: server.process,
                        reason: closeEventName
                    }
                )
            )
    }))
        .then(
            /*
                NOTE: Please be aware of newly set server instances when
                resolving happens here.
             */
            (value:ProcessCloseReason):void => {
                if (services.couchdb?.server?.resolve as unknown)
                    services.couchdb.server.resolve.call(this, value)
            },
            (reason:ProcessCloseReason):void => {
                if (services.couchdb?.server?.resolve as unknown)
                    services.couchdb.server.reject.call(this, reason)
            }
        )

    await Tools.checkReachability(
        Tools.stringFormat(configuration.couchdb.url, ''), {wait: true}
    )
}
/**
 * Stops open database connection if exist, stops server process, restarts
 * server process and re-initializes server connection.
 * @param state - Application state.
 *
 * @returns Given object of services wrapped in a promise resolving after
 * after finish.
 */
export const restart = async (state:State):Promise<void> => {
    const {configuration, pluginAPI, services} = state
    const {couchdb: {server}} = services

    const resolveServerProcessBackup:(value:ProcessCloseReason) => void =
        server.resolve
    const rejectServerProcessBackup:(reason:ProcessCloseReason) => void =
        server.reject

    // Avoid to notify web node about server process stop.
    server.resolve = server.reject = Tools.noop

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
 *
 * @returns Given object of services wrapped in a promise resolving after
 * after finish.
 */
export const stop = async (
    {couchdb}:Services, {couchdb: configuration}:Configuration
):Promise<void> => {
    if (couchdb.connection)
        void couchdb.connection.close()

    if (couchdb.server.process)
        couchdb.server.process.kill('SIGINT')

    await Tools.checkUnreachability(
        Tools.stringFormat(configuration.url, ''), {wait: true}
    )
}
// region vim modline
// vim: set tabstop=4 shiftwidth=4 expandtab:
// vim: foldmethod=marker foldmarker=region,endregion:
// endregion
