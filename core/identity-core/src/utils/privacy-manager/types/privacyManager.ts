import { cryptoWorkerManager } from '../../../encryption/cryptoWorkerManager';
export interface PrivacySettings {
  shareDisplayName: boolean;
  shareEmail: boolean;
  sharePreferences: boolean;
  shareCustomFields: boolean;
  allowToolAccess: boolean;
  requireExplicitConsent: boolean;
  auditLogging: boolean;
}

export interface ToolAccessRequest {
  toolId: string;
  toolName: string;
  toolDescription: string;
  requestedData: string[];
  permissions: string[];
  expiresAt?: string;
  requireZKProof?: boolean;
}

export interface ToolAccessResponse {
  granted: boolean;
  accessToken?: string;
  encryptedData?: any;
  auditLog?: any;
  message?: string;
}

export interface AuditLogEntry {
  timestamp: string;
  toolId: string;
  action: string;
  dataRequested: string[];
  dataShared: string[];
  userConsent: boolean;
  ipAddress?: string;
  userAgent?: string;
}

export interface GlobalPrivacySettings {
  allowAnalytics: boolean;
  allowMarketing: boolean;
  allowThirdPartySharing: boolean;
  dataRetentionDays: number;
  dataPoints: {
    [dataPointKey: string]: {
      label: string;
      description: string;
      category: 'identity' | 'preferences' | 'content' | 'analytics';
      requestedBy: string[];
      globalSetting: boolean;
      lastUpdated: string;
    };
  };
}

export interface ToolPermission {
  granted: boolean;
  accessToken: string;
  expiresAt?: string;
  dataAccess: string[];
  permissions: string[];
  lastAccessed: string;
}

export interface PrivacyValidationResult {
  isValid: boolean;
  reason?: string;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface SecurityEvent {
  timestamp: string;
  didId: string;
  event: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details?: any;
}
