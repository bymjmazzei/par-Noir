"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DIDValidator = void 0;
class DIDValidator {
    static validateDID(did) {
        const errors = [];
        const warnings = [];
        if (!did || typeof did !== 'string') {
            errors.push('DID must be a non-empty string');
            return { isValid: false, errors, warnings };
        }
        if (did.length > 100) {
            errors.push('DID length exceeds maximum limit of 100 characters');
        }
        if (did.length < 10) {
            errors.push('DID appears to be too short');
        }
        const components = this.parseDID(did);
        if (!components) {
            errors.push('Invalid DID format');
            return { isValid: false, errors, warnings };
        }
        if (components.scheme !== 'did') {
            errors.push('DID must start with "did:"');
        }
        if (!this.DID_METHOD_PATTERN.test(components.method)) {
            errors.push('Invalid DID method format');
        }
        if (!this.DID_IDENTIFIER_PATTERN.test(components.identifier)) {
            errors.push('Invalid DID identifier format');
        }
        const methodValidation = this.validateMethodSpecific(did, components);
        errors.push(...methodValidation.errors);
        warnings.push(...methodValidation.warnings);
        if (this.containsSuspiciousPatterns(did)) {
            errors.push('DID contains potentially malicious patterns');
        }
        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            didType: methodValidation.didType,
            method: components.method,
            identifier: components.identifier
        };
    }
    static parseDID(did) {
        try {
            const parts = did.split(':');
            if (parts.length < 3) {
                return null;
            }
            const scheme = parts[0];
            const method = parts[1];
            const identifier = parts.slice(2).join(':');
            return {
                scheme,
                method,
                identifier
            };
        }
        catch (error) {
            return null;
        }
    }
    static validateMethodSpecific(did, components) {
        const errors = [];
        const warnings = [];
        let didType = 'unknown';
        switch (components.method) {
            case 'key':
                didType = 'key';
                if (!this.DID_KEY_PATTERN.test(did)) {
                    errors.push('Invalid did:key format');
                }
                else {
                    const keyPart = components.identifier;
                    if (!this.isValidPublicKey(keyPart)) {
                        errors.push('Invalid public key format in did:key');
                    }
                }
                break;
            case 'web':
                didType = 'web';
                if (!this.DID_WEB_PATTERN.test(did)) {
                    errors.push('Invalid did:web format');
                }
                else {
                    const domain = components.identifier;
                    if (!this.DOMAIN_PATTERN.test(domain)) {
                        errors.push('Invalid domain format in did:web');
                    }
                }
                break;
            case 'ion':
                didType = 'ion';
                if (!this.DID_ION_PATTERN.test(did)) {
                    errors.push('Invalid did:ion format');
                }
                break;
            default:
                warnings.push(`Unknown DID method: ${components.method}`);
                break;
        }
        return { isValid: errors.length === 0, errors, warnings, didType };
    }
    static isValidPublicKey(key) {
        return Object.values(this.PUBLIC_KEY_PATTERNS).some(pattern => pattern.test(key));
    }
    static containsSuspiciousPatterns(did) {
        const suspiciousPatterns = [
            /javascript:/gi,
            /vbscript:/gi,
            /data:/gi,
            /<script/gi,
            /<iframe/gi,
            /<object/gi,
            /<embed/gi,
            /on\w+\s*=/gi,
            /\.\.\//g,
            /\.\.\\/g
        ];
        return suspiciousPatterns.some(pattern => pattern.test(did));
    }
    static validateDIDDocument(didDoc) {
        const errors = [];
        const warnings = [];
        if (!didDoc || typeof didDoc !== 'object') {
            errors.push('DID document must be a valid object');
            return { isValid: false, errors, warnings };
        }
        if (!didDoc.id) {
            errors.push('Missing DID identifier');
        }
        else {
            const didValidation = this.validateDID(didDoc.id);
            if (!didValidation.isValid) {
                errors.push(...didValidation.errors.map(err => `DID validation: ${err}`));
            }
        }
        if (!didDoc.verificationMethod || !Array.isArray(didDoc.verificationMethod)) {
            errors.push('Missing or invalid verification methods');
        }
        else {
            for (const vm of didDoc.verificationMethod) {
                if (!vm.id || !vm.type || !vm.controller) {
                    errors.push('Invalid verification method structure');
                    break;
                }
            }
        }
        if (!didDoc.authentication || !Array.isArray(didDoc.authentication)) {
            errors.push('Missing or invalid authentication methods');
        }
        if (didDoc.service && Array.isArray(didDoc.service)) {
            for (const service of didDoc.service) {
                if (service.serviceEndpoint && typeof service.serviceEndpoint === 'string') {
                    if (this.containsSuspiciousPatterns(service.serviceEndpoint)) {
                        errors.push('Suspicious service endpoint detected');
                    }
                }
            }
        }
        const docSize = JSON.stringify(didDoc).length;
        if (docSize > 10000) {
            warnings.push('DID document size exceeds recommended limit');
        }
        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }
    static validateCID(cid) {
        if (!cid || typeof cid !== 'string') {
            return false;
        }
        return this.CID_PATTERN.test(cid);
    }
    static validateDomain(domain) {
        if (!domain || typeof domain !== 'string') {
            return false;
        }
        return this.DOMAIN_PATTERN.test(domain);
    }
    static validateSignature(signature) {
        if (!signature || typeof signature !== 'string') {
            return false;
        }
        const signaturePattern = /^[A-Za-z0-9+/]{50,}$/;
        return signaturePattern.test(signature);
    }
    static validateChallenge(challenge) {
        if (!challenge || typeof challenge !== 'string') {
            return false;
        }
        const challengePattern = /^[A-Za-z0-9+/]{20,}$/;
        return challengePattern.test(challenge);
    }
    static getDIDMethod(did) {
        const components = this.parseDID(did);
        return components ? components.method : null;
    }
    static getDIDIdentifier(did) {
        const components = this.parseDID(did);
        return components ? components.identifier : null;
    }
    static isDIDMethod(did, method) {
        const didMethod = this.getDIDMethod(did);
        return didMethod === method;
    }
    static normalizeDID(did) {
        if (!did)
            return did;
        const normalized = did.trim();
        const components = this.parseDID(normalized);
        if (!components)
            return normalized;
        return `did:${components.method.toLowerCase()}:${components.identifier}`;
    }
    static generateDIDKey(publicKey) {
        if (!this.isValidPublicKey(publicKey)) {
            return null;
        }
        return `did:key:${publicKey}`;
    }
    static extractPublicKeyFromDIDKey(didKey) {
        if (!this.isDIDMethod(didKey, 'key')) {
            return null;
        }
        const identifier = this.getDIDIdentifier(didKey);
        if (!identifier || !this.isValidPublicKey(identifier)) {
            return null;
        }
        return identifier;
    }
}
exports.DIDValidator = DIDValidator;
DIDValidator.DID_SCHEME_PATTERN = /^did$/;
DIDValidator.DID_METHOD_PATTERN = /^[a-z0-9]+$/;
DIDValidator.DID_IDENTIFIER_PATTERN = /^[a-zA-Z0-9._-]+$/;
DIDValidator.DID_KEY_PATTERN = /^did:key:[a-zA-Z0-9]{32,}$/;
DIDValidator.DID_WEB_PATTERN = /^did:web:[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
DIDValidator.DID_ION_PATTERN = /^did:ion:[a-zA-Z0-9._-]+$/;
DIDValidator.PUBLIC_KEY_PATTERNS = {
    'Ed25519': /^z[1-9A-HJ-NP-Za-km-z]{44}$/,
    'X25519': /^z[1-9A-HJ-NP-Za-km-z]{44}$/,
    'P-256': /^z[1-9A-HJ-NP-Za-km-z]{44}$/,
    'P-384': /^z[1-9A-HJ-NP-Za-km-z]{44}$/,
    'P-521': /^z[1-9A-HJ-NP-Za-km-z]{44}$/,
    'RSA': /^z[1-9A-HJ-NP-Za-km-z]{44,}$/
};
DIDValidator.CID_PATTERN = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
DIDValidator.DOMAIN_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
//# sourceMappingURL=didValidator.js.map