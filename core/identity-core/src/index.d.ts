import { DID, CreateDIDOptions, AuthenticateOptions, UpdateMetadataOptions, GrantToolAccessOptions, ChallengeResponse, SignatureVerification, IdentityCoreConfig, IdentityCoreEventType, IdentityCoreEventHandler } from './types';
import { ToolAccessRequest } from './utils/privacy-manager';
import { DeviceSecurityManager } from './security/device-security';
import { WebAuthnManager } from './security/webauthn';
import { SupplyChainSecurityManager } from './security/supply-chain-security';
export declare class IdentityCore {
    private storage;
    private privacyManager;
    private deviceSecurity;
    private webAuthn;
    private supplyChainSecurity;
    private config;
    private eventHandlers;
    constructor(config?: Partial<IdentityCoreConfig>);
    private startBackgroundSecurity;
    initialize(): Promise<void>;
    getDeviceSecurity(): DeviceSecurityManager;
    getWebAuthn(): WebAuthnManager;
    getSupplyChainSecurity(): SupplyChainSecurityManager;
    performSecurityHealthCheck(): Promise<{
        deviceSecurity: boolean;
        webAuthnSupported: boolean;
        supplyChainSecurity: boolean;
        threats: any[];
        vulnerabilities: any[];
    }>;
    createDID(options: CreateDIDOptions): Promise<DID>;
    authenticate(options: AuthenticateOptions): Promise<DID>;
    getAllDIDs(): Promise<Array<{
        id: string;
        pnName: string;
        createdAt: string;
        status: string;
    }>>;
    updateMetadata(options: UpdateMetadataOptions): Promise<DID>;
    grantToolAccess(options: GrantToolAccessOptions): Promise<DID>;
    processToolRequest(didId: string, passcode: string, request: ToolAccessRequest): Promise<any>;
    generateChallenge(didId: string): Promise<ChallengeResponse>;
    verifySignature(didId: string, challenge: string, signature: string, passcode: string): Promise<SignatureVerification>;
    private verifySignatureCryptographically;
    private base64ToArrayBuffer;
    deleteDID(didId: string): Promise<void>;
    getAuditLog(didId: string): any[];
    updatePrivacySettings(did: DID, settings: any): void;
    on<T extends IdentityCoreEventType>(event: T, handler: IdentityCoreEventHandler<T>): void;
    off<T extends IdentityCoreEventType>(event: T, handler: IdentityCoreEventHandler<T>): void;
    private emit;
    private logSecurityEvent;
    destroy(): void;
}
export { CryptoManager } from './encryption/crypto';
export { IndexedDBStorage } from './storage/indexeddb';
export { PrivacyManager } from './utils/privacy-manager';
export { ZKProofManager } from './encryption/zk-proofs';
export { DIDResolver } from './distributed/DIDResolver';
export { IdentitySync } from './distributed/IdentitySync';
export { DecentralizedAuth } from './distributed/DecentralizedAuth';
export { DistributedIdentityManager } from './distributed/DistributedIdentityManager';
//# sourceMappingURL=index.d.ts.map