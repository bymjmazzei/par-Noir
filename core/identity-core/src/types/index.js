"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdentityErrorCodes = exports.IdentityError = void 0;
class IdentityError extends Error {
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'IdentityError';
    }
}
exports.IdentityError = IdentityError;
exports.IdentityErrorCodes = {
    DID_NOT_FOUND: 'DID_NOT_FOUND',
    INVALID_PASSCODE: 'INVALID_PASSCODE',
    INVALID_SIGNATURE: 'INVALID_SIGNATURE',
    PERMISSION_DENIED: 'PERMISSION_DENIED',
    STORAGE_ERROR: 'STORAGE_ERROR',
    ENCRYPTION_ERROR: 'ENCRYPTION_ERROR',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    CREATION_ERROR: 'CREATION_ERROR',
    AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
    NOT_FOUND_ERROR: 'NOT_FOUND_ERROR',
    PRIVACY_ERROR: 'PRIVACY_ERROR',
    SECURITY_ERROR: 'SECURITY_ERROR',
};
//# sourceMappingURL=index.js.map