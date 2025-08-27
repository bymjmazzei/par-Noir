"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdentitySync = void 0;
class IdentitySync {
    constructor(deviceId) {
        this.encryptionKey = null;
        this.rateLimiter = new Map();
        this.auditLog = [];
        this.deviceId = deviceId || this.generateDeviceId();
    }
    async initializeEncryption(password, salt) {
        try {
            const keySalt = salt || crypto.getRandomValues(new Uint8Array(32));
            const encoder = new TextEncoder();
            const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits', 'deriveKey']);
            this.encryptionKey = await crypto.subtle.deriveKey({
                name: 'PBKDF2',
                salt: keySalt,
                iterations: 200000,
                hash: 'SHA-256'
            }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
            this.logSecurityEvent('encryption_initialized', { deviceId: this.deviceId });
        }
        catch (error) {
            this.logSecurityEvent('encryption_init_failed', { error: error instanceof Error ? error.message : 'Unknown error' });
            throw error;
        }
    }
    async syncToAllDevices(identity) {
        const startTime = Date.now();
        try {
            if (!this.encryptionKey) {
                throw new Error('Encryption key not initialized');
            }
            if (!this.checkRateLimit(identity.id)) {
                throw new Error('Rate limit exceeded - too many sync attempts');
            }
            const encrypted = await this.encryptIdentity(identity);
            const cid = await this.uploadToIPFS(encrypted);
            await this.updateDidDocument(identity.id, {
                service: [{
                        id: '#identity-sync',
                        type: 'IdentitySync',
                        serviceEndpoint: `ipfs://${cid}`,
                        timestamp: new Date().toISOString(),
                        deviceId: this.deviceId
                    }]
            });
            await this.storeSecurely(identity.id, encrypted);
            await this.notifyOtherDevices(identity.id, cid);
            const result = {
                success: true,
                cid,
                timestamp: new Date().toISOString()
            };
            this.logSecurityEvent('sync_success', {
                did: identity.id,
                cid,
                duration: Date.now() - startTime
            });
            return result;
        }
        catch (error) {
            const result = {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
            };
            this.logSecurityEvent('sync_failed', {
                did: identity.id,
                error: result.error,
                duration: Date.now() - startTime
            });
            return result;
        }
    }
    async syncFromCloud(did) {
        const startTime = Date.now();
        try {
            if (!this.checkRateLimit(did)) {
                throw new Error('Rate limit exceeded - too many sync attempts');
            }
            const localIdentity = await this.getFromSecure(did);
            if (localIdentity) {
                this.logSecurityEvent('sync_from_local', { did, duration: Date.now() - startTime });
                return localIdentity;
            }
            const didDoc = await this.resolveDidDocument(did);
            const syncService = didDoc.service?.find((s) => s.type === 'IdentitySync');
            if (!syncService) {
                return null;
            }
            const cid = syncService.serviceEndpoint.replace('ipfs://', '');
            const encrypted = await this.downloadFromIPFS(cid);
            const identity = await this.decryptIdentity(encrypted);
            await this.storeSecurely(did, encrypted);
            this.logSecurityEvent('sync_from_cloud_success', {
                did,
                cid,
                duration: Date.now() - startTime
            });
            return identity;
        }
        catch (error) {
            this.logSecurityEvent('sync_from_cloud_failed', {
                did,
                error: error instanceof Error ? error.message : 'Unknown error',
                duration: Date.now() - startTime
            });
            if (process.env.NODE_ENV === 'development') {
                console.error('Failed to sync from cloud:', error);
            }
            return null;
        }
    }
    async encryptIdentity(identity) {
        if (!this.encryptionKey) {
            throw new Error('Encryption key not initialized');
        }
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoder = new TextEncoder();
        const data = encoder.encode(JSON.stringify(identity));
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.encryptionKey, data);
        const encryptedArray = new Uint8Array(encrypted);
        const combined = new Uint8Array(iv.length + encryptedArray.length);
        combined.set(iv);
        combined.set(encryptedArray, iv.length);
        return btoa(String.fromCharCode(...combined));
    }
    async decryptIdentity(encryptedData) {
        if (!this.encryptionKey) {
            throw new Error('Encryption key not initialized');
        }
        try {
            const combined = new Uint8Array(atob(encryptedData).split('').map(char => char.charCodeAt(0)));
            const iv = combined.slice(0, 12);
            const encrypted = combined.slice(12);
            const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, this.encryptionKey, encrypted);
            const decoder = new TextDecoder();
            const jsonString = decoder.decode(decrypted);
            const identity = JSON.parse(jsonString);
            if (!identity.id || !identity.username) {
                throw new Error('Invalid identity structure');
            }
            return identity;
        }
        catch (error) {
            this.logSecurityEvent('decrypt_failed', { error: error instanceof Error ? error.message : 'Unknown error' });
            throw new Error('Failed to decrypt identity data');
        }
    }
    async uploadToIPFS(data) {
        const gateways = [
            'https://ipfs.infura.io:5001',
            'https://gateway.pinata.cloud',
            'https://cloudflare-ipfs.com',
            'https://dweb.link'
        ];
        const uploadPromises = gateways.map(gateway => this.uploadToGateway(data, gateway));
        try {
            const results = await Promise.allSettled(uploadPromises);
            const successful = results
                .filter(r => r.status === 'fulfilled')
                .map(r => r.value);
            if (successful.length === 0) {
                throw new Error('All IPFS gateways failed');
            }
            const cid = successful[0];
            this.logSecurityEvent('ipfs_upload_success', {
                cid,
                successfulGateways: successful.length,
                totalGateways: gateways.length
            });
            return cid;
        }
        catch (error) {
            this.logSecurityEvent('ipfs_upload_failed', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error('IPFS upload failed - cannot proceed securely');
        }
    }
    async uploadToGateway(data, gateway) {
        try {
            const response = await fetch(`${gateway}/api/v0/add`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    path: '/identity.json',
                    content: data
                })
            });
            if (!response.ok) {
                throw new Error(`Gateway ${gateway} returned ${response.status}`);
            }
            const result = await response.json();
            if (!result.Hash) {
                throw new Error(`Gateway ${gateway} returned invalid response`);
            }
            return result.Hash;
        }
        catch (error) {
            throw new Error(`IPFS gateway upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async downloadFromIPFS(cid) {
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
                        'Accept': 'application/json, text/plain, */*'
                    }
                });
                if (!response.ok) {
                    continue;
                }
                const data = await response.text();
                if (!data || data.length < 10) {
                    continue;
                }
                this.logSecurityEvent('ipfs_download_success', { cid, gateway });
                return data;
            }
            catch (error) {
                continue;
            }
        }
        throw new Error('All IPFS gateways failed for download');
    }
    async updateDidDocument(did, updates) {
        try {
            const didDoc = {
                id: did,
                ...updates,
                updated: new Date().toISOString()
            };
            await this.storeSecurely(`did:${did}`, JSON.stringify(didDoc));
            this.logSecurityEvent('did_document_updated', { did });
        }
        catch (error) {
            this.logSecurityEvent('did_document_update_failed', {
                did,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
    async resolveDidDocument(did) {
        try {
            const stored = await this.getFromSecureStorage(`did:${did}`);
            if (!stored) {
                throw new Error('DID document not found');
            }
            const didDoc = JSON.parse(stored);
            if (!didDoc.id || !didDoc.service) {
                throw new Error('Invalid DID document structure');
            }
            return didDoc;
        }
        catch (error) {
            this.logSecurityEvent('did_resolution_failed', {
                did,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
    async storeSecurely(key, data) {
        try {
            if (window.crypto && window.crypto.subtle) {
                const encrypted = await this.encryptForStorage(data);
                sessionStorage.setItem(key, encrypted);
            }
            else {
                sessionStorage.setItem(key, data);
            }
        }
        catch (error) {
            this.logSecurityEvent('secure_storage_failed', {
                key,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
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
    async getFromSecureStorage(key) {
        try {
            const encrypted = sessionStorage.getItem(key);
            if (!encrypted)
                return null;
            if (window.crypto && window.crypto.subtle) {
                return await this.decryptFromStorage(encrypted);
            }
            else {
                return encrypted;
            }
        }
        catch (error) {
            return null;
        }
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
    async getFromSecure(did) {
        try {
            const encrypted = await this.getFromSecureStorage(`sync:${did}`);
            if (!encrypted)
                return null;
            return await this.decryptIdentity(encrypted);
        }
        catch (error) {
            return null;
        }
    }
    async notifyOtherDevices(did, cid) {
        try {
            this.logSecurityEvent('device_notification_sent', { did, cid });
            console.log(`Notifying other devices about sync for ${did} at ${cid}`);
        }
        catch (error) {
            this.logSecurityEvent('device_notification_failed', {
                did,
                cid,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    checkRateLimit(identifier) {
        const now = Date.now();
        const limit = this.rateLimiter.get(identifier);
        if (!limit || now > limit.resetTime) {
            this.rateLimiter.set(identifier, { count: 1, resetTime: now + 60000 });
            return true;
        }
        if (limit.count >= 5) {
            this.logSecurityEvent('rate_limit_exceeded', { identifier });
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
            userAgent: navigator.userAgent,
            deviceId: this.deviceId
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
    generateDeviceId() {
        const timestamp = Date.now();
        const random = crypto.getRandomValues(new Uint8Array(16));
        const entropy = Array.from(random, byte => byte.toString(16).padStart(2, '0')).join('');
        return `device-${timestamp}-${entropy}`;
    }
    getDeviceId() {
        return this.deviceId;
    }
    isEncryptionInitialized() {
        return this.encryptionKey !== null;
    }
    getAuditLog() {
        return [...this.auditLog];
    }
    clearAuditLog() {
        this.auditLog = [];
    }
}
exports.IdentitySync = IdentitySync;
//# sourceMappingURL=IdentitySync.js.map