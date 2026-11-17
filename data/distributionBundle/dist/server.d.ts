import type { Express } from 'express-serve-static-core';
import type { Configuration, Connector, CoreConfiguration, Services, State, LocalDatabaseConfiguration } from './type';
import { Logger } from 'clientnode';
export declare const log: Logger;
/**
 * Initializes an express instance connected with pouchdb.
 * @param name - Instance name.
 * @param state - Application state.
 * @param connector - Database connector instance.
 * @param configuration - Couchdb configuration object.
 * @param runnerConfiguration - Couchdb runner configuration object.
 * @param pluginAPI - Plugin API to call plugin hooks.
 * @param expressUtilities - Optional express related utilities.
 * @returns A promise resolving to the wrapping express instance and pouchdb's
 * express instance.
 */
export declare const initializeExpress: (name: string, state: State, connector: Connector, configuration: CoreConfiguration, runnerConfiguration: LocalDatabaseConfiguration, pluginAPI: State['pluginAPI'], expressUtilities?: (typeof import('./loadExpress'))['default']) => Promise<{
    expressInstance: Express;
    expressPouchDBInstance: Express;
}>;
/**
 * Starts server process.
 * @param state - Application state.
 * @param expressUtilities - Optional express related utilities.
 * @returns A promise representing the server process wrapped in a promise
 * which resolves after server is reachable.
 */
export declare const start: (state: State, expressUtilities?: (typeof import('./loadExpress'))['default']) => Promise<void>;
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
export declare const restart: (state: State, destroy?: boolean, expressUtilities?: (typeof import('./loadExpress'))['default']) => Promise<void>;
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
export declare const stop: ({ couchdb }: Services, { couchdb: configuration }: Configuration, destroy?: boolean) => Promise<void>;
