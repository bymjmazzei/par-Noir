import { cryptoWorkerManager } from './cryptoWorkerManager';
// Standardized Data Points System - Types
// Defines common data points that developers can request
// Each data point has a standard ZKP generation method

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
