"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DistributedIdentityManager = void 0;
const DIDResolver_1 = require("./DIDResolver");
const IdentitySync_1 = require("./IdentitySync");
const DecentralizedAuth_1 = require("./DecentralizedAuth");
const zk_proofs_1 = require("../encryption/zk-proofs");
class DistributedIdentityManager {
    constructor(config = {}) {
        this.operations = [];
        this.config = {
            enableIPFS: true,
            enableBlockchain: true,
            enableZKProofs: true,
            ...config
        };
        this.resolver = new DIDResolver_1.DIDResolver();
        this.sync = new IdentitySync_1.IdentitySync(config.deviceId);
        this.auth = new DecentralizedAuth_1.DecentralizedAuth(this.resolver);
        this.zkProofs = new zk_proofs_1.ZKProofManager();
    }
    async initialize(syncPassword) {
        try {
            await this.sync.initializeEncryption(syncPassword);
            if (process.env.NODE_ENV === 'development') {
                console.log('Distributed identity system initialized');
            }
        }
        catch (error) {
            if (process.env.NODE_ENV === 'development') {
                console.error('Failed to initialize distributed identity system:', error);
            }
            throw error;
        }
    }
    async createIdentity(identity) {
        try {
            const keyPair = await this.auth.generateKeyPair();
            const publicKeyString = await this.auth.exportPublicKey(keyPair.publicKey);
            const didDocument = this.createDidDocument(identity.id, publicKeyString);
            localStorage.setItem(`did:${identity.id}`, JSON.stringify(didDocument));
            if (this.config.enableZKProofs) {
                await this.generateIdentityExistenceProof(identity.id);
            }
            const syncResult = await this.sync.syncToAllDevices(identity);
            this.logOperation('create', identity.id, true);
            return syncResult;
        }
        catch (error) {
            this.logOperation('create', identity.id, false, error instanceof Error ? error.message : 'Unknown error');
            throw error;
        }
    }
    async syncIdentity(did) {
        try {
            const identity = await this.sync.syncFromCloud(did);
            if (identity) {
                this.logOperation('sync', did, true);
            }
            else {
                this.logOperation('sync', did, false, 'Identity not found');
            }
            return identity;
        }
        catch (error) {
            this.logOperation('sync', did, false, error instanceof Error ? error.message : 'Unknown error');
            throw error;
        }
    }
    async authenticateWithZKProof(did, proofRequest) {
        try {
            const zkProof = await this.zkProofs.generateProof(proofRequest);
            const verification = await this.zkProofs.verifyProof(zkProof);
            if (!verification.isValid) {
                throw new Error(`ZK proof verification failed: ${verification.error}`);
            }
            const session = {
                did,
                authenticatedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                deviceId: this.getDeviceId(),
                permissions: ['read', 'write', 'sync', 'zk_proof']
            };
            this.logOperation('zk_proof', did, true);
            return session;
        }
        catch (error) {
            this.logOperation('zk_proof', did, false, error instanceof Error ? error.message : 'Unknown error');
            throw error;
        }
    }
    async authenticate(did, privateKey) {
        try {
            const challenge = await this.auth.createChallenge(did);
            const signature = await this.auth.createSignature(challenge.challenge, privateKey);
            const session = await this.auth.authenticate(did, signature);
            if (session) {
                this.logOperation('authenticate', did, true);
            }
            else {
                this.logOperation('authenticate', did, false, 'Authentication failed');
            }
            return session;
        }
        catch (error) {
            this.logOperation('authenticate', did, false, error instanceof Error ? error.message : 'Unknown error');
            throw error;
        }
    }
    async generateIdentityExistenceProof(did) {
        try {
            const statement = {
                type: 'discrete_log',
                description: `Identity ${did} exists and is valid`,
                publicInputs: {
                    g: '79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798:483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8',
                    y: '79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798:483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8'
                },
                privateInputs: {
                    x: '123456789abcdef'
                },
                relation: 'y = g^x'
            };
            const proof = await this.zkProofs.generateProof({
                type: 'discrete_logarithm',
                statement
            });
            this.logOperation('zk_proof', did, true);
            return proof;
        }
        catch (error) {
            this.logOperation('zk_proof', did, false, error instanceof Error ? error.message : 'Unknown error');
            throw error;
        }
    }
    async generateSelectiveDisclosureProof(did, data, disclosedFields, statement) {
        try {
            const proof = await this.zkProofs.generateSelectiveDisclosure(data, disclosedFields);
            this.logOperation('zk_proof', did, true);
            return proof;
        }
        catch (error) {
            this.logOperation('zk_proof', did, false, error instanceof Error ? error.message : 'Unknown error');
            throw error;
        }
    }
    async generateAgeVerificationProof(did, birthDate, minimumAge, statement) {
        try {
            const identity = { age: minimumAge };
            const proof = await this.zkProofs.generateAgeVerification(identity, minimumAge);
            this.logOperation('zk_proof', did, true);
            return proof;
        }
        catch (error) {
            this.logOperation('zk_proof', did, false, error instanceof Error ? error.message : 'Unknown error');
            throw error;
        }
    }
    async generateCredentialVerificationProof(did, credentialHash, credentialType, statement) {
        try {
            const credential = { type: credentialType };
            const requiredFields = ['passport', 'driver_license', 'national_id'];
            const proof = await this.zkProofs.generateCredentialVerification(credential, requiredFields);
            this.logOperation('zk_proof', did, true);
            return proof;
        }
        catch (error) {
            this.logOperation('zk_proof', did, false, error instanceof Error ? error.message : 'Unknown error');
            throw error;
        }
    }
    async generatePermissionProof(did, permissions, requiredPermissions, statement) {
        try {
            const identity = { permissions };
            const proof = await this.zkProofs.generatePermissionProof(identity, requiredPermissions[0] || 'admin');
            this.logOperation('zk_proof', did, true);
            return proof;
        }
        catch (error) {
            this.logOperation('zk_proof', did, false, error instanceof Error ? error.message : 'Unknown error');
            throw error;
        }
    }
    async verifyZKProof(proof) {
        try {
            const verification = await this.zkProofs.verifyProof(proof);
            return verification.isValid;
        }
        catch (error) {
            if (process.env.NODE_ENV === 'development') {
                console.error('ZK proof verification failed:', error);
            }
            return false;
        }
    }
    async resolveDID(did) {
        try {
            const result = await this.resolver.resolve(did);
            this.logOperation('resolve', did, true);
            return result;
        }
        catch (error) {
            this.logOperation('resolve', did, false, error instanceof Error ? error.message : 'Unknown error');
            throw error;
        }
    }
    async isAuthenticated(did) {
        return await this.auth.isAuthenticated(did);
    }
    getSession(did) {
        return this.auth.getSession(did);
    }
    logout(did) {
        this.auth.logout(did);
    }
    getDeviceId() {
        return this.sync.getDeviceId();
    }
    isEncryptionInitialized() {
        return this.sync.isEncryptionInitialized();
    }
    getZKProofStats() {
        return this.zkProofs.getProofStats();
    }
    getOperationHistory() {
        return [...this.operations];
    }
    clearOperationHistory() {
        this.operations = [];
    }
    createDidDocument(did, publicKey) {
        return {
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
            capabilityDelegation: [`${did}#key-1`],
            service: [],
            created: new Date().toISOString(),
            updated: new Date().toISOString()
        };
    }
    logOperation(type, did, success, error) {
        const operation = {
            type,
            did,
            timestamp: new Date().toISOString(),
            success,
            error
        };
        this.operations.push(operation);
        if (this.operations.length > 100) {
            this.operations = this.operations.slice(-100);
        }
    }
    getSystemStatus() {
        return {
            encryptionInitialized: this.isEncryptionInitialized(),
            deviceId: this.getDeviceId(),
            operationCount: this.operations.length,
            lastOperation: this.operations[this.operations.length - 1],
            zkProofStats: this.getZKProofStats()
        };
    }
    async exportIdentity(did) {
        try {
            const identity = await this.sync.syncFromCloud(did);
            if (!identity) {
                throw new Error('Identity not found');
            }
            const exportData = {
                identity,
                deviceId: this.getDeviceId(),
                exportedAt: new Date().toISOString(),
                version: '1.0.0'
            };
            return btoa(JSON.stringify(exportData));
        }
        catch (error) {
            if (process.env.NODE_ENV === 'development') {
                console.error('Failed to export identity:', error);
            }
            throw error;
        }
    }
    async importIdentity(backupData) {
        try {
            const exportData = JSON.parse(atob(backupData));
            if (!exportData.identity || !exportData.identity.id) {
                throw new Error('Invalid backup data');
            }
            await this.sync.syncToAllDevices(exportData.identity);
            return exportData.identity;
        }
        catch (error) {
            if (process.env.NODE_ENV === 'development') {
                console.error('Failed to import identity:', error);
            }
            throw error;
        }
    }
}
exports.DistributedIdentityManager = DistributedIdentityManager;
//# sourceMappingURL=DistributedIdentityManager.js.map