// Verified Identity Types
// Defines the structure for verified identity data and ZKP proofs

export interface VerifiedIdentityData {
  id: string;
  verificationId: string;
  verificationLevel: 'basic' | 'enhanced' | 'verified';
  verifiedAt: string;
  expiresAt?: string;
  dataPoints: {
    [key: string]: VerifiedDataPoint;
  };
  fraudPrevention: FraudPreventionResult;
  provider: 'veriff' | 'jumio' | 'onfido' | 'mock';
  metadata: VerificationMetadata;
}

export interface VerifiedDataPoint {
  value: any;
  zkpProof: string;
  verified: boolean;
  verificationLevel: 'basic' | 'enhanced' | 'verified';
  verifiedAt: string;
  expiresAt?: string;
  dataPointId: string;
  originalValue?: any; // The raw extracted value before ZKP
}

export interface FraudPreventionResult {
  livenessCheck: boolean;
  documentAuthenticity: boolean;
  biometricMatch: boolean;
  riskScore: number; // 0-1, lower is better
  fraudIndicators: string[];
  confidence: number; // 0-1, higher is better
  timestamp: string;
}

export interface VerificationMetadata {
  documentType: 'drivers_license' | 'passport' | 'state_id' | 'national_id';
  documentNumber: string;
  issuingAuthority?: string;
  expirationDate?: string;
  verificationProvider: string;
  providerVerificationId?: string;
  quality: {
    document: number; // 0-1
    biometric: number; // 0-1
    overall: number; // 0-1
  };
  securityFeatures: string[];
}

export interface VerificationRequest {
  idDocument: File;
  selfie: File;
  livenessCheck: boolean;
  identityId: string;
  requestedDataPoints?: string[];
}

export interface VerificationResult {
  success: boolean;
  verificationId: string;
  extractedData: ExtractedIdentityData;
  fraudPrevention: FraudPreventionResult;
  error?: string;
  warnings?: string[];
}

export interface ExtractedIdentityData {
  firstName: string;
  lastName: string;
  middleName?: string;
  dateOfBirth: string;
  documentNumber: string;
  documentType: 'drivers_license' | 'passport' | 'state_id' | 'national_id';
  country: string;
  state?: string;
  city?: string;
  postalCode?: string;
  address?: string;
  expirationDate?: string;
  issuingAuthority?: string;
}

// ZKP-specific types for verified data
export interface VerifiedZKPProof {
  dataPointId: string;
  proofType: 'identity_verification' | 'age_verification' | 'location_verification' | 'document_verification';
  proof: string; // Encrypted ZKP
  signature: string;
  timestamp: string;
  expiresAt?: string;
  verificationLevel: 'verified'; // Always 'verified' for identity verification
  metadata: {
    requestedBy: string;
    userConsent: boolean;
    dataProvided: string[];
    verificationId: string;
    fraudPreventionScore: number;
    provider: string;
  };
}

// Storage types for verified identity data
export interface StoredVerifiedIdentity {
  id: string;
  identityId: string;
  verificationData: VerifiedIdentityData;
  createdAt: string;
  lastAccessed: string;
  accessCount: number;
  isActive: boolean;
}

// API response types
export interface VerificationStatusResponse {
  verificationId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  result?: 'approved' | 'rejected';
  error?: string;
  timestamp: string;
  estimatedCompletionTime?: string;
}

export interface VerificationHistoryItem {
  id: string;
  verificationId: string;
  status: 'completed' | 'failed' | 'cancelled';
  result?: 'approved' | 'rejected';
  verifiedAt: string;
  dataPoints: string[];
  provider: string;
  riskScore: number;
}

// Configuration types
export interface VerificationConfig {
  provider: 'veriff' | 'jumio' | 'onfido' | 'mock';
  apiKey?: string;
  apiSecret?: string;
  baseUrl?: string;
  fraudThreshold: number; // Maximum acceptable risk score
  confidenceThreshold: number; // Minimum acceptable confidence
  supportedDocuments: string[];
  supportedCountries: string[];
  maxRetries: number;
  timeout: number; // in milliseconds
}

// Event types for verification process
export interface VerificationEvent {
  type: 'started' | 'document_uploaded' | 'selfie_captured' | 'liveness_check' | 'processing' | 'completed' | 'failed';
  verificationId: string;
  timestamp: string;
  data?: any;
  error?: string;
}

// Utility types
export type VerificationStep = 
  | 'upload_document'
  | 'capture_selfie'
  | 'liveness_check'
  | 'processing'
  | 'completed';

export type VerificationProvider = 'veriff' | 'jumio' | 'onfido' | 'mock';

export type DocumentType = 'drivers_license' | 'passport' | 'state_id' | 'national_id';

export type VerificationLevel = 'basic' | 'enhanced' | 'verified';
