import type { Mapping, ValueOf } from 'clientnode';
import type { AbortControllerStack, ModelRolesMapping, Roles, Configuration, Connection, ConnectorConfiguration, CoreConfiguration, DatabaseConnectorConfiguration, Model, ModelConfiguration, Models, NormalizedRoles, PropertyDefinition, Services, SpecialPropertyNames } from './type';
import { Logger } from 'clientnode';
export declare const TOGGLE_LATEST_REVISION_DETERMINING: unique symbol;
export declare const log: Logger;
/**
 * Determines plugin to hook into any write operations.
 * @param configuration - This's plugin configuration object.
 * @returns A pouchdb plugin in object style.
 */
export declare const getPouchDBPlugin: (configuration: CoreConfiguration) => {
    installCouchDBWebNodePlugin: (this: Connection, description: string) => void;
};
export declare const removeDeprecatedIndexes: (connection: Connection<object>, models: Models, modelConfiguration: ModelConfiguration) => Promise<void>;
/**
 * Converts internal declarative database connector configuration object
 * into a database compatible one.
 * @param configuration - Connector configuration object.
 * @param abortControllerStack - Stack to put abort signals to. They will be
 * shifted and used for fetch calls.
 * @returns Database compatible configuration object.
 */
export declare const getConnectorOptions: (configuration: ConnectorConfiguration, abortControllerStack?: AbortControllerStack) => DatabaseConnectorConfiguration;
/**
 * Determines a representation for given plain object.
 * @param object - Object to represent.
 * @param maximumRepresentationTryLength - Maximum representation string to
 * process.
 * @param maximumRepresentationLength - Maximum length of returned
 * representation.
 * @returns Representation string.
 */
export declare const mayStripRepresentation: (object: unknown, maximumRepresentationTryLength: number, maximumRepresentationLength: number) => string;
/**
 * Updates/creates a design document in database with a validation function
 * set to given code.
 * @param databaseConnection - Database connection to use for document
 * updates.
 * @param documentName - Design document name.
 * @param documentData - Design document data.
 * @param description - Used to produce semantic logging messages.
 * @param doLogging - Enables logging.
 * @param idName - Property name for ids.
 * @param revisionName - Property name for revisions.
 * @param designDocumentNamePrefix - Document name prefix indicating deign
 * documents.
 * @returns Promise which will be resolved after given document has updated
 * successfully.
 */
export declare const ensureValidationDocumentPresence: (databaseConnection: Connection, documentName: string, documentData: Mapping, description: string, doLogging?: boolean, idName?: SpecialPropertyNames['id'], revisionName?: SpecialPropertyNames['revision'], designDocumentNamePrefix?: string) => Promise<void>;
/**
 * Initializes a database connection instance.
 * @param services - An object with stored service instances.
 * @param configuration - Mutable by plugins extended configuration object.
 * @param checkForDatabaseReachability - Indicates whether to check for
 * reachability of newly created database.
 * @returns Given and extended object of services.
 */
export declare const initializeConnection: (services: Services, configuration: Configuration, checkForDatabaseReachability?: boolean) => Promise<Services>;
/**
 * Determines the effective database URL to connect to based on given
 * configuration.
 * @param configuration - Couchdb configuration object.
 * @param withDatabase - Indicates whether the URL should contain the database
 * name or not.
 * @param withCredentials - Indicates whether the URL should contain the
 * credentials or not.
 * @returns The effective URL.
 */
export declare const getEffectiveURL: (configuration: CoreConfiguration, withDatabase?: boolean, withCredentials?: boolean) => string;
/**
 * Waits for given promise to be resolved or given timeout has been exceeded.
 * @param promise - Promise to wait for.
 * @param timeoutInSeconds - Timeout in seconds.
 * @param description - Used to produce semantic logging messages.
 * @returns A promise which will be resolved after given promise is resolved or
 * given timeout has been exceeded.
 */
export declare const waitWithTimeout: (promise: Promise<unknown>, timeoutInSeconds: number, description: string) => Promise<void>;
/**
 * Determines a mapping of all models to roles who are allowed to edit
 * corresponding model instances.
 * @param modelConfiguration - Model specification object.
 * @returns The mapping object.
 */
export declare const determineModelRolesMapping: (modelConfiguration: ModelConfiguration) => ModelRolesMapping;
/**
 * Determines whether given value of a model is a property specification.
 * @param value - Value to analyze.
 * @returns Boolean indicating the case.
 */
export declare const isPropertyDefinition: (value: ValueOf<Model>) => value is PropertyDefinition;
/**
 * Determines all property names which are indexable in a generic manner.
 * @param modelConfiguration - Model specification object.
 * @param model - Model to determine property names from.
 * @returns The mapping object.
 */
export declare const determineGenericIndexablePropertyNames: (modelConfiguration: ModelConfiguration, model: Model) => Array<string>;
/**
 * Extend given model with all specified one.
 * @param model - Model to extend.
 * @param modelConfiguration - Model specification object.
 * @param _name - Model name to extend. Only needed for debugging purposes.
 * @returns Given model in extended version.
 */
export declare const applyModelInheritance: (model: Model, modelConfiguration: ModelConfiguration, _name?: string) => Partial<Model>;
/**
 * Apply default property definitions to given model.
 * @param model - Model to extends its properties.
 * @param modelConfiguration - Model configuration to take into account.
 * @returns Extended model.
 */
export declare const applyDefaultPropertyConfigurations: (model: Model, modelConfiguration: ModelConfiguration) => Model;
/**
 * Extend default specification with specific one.
 * @param modelConfiguration - Model specification object.
 * @returns Models with extended specific specifications.
 */
export declare const applyModelsInheritance: (modelConfiguration: ModelConfiguration) => Models;
/**
 * Convert given roles to its normalized representation.
 * @param roles - Unstructured role's description.
 * @returns Normalized roles representation.
 */
export declare const normalizeRoles: (roles: Roles) => NormalizedRoles;
