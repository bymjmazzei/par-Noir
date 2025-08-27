import { DIDDocument } from '../types';
export interface DIDResolutionResult {
    didDocument: DIDDocument;
    metadata: {
        created: string;
        updated: string;
        deactivated?: boolean;
    };
}
export interface DIDValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}
export declare class DIDResolver {
    private cache;
    private cacheTimeout;
    private rateLimiter;
    private auditLog;
    resolve(did: string): Promise<DIDResolutionResult>;
    private validateDIDDocument;
    private resolveFromLocalStorage;
    private resolveFromIPFS;
    private resolveFromBlockchain;
    private resolveFromWeb;
    private resolveDidKey;
    private resolveDidWeb;
    private resolveDidIon;
    private isValidDIDFormat;
    private isValidCIDFormat;
    private isValidDomainFormat;
    private isValidPublicKeyFormat;
    private isValidIONFormat;
    private checkRateLimit;
    private logSecurityEvent;
    private sendToAuditLog;
    clearCache(): void;
    setCacheTimeout(timeout: number): void;
    getAuditLog(): Array<{
        timestamp: string;
        event: string;
        details: any;
    }>;
    clearAuditLog(): void;
}
//# sourceMappingURL=DIDResolver.d.ts.map