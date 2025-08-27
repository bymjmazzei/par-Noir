"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecentralizedAuth = void 0;
const DIDResolver_1 = require("./DIDResolver");
const didValidator_1 = require("../utils/didValidator");
class DecentralizedAuth {
    constructor(resolver) {
        this.sessions = new Map();
        this.rateLimiter = new Map();
        this.auditLog = [];
        this.challengeStore = new Map();
        this.resolver = resolver || new DIDResolver_1.DIDResolver();
    }
    async createChallenge(did, expiresIn = 300000) {
        const startTime = Date.now();
        try {
            if (!this.checkRateLimit(did)) {
                throw new Error('Rate limit exceeded - too many challenge requests');
            }
            if (!this.isValidDIDFormat(did)) {
                throw new Error('Invalid DID format');
            }
            const challenge = this.generateChallenge();
            const timestamp = new Date().toISOString();
            const expiresAt = new Date(Date.now() + expiresIn).toISOString();
            const authChallenge = {
                did,
                challenge,
                timestamp,
                expiresAt
            };
            this.challengeStore.set(did, authChallenge);
            this.logSecurityEvent('challenge_created', {
                did,
                expiresIn,
                duration: Date.now() - startTime
            });
            return authChallenge;
        }
        catch (error) {
            this.logSecurityEvent('challenge_creation_failed', {
                did,
                error: error instanceof Error ? error.message : 'Unknown error',
                duration: Date.now() - startTime
            });
            throw error;
        }
    }
    async authenticate(did, signature) {
        const startTime = Date.now();
        try {
            if (!this.checkRateLimit(did)) {
                throw new Error('Rate limit exceeded - too many authentication attempts');
            }
            if (!this.isValidSignatureFormat(signature)) {
                throw new Error('Invalid signature format');
            }
            const storedChallenge = this.challengeStore.get(did);
            if (!storedChallenge) {
                await this.delay(100);
                throw new Error('No authentication challenge found');
            }
            if (new Date() > new Date(storedChallenge.expiresAt)) {
                await this.delay(100);
                throw new Error('Authentication challenge expired');
            }
            if (!this.constantTimeCompare(signature.challenge, storedChallenge.challenge)) {
                await this.delay(100);
                throw new Error('Challenge mismatch');
            }
            const didResolution = await this.resolver.resolve(did);
            const publicKey = this.extractPublicKey(didResolution.didDocument);
            if (!publicKey) {
                throw new Error('No public key found in DID document');
            }
            const isValid = await this.verifySignature(signature.challenge, signature.signature, publicKey);
            if (!isValid) {
                await this.delay(100);
                throw new Error('Invalid signature');
            }
            const session = {
                did,
                authenticatedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                deviceId: this.getDeviceId(),
                permissions: ['read', 'write', 'sync']
            };
            this.sessions.set(did, session);
            await this.storeSessionSecurely(did, session);
            this.challengeStore.delete(did);
            this.logSecurityEvent('authentication_success', {
                did,
                deviceId: session.deviceId,
                duration: Date.now() - startTime
            });
            return session;
        }
        catch (error) {
            this.logSecurityEvent('authentication_failed', {
                did,
                error: error instanceof Error ? error.message : 'Unknown error',
                duration: Date.now() - startTime
            });
            if (process.env.NODE_ENV === 'development') {
                console.error('Authentication failed:', error);
            }
            return null;
        }
    }
    async isAuthenticated(did) {
        try {
            const session = this.sessions.get(did);
            if (!session) {
                const storedSession = await this.getSessionSecurely(did);
                if (!storedSession)
                    return false;
                if (new Date() > new Date(storedSession.expiresAt)) {
                    await this.removeSessionSecurely(did);
                    return false;
                }
                this.sessions.set(did, storedSession);
                return true;
            }
            return new Date() <= new Date(session.expiresAt);
        }
        catch (error) {
            this.logSecurityEvent('session_verification_failed', {
                did,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            if (process.env.NODE_ENV === 'development') {
                console.error('Session verification failed:', error);
            }
            return false;
        }
    }
    getSession(did) {
        return this.sessions.get(did) || null;
    }
    async logout(did) {
        try {
            this.sessions.delete(did);
            await this.removeSessionSecurely(did);
            this.logSecurityEvent('logout_success', { did });
        }
        catch (error) {
            this.logSecurityEvent('logout_failed', {
                did,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
    generateChallenge() {
        const randomBytes = crypto.getRandomValues(new Uint8Array(64));
        return btoa(String.fromCharCode(...randomBytes));
    }
    extractPublicKey(didDocument) {
        try {
            const verificationMethod = didDocument.verificationMethod?.[0];
            if (!verificationMethod)
                return null;
            if (!verificationMethod.id || !verificationMethod.type || !verificationMethod.controller) {
                return null;
            }
            if (verificationMethod.publicKeyMultibase) {
                if (!this.isValidMultibaseFormat(verificationMethod.publicKeyMultibase)) {
                    return null;
                }
                return verificationMethod.publicKeyMultibase;
            }
            if (verificationMethod.publicKeyJwk) {
                return this.jwkToRaw(verificationMethod.publicKeyJwk);
            }
            return null;
        }
        catch (error) {
            this.logSecurityEvent('public_key_extraction_failed', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return null;
        }
    }
    async verifySignature(message, signature, publicKey) {
        try {
            if (!this.isValidSignatureFormat({ signature, publicKey })) {
                return false;
            }
            const signatureBytes = new Uint8Array(atob(signature).split('').map(char => char.charCodeAt(0)));
            const publicKeyBytes = new Uint8Array(atob(publicKey).split('').map(char => char.charCodeAt(0)));
            const cryptoKey = await crypto.subtle.importKey('raw', publicKeyBytes, { name: 'Ed25519' }, false, ['verify']);
            const encoder = new TextEncoder();
            const messageBytes = encoder.encode(message);
            const isValid = await crypto.subtle.verify({ name: 'Ed25519' }, cryptoKey, signatureBytes, messageBytes);
            await this.delay(isValid ? 50 : 50);
            return isValid;
        }
        catch (error) {
            this.logSecurityEvent('signature_verification_failed', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return false;
        }
    }
    jwkToRaw(jwk) {
        try {
            if (!jwk.kty || !jwk.crv || !jwk.x) {
                throw new Error('Invalid JWK structure');
            }
            return btoa(JSON.stringify(jwk));
        }
        catch (error) {
            this.logSecurityEvent('jwk_conversion_failed', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
    getDeviceId() {
        let deviceId = sessionStorage.getItem('deviceId');
        if (!deviceId) {
            const timestamp = Date.now();
            const random = crypto.getRandomValues(new Uint8Array(16));
            const entropy = Array.from(random, byte => byte.toString(16).padStart(2, '0')).join('');
            deviceId = `device-${timestamp}-${entropy}`;
            sessionStorage.setItem('deviceId', deviceId);
        }
        return deviceId;
    }
    async createSignature(challenge, privateKey) {
        try {
            if (!this.isValidChallengeFormat(challenge)) {
                throw new Error('Invalid challenge format');
            }
            const encoder = new TextEncoder();
            const messageBytes = encoder.encode(challenge);
            const signature = await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, messageBytes);
            return {
                challenge,
                signature: btoa(String.fromCharCode(...new Uint8Array(signature))),
                publicKey: '',
                timestamp: new Date().toISOString()
            };
        }
        catch (error) {
            this.logSecurityEvent('signature_creation_failed', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
    async generateKeyPair() {
        try {
            const keyPair = await crypto.subtle.generateKey({
                name: 'Ed25519'
            }, true, ['sign', 'verify']);
            this.logSecurityEvent('key_pair_generated', {});
            return {
                publicKey: keyPair.publicKey,
                privateKey: keyPair.privateKey
            };
        }
        catch (error) {
            this.logSecurityEvent('key_pair_generation_failed', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
    async exportPublicKey(publicKey) {
        try {
            const exported = await crypto.subtle.exportKey('raw', publicKey);
            const result = btoa(String.fromCharCode(...new Uint8Array(exported)));
            if (!this.isValidExportedKeyFormat(result)) {
                throw new Error('Invalid exported key format');
            }
            return result;
        }
        catch (error) {
            this.logSecurityEvent('public_key_export_failed', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
    async storeSessionSecurely(did, session) {
        try {
            if (window.crypto && window.crypto.subtle) {
                const encrypted = await this.encryptForStorage(JSON.stringify(session));
                sessionStorage.setItem(`auth:session:${did}`, encrypted);
            }
            else {
                sessionStorage.setItem(`auth:session:${did}`, JSON.stringify(session));
            }
        }
        catch (error) {
            this.logSecurityEvent('session_storage_failed', {
                did,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
    async getSessionSecurely(did) {
        try {
            const encrypted = sessionStorage.getItem(`auth:session:${did}`);
            if (!encrypted)
                return null;
            if (window.crypto && window.crypto.subtle) {
                const decrypted = await this.decryptFromStorage(encrypted);
                return JSON.parse(decrypted);
            }
            else {
                return JSON.parse(encrypted);
            }
        }
        catch (error) {
            return null;
        }
    }
    async removeSessionSecurely(did) {
        try {
            sessionStorage.removeItem(`auth:session:${did}`);
        }
        catch (error) {
            this.logSecurityEvent('session_removal_failed', {
                did,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    async encryptForStorage(data) {
        const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(data);
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
        return JSON.stringify({
            data: Array.from(new Uint8Array(encrypted)),
            iv: Array.from(iv)
        });
    }
    async decryptFromStorage(encryptedData) {
        try {
            const { data, iv } = JSON.parse(encryptedData);
            const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
            const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, key, new Uint8Array(data));
            return new TextDecoder().decode(decrypted);
        }
        catch (error) {
            throw new Error('Failed to decrypt stored data');
        }
    }
    constantTimeCompare(a, b) {
        if (a.length !== b.length) {
            return false;
        }
        let result = 0;
        for (let i = 0; i < a.length; i++) {
            result |= a.charCodeAt(i) ^ b.charCodeAt(i);
        }
        return result === 0;
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    checkRateLimit(identifier) {
        const now = Date.now();
        const limit = this.rateLimiter.get(identifier);
        if (!limit || now > limit.resetTime) {
            this.rateLimiter.set(identifier, { count: 1, resetTime: now + 60000 });
            return true;
        }
        if (limit.count >= 5) {
            this.logSecurityEvent('auth_rate_limit_exceeded', { identifier });
            return false;
        }
        limit.count++;
        return true;
    }
    isValidDIDFormat(did) {
        const validation = didValidator_1.DIDValidator.validateDID(did);
        return validation.isValid;
    }
    isValidSignatureFormat(signature) {
        if (!signature.signature || !signature.publicKey)
            return false;
        const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
        return base64Pattern.test(signature.signature) && base64Pattern.test(signature.publicKey);
    }
    isValidChallengeFormat(challenge) {
        if (!challenge || typeof challenge !== 'string')
            return false;
        const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
        return base64Pattern.test(challenge) && challenge.length >= 32;
    }
    isValidMultibaseFormat(key) {
        if (!key || typeof key !== 'string')
            return false;
        const multibasePattern = /^z[1-9A-HJ-NP-Za-km-z]{45,}$/;
        return multibasePattern.test(key);
    }
    isValidExportedKeyFormat(key) {
        if (!key || typeof key !== 'string')
            return false;
        const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
        return base64Pattern.test(key) && key.length >= 32;
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
    getAuditLog() {
        return [...this.auditLog];
    }
    clearAuditLog() {
        this.auditLog = [];
    }
}
exports.DecentralizedAuth = DecentralizedAuth;
//# sourceMappingURL=DecentralizedAuth.js.map