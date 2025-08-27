"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HSMManager = void 0;
class HSMManager {
    constructor(config = {}) {
        this.operationLog = [];
        this.isConnected = false;
        this.config = {
            enabled: false,
            provider: 'local-hsm',
            fallbackToLocal: true,
            ...config
        };
    }
    async initialize() {
        if (!this.config.enabled) {
            return false;
        }
        try {
            switch (this.config.provider) {
                case 'aws-kms':
                    return await this.initializeAWSKMS();
                case 'azure-keyvault':
                    return await this.initializeAzureKeyVault();
                case 'gcp-kms':
                    return await this.initializeGCPKMS();
                case 'local-hsm':
                    return await this.initializeLocalHSM();
                default:
                    throw new Error(`Unsupported HSM provider: ${this.config.provider}`);
            }
        }
        catch (error) {
            console.warn('HSM initialization failed, falling back to local storage:', error);
            this.isConnected = false;
            return false;
        }
    }
    async initializeAWSKMS() {
        try {
            await this.simulateHSMConnection('aws-kms');
            this.isConnected = true;
            return true;
        }
        catch (error) {
            throw new Error(`AWS KMS initialization failed: ${error}`);
        }
    }
    async initializeAzureKeyVault() {
        try {
            await this.simulateHSMConnection('azure-keyvault');
            this.isConnected = true;
            return true;
        }
        catch (error) {
            throw new Error(`Azure Key Vault initialization failed: ${error}`);
        }
    }
    async initializeGCPKMS() {
        try {
            await this.simulateHSMConnection('gcp-kms');
            this.isConnected = true;
            return true;
        }
        catch (error) {
            throw new Error(`GCP KMS initialization failed: ${error}`);
        }
    }
    async initializeLocalHSM() {
        try {
            await this.simulateHSMConnection('local-hsm');
            this.isConnected = true;
            return true;
        }
        catch (error) {
            throw new Error(`Local HSM initialization failed: ${error}`);
        }
    }
    async simulateHSMConnection(provider) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (Math.random() < 0.1) {
            throw new Error('HSM connection failed');
        }
    }
    async generateKeyPair(algorithm = 'RSA_2048') {
        if (!this.isConnected) {
            throw new Error('HSM not connected');
        }
        try {
            const keyId = this.generateKeyId();
            const now = new Date();
            const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
            const keyPair = await this.simulateHSMKeyGeneration(algorithm);
            const result = {
                keyId,
                publicKey: keyPair.publicKey,
                encryptedPrivateKey: keyPair.encryptedPrivateKey,
                provider: this.config.provider,
                region: this.config.region || 'us-east-1',
                createdAt: now.toISOString(),
                expiresAt: expiresAt.toISOString(),
                hsmProtected: true
            };
            this.logOperation({
                operation: 'generate',
                keyId,
                algorithm,
                timestamp: now.toISOString(),
                success: true
            });
            return result;
        }
        catch (error) {
            this.logOperation({
                operation: 'generate',
                keyId: 'unknown',
                algorithm,
                timestamp: new Date().toISOString(),
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            if (this.config.fallbackToLocal) {
                return this.fallbackToLocalKeyGeneration();
            }
            throw error;
        }
    }
    async sign(keyId, data, algorithm = 'RSA_PKCS1_SHA_256') {
        if (!this.isConnected) {
            throw new Error('HSM not connected');
        }
        try {
            const signature = await this.simulateHSMSigning(keyId, data, algorithm);
            this.logOperation({
                operation: 'sign',
                keyId,
                data: data.substring(0, 32) + '...',
                algorithm,
                timestamp: new Date().toISOString(),
                success: true
            });
            return signature;
        }
        catch (error) {
            this.logOperation({
                operation: 'sign',
                keyId,
                data: data.substring(0, 32) + '...',
                algorithm,
                timestamp: new Date().toISOString(),
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            if (this.config.fallbackToLocal) {
                return this.fallbackToLocalSigning(data, algorithm);
            }
            throw error;
        }
    }
    async verify(keyId, data, signature, algorithm = 'RSA_PKCS1_SHA_256') {
        if (!this.isConnected) {
            throw new Error('HSM not connected');
        }
        try {
            const isValid = await this.simulateHSMVerification(keyId, data, signature, algorithm);
            this.logOperation({
                operation: 'verify',
                keyId,
                data: data.substring(0, 32) + '...',
                algorithm,
                timestamp: new Date().toISOString(),
                success: isValid
            });
            return isValid;
        }
        catch (error) {
            this.logOperation({
                operation: 'verify',
                keyId,
                data: data.substring(0, 32) + '...',
                algorithm,
                timestamp: new Date().toISOString(),
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            if (this.config.fallbackToLocal) {
                return this.fallbackToLocalVerification(data, signature, algorithm);
            }
            return false;
        }
    }
    async encrypt(keyId, data, algorithm = 'RSA_OAEP_SHA_256') {
        if (!this.isConnected) {
            throw new Error('HSM not connected');
        }
        try {
            const encrypted = await this.simulateHSMEncryption(keyId, data, algorithm);
            this.logOperation({
                operation: 'encrypt',
                keyId,
                data: data.substring(0, 32) + '...',
                algorithm,
                timestamp: new Date().toISOString(),
                success: true
            });
            return encrypted;
        }
        catch (error) {
            this.logOperation({
                operation: 'encrypt',
                keyId,
                data: data.substring(0, 32) + '...',
                algorithm,
                timestamp: new Date().toISOString(),
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            if (this.config.fallbackToLocal) {
                return this.fallbackToLocalEncryption(data, algorithm);
            }
            throw error;
        }
    }
    async decrypt(keyId, encryptedData, algorithm = 'RSA_OAEP_SHA_256') {
        if (!this.isConnected) {
            throw new Error('HSM not connected');
        }
        try {
            const decrypted = await this.simulateHSMDecryption(keyId, encryptedData, algorithm);
            this.logOperation({
                operation: 'decrypt',
                keyId,
                data: encryptedData.substring(0, 32) + '...',
                algorithm,
                timestamp: new Date().toISOString(),
                success: true
            });
            return decrypted;
        }
        catch (error) {
            this.logOperation({
                operation: 'decrypt',
                keyId,
                data: encryptedData.substring(0, 32) + '...',
                algorithm,
                timestamp: new Date().toISOString(),
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            if (this.config.fallbackToLocal) {
                return this.fallbackToLocalDecryption(encryptedData, algorithm);
            }
            throw error;
        }
    }
    async simulateHSMKeyGeneration(algorithm) {
        await new Promise(resolve => setTimeout(resolve, 200));
        const publicKey = crypto.getRandomValues(new Uint8Array(256));
        const encryptedPrivateKey = crypto.getRandomValues(new Uint8Array(256));
        return {
            publicKey: this.arrayBufferToBase64(publicKey),
            encryptedPrivateKey: this.arrayBufferToBase64(encryptedPrivateKey)
        };
    }
    async simulateHSMSigning(keyId, data, algorithm) {
        await new Promise(resolve => setTimeout(resolve, 100));
        const signature = crypto.getRandomValues(new Uint8Array(256));
        return this.arrayBufferToBase64(signature);
    }
    async simulateHSMVerification(keyId, data, signature, algorithm) {
        await new Promise(resolve => setTimeout(resolve, 50));
        return Math.random() > 0.01;
    }
    async simulateHSMEncryption(keyId, data, algorithm) {
        await new Promise(resolve => setTimeout(resolve, 150));
        const encrypted = crypto.getRandomValues(new Uint8Array(256));
        return this.arrayBufferToBase64(encrypted);
    }
    async simulateHSMDecryption(keyId, encryptedData, algorithm) {
        await new Promise(resolve => setTimeout(resolve, 150));
        return 'decrypted-data-placeholder';
    }
    async fallbackToLocalKeyGeneration() {
        const keyPair = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
        const publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey);
        const privateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
        return {
            keyId: this.generateKeyId(),
            publicKey: this.arrayBufferToBase64(publicKey),
            encryptedPrivateKey: this.arrayBufferToBase64(privateKey),
            provider: 'local-fallback',
            region: 'local',
            createdAt: new Date().toISOString(),
            hsmProtected: false
        };
    }
    async fallbackToLocalSigning(data, algorithm) {
        const signature = crypto.getRandomValues(new Uint8Array(256));
        return this.arrayBufferToBase64(signature);
    }
    async fallbackToLocalVerification(data, signature, algorithm) {
        return true;
    }
    async fallbackToLocalEncryption(data, algorithm) {
        const encrypted = crypto.getRandomValues(new Uint8Array(256));
        return this.arrayBufferToBase64(encrypted);
    }
    async fallbackToLocalDecryption(encryptedData, algorithm) {
        return 'decrypted-data-fallback';
    }
    generateKeyId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2);
        return `hsm-${timestamp}-${random}`;
    }
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
    logOperation(operation) {
        this.operationLog.push(operation);
        if (this.operationLog.length > 1000) {
            this.operationLog = this.operationLog.slice(-1000);
        }
    }
    getOperationLog() {
        return [...this.operationLog];
    }
    isHSMConnected() {
        return this.isConnected;
    }
    getConfig() {
        return { ...this.config };
    }
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }
}
exports.HSMManager = HSMManager;
//# sourceMappingURL=hsmManager.js.map