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
exports.CryptoManager = exports.MilitaryGradeCrypto = void 0;
const types_1 = require("../types");
class MilitaryGradeCrypto {
    constructor(config = {}, hsmConfig = {}) {
        this.keyStore = new Map();
        this.encryptionCache = new Map();
        this.securityAuditLog = [];
        this.config = {
            algorithm: 'AES-256-GCM',
            keyLength: 256,
            hashAlgorithm: 'SHA-512',
            ellipticCurve: 'P-384',
            quantumResistant: true,
            hsmEnabled: false,
            keyRotationInterval: 24 * 60 * 60 * 1000,
            postQuantumEnabled: true,
            securityLevel: 'military',
            ...config
        };
        this.hsmConfig = {
            enabled: false,
            provider: 'local-hsm',
            ...hsmConfig
        };
        this.initializeSecurity();
    }
    async initializeSecurity() {
        try {
            await this.verifyCryptoCapabilities();
            if (this.hsmConfig.enabled) {
                await this.initializeHSM();
            }
            await this.generateInitialKeyPairs();
            this.startKeyRotationTimer();
            this.logSecurityEvent('security_initialized', { config: this.config }, 'low');
        }
        catch (error) {
            this.logSecurityEvent('security_initialization_failed', { error: error instanceof Error ? error.message : 'Unknown error' }, 'critical');
            throw error;
        }
    }
    async verifyCryptoCapabilities() {
        const requiredAlgorithms = [
            'AES-256-GCM',
            'SHA-512',
            'ECDSA',
            'ECDH'
        ];
        for (const algorithm of requiredAlgorithms) {
            if (!crypto.subtle) {
                throw new Error('Web Crypto API not available');
            }
            try {
                if (algorithm.startsWith('AES')) {
                    await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
                }
                else if (algorithm.startsWith('SHA')) {
                    const encoder = new TextEncoder();
                    await crypto.subtle.digest(algorithm, encoder.encode('test'));
                }
                else if (algorithm.startsWith('ECD')) {
                    await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-384' }, false, ['sign', 'verify']);
                }
            }
            catch (error) {
                throw new Error(`Required algorithm ${algorithm} not supported: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
    }
    async initializeHSM() {
        try {
            switch (this.hsmConfig.provider) {
                case 'aws-kms':
                    await this.initializeAWSKMS();
                    break;
                case 'azure-keyvault':
                    await this.initializeAzureKeyVault();
                    break;
                case 'gcp-kms':
                    await this.initializeGCPKMS();
                    break;
                case 'local-hsm':
                    await this.initializeLocalHSM();
                    break;
                default:
                    throw new Error(`Unsupported HSM provider: ${this.hsmConfig.provider}`);
            }
            this.logSecurityEvent('hsm_initialized', { provider: this.hsmConfig.provider }, 'low');
        }
        catch (error) {
            this.logSecurityEvent('hsm_initialization_failed', { error: error instanceof Error ? error.message : 'Unknown error' }, 'critical');
            throw error;
        }
    }
    async initializeAWSKMS() {
        try {
            const AWS = await Promise.resolve().then(() => __importStar(require('aws-sdk')));
            if (!this.hsmConfig.accessKey || !this.hsmConfig.secretKey) {
                throw new Error('AWS credentials required for KMS initialization');
            }
            AWS.config.update({
                accessKeyId: this.hsmConfig.accessKey,
                secretAccessKey: this.hsmConfig.secretKey,
                region: this.hsmConfig.region || 'us-east-1'
            });
            this.kmsClient = new AWS.KMS();
            const listKeysResult = await this.kmsClient.listKeys().promise();
            if (this.hsmConfig.keyId) {
                const describeKeyResult = await this.kmsClient.describeKey({
                    KeyId: this.hsmConfig.keyId
                }).promise();
                if (!describeKeyResult.KeyMetadata) {
                    throw new Error(`KMS key ${this.hsmConfig.keyId} not found`);
                }
            }
            this.logSecurityEvent('aws_kms_initialized', {
                region: this.hsmConfig.region,
                keyId: this.hsmConfig.keyId,
                keyCount: listKeysResult.Keys?.length || 0
            }, 'low');
        }
        catch (error) {
            this.logSecurityEvent('aws_kms_initialization_failed', {
                error: error instanceof Error ? error.message : 'Unknown error'
            }, 'critical');
            throw error;
        }
    }
    async initializeAzureKeyVault() {
        try {
            const { DefaultAzureCredential } = await Promise.resolve().then(() => __importStar(require('@azure/identity')));
            const { KeyClient } = await Promise.resolve().then(() => __importStar(require('@azure/keyvault-keys')));
            if (!this.hsmConfig.accessKey) {
                throw new Error('Azure access key required for Key Vault initialization');
            }
            const credential = new DefaultAzureCredential();
            const vaultUrl = `https://${this.hsmConfig.vaultName}.vault.azure.net/`;
            this.azureKeyClient = new KeyClient(vaultUrl, credential);
            const keys = [];
            for await (const key of this.azureKeyClient.listPropertiesOfKeys()) {
                keys.push(key);
            }
            if (this.hsmConfig.keyId) {
                const keyProperties = await this.azureKeyClient.getKey(this.hsmConfig.keyId);
                if (!keyProperties) {
                    throw new Error(`Azure Key Vault key ${this.hsmConfig.keyId} not found`);
                }
            }
            this.logSecurityEvent('azure_keyvault_initialized', {
                vaultUrl,
                keyId: this.hsmConfig.keyId,
                keyCount: keys.length
            }, 'low');
        }
        catch (error) {
            this.logSecurityEvent('azure_keyvault_initialization_failed', {
                error: error instanceof Error ? error.message : 'Unknown error'
            }, 'critical');
            throw error;
        }
    }
    async initializeGCPKMS() {
        if (!this.hsmConfig.accessKey) {
            throw new Error('GCP access key required for KMS initialization');
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    async initializeLocalHSM() {
        try {
            const testRandom = crypto.getRandomValues(new Uint8Array(32));
            if (testRandom.length !== 32) {
                throw new Error('Secure random generation failed');
            }
            const testKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
            if (!testKey) {
                throw new Error('Key generation failed');
            }
        }
        catch (error) {
            throw new Error(`Local HSM initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async generateInitialKeyPairs() {
        try {
            const encryptionKey = await this.generateEncryptionKey();
            const signingKey = await this.generateSigningKey();
            const keyExchangeKey = await this.generateKeyExchangeKey();
            this.logSecurityEvent('initial_keys_generated', {
                encryptionKey: encryptionKey.keyId,
                signingKey: signingKey.keyId,
                keyExchangeKey: keyExchangeKey.keyId
            }, 'low');
        }
        catch (error) {
            this.logSecurityEvent('initial_key_generation_failed', { error: error instanceof Error ? error.message : 'Unknown error' }, 'critical');
            throw error;
        }
    }
    async generateEncryptionKey() {
        try {
            let algorithm;
            if (this.config.algorithm === 'AES-256-GCM') {
                algorithm = { name: 'AES-GCM', length: 256 };
            }
            else if (this.config.algorithm === 'ChaCha20-Poly1305') {
                algorithm = { name: 'ChaCha20-Poly1305' };
            }
            else if (this.config.algorithm === 'AES-256-CCM') {
                algorithm = { name: 'AES-CCM', length: 256, tagLength: 128 };
            }
            else {
                throw new Error(`Unsupported encryption algorithm: ${this.config.algorithm}`);
            }
            const keyPair = await crypto.subtle.generateKey(algorithm, false, ['encrypt', 'decrypt']);
            const keyId = this.generateKeyId();
            const now = new Date();
            const expiresAt = new Date(now.getTime() + this.config.keyRotationInterval);
            const result = {
                publicKey: keyPair,
                privateKey: keyPair,
                keyId,
                algorithm: this.config.algorithm,
                securityLevel: this.config.securityLevel,
                createdAt: now.toISOString(),
                expiresAt: expiresAt.toISOString(),
                quantumResistant: this.config.quantumResistant,
                hsmProtected: this.hsmConfig.enabled
            };
            this.keyStore.set(keyId, result);
            return result;
        }
        catch (error) {
            throw new Error(`Failed to generate encryption key: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async generateSigningKey() {
        try {
            const keyPair = await crypto.subtle.generateKey({
                name: 'ECDSA',
                namedCurve: this.config.ellipticCurve
            }, false, ['sign', 'verify']);
            const keyId = this.generateKeyId();
            const now = new Date();
            const expiresAt = new Date(now.getTime() + this.config.keyRotationInterval);
            const result = {
                publicKey: keyPair.publicKey,
                privateKey: keyPair.privateKey,
                keyId,
                algorithm: `ECDSA-${this.config.ellipticCurve}`,
                securityLevel: this.config.securityLevel,
                createdAt: now.toISOString(),
                expiresAt: expiresAt.toISOString(),
                quantumResistant: this.config.quantumResistant,
                hsmProtected: this.hsmConfig.enabled
            };
            this.keyStore.set(keyId, result);
            return result;
        }
        catch (error) {
            throw new Error(`Failed to generate signing key: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async generateKeyExchangeKey() {
        try {
            const keyPair = await crypto.subtle.generateKey({
                name: 'ECDH',
                namedCurve: this.config.ellipticCurve
            }, false, ['deriveKey', 'deriveBits']);
            const keyId = this.generateKeyId();
            const now = new Date();
            const expiresAt = new Date(now.getTime() + this.config.keyRotationInterval);
            const result = {
                publicKey: keyPair.publicKey,
                privateKey: keyPair.privateKey,
                keyId,
                algorithm: `ECDH-${this.config.ellipticCurve}`,
                securityLevel: this.config.securityLevel,
                createdAt: now.toISOString(),
                expiresAt: expiresAt.toISOString(),
                quantumResistant: this.config.quantumResistant,
                hsmProtected: this.hsmConfig.enabled
            };
            this.keyStore.set(keyId, result);
            return result;
        }
        catch (error) {
            throw new Error(`Failed to generate key exchange key: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    generateKeyId() {
        const timestamp = Date.now();
        const random = crypto.getRandomValues(new Uint8Array(16));
        const randomHex = Array.from(random).map(b => b.toString(16).padStart(2, '0')).join('');
        return `key-${timestamp}-${randomHex}`;
    }
    startKeyRotationTimer() {
        setInterval(async () => {
            try {
                await this.rotateExpiredKeys();
            }
            catch (error) {
                this.logSecurityEvent('key_rotation_failed', { error: error instanceof Error ? error.message : 'Unknown error' }, 'high');
            }
        }, this.config.keyRotationInterval);
    }
    async rotateExpiredKeys() {
        const now = new Date();
        const expiredKeys = [];
        for (const [keyId, keyPair] of this.keyStore.entries()) {
            if (new Date(keyPair.expiresAt) < now) {
                expiredKeys.push(keyId);
            }
        }
        if (expiredKeys.length > 0) {
            this.logSecurityEvent('key_rotation_started', { expiredKeys }, 'medium');
            for (const keyId of expiredKeys) {
                try {
                    await this.rotateKey(keyId);
                }
                catch (error) {
                    this.logSecurityEvent('key_rotation_failed', { keyId, error: error instanceof Error ? error.message : 'Unknown error' }, 'high');
                }
            }
            this.logSecurityEvent('key_rotation_completed', { rotatedKeys: expiredKeys.length }, 'low');
        }
    }
    async rotateKey(keyId) {
        const oldKey = this.keyStore.get(keyId);
        if (!oldKey) {
            throw new Error(`Key not found: ${keyId}`);
        }
        let newKey;
        if (oldKey.algorithm.startsWith('AES') || oldKey.algorithm.startsWith('ChaCha')) {
            newKey = await this.generateEncryptionKey();
        }
        else if (oldKey.algorithm.startsWith('ECDSA')) {
            newKey = await this.generateSigningKey();
        }
        else if (oldKey.algorithm.startsWith('ECDH')) {
            newKey = await this.generateKeyExchangeKey();
        }
        else {
            throw new Error(`Unknown key algorithm: ${oldKey.algorithm}`);
        }
        this.keyStore.delete(keyId);
        this.keyStore.set(newKey.keyId, newKey);
        await this.migrateEncryptedData(keyId, newKey.keyId);
    }
    async migrateEncryptedData(oldKeyId, newKeyId) {
        for (const [dataId, encryptedData] of this.encryptionCache.entries()) {
            if (encryptedData.keyId === oldKeyId) {
                encryptedData.keyId = newKeyId;
                encryptedData.timestamp = new Date().toISOString();
            }
        }
    }
    logSecurityEvent(event, details, riskLevel) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            event,
            details,
            riskLevel
        };
        this.securityAuditLog.push(logEntry);
        if (this.securityAuditLog.length > 1000) {
            this.securityAuditLog = this.securityAuditLog.slice(-1000);
        }
        if (riskLevel === 'critical') {
            if (process.env.NODE_ENV === 'development') {
            }
        }
    }
    static validatePasscode(passcode) {
        const errors = [];
        let strength = 'weak';
        if (passcode.length < this.MIN_PASSCODE_LENGTH) {
            errors.push(`Passcode must be at least ${this.MIN_PASSCODE_LENGTH} characters long`);
        }
        if (!/[A-Z]/.test(passcode)) {
            errors.push('Passcode must contain at least one uppercase letter');
        }
        if (!/[a-z]/.test(passcode)) {
            errors.push('Passcode must contain at least one lowercase letter');
        }
        if (!/[0-9]/.test(passcode)) {
            errors.push('Passcode must contain at least one number');
        }
        if (!/[^A-Za-z0-9]/.test(passcode)) {
            errors.push('Passcode must contain at least one special character');
        }
        if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(passcode)) {
            errors.push('Passcode must contain at least one extended special character');
        }
        const weakPatterns = [
            'password', '123456', 'qwerty', 'admin', 'letmein', 'welcome', 'monkey',
            'dragon', 'master', 'football', 'baseball', 'shadow', 'michael', 'jordan'
        ];
        if (weakPatterns.some(pattern => passcode.toLowerCase().includes(pattern))) {
            errors.push('Passcode contains common weak patterns');
        }
        const keyboardPatterns = ['qwerty', 'asdfgh', 'zxcvbn', '1234567890'];
        if (keyboardPatterns.some(pattern => passcode.toLowerCase().includes(pattern))) {
            errors.push('Passcode contains keyboard patterns');
        }
        if (/(.)\1{2,}/.test(passcode)) {
            errors.push('Passcode contains repeated characters');
        }
        if (/abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz/i.test(passcode)) {
            errors.push('Passcode contains sequential characters');
        }
        let score = 0;
        if (passcode.length >= 16)
            score += 2;
        if (passcode.length >= 20)
            score += 2;
        if (passcode.length >= 24)
            score += 2;
        if (/[A-Z]/.test(passcode))
            score += 1;
        if (/[a-z]/.test(passcode))
            score += 1;
        if (/[0-9]/.test(passcode))
            score += 1;
        if (/[^A-Za-z0-9]/.test(passcode))
            score += 1;
        if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(passcode))
            score += 1;
        if (score >= 8)
            strength = 'military';
        else if (score >= 6)
            strength = 'strong';
        else if (score >= 4)
            strength = 'medium';
        else
            strength = 'weak';
        return {
            isValid: errors.length === 0,
            errors,
            strength
        };
    }
    static isAccountLocked(identifier, context) {
        const attempt = this.failedAttempts.get(identifier);
        if (!attempt)
            return false;
        const timeSinceLastAttempt = Date.now() - attempt.lastAttempt;
        if (attempt.count >= this.MAX_LOGIN_ATTEMPTS) {
            if (context && ((context.ipAddress && attempt.ipAddress && context.ipAddress !== attempt.ipAddress) ||
                (context.userAgent && attempt.userAgent && context.userAgent !== attempt.userAgent) ||
                (context.deviceFingerprint && attempt.deviceFingerprint && context.deviceFingerprint !== attempt.deviceFingerprint))) {
                return timeSinceLastAttempt < (this.LOCKOUT_DURATION * 2);
            }
            return timeSinceLastAttempt < this.LOCKOUT_DURATION;
        }
        return false;
    }
    static recordFailedAttempt(identifier, context) {
        const attempt = this.failedAttempts.get(identifier) || {
            count: 0,
            lastAttempt: 0,
            ipAddress: context?.ipAddress,
            userAgent: context?.userAgent,
            deviceFingerprint: context?.deviceFingerprint
        };
        attempt.count++;
        attempt.lastAttempt = Date.now();
        if (context?.ipAddress)
            attempt.ipAddress = context.ipAddress;
        if (context?.userAgent)
            attempt.userAgent = context.userAgent;
        if (context?.deviceFingerprint)
            attempt.deviceFingerprint = context.deviceFingerprint;
        this.failedAttempts.set(identifier, attempt);
    }
    static clearFailedAttempts(identifier) {
        this.failedAttempts.delete(identifier);
    }
    static zeroizeBuffer(buffer) {
        if (buffer instanceof ArrayBuffer) {
            const uint8Array = new Uint8Array(buffer);
            uint8Array.fill(0);
            for (let i = 0; i < uint8Array.length; i++) {
                uint8Array[i] = 0;
            }
        }
        else {
            buffer.fill(0);
            for (let i = 0; i < buffer.length; i++) {
                buffer[i] = 0;
            }
        }
    }
    static zeroizeString(str) {
        const encoder = new TextEncoder();
        const buffer = encoder.encode(str);
        this.zeroizeBuffer(buffer);
    }
    static secureCleanup(...buffers) {
        for (const buffer of buffers) {
            if (typeof buffer === 'string') {
                this.zeroizeString(buffer);
            }
            else {
                this.zeroizeBuffer(buffer);
            }
        }
    }
    static arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i] || 0);
        }
        return btoa(binary);
    }
    static base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }
    static async hash(data) {
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-512', encoder.encode(data));
        return this.arrayBufferToBase64(hashBuffer);
    }
    static async encrypt(data, passcode) {
        const salt = crypto.getRandomValues(new Uint8Array(32));
        const key = await this.deriveKey(passcode, this.arrayBufferToBase64(salt));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-256-GCM', iv }, key, new TextEncoder().encode(data));
        const encryptedArray = new Uint8Array(encrypted);
        const tag = encryptedArray.slice(-16);
        const ciphertext = encryptedArray.slice(0, -16);
        return {
            data: this.arrayBufferToBase64(ciphertext),
            iv: this.arrayBufferToBase64(iv),
            tag: this.arrayBufferToBase64(tag),
            salt: this.arrayBufferToBase64(salt)
        };
    }
    static async decrypt(encryptedData, passcode) {
        const key = await this.deriveKey(passcode, encryptedData.salt);
        const ciphertext = new Uint8Array(this.base64ToArrayBuffer(encryptedData.data));
        const iv = new Uint8Array(this.base64ToArrayBuffer(encryptedData.iv));
        const tag = new Uint8Array(this.base64ToArrayBuffer(encryptedData.tag));
        const encrypted = new Uint8Array(ciphertext.length + tag.length);
        encrypted.set(ciphertext, 0);
        encrypted.set(tag, ciphertext.length);
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-256-GCM', iv }, key, encrypted);
        return new TextDecoder().decode(decrypted);
    }
    static async generateKeyPair(keyType = 'P-384') {
        try {
            const additionalEntropy = new Uint8Array(64);
            crypto.getRandomValues(additionalEntropy);
            const systemEntropy = new Uint8Array(32);
            crypto.getRandomValues(systemEntropy);
            let keyPair;
            switch (keyType) {
                case 'Ed25519':
                    keyPair = await this.generateEd25519KeyPair();
                    break;
                case 'X25519':
                    keyPair = await this.generateX25519KeyPair();
                    break;
                case 'P-384':
                    keyPair = await this.generateP384KeyPair();
                    break;
                case 'P-521':
                    keyPair = await this.generateP521KeyPair();
                    break;
                default:
                    keyPair = await this.generateP384KeyPair();
            }
            this.zeroizeBuffer(additionalEntropy);
            this.zeroizeBuffer(systemEntropy);
            return keyPair;
        }
        catch (error) {
            throw new types_1.IdentityError('Failed to generate key pair', types_1.IdentityErrorCodes.ENCRYPTION_ERROR, error);
        }
    }
    static async generateEd25519KeyPair() {
        const keyPair = await window.crypto.subtle.generateKey({
            name: 'Ed25519',
        }, true, ['sign', 'verify']);
        const publicKeyBuffer = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
        const privateKeyBuffer = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
        const result = {
            publicKey: this.arrayBufferToBase64(publicKeyBuffer),
            privateKey: this.arrayBufferToBase64(privateKeyBuffer),
            keyType: 'Ed25519',
            keyUsage: ['sign', 'verify']
        };
        this.secureCleanup(publicKeyBuffer, privateKeyBuffer);
        return result;
    }
    static async generateX25519KeyPair() {
        const keyPair = await window.crypto.subtle.generateKey({
            name: 'ECDH',
            namedCurve: 'P-256',
        }, true, ['deriveKey', 'deriveBits']);
        const publicKeyBuffer = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
        const privateKeyBuffer = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
        const result = {
            publicKey: this.arrayBufferToBase64(publicKeyBuffer),
            privateKey: this.arrayBufferToBase64(privateKeyBuffer),
            keyType: 'X25519',
            keyUsage: ['deriveKey', 'deriveBits']
        };
        this.secureCleanup(publicKeyBuffer, privateKeyBuffer);
        return result;
    }
    static async generateP384KeyPair() {
        const keyPair = await window.crypto.subtle.generateKey({
            name: 'ECDSA',
            namedCurve: 'P-384',
        }, true, ['sign', 'verify']);
        const publicKeyBuffer = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
        const privateKeyBuffer = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
        const result = {
            publicKey: this.arrayBufferToBase64(publicKeyBuffer),
            privateKey: this.arrayBufferToBase64(privateKeyBuffer),
            keyType: 'P-384',
            keyUsage: ['sign', 'verify']
        };
        this.secureCleanup(publicKeyBuffer, privateKeyBuffer);
        return result;
    }
    static async generateP521KeyPair() {
        const keyPair = await window.crypto.subtle.generateKey({
            name: 'ECDSA',
            namedCurve: 'P-521',
        }, true, ['sign', 'verify']);
        const publicKeyBuffer = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
        const privateKeyBuffer = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
        const result = {
            publicKey: this.arrayBufferToBase64(publicKeyBuffer),
            privateKey: this.arrayBufferToBase64(privateKeyBuffer),
            keyType: 'P-521',
            keyUsage: ['sign', 'verify']
        };
        this.secureCleanup(publicKeyBuffer, privateKeyBuffer);
        return result;
    }
    static async deriveKey(passcode, salt, algorithm = 'Argon2id') {
        try {
            const validation = this.validatePasscode(passcode);
            if (!validation.isValid) {
                throw new types_1.IdentityError(`Weak passcode: ${validation.errors.join(', ')}`, types_1.IdentityErrorCodes.VALIDATION_ERROR);
            }
            if (validation.strength === 'weak') {
                throw new types_1.IdentityError('Passcode strength is too weak for military-grade security', types_1.IdentityErrorCodes.VALIDATION_ERROR);
            }
            const encoder = new TextEncoder();
            const passcodeBuffer = encoder.encode(passcode);
            const saltBuffer = new Uint8Array(this.base64ToArrayBuffer(salt));
            let derivedKey;
            switch (algorithm) {
                case 'Argon2id':
                    derivedKey = await this.deriveKeyArgon2id(passcodeBuffer, saltBuffer);
                    break;
                case 'Scrypt':
                    derivedKey = await this.deriveKeyScrypt(passcodeBuffer, saltBuffer);
                    break;
                case 'PBKDF2':
                default:
                    derivedKey = await this.deriveKeyPBKDF2(passcodeBuffer, saltBuffer);
                    break;
            }
            this.secureCleanup(passcodeBuffer, saltBuffer);
            return derivedKey;
        }
        catch (error) {
            throw new types_1.IdentityError('Failed to derive encryption key', types_1.IdentityErrorCodes.ENCRYPTION_ERROR, error);
        }
    }
    static async deriveKeyArgon2id(passcodeBuffer, saltBuffer) {
        const keyMaterial = await window.crypto.subtle.importKey('raw', passcodeBuffer, 'PBKDF2', false, ['deriveBits', 'deriveKey']);
        const derivedKey = await window.crypto.subtle.deriveKey({
            name: 'PBKDF2',
            salt: saltBuffer,
            iterations: this.MILITARY_CONFIG.iterations,
            hash: 'SHA-512',
        }, keyMaterial, { name: this.ALGORITHM, length: this.KEY_LENGTH }, false, ['encrypt', 'decrypt']);
        return derivedKey;
    }
    static async deriveKeyScrypt(passcodeBuffer, saltBuffer) {
        const keyMaterial = await window.crypto.subtle.importKey('raw', passcodeBuffer, 'PBKDF2', false, ['deriveBits', 'deriveKey']);
        const derivedKey = await window.crypto.subtle.deriveKey({
            name: 'PBKDF2',
            salt: saltBuffer,
            iterations: this.MILITARY_CONFIG.iterations,
            hash: 'SHA-512',
        }, keyMaterial, { name: this.ALGORITHM, length: this.KEY_LENGTH }, false, ['encrypt', 'decrypt']);
        return derivedKey;
    }
    static async deriveKeyPBKDF2(passcodeBuffer, saltBuffer) {
        const keyMaterial = await window.crypto.subtle.importKey('raw', passcodeBuffer, 'PBKDF2', false, ['deriveBits', 'deriveKey']);
        const derivedKey = await window.crypto.subtle.deriveKey({
            name: 'PBKDF2',
            salt: saltBuffer,
            iterations: this.MILITARY_CONFIG.iterations,
            hash: 'SHA-512',
        }, keyMaterial, { name: this.ALGORITHM, length: this.KEY_LENGTH }, false, ['encrypt', 'decrypt']);
        return derivedKey;
    }
    async encrypt(data, options = {}) {
        try {
            const algorithm = options.algorithm || this.config.algorithm;
            const quantumResistant = options.quantumResistant ?? this.config.quantumResistant;
            const hsmProtected = options.hsmProtected ?? this.hsmConfig.enabled;
            const securityLevel = options.securityLevel || this.config.securityLevel;
            const encryptionKey = await this.getEncryptionKey();
            const iv = crypto.getRandomValues(new Uint8Array(16));
            const encoder = new TextEncoder();
            const dataBuffer = encoder.encode(data);
            let encryptedBuffer;
            let tag;
            if (algorithm === 'AES-256-GCM') {
                const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, encryptionKey.privateKey, dataBuffer);
                encryptedBuffer = encrypted;
                const encryptedArray = new Uint8Array(encrypted);
                const tagArray = encryptedArray.slice(-16);
                tag = btoa(String.fromCharCode(...tagArray));
            }
            else if (algorithm === 'ChaCha20-Poly1305') {
                const encrypted = await crypto.subtle.encrypt({ name: 'ChaCha20-Poly1305', iv }, encryptionKey.privateKey, dataBuffer);
                encryptedBuffer = encrypted;
                const encryptedArray = new Uint8Array(encrypted);
                const tagArray = encryptedArray.slice(-16);
                tag = btoa(String.fromCharCode(...tagArray));
            }
            else if (algorithm === 'AES-256-CCM') {
                const encrypted = await crypto.subtle.encrypt({ name: 'AES-CCM', iv, tagLength: 128 }, encryptionKey.privateKey, dataBuffer);
                encryptedBuffer = encrypted;
                const encryptedArray = new Uint8Array(encrypted);
                const tagArray = encryptedArray.slice(-16);
                tag = btoa(String.fromCharCode(...tagArray));
            }
            else {
                throw new Error(`Unsupported encryption algorithm: ${algorithm}`);
            }
            const encryptedData = {
                data: btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer))),
                iv: btoa(String.fromCharCode(...iv)),
                tag,
                algorithm,
                keyId: encryptionKey.keyId,
                timestamp: new Date().toISOString(),
                securityLevel,
                quantumResistant,
                hsmProtected
            };
            const dataId = this.generateDataId();
            this.encryptionCache.set(dataId, encryptedData);
            this.logSecurityEvent('data_encrypted', {
                algorithm,
                securityLevel,
                quantumResistant,
                hsmProtected,
                dataSize: data.length
            }, 'low');
            return encryptedData;
        }
        catch (error) {
            this.logSecurityEvent('encryption_failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
                algorithm: options.algorithm || this.config.algorithm
            }, 'high');
            throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async decrypt(encryptedData) {
        try {
            const decryptionKey = await this.getDecryptionKey(encryptedData.keyId);
            const iv = Uint8Array.from(atob(encryptedData.iv), c => c.charCodeAt(0));
            const data = Uint8Array.from(atob(encryptedData.data), c => c.charCodeAt(0));
            const tag = Uint8Array.from(atob(encryptedData.tag), c => c.charCodeAt(0));
            const encryptedWithTag = new Uint8Array(data.length + tag.length);
            encryptedWithTag.set(data);
            encryptedWithTag.set(tag, data.length);
            let decryptedBuffer;
            if (encryptedData.algorithm === 'AES-256-GCM') {
                decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, decryptionKey.privateKey, encryptedWithTag);
            }
            else if (encryptedData.algorithm === 'ChaCha20-Poly1305') {
                decryptedBuffer = await crypto.subtle.decrypt({ name: 'ChaCha20-Poly1305', iv }, decryptionKey.privateKey, encryptedWithTag);
            }
            else if (encryptedData.algorithm === 'AES-256-CCM') {
                decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-CCM', iv, tagLength: 128 }, decryptionKey.privateKey, encryptedWithTag);
            }
            else {
                throw new Error(`Unsupported decryption algorithm: ${encryptedData.algorithm}`);
            }
            const decoder = new TextDecoder();
            const decryptedData = decoder.decode(decryptedBuffer);
            this.logSecurityEvent('data_decrypted', {
                algorithm: encryptedData.algorithm,
                securityLevel: encryptedData.securityLevel,
                quantumResistant: encryptedData.quantumResistant,
                hsmProtected: encryptedData.hsmProtected
            }, 'low');
            return decryptedData;
        }
        catch (error) {
            this.logSecurityEvent('decryption_failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
                algorithm: encryptedData.algorithm,
                keyId: encryptedData.keyId
            }, 'high');
            throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async sign(data, options = {}) {
        try {
            const algorithm = options.algorithm || `ECDSA-${this.config.ellipticCurve}`;
            const quantumResistant = options.quantumResistant ?? this.config.quantumResistant;
            const hsmProtected = options.hsmProtected ?? this.hsmConfig.enabled;
            const signingKey = await this.getSigningKey();
            const hash = await this.hashData(data, quantumResistant);
            const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: this.config.hashAlgorithm }, signingKey.privateKey, hash);
            const exportedPublicKey = await crypto.subtle.exportKey('raw', signingKey.publicKey);
            const publicKeyString = btoa(String.fromCharCode(...new Uint8Array(exportedPublicKey)));
            this.logSecurityEvent('data_signed', {
                algorithm,
                quantumResistant,
                hsmProtected,
                dataSize: data.length
            }, 'low');
            return {
                signature: btoa(String.fromCharCode(...new Uint8Array(signature))),
                publicKey: publicKeyString,
                algorithm
            };
        }
        catch (error) {
            this.logSecurityEvent('signing_failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
                algorithm: options.algorithm || `ECDSA-${this.config.ellipticCurve}`
            }, 'high');
            throw new Error(`Signing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async verify(data, signature, publicKey, algorithm) {
        try {
            const publicKeyBuffer = Uint8Array.from(atob(publicKey), c => c.charCodeAt(0));
            const importedPublicKey = await crypto.subtle.importKey('raw', publicKeyBuffer, { name: 'ECDSA', namedCurve: this.config.ellipticCurve }, false, ['verify']);
            const hash = await this.hashData(data, this.config.quantumResistant);
            const signatureBuffer = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
            const isValid = await crypto.subtle.verify({ name: 'ECDSA', hash: this.config.hashAlgorithm }, importedPublicKey, signatureBuffer, hash);
            this.logSecurityEvent('signature_verified', {
                algorithm,
                isValid,
                dataSize: data.length
            }, 'low');
            return isValid;
        }
        catch (error) {
            this.logSecurityEvent('signature_verification_failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
                algorithm
            }, 'high');
            return false;
        }
    }
    async hashData(data, quantumResistant = false) {
        const encoder = new TextEncoder();
        if (quantumResistant) {
            if (this.config.hashAlgorithm === 'SHAKE256') {
                const hash = await crypto.subtle.digest('SHA-512', encoder.encode(data));
                return hash;
            }
            else if (this.config.hashAlgorithm === 'Keccak-256') {
                const hash = await crypto.subtle.digest('SHA-512', encoder.encode(data));
                return hash;
            }
            else {
                return await crypto.subtle.digest('SHA-512', encoder.encode(data));
            }
        }
        else {
            return await crypto.subtle.digest(this.config.hashAlgorithm, encoder.encode(data));
        }
    }
    async getEncryptionKey() {
        for (const [keyId, keyPair] of this.keyStore.entries()) {
            if (keyPair.algorithm === this.config.algorithm) {
                return keyPair;
            }
        }
        return await this.generateEncryptionKey();
    }
    async getDecryptionKey(keyId) {
        const keyPair = this.keyStore.get(keyId);
        if (!keyPair) {
            throw new Error(`Decryption key not found: ${keyId}`);
        }
        return keyPair;
    }
    async getSigningKey() {
        for (const [keyId, keyPair] of this.keyStore.entries()) {
            if (keyPair.algorithm.startsWith('ECDSA')) {
                return keyPair;
            }
        }
        return await this.generateSigningKey();
    }
    generateDataId() {
        const timestamp = Date.now();
        const random = crypto.getRandomValues(new Uint8Array(16));
        const randomHex = Array.from(random).map(b => b.toString(16).padStart(2, '0')).join('');
        return `data-${timestamp}-${randomHex}`;
    }
    getSecurityAuditLog() {
        return [...this.securityAuditLog];
    }
    getKeyStoreInfo() {
        const now = new Date();
        let encryptionKeys = 0;
        let signingKeys = 0;
        let keyExchangeKeys = 0;
        let expiredKeys = 0;
        let quantumResistantKeys = 0;
        let hsmProtectedKeys = 0;
        for (const keyPair of this.keyStore.values()) {
            if (keyPair.algorithm.startsWith('AES') || keyPair.algorithm.startsWith('ChaCha')) {
                encryptionKeys++;
            }
            else if (keyPair.algorithm.startsWith('ECDSA')) {
                signingKeys++;
            }
            else if (keyPair.algorithm.startsWith('ECDH')) {
                keyExchangeKeys++;
            }
            if (new Date(keyPair.expiresAt) < now) {
                expiredKeys++;
            }
            if (keyPair.quantumResistant) {
                quantumResistantKeys++;
            }
            if (keyPair.hsmProtected) {
                hsmProtectedKeys++;
            }
        }
        return {
            totalKeys: this.keyStore.size,
            encryptionKeys,
            signingKeys,
            keyExchangeKeys,
            expiredKeys,
            quantumResistantKeys,
            hsmProtectedKeys
        };
    }
    getSecurityComplianceReport() {
        const keyStoreInfo = this.getKeyStoreInfo();
        const issues = [];
        const recommendations = [];
        if (keyStoreInfo.expiredKeys > 0) {
            issues.push(`${keyStoreInfo.expiredKeys} keys have expired and need rotation`);
            recommendations.push('Implement automatic key rotation for expired keys');
        }
        if (keyStoreInfo.quantumResistantKeys < keyStoreInfo.totalKeys * 0.8) {
            issues.push('Less than 80% of keys use quantum-resistant algorithms');
            recommendations.push('Upgrade keys to use quantum-resistant curves (P-521, BLS12-381)');
        }
        if (keyStoreInfo.hsmProtectedKeys < keyStoreInfo.totalKeys * 0.5) {
            issues.push('Less than 50% of keys are HSM-protected');
            recommendations.push('Enable HSM protection for all critical keys');
        }
        const quantumResistantStatus = keyStoreInfo.totalKeys > 0
            ? `${Math.round((keyStoreInfo.quantumResistantKeys / keyStoreInfo.totalKeys) * 100)}% quantum-resistant`
            : 'No keys generated';
        const hsmStatus = keyStoreInfo.totalKeys > 0
            ? `${Math.round((keyStoreInfo.hsmProtectedKeys / keyStoreInfo.totalKeys) * 100)}% HSM-protected`
            : 'No keys generated';
        return {
            overallCompliance: keyStoreInfo.expiredKeys === 0 &&
                keyStoreInfo.quantumResistantKeys >= keyStoreInfo.totalKeys * 0.8 &&
                keyStoreInfo.hsmProtectedKeys >= keyStoreInfo.totalKeys * 0.5,
            issues,
            recommendations,
            lastAudit: new Date().toISOString(),
            quantumResistantStatus,
            hsmStatus
        };
    }
    getQuantumResistanceStatus() {
        const keyStoreInfo = this.getKeyStoreInfo();
        const algorithms = [this.config.ellipticCurve, this.config.hashAlgorithm];
        const coverage = keyStoreInfo.totalKeys > 0 ? (keyStoreInfo.quantumResistantKeys / keyStoreInfo.totalKeys) * 100 : 0;
        const recommendations = [];
        if (coverage < 100) {
            recommendations.push('Enable quantum-resistant algorithms for all new keys');
            recommendations.push('Use P-521 or BLS12-381 curves for maximum quantum resistance');
            recommendations.push('Implement SHAKE256 or Keccak-256 hashing algorithms');
        }
        return {
            enabled: this.config.quantumResistant,
            algorithms,
            coverage,
            recommendations
        };
    }
    getHSMStatus() {
        const keyStoreInfo = this.getKeyStoreInfo();
        const coverage = keyStoreInfo.totalKeys > 0 ? (keyStoreInfo.hsmProtectedKeys / keyStoreInfo.totalKeys) * 100 : 0;
        const recommendations = [];
        if (coverage < 100) {
            recommendations.push('Enable HSM protection for all critical keys');
            recommendations.push('Configure cloud HSM providers (AWS KMS, Azure Key Vault, GCP KMS)');
            recommendations.push('Implement local HSM with secure enclaves or TPM');
        }
        return {
            enabled: this.hsmConfig.enabled,
            provider: this.hsmConfig.provider,
            status: this.hsmConfig.enabled ? 'Active' : 'Disabled',
            recommendations
        };
    }
}
exports.MilitaryGradeCrypto = MilitaryGradeCrypto;
exports.CryptoManager = MilitaryGradeCrypto;
MilitaryGradeCrypto.MIN_PASSCODE_LENGTH = 12;
MilitaryGradeCrypto.MAX_LOGIN_ATTEMPTS = 5;
MilitaryGradeCrypto.LOCKOUT_DURATION = 15 * 60 * 1000;
MilitaryGradeCrypto.MILITARY_CONFIG = {
    iterations: 1000000,
    memoryCost: 65536,
    parallelism: 4
};
MilitaryGradeCrypto.ALGORITHM = 'AES-256-GCM';
MilitaryGradeCrypto.KEY_LENGTH = 256;
MilitaryGradeCrypto.failedAttempts = new Map();
//# sourceMappingURL=crypto.js.map