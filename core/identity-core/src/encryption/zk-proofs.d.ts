export interface ZKProofData {
    schnorrProof?: SchnorrZKProof;
    pedersenProof?: PedersenZKProof;
    sigmaProtocol?: SigmaProtocolProof;
    fiatShamirTransform?: FiatShamirProof;
}
export interface ZKProof {
    id: string;
    type: ZKProofType;
    statement: ZKStatement;
    proof: ZKProofData;
    publicInputs: Record<string, any>;
    timestamp: string;
    expiresAt: string;
    verificationKey: string;
    securityLevel: 'standard' | 'military' | 'top-secret';
    algorithm: string;
    keyLength: number;
    quantumResistant: boolean;
    schnorrProof: SchnorrZKProof;
    pedersenProof: PedersenZKProof;
    sigmaProtocol: SigmaProtocolProof;
    fiatShamirTransform: FiatShamirProof;
}
export interface ZKStatement {
    type: 'discrete_log' | 'pedersen_commitment' | 'range_proof' | 'set_membership' | 'equality' | 'custom';
    description: string;
    publicInputs: Record<string, string>;
    privateInputs: Record<string, string>;
    relation: string;
}
export interface SchnorrZKProof {
    commitment: string;
    challenge: string;
    response: string;
    publicKey: string;
    message: string;
    curve: 'secp256k1' | 'P-384' | 'P-521';
    generator: string;
    order: string;
}
export interface PedersenZKProof {
    commitment: string;
    opening: {
        message: string;
        randomness: string;
    };
    generators: {
        g: string;
        h: string;
    };
    proofOfKnowledge: {
        commitment: string;
        challenge: string;
        response1: string;
        response2: string;
    };
}
export interface SigmaProtocolProof {
    commitment: string;
    challenge: string;
    response: string;
    statement: string;
    generator: string;
    order: string;
}
export interface FiatShamirProof {
    commitment: string;
    challenge: string;
    response: string;
    hashFunction: string;
    transformType: 'schnorr' | 'pedersen' | 'sigma';
}
export interface ZKProofRequest {
    type: ZKProofType;
    statement: ZKStatement;
    expirationHours?: number;
    securityLevel?: 'standard' | 'military' | 'top-secret';
    quantumResistant?: boolean;
    interactive?: boolean;
}
export interface ZKProofVerification {
    isValid: boolean;
    proofId: string;
    statement: ZKStatement;
    verifiedAt: string;
    error?: string;
    securityValidation?: {
        algorithm: string;
        keyLength: number;
        compliance: boolean;
        issues: string[];
        quantumResistant: boolean;
    };
}
export type ZKProofType = 'discrete_logarithm' | 'pedersen_commitment' | 'range_proof' | 'set_membership' | 'equality_proof' | 'disjunction_proof' | 'conjunction_proof' | 'custom_proof';
export interface ZKProofConfig {
    curve: 'secp256k1' | 'P-384' | 'P-521';
    hashAlgorithm: 'SHA-256' | 'SHA-384' | 'SHA-512' | 'BLAKE3' | 'Keccak-256';
    proofExpirationHours: number;
    enableInteractiveProofs: boolean;
    securityLevel: 'standard' | 'military' | 'top-secret';
    keyLength: 256 | 384 | 521;
    iterations: number;
    memoryCost: number;
    quantumResistant: boolean;
}
export declare class AuthenticZKProofManager {
    private config;
    private proofCache;
    private curveParams;
    constructor(config?: Partial<ZKProofConfig>);
    generateProof(request: ZKProofRequest): Promise<ZKProof>;
    private generateDiscreteLogProof;
    private generatePedersenCommitmentProof;
    private generateRangeProof;
    private generateSetMembershipProof;
    private generateSigmaProtocol;
    private generateFiatShamirProof;
    verifyProof(proof: ZKProof): Promise<ZKProofVerification>;
    private verifyDiscreteLogProof;
    private verifyPedersenCommitmentProof;
    private verifyRangeProof;
    private verifySetMembershipProof;
    private generateSecureRandom;
    private hashData;
    private hashToBigInt;
    private arrayBufferToBase64;
    private parsePoint;
    private pointMultiply;
    private pointAdd;
    private generateGenerator;
    private generateVerificationKey;
    private decomposeToBinary;
    private generateBinaryRangeProof;
    private generateDisjunctiveProof;
    getProofStats(): {
        totalProofs: number;
        activeProofs: number;
        expiredProofs: number;
        securityLevels: Record<string, number>;
        complianceRate: number;
        quantumResistantCount: number;
        averageProofAge: number;
        proofTypes: Record<string, number>;
        securityCompliance: {
            standard: number;
            military: number;
            topSecret: number;
        };
    };
    generateSelectiveDisclosure(identity: any, attributes: string[]): Promise<ZKProof>;
    generateAgeVerification(identity: any, minAge: number): Promise<ZKProof>;
    generateCredentialVerification(credential: any, requiredFields: string[]): Promise<ZKProof>;
    generatePermissionProof(identity: any, permission: string): Promise<ZKProof>;
}
export { AuthenticZKProofManager as ZKProofManager };
//# sourceMappingURL=zk-proofs.d.ts.map