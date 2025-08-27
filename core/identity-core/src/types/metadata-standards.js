"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ERROR_CODES = exports.VALID_SHARING_LEVELS = exports.VALID_PRIVACY_LEVELS = exports.VALID_CONTACT_TYPES = exports.VALID_CUSTODIAN_TYPES = exports.VALID_DEVICE_TYPES = exports.DEVICE_SYNC_EXPIRATION_HOURS = exports.QR_CODE_EXPIRATION_HOURS = exports.DEFAULT_RECOVERY_THRESHOLD = exports.MIN_CUSTODIANS = exports.MAX_CUSTODIANS = exports.CONTEXT_URL = exports.PROTOCOL_VERSION = exports.isQRCodeData = exports.isRecoveryCustodian = exports.isIdentityDocument = exports.validatePhone = exports.validateEmail = exports.generateUniqueId = exports.isExpired = exports.generateExpirationTime = exports.generateTimestamp = exports.needsMigration = exports.migrateV1_0_to_V1_1 = exports.createIPFSCID = exports.deserializeFromIPFS = exports.serializeForIPFS = exports.validateQRCodeData = exports.validateCustodianInvitation = exports.validateIdentityDocument = void 0;
const validateIdentityDocument = (doc) => {
    return !!(doc.id &&
        doc.createdAt &&
        doc.metadata &&
        doc.custodians &&
        doc.recoveryConfig);
};
exports.validateIdentityDocument = validateIdentityDocument;
const validateCustodianInvitation = (invitation) => {
    return !!(invitation.invitationId &&
        invitation.identityId &&
        invitation.custodianName &&
        invitation.contactValue);
};
exports.validateCustodianInvitation = validateCustodianInvitation;
const validateQRCodeData = (data) => {
    return !!(data.type &&
        data.timestamp &&
        data.expiresAt &&
        data.data);
};
exports.validateQRCodeData = validateQRCodeData;
const serializeForIPFS = (data) => {
    return JSON.stringify(data, null, 2);
};
exports.serializeForIPFS = serializeForIPFS;
const deserializeFromIPFS = (data) => {
    return JSON.parse(data);
};
exports.deserializeFromIPFS = deserializeFromIPFS;
const createIPFSCID = async (data) => {
    const serialized = (0, exports.serializeForIPFS)(data);
    return "Qm" + btoa(serialized).substring(0, 44);
};
exports.createIPFSCID = createIPFSCID;
const migrateV1_0_to_V1_1 = (oldData) => {
    return {
        ...oldData,
        "@context": "https://identity-protocol.com/v1",
        updatedAt: new Date().toISOString()
    };
};
exports.migrateV1_0_to_V1_1 = migrateV1_0_to_V1_1;
const needsMigration = (currentVersion, targetVersion) => {
    const current = currentVersion.split('.').map(Number);
    const target = targetVersion.split('.').map(Number);
    return current[0] < target[0] ||
        (current[0] === target[0] && current[1] < target[1]) ||
        (current[0] === target[0] && current[1] === target[1] && current[2] < target[2]);
};
exports.needsMigration = needsMigration;
const generateTimestamp = () => {
    return new Date().toISOString();
};
exports.generateTimestamp = generateTimestamp;
const generateExpirationTime = (hours = 24) => {
    const expiration = new Date();
    expiration.setHours(expiration.getHours() + hours);
    return expiration.toISOString();
};
exports.generateExpirationTime = generateExpirationTime;
const isExpired = (timestamp) => {
    return new Date(timestamp) < new Date();
};
exports.isExpired = isExpired;
const generateUniqueId = () => {
    return `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};
exports.generateUniqueId = generateUniqueId;
const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};
exports.validateEmail = validateEmail;
const validatePhone = (phone) => {
    const phoneRegex = /^\+?[\d\s\-()]{10,}$/;
    return phoneRegex.test(phone);
};
exports.validatePhone = validatePhone;
const isIdentityDocument = (obj) => {
    return obj &&
        typeof obj.id === 'string' &&
        typeof obj.createdAt === 'string' &&
        typeof obj.metadata === 'object';
};
exports.isIdentityDocument = isIdentityDocument;
const isRecoveryCustodian = (obj) => {
    return obj &&
        typeof obj.id === 'string' &&
        typeof obj.name === 'string' &&
        typeof obj.type === 'string';
};
exports.isRecoveryCustodian = isRecoveryCustodian;
const isQRCodeData = (obj) => {
    return obj &&
        typeof obj.type === 'string' &&
        typeof obj.timestamp === 'string' &&
        typeof obj.data === 'object';
};
exports.isQRCodeData = isQRCodeData;
exports.PROTOCOL_VERSION = "1.0.0";
exports.CONTEXT_URL = "https://identity-protocol.com/v1";
exports.MAX_CUSTODIANS = 5;
exports.MIN_CUSTODIANS = 2;
exports.DEFAULT_RECOVERY_THRESHOLD = 2;
exports.QR_CODE_EXPIRATION_HOURS = 24;
exports.DEVICE_SYNC_EXPIRATION_HOURS = 1;
exports.VALID_DEVICE_TYPES = ["mobile", "desktop", "tablet", "other"];
exports.VALID_CUSTODIAN_TYPES = ["person", "service", "self"];
exports.VALID_CONTACT_TYPES = ["email", "phone"];
exports.VALID_PRIVACY_LEVELS = ["high", "medium", "low"];
exports.VALID_SHARING_LEVELS = ["open", "selective", "closed"];
exports.ERROR_CODES = {
    INVALID_IDENTITY_DOCUMENT: "INVALID_IDENTITY_DOCUMENT",
    INVALID_CUSTODIAN_DATA: "INVALID_CUSTODIAN_DATA",
    INVALID_QR_CODE_DATA: "INVALID_QR_CODE_DATA",
    EXPIRED_DATA: "EXPIRED_DATA",
    INVALID_SIGNATURE: "INVALID_SIGNATURE",
    INSUFFICIENT_CUSTODIANS: "INSUFFICIENT_CUSTODIANS",
    TOO_MANY_CUSTODIANS: "TOO_MANY_CUSTODIANS",
    INVALID_CONTACT_INFO: "INVALID_CONTACT_INFO",
    INVALID_DEVICE_TYPE: "INVALID_DEVICE_TYPE",
    SERIALIZATION_ERROR: "SERIALIZATION_ERROR",
    DESERIALIZATION_ERROR: "DESERIALIZATION_ERROR",
    MIGRATION_ERROR: "MIGRATION_ERROR",
    VERSION_MISMATCH: "VERSION_MISMATCH"
};
//# sourceMappingURL=metadata-standards.js.map