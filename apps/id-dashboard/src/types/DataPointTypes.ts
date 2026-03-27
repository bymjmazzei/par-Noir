// Standardized Data Points System — shared catalog types from @par-noir/standard-data-points
import type { StandardDataPoint, ZKPType } from '@par-noir/standard-data-points';
import type { EncryptedIdentity } from './crypto';
export type { StandardDataPoint, ZKPType, EncryptedIdentity };

/** Dashboard-only validation helpers (e.g. custom checks) layered on catalog rows */
export interface DataValidation {
  minValue?: number;
  maxValue?: number;
  pattern?: RegExp;
  required?: boolean;
  custom?: (value: unknown) => boolean;
}

export interface ZKPGenerationRequest {
  dataPointId: string;
  userData: any;
  verificationLevel: 'basic' | 'enhanced' | 'verified';
  expirationDays?: number;
  /** Session DID — must match SecureCredentialManager credentials */
  identityId: string;
  /** Encrypted identity blob (public key + ciphertext) for ML-DSA signing */
  encryptedIdentity: EncryptedIdentity;
}

export interface ZKPProof {
  dataPointId: string;
  proofType: ZKPType;
  proof: string; // Encrypted ZKP
  signature: string;
  timestamp: string;
  expiresAt?: string;
  verificationLevel: 'basic' | 'enhanced' | 'verified';
  metadata: {
    requestedBy: string;
    userConsent: boolean;
    dataProvided: string[]; // Which fields were provided
  };
}

// Data Point Proposal System
export interface DataPointProposal {
  id: string;
  name: string;
  description: string;
  category: 'verification' | 'preferences' | 'compliance' | 'location';
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
