/**
 * Privacy manager for handling tool permissions and data sharing
 */

import { DID, DIDMetadata, ToolPermission, IdentityError, IdentityErrorCodes } from '../types';
import { CryptoManager } from '../encryption/crypto';

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

// Security configuration
const SENSITIVE_PATTERNS = [
  'password', 'privateKey', 'recoveryKey', 'ssn', 'medical', 'biometric', 'secret', 'token', 'credential'
];
const ALLOWED_DATA_POINTS = [
  'userProfile', 'displayName', 'avatar', 'preferences', 'theme', 'language', 'content', 'files', 'messages'
];

function isDataPointAllowed(dataPoint: string): boolean {
  const lower = dataPoint.toLowerCase();
  if (SENSITIVE_PATTERNS.some(pattern => lower.includes(pattern))) return false;
  if (!ALLOWED_DATA_POINTS.includes(dataPoint)) return false;
  return true;
}

export class PrivacyManager {
  private auditLog: AuditLogEntry[] = [];
  private defaultPrivacySettings: PrivacySettings = {
    shareDisplayName: true,
    shareEmail: false,
    sharePreferences: true,
    shareCustomFields: false,
    allowToolAccess: true,
    requireExplicitConsent: true,
    auditLogging: true
  };

  /**
   * Process tool access request with enhanced security
   */
  async processToolAccessRequest(
    did: DID,
    request: ToolAccessRequest
  ): Promise<ToolAccessResponse> {
    try {
      // Enhanced input validation
      this.validateToolRequest(request);

      // Check for suspicious patterns in tool ID
      if (this.detectSuspiciousToolId(request.toolId)) {
        this.logAuditEntry({
          timestamp: new Date().toISOString(),
          toolId: request.toolId,
          action: 'TOOL_REQUEST_BLOCKED',
          dataRequested: request.requestedData,
          dataShared: [],
          userConsent: false
        });

        return this.createDeniedResponse(request, 'Tool request blocked due to security concerns');
      }

      // Validate requested data points for security
      const validationResult = this.validateDataPointRequests(request.requestedData);
      if (!validationResult.isValid) {
        this.logAuditEntry({
          timestamp: new Date().toISOString(),
          toolId: request.toolId,
          action: 'DATA_POINT_REQUEST_BLOCKED',
          dataRequested: request.requestedData,
          dataShared: [],
          userConsent: false
        });

        return this.createDeniedResponse(request, `Data point request blocked: ${validationResult.reason}`);
      }

      // Check global privacy settings first
      const privacySettings = this.getPrivacySettings(did);
      
      // Check if any requested data points are globally blocked
      const blockedDataPoints = request.requestedData.filter(dataPoint => {
        const globalSetting = privacySettings.dataPoints[dataPoint]?.globalSetting;
        return globalSetting === false;
      });

      if (blockedDataPoints.length > 0) {
        this.logAuditEntry({
          timestamp: new Date().toISOString(),
          toolId: request.toolId,
          action: 'GLOBAL_PRIVACY_BLOCK',
          dataRequested: blockedDataPoints,
          dataShared: [],
          userConsent: false
        });

        return this.createDeniedResponse(
          request,
          `Access denied: ${blockedDataPoints.join(', ')} are globally blocked`
        );
      }

      // Register new data points dynamically
      this.registerDataPoints(did, request.requestedData, request.toolId);

      // Filter allowed data points based on global settings
      const allowedDataPoints = request.requestedData.filter(dataPoint => {
        const globalSetting = privacySettings.dataPoints[dataPoint]?.globalSetting;
        return globalSetting !== false; // Allow if not explicitly blocked
      });

      if (allowedDataPoints.length === 0) {
        return this.createDeniedResponse(request, 'No data points allowed based on privacy settings');
      }

      // Update privacy settings
      if (!privacySettings.dataPoints) {
        privacySettings.dataPoints = {};
      }

      // Register new data points
      for (const dataPoint of allowedDataPoints) {
        if (!privacySettings.dataPoints[dataPoint]) {
          privacySettings.dataPoints[dataPoint] = {
            label: this.generateLabel(dataPoint),
            description: `Data point for ${dataPoint}`,
            category: this.categorizeDataPoint(dataPoint),
            requestedBy: [request.toolId],
            globalSetting: true,
            lastUpdated: new Date().toISOString()
          };
        } else {
          // Update existing data point
          privacySettings.dataPoints[dataPoint].requestedBy.push(request.toolId);
          privacySettings.dataPoints[dataPoint].lastUpdated = new Date().toISOString();
        }
      }

      // Store tool permissions in DID's permissions property
      if (!did.permissions) {
        did.permissions = {};
      }
      
      did.permissions[request.toolId] = {
        granted: true,
        grantedAt: new Date().toISOString(),
        expiresAt: request.expiresAt,
        permissions: request.permissions || [],
        accessToken: undefined // Will be set below
      };

      // Generate access token with enhanced security
      const accessToken = await this.generateAccessToken(did.id, request.toolId, allowedDataPoints.join(','));

      // Update the access token in permissions
      did.permissions[request.toolId].accessToken = accessToken;

      // Encrypt shared data
      const sharedData = await this.encryptSharedData(allowedDataPoints, allowedDataPoints.join(','));

      // Log successful access grant
      this.logAuditEntry({
        timestamp: new Date().toISOString(),
        toolId: request.toolId,
        action: 'TOOL_ACCESS_GRANTED',
        dataRequested: request.requestedData,
        dataShared: allowedDataPoints,
        userConsent: true
      });

      return {
        granted: true,
        accessToken,
        encryptedData: sharedData,
        message: 'Access granted successfully'
      };

    } catch (error) {
      this.logAuditEntry({
        timestamp: new Date().toISOString(),
        toolId: request.toolId,
        action: 'TOOL_REQUEST_ERROR',
        dataRequested: request.requestedData,
        dataShared: [],
        userConsent: false
      });

      return {
        granted: false,
        message: `Error processing request: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Validate tool request for security
   */
  private validateToolRequest(request: ToolAccessRequest): void {
    // Validate tool ID format
    if (!request.toolId || !/^[a-zA-Z0-9-_]{3,50}$/.test(request.toolId)) {
      throw new IdentityError(
        'Invalid tool ID format',
        IdentityErrorCodes.VALIDATION_ERROR
      );
    }

    // Validate tool name
    if (!request.toolName || request.toolName.length < 1 || request.toolName.length > 100) {
      throw new IdentityError(
        'Invalid tool name',
        IdentityErrorCodes.VALIDATION_ERROR
      );
    }

    // Validate tool description
    if (!request.toolDescription || request.toolDescription.length < 10 || request.toolDescription.length > 500) {
      throw new IdentityError(
        'Invalid tool description',
        IdentityErrorCodes.VALIDATION_ERROR
      );
    }

    // Validate requested data points
    if (!Array.isArray(request.requestedData) || request.requestedData.length === 0) {
      throw new IdentityError(
        'Invalid requested data points',
        IdentityErrorCodes.VALIDATION_ERROR
      );
    }

    // Validate each data point
    for (const dataPoint of request.requestedData) {
      if (typeof dataPoint !== 'string' || !/^[a-zA-Z0-9_]{1,50}$/.test(dataPoint)) {
        throw new IdentityError(
          `Invalid data point format: ${dataPoint}`,
          IdentityErrorCodes.VALIDATION_ERROR
        );
      }
    }

    // Validate permissions array
    if (request.permissions && !Array.isArray(request.permissions)) {
      throw new IdentityError(
        'Invalid permissions format',
        IdentityErrorCodes.VALIDATION_ERROR
      );
    }

    // Validate expiration date if provided
    if (request.expiresAt) {
      const expirationDate = new Date(request.expiresAt);
      if (isNaN(expirationDate.getTime()) || expirationDate <= new Date()) {
        throw new IdentityError(
          'Invalid expiration date',
          IdentityErrorCodes.VALIDATION_ERROR
        );
      }
    }
  }

  /**
   * Detect suspicious tool ID patterns
   */
  private detectSuspiciousToolId(toolId: string): boolean {
    const suspiciousPatterns = [
      /(admin|root|system|test|debug|internal|secret)/i,
      /(sql|script|exec|cmd|shell)/i,
      /(union|select|insert|update|delete|drop)/i,
      /(javascript|vbscript|eval|function)/i,
      /(\.\.\/|\.\.\\)/, // Path traversal
      /[<>"'&]/, // HTML/XML injection
      /[^\w-]/ // Non-alphanumeric characters except hyphens
    ];

    return suspiciousPatterns.some(pattern => pattern.test(toolId));
  }

  /**
   * Validate data point requests for security
   */
  private validateDataPointRequests(requestedData: string[]): { isValid: boolean; reason?: string } {
    // Check for sensitive data patterns
    const sensitivePatterns = [
      /(password|passwd|secret|key|token|credential)/i,
      /(ssn|social|security|number)/i,
      /(credit|card|bank|account|routing)/i,
      /(private|internal|confidential)/i,
      /(admin|root|system|privileged)/i
    ];

    for (const dataPoint of requestedData) {
      for (const pattern of sensitivePatterns) {
        if (pattern.test(dataPoint)) {
          return {
            isValid: false,
            reason: `Data point '${dataPoint}' matches sensitive pattern`
          };
        }
      }
    }

    // Check for excessive data requests
    if (requestedData.length > 20) {
      return {
        isValid: false,
        reason: 'Too many data points requested (max 20)'
      };
    }

    // Check for duplicate data points
    const uniqueDataPoints = new Set(requestedData);
    if (uniqueDataPoints.size !== requestedData.length) {
      return {
        isValid: false,
        reason: 'Duplicate data points in request'
      };
    }

    return { isValid: true };
  }

  /**
   * Register new data points from tool requests
   */
  private async registerDataPoints(did: DID, requestedData: string[], toolId: string): Promise<Record<string, any>> {
    const privacySettings = this.getPrivacySettings(did);
    const currentDataPoints = privacySettings.dataPoints || {};
    
    // Add new data points with default settings
    requestedData.forEach(dataPointKey => {
      if (!isDataPointAllowed(dataPointKey)) {
        // Optionally log or audit this attempt
        return; // Block registration of sensitive or unapproved data points
      }
      if (!currentDataPoints[dataPointKey]) {
        currentDataPoints[dataPointKey] = {
          label: this.generateLabel(dataPointKey),
          description: `Data point requested by ${toolId}`,
          category: this.categorizeDataPoint(dataPointKey),
          requestedBy: [toolId],
          globalSetting: true, // Default to allowed
          lastUpdated: new Date().toISOString()
        };
      } else {
        // Add tool to requestedBy if not already there
        if (!currentDataPoints[dataPointKey].requestedBy.includes(toolId)) {
          currentDataPoints[dataPointKey].requestedBy.push(toolId);
        }
      }
    });

    return currentDataPoints;
  }

  private generateLabel(dataPointKey: string): string {
    // Convert camelCase to readable label
    return dataPointKey
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  /**
   * Categorize data point for privacy management
   */
  private categorizeDataPoint(dataPointKey: string): 'identity' | 'preferences' | 'content' | 'analytics' {
    const key = dataPointKey.toLowerCase();
    
    if (key.includes('name') || key.includes('email') || key.includes('phone') || key.includes('address')) {
      return 'identity';
    } else if (key.includes('pref') || key.includes('setting') || key.includes('config')) {
      return 'preferences';
    } else if (key.includes('content') || key.includes('file') || key.includes('document')) {
      return 'content';
    } else {
      return 'analytics';
    }
  }

  /**
   * Get privacy settings for a DID
   */
  private getPrivacySettings(did: DID): GlobalPrivacySettings {
    const defaultSettings: GlobalPrivacySettings = {
      allowAnalytics: false,
      allowMarketing: false,
      allowThirdPartySharing: false,
      dataRetentionDays: 365,
      dataPoints: {}
    };

    if (!did.metadata.privacySettings) {
      did.metadata.privacySettings = defaultSettings;
    }

    return did.metadata.privacySettings;
  }

  /**
   * Update privacy settings for a DID
   */
  updatePrivacySettings(did: DID, settings: GlobalPrivacySettings): void {
    did.metadata.privacySettings = settings;
  }

  /**
   * Filter data based on privacy settings
   */
  private filterAllowedData(metadata: DIDMetadata, requestedData: string[]): Array<{ key: string; value: any }> {
    const allowedData: Array<{ key: string; value: any }> = [];
    
    requestedData.forEach(key => {
      if (!isDataPointAllowed(key)) return; // Block sharing of sensitive or unapproved data points
      switch (key) {
        case 'displayName':
          if (metadata.displayName && this.defaultPrivacySettings.shareDisplayName) {
            allowedData.push({ key, value: metadata.displayName });
          }
          break;
        case 'email':
          if (metadata.email && this.defaultPrivacySettings.shareEmail) {
            allowedData.push({ key, value: metadata.email });
          }
          break;
        case 'preferences':
          if (metadata.preferences && this.defaultPrivacySettings.sharePreferences) {
            allowedData.push({ key, value: metadata.preferences });
          }
          break;
        case 'customFields':
          if (metadata.customFields && this.defaultPrivacySettings.shareCustomFields) {
            allowedData.push({ key, value: metadata.customFields });
          }
          break;
        default: {
          // For dynamic data points, check global settings
          const privacySettings = this.getPrivacySettings({ metadata } as DID);
          if (privacySettings.dataPoints[key]?.globalSetting) {
            allowedData.push({ key, value: metadata.customFields?.[key] });
          }
          break;
        }
      }
    });
    
    return allowedData;
  }

  /**
   * Generate access token for tool access
   */
  private async generateAccessToken(didId: string, toolId: string, passcode: string): Promise<string> {
    const data = `${didId}:${toolId}:${Date.now()}`;
    const encrypted = await CryptoManager.encrypt(data, passcode);
    return encrypted.data;
  }

  /**
   * Encrypt shared data for tool access
   */
  private async encryptSharedData(data: any[], passcode: string): Promise<any> {
    const encrypted = await CryptoManager.encrypt(JSON.stringify(data), passcode);
    return encrypted.data;
  }

  /**
   * Create denied response
   */
  private createDeniedResponse(request: ToolAccessRequest, reason: string): ToolAccessResponse {
    const auditEntry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      toolId: request.toolId,
      action: 'access_denied',
      dataRequested: request.requestedData,
      dataShared: [],
      userConsent: false
    };
    
    this.logAuditEntry(auditEntry);
    
    return {
      granted: false,
      message: reason,
      auditLog: auditEntry
    };
  }

  /**
   * Handle existing access
   */
  private handleExistingAccess(did: DID, request: ToolAccessRequest, existingPermission: ToolPermission): ToolAccessResponse {
    if (existingPermission.expiresAt && new Date(existingPermission.expiresAt) < new Date()) {
      return this.createDeniedResponse(request, 'Access token expired');
    }
    
    return {
      granted: true,
      accessToken: existingPermission.accessToken,
      message: 'Access already granted'
    };
  }

  /**
   * Log audit entry
   */
  private logAuditEntry(entry: AuditLogEntry): void {
    this.auditLog.push(entry);
    
    // Keep only last 1000 entries
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }
  }

  /**
   * Revoke tool access
   */
  revokeToolAccess(did: DID, toolId: string): void {
    // Remove tool permissions from DID
    if (did.permissions[toolId]) {
      delete did.permissions[toolId];
      
      const auditEntry: AuditLogEntry = {
        timestamp: new Date().toISOString(),
        toolId,
        action: 'access_revoked',
        dataRequested: [],
        dataShared: [],
        userConsent: true
      };
      
      this.logAuditEntry(auditEntry);
    }
  }

  /**
   * Check if tool has access
   */
  hasToolAccess(did: DID, toolId: string): boolean {
    const permission = did.permissions[toolId];
    
    if (!permission || !permission.granted) {
      return false;
    }

    if (permission.expiresAt && new Date(permission.expiresAt) < new Date()) {
      return false;
    }

    return true;
  }

  /**
   * Get audit log for a specific DID
   */
  getAuditLog(didId: string): AuditLogEntry[] {
    return this.auditLog.filter(entry => entry.toolId === didId);
  }

  /**
   * Log security events for audit and monitoring
   */
  logSecurityEvent(securityEvent: any): void {
    // Store security event in audit log
    const auditEntry: AuditLogEntry = {
      timestamp: securityEvent.timestamp || new Date().toISOString(),
      toolId: securityEvent.didId || 'system',
      action: securityEvent.event || 'security_event',
      dataRequested: [],
      dataShared: [],
      userConsent: false
    };
    
    this.auditLog.push(auditEntry);
    
    // Keep audit log size manageable
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }
  }
} 