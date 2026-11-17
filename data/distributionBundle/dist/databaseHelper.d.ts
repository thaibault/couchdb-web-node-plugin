import type { Mapping } from 'clientnode';
import type { ModelRolesMapping, Attachment, BaseModelConfiguration, Document, Models, PartialFullDocument, SecuritySettings, SpecialPropertyNames, UserContext } from './type';
import { Logger } from 'clientnode';
/**
 * WebNode plugin interface with all provided hooks.
 */
export declare const log: Logger;
/**
 * Authorizes given document update against given mapping of allowed roles for
 * writing into corresponding model instances.
 * @param newDocument - Updated document.
 * @param oldDocument - If an existing document should be updated its given
 * here.
 * @param userContext - Contains meta information about currently acting user.
 * @param securitySettings - Database security settings.
 * @param modelRolesMapping - Allowed roles for given models.
 * @param read - Indicates whether a read or write of given document should be
 * authorized or not.
 * @param specialNames - Special names configuration.
 * @param contextPath - Path of properties leading to current document.
 * @param parentRoles - Roles of parent object when called recursively.
 * @param toJSON - JSON stringifier.
 * @param fromJSON - JSON parser.
 * @returns Throws an exception if authorization is not accepted and "true"
 * otherwise.
 */
export declare const authorize: (newDocument: Partial<Document>, oldDocument?: null | Partial<Document>, userContext?: Partial<UserContext>, securitySettings?: Partial<SecuritySettings>, modelRolesMapping?: ModelRolesMapping, read?: boolean, specialNames?: SpecialPropertyNames, contextPath?: Array<string>, parentRoles?: Array<string>, toJSON?: (value: unknown) => string, fromJSON?: (value: string) => unknown) => true;
/**
 * Represents a design document validation function for given model
 * specification.
 * @param newDocument - Updated document.
 * @param oldDocument - If an existing document should be updated its given
 * here.
 * @param userContext - Contains meta information about currently acting user.
 * @param securitySettings - Database security settings.
 * @param modelConfiguration - Model configuration object.
 * @param models - Models specification object.
 * @param checkPublicModelType - Indicates whether to public model types only.
 * @param toJSON - JSON stringifier.
 * @param fromJSON - JSON parser.
 * @returns Modified given new document.
 */
export declare const validateDocumentUpdate: <ObjectType extends object = object, AttachmentType extends Attachment = Attachment, AdditionalDefinition extends object = Mapping<unknown>, AdditionalPropertiesType = unknown>(newDocument: PartialFullDocument<ObjectType, AdditionalPropertiesType>, oldDocument: (null | PartialFullDocument<ObjectType, AdditionalPropertiesType>), userContext: Partial<UserContext>, securitySettings: Partial<SecuritySettings>, modelConfiguration: BaseModelConfiguration<ObjectType, AdditionalDefinition>, models?: Models<ObjectType, AttachmentType, AdditionalDefinition, AdditionalPropertiesType>, checkPublicModelType?: boolean, toJSON?: (value: unknown) => string, fromJSON?: (value: string) => unknown) => PartialFullDocument<ObjectType, AdditionalPropertiesType>;
export declare const databaseHelper: {
    authorize: typeof authorize;
    validateDocumentUpdate: typeof validateDocumentUpdate;
};
export default databaseHelper;
