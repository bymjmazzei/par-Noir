"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DistributedIdentityManager = exports.DecentralizedAuth = exports.IdentitySync = exports.DIDResolver = exports.ZKProofManager = exports.PrivacyManager = exports.IndexedDBStorage = exports.CryptoManager = exports.IdentityCore = void 0;
const types_1 = require("./types");
const crypto_1 = require("./encryption/crypto");
const indexeddb_1 = require("./storage/indexeddb");
const privacy_manager_1 = require("./utils/privacy-manager");
const device_security_1 = require("./security/device-security");
const webauthn_1 = require("./security/webauthn");
const supply_chain_security_1 = require("./security/supply-chain-security");
class IdentityCore {
    constructor(config = {}) {
        this.eventHandlers = new Map();
        this.config = {
            storageType: 'indexeddb',
            encryptionLevel: 'high',
            backupEnabled: false,
            biometricEnabled: false,
            ...config
        };
        this.storage = new indexeddb_1.IndexedDBStorage();
        this.privacyManager = new privacy_manager_1.PrivacyManager();
        this.deviceSecurity = new device_security_1.DeviceSecurityManager();
        this.webAuthn = new webauthn_1.WebAuthnManager();
        this.supplyChainSecurity = new supply_chain_security_1.SupplyChainSecurityManager();
        this.startBackgroundSecurity();
    }
    async startBackgroundSecurity() {
        try {
            const { BackgroundMonitor } = await Promise.resolve().then(() => __importStar(require('./security/background-monitor')));
            BackgroundMonitor.start({
                enabled: true,
                checkInterval: 5 * 60 * 1000,
                cleanupInterval: 60 * 60 * 1000,
                logLevel: 'warn'
            });
        }
        catch (error) {
            console.warn('Background security monitoring not available:', error);
        }
    }
    async initialize() {
        try {
            await this.storage.initialize();
            await this.deviceSecurity.initialize();
            await this.supplyChainSecurity.initialize();
            if (webauthn_1.WebAuthnManager.isSupported()) {
                this.emit('webauthn_supported', { supported: true });
            }
            this.emit('initialized', {});
        }
        catch (error) {
            throw new types_1.IdentityError('Failed to initialize Identity Core', types_1.IdentityErrorCodes.STORAGE_ERROR, error);
        }
    }
    getDeviceSecurity() {
        return this.deviceSecurity;
    }
    getWebAuthn() {
        return this.webAuthn;
    }
    getSupplyChainSecurity() {
        return this.supplyChainSecurity;
    }
    async performSecurityHealthCheck() {
        try {
            const deviceFingerprint = this.deviceSecurity.getDeviceFingerprint();
            const threatHistory = this.deviceSecurity.getThreatHistory();
            const latestAudit = this.supplyChainSecurity.getLatestAuditResult();
            return {
                deviceSecurity: !!deviceFingerprint,
                webAuthnSupported: webauthn_1.WebAuthnManager.isSupported(),
                supplyChainSecurity: latestAudit?.riskLevel !== 'critical',
                threats: threatHistory,
                vulnerabilities: latestAudit ? [latestAudit] : []
            };
        }
        catch (error) {
            throw new types_1.IdentityError('Security health check failed', types_1.IdentityErrorCodes.SECURITY_ERROR, error);
        }
    }
    async createDID(options) {
        try {
            if (!options.pnName || options.pnName.length < 3) {
                throw new types_1.IdentityError('pN Name must be at least 3 characters long', types_1.IdentityErrorCodes.VALIDATION_ERROR);
            }
            if (!/^[a-zA-Z0-9-]+$/.test(options.pnName)) {
                throw new types_1.IdentityError('pN Name can only contain letters, numbers, and hyphens', types_1.IdentityErrorCodes.VALIDATION_ERROR);
            }
            const reservedUsernames = ['admin', 'root', 'system', 'test', 'guest', 'anonymous'];
            if (reservedUsernames.includes(options.pnName.toLowerCase())) {
                throw new types_1.IdentityError('pN Name is reserved and cannot be used', types_1.IdentityErrorCodes.VALIDATION_ERROR);
            }
            const passcodeValidation = crypto_1.CryptoManager.validatePasscode(options.passcode);
            if (!passcodeValidation.isValid) {
                throw new types_1.IdentityError(`Weak passcode: ${passcodeValidation.errors.join(', ')}`, types_1.IdentityErrorCodes.VALIDATION_ERROR);
            }
            const existingDID = await this.storage.getDIDByPNName(options.pnName);
            if (existingDID) {
                throw new types_1.IdentityError('pN Name already exists', types_1.IdentityErrorCodes.VALIDATION_ERROR);
            }
            const keyPair = await crypto_1.CryptoManager.generateKeyPair();
            const did = {
                id: `did:key:${await crypto_1.CryptoManager.hash(keyPair.publicKey)}`,
                pnName: options.pnName,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                status: 'active',
                metadata: {
                    displayName: options.displayName || undefined,
                    email: options.email || undefined,
                    preferences: {
                        privacy: 'medium',
                        sharing: 'selective',
                        notifications: true,
                        backup: this.config.backupEnabled,
                        ...options.preferences
                    },
                    security: {
                        lastLoginAttempt: undefined,
                        failedAttempts: 0,
                        accountLockedUntil: undefined,
                        ipAddress: undefined,
                        userAgent: undefined,
                        deviceFingerprint: undefined
                    }
                },
                keys: {
                    primary: keyPair.privateKey,
                    publicKey: keyPair.publicKey,
                    privateKey: keyPair.privateKey,
                },
                permissions: {}
            };
            await this.storage.storeDID(did, options.passcode);
            this.emit('did_created', { didId: did.id, pnName: did.pnName });
            return did;
        }
        catch (error) {
            throw new types_1.IdentityError('Failed to create DID', types_1.IdentityErrorCodes.CREATION_ERROR, error);
        }
    }
    async authenticate(options) {
        try {
            if (crypto_1.CryptoManager.isAccountLocked(options.pnName)) {
                throw new types_1.IdentityError('Account is temporarily locked due to too many failed attempts. Please try again later.', types_1.IdentityErrorCodes.AUTHENTICATION_ERROR);
            }
            const passcodeValidation = crypto_1.CryptoManager.validatePasscode(options.passcode);
            if (!passcodeValidation.isValid) {
                crypto_1.CryptoManager.recordFailedAttempt(options.pnName);
                throw new types_1.IdentityError(`Weak passcode: ${passcodeValidation.errors.join(', ')}`, types_1.IdentityErrorCodes.VALIDATION_ERROR);
            }
            const did = await this.storage.getDID(options.pnName, options.passcode);
            if (!did) {
                crypto_1.CryptoManager.recordFailedAttempt(options.pnName);
                throw new types_1.IdentityError('Invalid username or passcode', types_1.IdentityErrorCodes.AUTHENTICATION_ERROR);
            }
            if (did.metadata.security?.accountLockedUntil) {
                const lockUntil = new Date(did.metadata.security.accountLockedUntil);
                if (new Date() < lockUntil) {
                    throw new types_1.IdentityError('Account is locked until ' + lockUntil.toLocaleString(), types_1.IdentityErrorCodes.AUTHENTICATION_ERROR);
                }
            }
            crypto_1.CryptoManager.clearFailedAttempts(options.pnName);
            did.metadata.security = {
                ...did.metadata.security,
                lastLoginAttempt: new Date().toISOString(),
                failedAttempts: 0,
                accountLockedUntil: undefined
            };
            await this.storage.updateDID(did, options.passcode);
            this.emit('did_authenticated', { didId: did.id, pnName: did.pnName });
            return did;
        }
        catch (error) {
            if (error instanceof types_1.IdentityError && error.code === types_1.IdentityErrorCodes.AUTHENTICATION_ERROR) {
                crypto_1.CryptoManager.recordFailedAttempt(options.pnName);
            }
            throw error;
        }
    }
    async getAllDIDs() {
        return this.storage.getAllDIDs();
    }
    async updateMetadata(options) {
        try {
            const { MetadataValidator } = await Promise.resolve().then(() => __importStar(require('./security/metadata-validator')));
            const { ThreatDetector } = await Promise.resolve().then(() => __importStar(require('./security/threat-detector')));
            ThreatDetector.recordEvent({
                eventType: 'metadata_update_started',
                userId: options.did,
                dashboardId: 'identity-core',
                details: { metadata: options.metadata },
                riskLevel: 'low'
            });
            const did = await this.storage.getDID(options.did, options.passcode);
            const sanitizedMetadata = MetadataValidator.silentValidate(options.metadata);
            did.metadata = {
                ...did.metadata,
                ...sanitizedMetadata
            };
            did.updatedAt = new Date().toISOString();
            await this.storage.updateDID(did, options.passcode);
            ThreatDetector.recordEvent({
                eventType: 'metadata_update_completed',
                userId: options.did,
                dashboardId: 'identity-core',
                details: { metadata: sanitizedMetadata },
                riskLevel: 'low'
            });
            this.emit('did:updated', did);
            return did;
        }
        catch (error) {
            const { ThreatDetector } = await Promise.resolve().then(() => __importStar(require('./security/threat-detector')));
            ThreatDetector.recordEvent({
                eventType: 'metadata_update_failed',
                userId: options.did,
                dashboardId: 'identity-core',
                details: { error: error instanceof Error ? error.message : 'Unknown error' },
                riskLevel: 'medium'
            });
            throw new types_1.IdentityError('Failed to update metadata', types_1.IdentityErrorCodes.STORAGE_ERROR, error);
        }
    }
    async grantToolAccess(options) {
        try {
            const did = await this.storage.getDID(options.did, options.passcode);
            did.permissions[options.toolId] = {
                granted: true,
                grantedAt: new Date().toISOString(),
                expiresAt: options.expiresAt || undefined,
                permissions: options.permissions
            };
            await this.storage.updateDID(did, options.passcode);
            this.emit('tool:access:granted', options.did);
            return did;
        }
        catch (error) {
            throw new types_1.IdentityError('Failed to grant tool access', types_1.IdentityErrorCodes.PERMISSION_DENIED, error);
        }
    }
    async processToolRequest(didId, passcode, request) {
        try {
            const did = await this.storage.getDID(didId, passcode);
            return await this.privacyManager.processToolAccessRequest(did, request);
        }
        catch (error) {
            throw new types_1.IdentityError('Failed to process tool request', types_1.IdentityErrorCodes.PERMISSION_DENIED, error);
        }
    }
    async generateChallenge(didId) {
        try {
            const challenge = await crypto_1.CryptoManager.hash(`${didId}:${Date.now()}:${Math.random()}`);
            return {
                challenge,
                expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
            };
        }
        catch (error) {
            throw new types_1.IdentityError('Failed to generate challenge', types_1.IdentityErrorCodes.ENCRYPTION_ERROR, error);
        }
    }
    async verifySignature(didId, challenge, signature, passcode) {
        try {
            const verified = await this.verifySignatureCryptographically(didId, challenge, signature, passcode);
            return {
                did: didId,
                challenge,
                signature,
                verified
            };
        }
        catch (error) {
            return {
                did: didId,
                challenge,
                signature,
                verified: false
            };
        }
    }
    async verifySignatureCryptographically(didId, challenge, signature, passcode) {
        try {
            const didInfo = await this.storage.getDID(didId, passcode);
            if (!didInfo)
                return false;
            const publicKeyBuffer = this.base64ToArrayBuffer(didInfo.keys.publicKey);
            const importedPublicKey = await crypto.subtle.importKey('spki', publicKeyBuffer, { name: 'ECDSA', namedCurve: 'P-384' }, false, ['verify']);
            const encoder = new TextEncoder();
            const challengeBuffer = encoder.encode(challenge);
            const hashBuffer = await crypto.subtle.digest('SHA-512', challengeBuffer);
            const signatureBuffer = this.base64ToArrayBuffer(signature);
            const isValid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-512' }, importedPublicKey, signatureBuffer, hashBuffer);
            if (!isValid) {
                this.logSecurityEvent('signature_verification_failed', { didId, reason: 'invalid_signature' }, 'high');
            }
            return isValid;
        }
        catch (error) {
            this.logSecurityEvent('signature_verification_failed', { didId, error: error instanceof Error ? error.message : 'Unknown error' }, 'high');
            return false;
        }
    }
    base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }
    async deleteDID(didId) {
        try {
            await this.storage.deleteDID(didId);
            this.emit('did:deleted', didId);
        }
        catch (error) {
            throw new types_1.IdentityError('Failed to delete DID', types_1.IdentityErrorCodes.STORAGE_ERROR, error);
        }
    }
    getAuditLog(didId) {
        return this.privacyManager.getAuditLog(didId);
    }
    updatePrivacySettings(did, settings) {
        this.privacyManager.updatePrivacySettings(did, settings);
    }
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, new Set());
        }
        this.eventHandlers.get(event).add(handler);
    }
    off(event, handler) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            handlers.delete(handler);
        }
    }
    emit(event, data) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                }
                catch (error) {
                    this.logSecurityEvent('event_handler_error', { event, error }, 'medium');
                }
            });
        }
    }
    logSecurityEvent(event, details, riskLevel) {
        const securityEvent = {
            timestamp: new Date().toISOString(),
            event,
            details,
            riskLevel,
            didId: details.didId || 'system'
        };
        this.privacyManager.logSecurityEvent(securityEvent);
        this.emit('security:event', securityEvent);
    }
    destroy() {
        this.storage.close();
        this.eventHandlers.clear();
    }
}
exports.IdentityCore = IdentityCore;
var crypto_2 = require("./encryption/crypto");
Object.defineProperty(exports, "CryptoManager", { enumerable: true, get: function () { return crypto_2.CryptoManager; } });
var indexeddb_2 = require("./storage/indexeddb");
Object.defineProperty(exports, "IndexedDBStorage", { enumerable: true, get: function () { return indexeddb_2.IndexedDBStorage; } });
var privacy_manager_2 = require("./utils/privacy-manager");
Object.defineProperty(exports, "PrivacyManager", { enumerable: true, get: function () { return privacy_manager_2.PrivacyManager; } });
var zk_proofs_1 = require("./encryption/zk-proofs");
Object.defineProperty(exports, "ZKProofManager", { enumerable: true, get: function () { return zk_proofs_1.ZKProofManager; } });
var DIDResolver_1 = require("./distributed/DIDResolver");
Object.defineProperty(exports, "DIDResolver", { enumerable: true, get: function () { return DIDResolver_1.DIDResolver; } });
var IdentitySync_1 = require("./distributed/IdentitySync");
Object.defineProperty(exports, "IdentitySync", { enumerable: true, get: function () { return IdentitySync_1.IdentitySync; } });
var DecentralizedAuth_1 = require("./distributed/DecentralizedAuth");
Object.defineProperty(exports, "DecentralizedAuth", { enumerable: true, get: function () { return DecentralizedAuth_1.DecentralizedAuth; } });
var DistributedIdentityManager_1 = require("./distributed/DistributedIdentityManager");
Object.defineProperty(exports, "DistributedIdentityManager", { enumerable: true, get: function () { return DistributedIdentityManager_1.DistributedIdentityManager; } });
//# sourceMappingURL=index.js.map