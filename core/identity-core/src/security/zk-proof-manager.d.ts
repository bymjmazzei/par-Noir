import { DID } from '../types';
import { ZKProof } from '../encryption/zk-proofs';
export interface TimestampedZKProof extends ZKProof {
    timestamp: string;
    nonce: string;
    context: string;
    expiresAt: string;
    proofHash: string;
    signature: string;
}
export interface ProofValidationResult {
    isValid: boolean;
    reason?: string;
    riskLevel: 'low' | 'medium' | 'high';
    recommendations: string[];
}
export interface ProofConfig {
    expirationTime: number;
    maxProofsPerHour: number;
    requireContext: boolean;
    enableReplayProtection: boolean;
    securityLevel: 'standard' | 'military' | 'top-secret';
}
export declare class ZKProofManager {
    private static readonly DEFAULT_CONFIG;
    private static readonly USED_PROOFS_CACHE;
    private static readonly PROOF_RATE_LIMITS;
    private static readonly PROOF_HISTORY;
    static generateTimestampedProof(did: DID, statement: string, context: string, config?: Partial<ProofConfig>): Promise<TimestampedZKProof>;
    static validateProof(proof: TimestampedZKProof, context: string, config?: Partial<ProofConfig>): ProofValidationResult;
    private static generateBaseProof;
    private static hashProof;
    private static signProof;
    private static verifyProofSignature;
    private static checkRateLimit;
    private static updateRateLimit;
    private static detectSuspiciousPatterns;
    static cleanupExpiredProofs(): void;
    static getProofStats(): {
        totalProofs: number;
        activeProofs: number;
        expiredProofs: number;
        averageProofAge: number;
    };
    static silentValidate(proof: TimestampedZKProof, context: string): boolean;
    private static hashString;
}
//# sourceMappingURL=zk-proof-manager.d.ts.map