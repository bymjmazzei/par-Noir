import { DIDResolver } from './DIDResolver';
export interface AuthChallenge {
    did: string;
    challenge: string;
    timestamp: string;
    expiresAt: string;
}
export interface AuthSignature {
    challenge: string;
    signature: string;
    publicKey: string;
    timestamp: string;
}
export interface AuthSession {
    did: string;
    authenticatedAt: string;
    expiresAt: string;
    deviceId: string;
    permissions: string[];
}
export declare class DecentralizedAuth {
    private resolver;
    private sessions;
    private rateLimiter;
    private auditLog;
    private challengeStore;
    constructor(resolver?: DIDResolver);
    createChallenge(did: string, expiresIn?: number): Promise<AuthChallenge>;
    authenticate(did: string, signature: AuthSignature): Promise<AuthSession | null>;
    isAuthenticated(did: string): Promise<boolean>;
    getSession(did: string): AuthSession | null;
    logout(did: string): Promise<void>;
    private generateChallenge;
    private extractPublicKey;
    private verifySignature;
    private jwkToRaw;
    private getDeviceId;
    createSignature(challenge: string, privateKey: CryptoKey): Promise<AuthSignature>;
    generateKeyPair(): Promise<{
        publicKey: CryptoKey;
        privateKey: CryptoKey;
    }>;
    exportPublicKey(publicKey: CryptoKey): Promise<string>;
    private storeSessionSecurely;
    private getSessionSecurely;
    private removeSessionSecurely;
    private encryptForStorage;
    private decryptFromStorage;
    private constantTimeCompare;
    private delay;
    private checkRateLimit;
    private isValidDIDFormat;
    private isValidSignatureFormat;
    private isValidChallengeFormat;
    private isValidMultibaseFormat;
    private isValidExportedKeyFormat;
    private logSecurityEvent;
    private sendToAuditLog;
    getAuditLog(): Array<{
        timestamp: string;
        event: string;
        details: any;
    }>;
    clearAuditLog(): void;
}
//# sourceMappingURL=DecentralizedAuth.d.ts.map