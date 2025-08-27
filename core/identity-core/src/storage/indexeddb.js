"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IndexedDBStorage = void 0;
const types_1 = require("../types");
const crypto_1 = require("../encryption/crypto");
class IndexedDBStorage {
    constructor(config = {
        databaseName: 'IdentityProtocol',
        version: 1,
        storeName: 'dids'
    }) {
        this.db = null;
        this.config = config;
    }
    async initialize() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.config.databaseName, this.config.version);
            request.onerror = () => {
                reject(new types_1.IdentityError('Failed to open IndexedDB', types_1.IdentityErrorCodes.STORAGE_ERROR, request.error));
            };
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.config.storeName)) {
                    const store = db.createObjectStore(this.config.storeName, { keyPath: 'id' });
                    store.createIndex('pnName', 'pnName', { unique: true });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                }
            };
        });
    }
    async storeDID(did, passcode) {
        if (!this.db) {
            throw new types_1.IdentityError('Database not initialized', types_1.IdentityErrorCodes.STORAGE_ERROR);
        }
        try {
            this.validateDIDStructure(did);
            const didData = JSON.stringify(did);
            if (didData.length > 1024 * 1024) {
                throw new types_1.IdentityError('DID data too large', types_1.IdentityErrorCodes.VALIDATION_ERROR);
            }
            const encryptedData = await crypto_1.CryptoManager.encrypt(didData, passcode);
            const testDecrypt = await crypto_1.CryptoManager.decrypt(encryptedData, passcode);
            if (testDecrypt !== didData) {
                throw new types_1.IdentityError('Encryption verification failed', types_1.IdentityErrorCodes.ENCRYPTION_ERROR);
            }
            const transaction = this.db.transaction([this.config.storeName], 'readwrite');
            const store = transaction.objectStore(this.config.storeName);
            const request = store.put({
                id: did.id,
                pnName: did.pnName,
                encryptedData: encryptedData,
                createdAt: did.createdAt,
                updatedAt: did.updatedAt,
                status: did.status,
                security: {
                    lastModified: new Date().toISOString(),
                    checksum: await crypto_1.CryptoManager.hash(didData),
                    version: '1.0'
                }
            });
            return new Promise((resolve, reject) => {
                request.onsuccess = () => resolve();
                request.onerror = () => {
                    reject(new types_1.IdentityError('Failed to store DID', types_1.IdentityErrorCodes.STORAGE_ERROR, request.error));
                };
            });
        }
        catch (error) {
            throw new types_1.IdentityError('Failed to encrypt and store DID', types_1.IdentityErrorCodes.ENCRYPTION_ERROR, error);
        }
    }
    async getDID(didId, passcode) {
        if (!this.db) {
            throw new types_1.IdentityError('Database not initialized', types_1.IdentityErrorCodes.STORAGE_ERROR);
        }
        try {
            const transaction = this.db.transaction([this.config.storeName], 'readonly');
            const store = transaction.objectStore(this.config.storeName);
            const request = store.get(didId);
            return new Promise((resolve, reject) => {
                request.onsuccess = async () => {
                    if (!request.result) {
                        reject(new types_1.IdentityError('DID not found', types_1.IdentityErrorCodes.NOT_FOUND_ERROR));
                        return;
                    }
                    const storedData = request.result;
                    if (!storedData.encryptedData || !storedData.security) {
                        reject(new types_1.IdentityError('Invalid stored data structure', types_1.IdentityErrorCodes.STORAGE_ERROR));
                        return;
                    }
                    try {
                        const decryptedData = await crypto_1.CryptoManager.decrypt(storedData.encryptedData, passcode);
                        const did = JSON.parse(decryptedData);
                        const expectedChecksum = storedData.security.checksum;
                        const actualChecksum = await crypto_1.CryptoManager.hash(decryptedData);
                        if (expectedChecksum !== actualChecksum) {
                            reject(new types_1.IdentityError('Data integrity check failed', types_1.IdentityErrorCodes.STORAGE_ERROR));
                            return;
                        }
                        this.validateDIDStructure(did);
                        resolve(did);
                    }
                    catch (error) {
                        reject(new types_1.IdentityError('Failed to decrypt DID', types_1.IdentityErrorCodes.ENCRYPTION_ERROR, error));
                    }
                };
                request.onerror = () => {
                    reject(new types_1.IdentityError('Failed to retrieve DID', types_1.IdentityErrorCodes.STORAGE_ERROR, request.error));
                };
            });
        }
        catch (error) {
            throw new types_1.IdentityError('Failed to decrypt DID', types_1.IdentityErrorCodes.ENCRYPTION_ERROR, error);
        }
    }
    async getAllDIDs() {
        if (!this.db) {
            throw new types_1.IdentityError('Database not initialized', types_1.IdentityErrorCodes.STORAGE_ERROR);
        }
        const transaction = this.db.transaction([this.config.storeName], 'readonly');
        const store = transaction.objectStore(this.config.storeName);
        const request = store.getAll();
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const results = request.result.map(item => ({
                    id: item.id,
                    pnName: item.pnName,
                    createdAt: item.createdAt,
                    status: item.status
                }));
                resolve(results);
            };
            request.onerror = () => {
                reject(new types_1.IdentityError('Failed to retrieve DIDs', types_1.IdentityErrorCodes.STORAGE_ERROR, request.error));
            };
        });
    }
    async updateDID(did, passcode) {
        if (!this.db) {
            throw new types_1.IdentityError('Database not initialized', types_1.IdentityErrorCodes.STORAGE_ERROR);
        }
        try {
            this.validateDIDStructure(did);
            did.updatedAt = new Date().toISOString();
            const didData = JSON.stringify(did);
            const encryptedData = await crypto_1.CryptoManager.encrypt(didData, passcode);
            const transaction = this.db.transaction([this.config.storeName], 'readwrite');
            const store = transaction.objectStore(this.config.storeName);
            const request = store.put({
                id: did.id,
                pnName: did.pnName,
                encryptedData: encryptedData,
                createdAt: did.createdAt,
                updatedAt: did.updatedAt,
                status: did.status,
                security: {
                    lastModified: new Date().toISOString(),
                    checksum: await crypto_1.CryptoManager.hash(didData),
                    version: '1.0'
                }
            });
            return new Promise((resolve, reject) => {
                request.onsuccess = () => resolve();
                request.onerror = () => {
                    reject(new types_1.IdentityError('Failed to update DID', types_1.IdentityErrorCodes.STORAGE_ERROR, request.error));
                };
            });
        }
        catch (error) {
            throw new types_1.IdentityError('Failed to update DID', types_1.IdentityErrorCodes.STORAGE_ERROR, error);
        }
    }
    async deleteDID(didId) {
        if (!this.db) {
            throw new types_1.IdentityError('Database not initialized', types_1.IdentityErrorCodes.STORAGE_ERROR);
        }
        try {
            const transaction = this.db.transaction([this.config.storeName], 'readwrite');
            const store = transaction.objectStore(this.config.storeName);
            const request = store.delete(didId);
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    this.performSecureCleanup();
                    resolve();
                };
                request.onerror = () => {
                    reject(new types_1.IdentityError('Failed to delete DID', types_1.IdentityErrorCodes.STORAGE_ERROR, request.error));
                };
            });
        }
        catch (error) {
            throw new types_1.IdentityError('Failed to delete DID', types_1.IdentityErrorCodes.STORAGE_ERROR, error);
        }
    }
    async hasDID(didId) {
        if (!this.db) {
            throw new types_1.IdentityError('Database not initialized', types_1.IdentityErrorCodes.STORAGE_ERROR);
        }
        const transaction = this.db.transaction([this.config.storeName], 'readonly');
        const store = transaction.objectStore(this.config.storeName);
        const request = store.count(didId);
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                resolve(request.result > 0);
            };
            request.onerror = () => {
                reject(new types_1.IdentityError('Failed to check DID existence', types_1.IdentityErrorCodes.STORAGE_ERROR, request.error));
            };
        });
    }
    async getDIDByPNName(pnName) {
        if (!this.db) {
            throw new types_1.IdentityError('Database not initialized', types_1.IdentityErrorCodes.STORAGE_ERROR);
        }
        const transaction = this.db.transaction([this.config.storeName], 'readonly');
        const store = transaction.objectStore(this.config.storeName);
        const index = store.index('pnName');
        const request = index.get(pnName);
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const result = request.result;
                if (!result) {
                    resolve(null);
                }
                else {
                    resolve({
                        id: result.id,
                        pnName: result.pnName,
                        createdAt: result.createdAt,
                        status: result.status
                    });
                }
            };
            request.onerror = () => {
                reject(new types_1.IdentityError('Failed to retrieve DID by username', types_1.IdentityErrorCodes.STORAGE_ERROR, request.error));
            };
        });
    }
    async clear() {
        if (!this.db) {
            throw new types_1.IdentityError('Database not initialized', types_1.IdentityErrorCodes.STORAGE_ERROR);
        }
        const transaction = this.db.transaction([this.config.storeName], 'readwrite');
        const store = transaction.objectStore(this.config.storeName);
        const request = store.clear();
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve();
            request.onerror = () => {
                reject(new types_1.IdentityError('Failed to clear storage', types_1.IdentityErrorCodes.STORAGE_ERROR, request.error));
            };
        });
    }
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
    validateDIDStructure(did) {
        if (!did.id || !did.pnName || !did.createdAt || !did.updatedAt) {
            throw new types_1.IdentityError('Invalid DID structure: missing required fields', types_1.IdentityErrorCodes.VALIDATION_ERROR);
        }
        if (!did.id.startsWith('did:key:')) {
            throw new types_1.IdentityError('Invalid DID format', types_1.IdentityErrorCodes.VALIDATION_ERROR);
        }
        if (!/^[a-zA-Z0-9-]{3,20}$/.test(did.pnName)) {
            throw new types_1.IdentityError('Invalid username format', types_1.IdentityErrorCodes.VALIDATION_ERROR);
        }
        const createdAt = new Date(did.createdAt);
        const updatedAt = new Date(did.updatedAt);
        if (isNaN(createdAt.getTime()) || isNaN(updatedAt.getTime())) {
            throw new types_1.IdentityError('Invalid date format', types_1.IdentityErrorCodes.VALIDATION_ERROR);
        }
        if (updatedAt < createdAt) {
            throw new types_1.IdentityError('Updated date cannot be before created date', types_1.IdentityErrorCodes.VALIDATION_ERROR);
        }
        if (!['active', 'inactive', 'suspended'].includes(did.status)) {
            throw new types_1.IdentityError('Invalid DID status', types_1.IdentityErrorCodes.VALIDATION_ERROR);
        }
        if (!did.metadata || typeof did.metadata !== 'object') {
            throw new types_1.IdentityError('Invalid metadata structure', types_1.IdentityErrorCodes.VALIDATION_ERROR);
        }
        if (!did.keys || !did.keys.publicKey || !did.keys.privateKey) {
            throw new types_1.IdentityError('Invalid keys structure', types_1.IdentityErrorCodes.VALIDATION_ERROR);
        }
    }
    performSecureCleanup() {
        if (typeof window !== 'undefined' && window.caches) {
            caches.keys().then(cacheNames => {
                cacheNames.forEach(cacheName => {
                    caches.delete(cacheName);
                });
            });
        }
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.clear();
        }
        if (this.db) {
            const transaction = this.db.transaction([this.config.storeName], 'readwrite');
            const store = transaction.objectStore(this.config.storeName);
            const clearRequest = store.clear();
            clearRequest.onsuccess = () => {
                if (typeof window !== 'undefined' && window.gc) {
                    window.gc();
                }
            };
        }
    }
}
exports.IndexedDBStorage = IndexedDBStorage;
//# sourceMappingURL=indexeddb.js.map