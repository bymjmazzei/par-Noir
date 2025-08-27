"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DIDResolver = void 0;
const didValidator_1 = require("../utils/didValidator");
class DIDResolver {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000;
        this.rateLimiter = new Map();
        this.auditLog = [];
    }
    async resolve(did) {
        const startTime = Date.now();
        try {
            if (!this.checkRateLimit(did)) {
                throw new Error('Rate limit exceeded - too many resolution attempts');
            }
            const cached = this.cache.get(did);
            if (cached && Date.now() - new Date(cached.metadata.updated).getTime() < this.cacheTimeout) {
                this.logSecurityEvent('did_resolution_cache_hit', { did, duration: Date.now() - startTime });
                return cached;
            }
            const sources = [
                () => this.resolveFromLocalStorage(did),
                () => this.resolveFromIPFS(did),
                () => this.resolveFromBlockchain(did),
                () => this.resolveFromWeb(did)
            ];
            const results = [];
            for (const source of sources) {
                try {
                    const result = await source();
                    if (result) {
                        const validation = this.validateDIDDocument(result.didDocument);
                        if (validation.isValid) {
                            this.cache.set(did, result);
                            this.logSecurityEvent('did_resolution_success', {
                                did,
                                source: source.name,
                                duration: Date.now() - startTime
                            });
                            return result;
                        }
                        else {
                            this.logSecurityEvent('did_resolution_validation_failed', {
                                did,
                                errors: validation.errors
                            });
                        }
                    }
                    results.push(result);
                }
                catch (error) {
                    this.logSecurityEvent('did_resolution_source_failed', {
                        did,
                        source: source.name,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                    results.push(null);
                }
            }
            throw new Error(`Could not resolve DID: ${did} - no valid sources found`);
        }
        catch (error) {
            this.logSecurityEvent('did_resolution_failed', {
                did,
                error: error instanceof Error ? error.message : 'Unknown error',
                duration: Date.now() - startTime
            });
            throw error;
        }
    }
    validateDIDDocument(didDoc) {
        const errors = [];
        const warnings = [];
        try {
            if (!didDoc.id) {
                errors.push('Missing DID identifier');
            }
            if (!didDoc.verificationMethod || !Array.isArray(didDoc.verificationMethod)) {
                errors.push('Missing or invalid verification methods');
            }
            if (!didDoc.authentication || !Array.isArray(didDoc.authentication)) {
                errors.push('Missing or invalid authentication methods');
            }
            if (didDoc.verificationMethod) {
                for (const vm of didDoc.verificationMethod) {
                    if (!vm.id || !vm.type || !vm.controller) {
                        errors.push('Invalid verification method structure');
                        break;
                    }
                }
            }
            if (didDoc.service) {
                for (const service of didDoc.service) {
                    if (service.serviceEndpoint && typeof service.serviceEndpoint === 'string') {
                        if (service.serviceEndpoint.includes('javascript:') ||
                            service.serviceEndpoint.includes('data:') ||
                            service.serviceEndpoint.includes('vbscript:')) {
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
        catch (error) {
            return {
                isValid: false,
                errors: ['Failed to validate DID document structure'],
                warnings: []
            };
        }
    }
    async resolveFromLocalStorage(did) {
        try {
            const stored = sessionStorage.getItem(`did:${did}`);
            if (!stored)
                return null;
            const didDoc = JSON.parse(stored);
            if (!this.isValidDIDFormat(didDoc.id)) {
                throw new Error('Invalid DID format in local storage');
            }
            return {
                didDocument: didDoc,
                metadata: {
                    created: didDoc.created || new Date().toISOString(),
                    updated: didDoc.updated || new Date().toISOString()
                }
            };
        }
        catch (error) {
            this.logSecurityEvent('local_storage_resolution_failed', {
                did,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return null;
        }
    }
    async resolveFromIPFS(did) {
        try {
            const ipfsMatch = did.match(/did:ipfs:(.+)/);
            if (!ipfsMatch)
                return null;
            const cid = ipfsMatch[1];
            if (!this.isValidCIDFormat(cid)) {
                throw new Error('Invalid IPFS CID format');
            }
            const gateways = [
                'https://ipfs.io',
                'https://gateway.pinata.cloud',
                'https://cloudflare-ipfs.com',
                'https://dweb.link'
            ];
            for (const gateway of gateways) {
                try {
                    const response = await fetch(`${gateway}/ipfs/${cid}`, {
                        headers: {
                            'Accept': 'application/did+json, application/json'
                        }
                    });
                    if (!response.ok) {
                        continue;
                    }
                    const didDoc = await response.json();
                    if (!this.isValidDIDFormat(didDoc.id)) {
                        continue;
                    }
                    return {
                        didDocument: didDoc,
                        metadata: {
                            created: didDoc.created || new Date().toISOString(),
                            updated: didDoc.updated || new Date().toISOString()
                        }
                    };
                }
                catch (error) {
                    continue;
                }
            }
            return null;
        }
        catch (error) {
            this.logSecurityEvent('ipfs_resolution_failed', {
                did,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return null;
        }
    }
    async resolveFromBlockchain(did) {
        try {
            const methods = [
                () => this.resolveDidKey(did),
                () => this.resolveDidWeb(did),
                () => this.resolveDidIon(did)
            ];
            for (const method of methods) {
                try {
                    const result = await method();
                    if (result) {
                        const validation = this.validateDIDDocument(result.didDocument);
                        if (validation.isValid) {
                            return result;
                        }
                    }
                }
                catch (error) {
                }
            }
            return null;
        }
        catch (error) {
            this.logSecurityEvent('blockchain_resolution_failed', {
                did,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return null;
        }
    }
    async resolveFromWeb(did) {
        try {
            const webMatch = did.match(/did:web:(.+)/);
            if (!webMatch)
                return null;
            const domain = webMatch[1];
            if (!this.isValidDomainFormat(domain)) {
                throw new Error('Invalid domain format in DID');
            }
            const gateways = [
                `https://${domain}/.well-known/did.json`,
                `https://${domain}/.well-known/did`
            ];
            for (const url of gateways) {
                try {
                    const response = await fetch(url, {
                        headers: {
                            'Accept': 'application/did+json, application/json'
                        }
                    });
                    if (!response.ok) {
                        continue;
                    }
                    const didDoc = await response.json();
                    if (!this.isValidDIDFormat(didDoc.id)) {
                        continue;
                    }
                    return {
                        didDocument: didDoc,
                        metadata: {
                            created: didDoc.created || new Date().toISOString(),
                            updated: didDoc.updated || new Date().toISOString()
                        }
                    };
                }
                catch (error) {
                    continue;
                }
            }
            return null;
        }
        catch (error) {
            this.logSecurityEvent('web_resolution_failed', {
                did,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return null;
        }
    }
    async resolveDidKey(did) {
        const keyMatch = did.match(/did:key:(.+)/);
        if (!keyMatch)
            return null;
        const publicKey = keyMatch[1];
        if (!this.isValidPublicKeyFormat(publicKey)) {
            throw new Error('Invalid public key format in did:key');
        }
        const didDoc = {
            id: did,
            verificationMethod: [{
                    id: `${did}#key-1`,
                    type: 'Ed25519VerificationKey2020',
                    controller: did,
                    publicKeyMultibase: publicKey
                }],
            authentication: [`${did}#key-1`],
            assertionMethod: [`${did}#key-1`],
            capabilityInvocation: [`${did}#key-1`],
            capabilityDelegation: [`${did}#key-1`]
        };
        return {
            didDocument: didDoc,
            metadata: {
                created: new Date().toISOString(),
                updated: new Date().toISOString()
            }
        };
    }
    async resolveDidWeb(did) {
        return this.resolveFromWeb(did);
    }
    async resolveDidIon(did) {
        try {
            const ionMatch = did.match(/did:ion:(.+)/);
            if (!ionMatch)
                return null;
            const suffix = ionMatch[1];
            if (!this.isValidIONFormat(suffix)) {
                throw new Error('Invalid ION DID format');
            }
            const response = await fetch(`https://ion.tbd.engineering/identifiers/${did}`, {
                headers: {
                    'Accept': 'application/did+json, application/json'
                }
            });
            if (!response.ok)
                return null;
            const result = await response.json();
            if (!result.didDocument || !this.isValidDIDFormat(result.didDocument.id)) {
                throw new Error('Invalid ION DID document');
            }
            return {
                didDocument: result.didDocument,
                metadata: result.metadata
            };
        }
        catch (error) {
            this.logSecurityEvent('ion_resolution_failed', {
                did,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return null;
        }
    }
    isValidDIDFormat(did) {
        const validation = didValidator_1.DIDValidator.validateDID(did);
        return validation.isValid;
    }
    isValidCIDFormat(cid) {
        return didValidator_1.DIDValidator.validateCID(cid);
    }
    isValidDomainFormat(domain) {
        return didValidator_1.DIDValidator.validateDomain(domain);
    }
    isValidPublicKeyFormat(key) {
        const validation = didValidator_1.DIDValidator.validateDID(`did:key:${key}`);
        return validation.isValid;
    }
    isValidIONFormat(suffix) {
        const validation = didValidator_1.DIDValidator.validateDID(`did:ion:${suffix}`);
        return validation.isValid;
    }
    checkRateLimit(did) {
        const now = Date.now();
        const limit = this.rateLimiter.get(did);
        if (!limit || now > limit.resetTime) {
            this.rateLimiter.set(did, { count: 1, resetTime: now + 60000 });
            return true;
        }
        if (limit.count >= 10) {
            this.logSecurityEvent('did_resolution_rate_limit_exceeded', { did });
            return false;
        }
        limit.count++;
        return true;
    }
    logSecurityEvent(event, details) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            event,
            details,
            userAgent: navigator.userAgent
        };
        this.auditLog.push(logEntry);
        if (this.auditLog.length > 1000) {
            this.auditLog = this.auditLog.slice(-1000);
        }
        this.sendToAuditLog(logEntry);
    }
    async sendToAuditLog(logEntry) {
        try {
            if (process.env.NODE_ENV === 'development') {
            }
        }
        catch (error) {
            if (process.env.NODE_ENV === 'development') {
            }
        }
    }
    clearCache() {
        this.cache.clear();
        this.logSecurityEvent('cache_cleared', {});
    }
    setCacheTimeout(timeout) {
        this.cacheTimeout = timeout;
        this.logSecurityEvent('cache_timeout_updated', { timeout });
    }
    getAuditLog() {
        return [...this.auditLog];
    }
    clearAuditLog() {
        this.auditLog = [];
    }
}
exports.DIDResolver = DIDResolver;
//# sourceMappingURL=DIDResolver.js.map