import { SyncResult } from './IdentitySync';
import { AuthSession } from './DecentralizedAuth';
import { ZKProof, ZKProofRequest } from '../encryption/zk-proofs';
import { Identity } from '../types';
export interface DistributedIdentityConfig {
    syncPassword?: string;
    deviceId?: string;
    enableIPFS?: boolean;
    enableBlockchain?: boolean;
    enableZKProofs?: boolean;
}
export interface IdentityOperation {
    type: 'create' | 'sync' | 'authenticate' | 'resolve' | 'zk_proof';
    did: string;
    timestamp: string;
    success: boolean;
    error?: string;
}
export declare class DistributedIdentityManager {
    private resolver;
    private sync;
    private auth;
    private zkProofs;
    private config;
    private operations;
    constructor(config?: DistributedIdentityConfig);
    initialize(syncPassword: string): Promise<void>;
    createIdentity(identity: Identity): Promise<SyncResult>;
    syncIdentity(did: string): Promise<Identity | null>;
    authenticateWithZKProof(did: string, proofRequest: ZKProofRequest): Promise<AuthSession | null>;
    authenticate(did: string, privateKey: CryptoKey): Promise<AuthSession | null>;
    generateIdentityExistenceProof(did: string): Promise<ZKProof>;
    generateSelectiveDisclosureProof(did: string, data: Record<string, any>, disclosedFields: string[], statement: string): Promise<ZKProof>;
    generateAgeVerificationProof(did: string, birthDate: string, minimumAge: number, statement?: string): Promise<ZKProof>;
    generateCredentialVerificationProof(did: string, credentialHash: string, credentialType: string, statement?: string): Promise<ZKProof>;
    generatePermissionProof(did: string, permissions: string[], requiredPermissions: string[], statement?: string): Promise<ZKProof>;
    verifyZKProof(proof: ZKProof): Promise<boolean>;
    resolveDID(did: string): Promise<any>;
    isAuthenticated(did: string): Promise<boolean>;
    getSession(did: string): AuthSession | null;
    logout(did: string): void;
    getDeviceId(): string;
    isEncryptionInitialized(): boolean;
    getZKProofStats(): {
        totalProofs: number;
        activeProofs: number;
        expiredProofs: number;
    };
    getOperationHistory(): IdentityOperation[];
    clearOperationHistory(): void;
    private createDidDocument;
    private logOperation;
    getSystemStatus(): {
        encryptionInitialized: boolean;
        deviceId: string;
        operationCount: number;
        lastOperation?: IdentityOperation;
        zkProofStats: {
            totalProofs: number;
            activeProofs: number;
            expiredProofs: number;
        };
    };
    exportIdentity(did: string): Promise<string>;
    importIdentity(backupData: string): Promise<Identity>;
}
//# sourceMappingURL=DistributedIdentityManager.d.ts.map