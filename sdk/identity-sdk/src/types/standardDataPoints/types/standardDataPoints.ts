import { cryptoWorkerManager } from './cryptoWorkerManager';
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

export type ZKPType = 
  | 'age_verification'
  | 'email_verification'
  | 'phone_verification'
  | 'location_verification'
  | 'identity_verification'
  | 'identity_attestation'
  | 'preference_disclosure'
  | 'compliance_attestation'
  | 'custom_proof';

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
  proofId: string;
  dataPointId: string;
  proofType: ZKPType;
  proofData: {
    encryptedData: string;
    zkpToken: string;
    attestedAt: string;
    attestedBy: string;
    dataType: 'attested' | 'verified';
    expiresAt?: string;
  };
  signature: string;
  timestamp: string;
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

export interface ProposalResponse {
  success: boolean;
  proposalId?: string;
  error?: string;
}

export interface VoteResponse {
  success: boolean;
  error?: string;
}
