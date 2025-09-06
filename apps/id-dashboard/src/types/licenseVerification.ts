import { cryptoWorkerManager } from './cryptoWorkerManager';
// License Verification Types and Interfaces
export interface LicenseInfo {
  licenseKey: string;
  type: 'free' | 'perpetual' | 'annual';
  identityHash: string;
  issuedAt: string;
  expiresAt: string;
  status: 'active' | 'expired' | 'pending';
  transferredFrom?: string;
  transferDate?: string;
  originalIssueDate?: string;
  isCommercial: boolean;
}

export interface LicenseProof {
  proof: string;
  publicInputs: {
    licenseType: string;
    isValid: boolean;
    issuedDate: string;
    identityHash: string;
    isCommercial: boolean;
  };
  signature: string;
}

export interface LicenseReceipt {
  receiptId: string;
  licenseType: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  purchaseDate: string;
  identityHash: string;
  transactionHash?: string;
  isCommercial: boolean;
}

// Detection mechanism interfaces
export interface APICallRecord {
  timestamp: number;
  endpoint: string;
  method: string;
  identityHash: string;
}

export interface EnterpriseFeatureAccess {
  featureId: string;
  featureName: string;
  accessTimestamp: number;
  identityHash: string;
  requiresCommercialLicense: boolean;
}

export interface ScaleIndicators {
  userCount: number;
  integrationCount: number;
  whiteLabelUsage: boolean;
  multiTenantUsage: boolean;
  lastUpdated: number;
  identityHash: string;
}

export interface UsagePattern {
  apiCallFrequency: number;
  enterpriseFeatureAccess: boolean;
  scaleIndicators: ScaleIndicators | null;
  isCommercial: boolean;
  lastChecked: number;
  commercialUsageFirstDetected?: number; // Timestamp when commercial usage was first detected
  gracePeriodExpires?: number; // Timestamp when grace period expires
  gracePeriodActive: boolean; // Whether grace period is currently active
}
