import type { PluginPromises } from 'web-node/type';
import type { PluginHandler, ServicesState, State } from './type';
/**
 * Launches an application server und triggers all some pluginable hooks on
 * an event.
 */
/**
 * Appends an application server to the web node services.
 * @param state - Application state.
 * @param state.configuration - Applications configuration.
 * @param state.configuration.couchdb - Plugins configuration.
 * @param state.services - Applications services.
 * @returns Promise resolving to nothing.
 */
export declare const preLoadService: ({ configuration: { couchdb: configuration }, services }: ServicesState) => Promise<void>;
/**
 * Start database's child process and return a Promise which observes this
 * service.
 * @param state - Application state.
 * @param state.configuration - Applications configuration.
 * @param state.services - Applications services.
 * @returns A mapping to promises which correspond to the plugin specific
 * continues services.
 */
export declare const loadService: (state: State) => Promise<PluginPromises>;
/**
 * Add database event listener to auto restart database server on unexpected
 * server issues.
 * @param state - Application state.
 * @returns Promise resolving to nothing.
 */
export declare const postLoadService: (state: State) => Promise<void>;
/**
 * Triggered when application will be closed soon.
 * @param state - Application state.
 * @param state.configuration - Applications configuration.
 * @param state.services - Applications services.
 * @returns Promise resolving to nothing.
 */
export declare const shouldExit: ({ configuration, services }: State) => Promise<void>;
export declare const database: PluginHandler;
export default database;
