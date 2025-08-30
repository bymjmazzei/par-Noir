export interface GlobalPrivacySettings {
  // Global overrides (always take precedence)
  allowAnalytics: boolean;
  allowMarketing: boolean;
  allowThirdPartySharing: boolean;
  
  // Dynamic data points (populated by tools)
  dataPoints: {
    [dataPointKey: string]: {
      label: string;
      description: string;
      category: 'verification' | 'preferences' | 'compliance' | 'location' | 'content' | 'analytics';
      requestedBy: string[]; // Array of tool IDs that requested this
      globalSetting: boolean; // Global override for this data point
      lastUpdated: string;
    };
  };
  
  // Tool-specific permissions (overridden by global settings)
  toolPermissions: {
    [toolId: string]: {
      toolName: string;
      toolDescription: string;
      permissions: string[];
      dataPoints: string[]; // Which data points this tool can access
      grantedAt: string;
      expiresAt?: string;
      status: 'active' | 'pending' | 'revoked';
    };
  };
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

export interface DataPointRegistration {
  toolId: string;
  dataPointKey: string;
  label: string;
  description: string;
  category: 'verification' | 'preferences' | 'compliance' | 'location' | 'content' | 'analytics';
} 