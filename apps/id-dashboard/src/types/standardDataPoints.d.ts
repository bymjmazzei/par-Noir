export interface StandardDataPoint {
    id: string;
    name: string;
    description: string;
    category: 'identity' | 'verification' | 'preferences' | 'compliance' | 'location';
    dataType: 'string' | 'number' | 'boolean' | 'date' | 'object';
    zkpType: ZKPType;
    validation?: DataValidation;
    requiredFields?: string[];
    optionalFields?: string[];
    defaultPrivacy: 'public' | 'private' | 'selective';
    examples: string[];
}
export type ZKPType = 'age_verification' | 'email_verification' | 'phone_verification' | 'location_verification' | 'identity_verification' | 'preference_disclosure' | 'compliance_attestation' | 'custom_proof';
export interface DataValidation {
    minValue?: number;
    maxValue?: number;
    pattern?: RegExp;
    required?: boolean;
    custom?: (value: any) => boolean;
}
export interface ZKPGenerationRequest {
    dataPointId: string;
    userData: any;
    verificationLevel: 'basic' | 'enhanced' | 'verified';
    expirationDays?: number;
}
export interface ZKPProof {
    dataPointId: string;
    proofType: ZKPType;
    proof: string;
    signature: string;
    timestamp: string;
    expiresAt?: string;
    verificationLevel: 'basic' | 'enhanced' | 'verified';
    metadata: {
        requestedBy: string;
        userConsent: boolean;
        dataProvided: string[];
    };
}
export interface DataPointProposal {
    id: string;
    name: string;
    description: string;
    category: 'identity' | 'verification' | 'preferences' | 'compliance' | 'location';
    dataType: 'string' | 'number' | 'boolean' | 'date' | 'object';
    requiredFields: string[];
    optionalFields?: string[];
    validation?: DataValidation;
    examples: string[];
    useCase: string;
    proposedBy: string;
    proposedAt: string;
    status: 'pending' | 'approved' | 'rejected';
    approvedBy?: string;
    approvedAt?: string;
    rejectionReason?: string;
    votes: {
        upvotes: number;
        downvotes: number;
        voters: string[];
    };
}
export declare const STANDARD_DATA_POINTS: Record<string, StandardDataPoint>;
export declare const DATA_POINT_CATEGORIES: {
    readonly verification: "Core Identity Verification";
    readonly location: "Location & Geography";
};
import { DataPointProposal as MetadataDataPointProposal } from '../utils/secureMetadata';
export declare class ZKPGenerator {
    /**
     * Generate ZKP for a standard data point
     */
    static generateZKP(request: ZKPGenerationRequest): Promise<ZKPProof>;
    /**
     * Propose a new standard data point
     */
    static proposeDataPoint(proposal: Omit<DataPointProposal, 'id' | 'proposedAt' | 'status' | 'votes'>, identityId: string, pnName: string, passcode: string): Promise<{
        success: boolean;
        proposalId?: string;
        error?: string;
    }>;
    /**
     * Vote on a data point proposal
     */
    static voteOnProposal(proposalId: string, voterId: string, vote: 'upvote' | 'downvote', identityId: string, pnName: string, passcode: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Approve a data point proposal (admin function)
     */
    static approveDataPointProposal(proposalId: string, approvedBy: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Get all pending proposals for a specific pN
     */
    static getPendingProposals(identityId: string, pnName: string, passcode: string): Promise<MetadataDataPointProposal[]>;
    /**
     * Get proposal by ID for a specific pN
     */
    static getProposal(proposalId: string, identityId: string, pnName: string, passcode: string): Promise<MetadataDataPointProposal | undefined>;
    /**
     * Validate user data against data point requirements
     */
    private static validateUserData;
    /**
     * Validate individual field
     */
    private static validateField;
    /**
     * Generate proof based on ZKP type
     */
    private static generateProofByType;
    private static generateAgeVerificationProof;
    private static generateEmailVerificationProof;
    private static generatePhoneVerificationProof;
    private static generateLocationVerificationProof;
    private static generateIdentityVerificationProof;
    private static generatePreferenceDisclosureProof;
    private static generateComplianceAttestationProof;
    private static generateCustomProof;
    /**
     * Sign the proof with cryptographic signature
     */
    private static signProof;
    /**
     * Get all available data points
     */
    static getAvailableDataPoints(): StandardDataPoint[];
    /**
     * Get data points by category
     */
    static getDataPointsByCategory(category: string): StandardDataPoint[];
    /**
     * Get data point by ID
     */
    static getDataPoint(id: string): StandardDataPoint | undefined;
}
