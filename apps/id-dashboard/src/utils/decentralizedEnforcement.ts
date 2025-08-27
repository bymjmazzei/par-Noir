// Decentralized License Enforcement System
// This system enforces license compliance at the client/protocol level

import { LicenseVerification, UsagePattern } from './licenseVerification';

export interface EnforcementResult {
  allowed: boolean;
  reason?: string;
  gracePeriodActive: boolean;
  daysRemaining?: number;
  requiresUpgrade: boolean;
}

export interface CommercialOperation {
  operationId: string;
  operationType: 'api_call' | 'enterprise_feature' | 'bulk_operation' | 'integration' | 'white_label' | 'multi_tenant';
  resourceId?: string;
  metadata?: any;
}

// Commercial operations that require licensing
export const COMMERCIAL_OPERATIONS = {
  // API Operations
  API_BULK_VERIFICATION: 'api_bulk_verification',
  API_HIGH_FREQUENCY: 'api_high_frequency',
  API_ENTERPRISE_ENDPOINTS: 'api_enterprise_endpoints',
  
  // Enterprise Features
  ADVANCED_ANALYTICS: 'advanced_analytics',
  BULK_OPERATIONS: 'bulk_operations',
  CUSTOM_INTEGRATIONS: 'custom_integrations',
  WHITE_LABEL: 'white_label',
  MULTI_TENANT: 'multi_tenant',
  ENTERPRISE_SUPPORT: 'enterprise_support',
  
  // Scale Operations
  MULTI_USER_MANAGEMENT: 'multi_user_management',
  INTEGRATION_MANAGEMENT: 'integration_management',
  DATA_EXPORT: 'data_export',
  ADVANCED_SECURITY: 'advanced_security'
};

// Enforcement thresholds
const ENFORCEMENT_THRESHOLDS = {
  API_CALL_LIMIT: 100, // calls per hour
  USER_COUNT_LIMIT: 10, // users
  INTEGRATION_COUNT_LIMIT: 5, // integrations
  BULK_OPERATION_LIMIT: 1000 // records per operation
};

export class DecentralizedEnforcement {
  
  // Main enforcement method - validates operations before execution
  static async validateOperation(
    identityHash: string, 
    operation: CommercialOperation
  ): Promise<EnforcementResult> {
    
    // Get current license and grace period status
    const licenseStatus = await LicenseVerification.getLicenseStatus(identityHash);
    const graceStatus = LicenseVerification.getGracePeriodStatus(identityHash);
    const usagePattern = LicenseVerification.getUsagePattern(identityHash);
    
    // Check if operation requires commercial license
    const requiresCommercialLicense = this.isCommercialOperation(operation);
    
    if (!requiresCommercialLicense) {
      // Non-commercial operations are always allowed
      return {
        allowed: true,
        gracePeriodActive: false,
        requiresUpgrade: false
      };
    }
    
    // Commercial operations require valid commercial license
    if (!licenseStatus.isCommercial) {
      if (graceStatus.isActive) {
        // Grace period active - allow with warning
        return {
          allowed: true,
          reason: `Commercial operation allowed during grace period. ${graceStatus.daysRemaining} days remaining.`,
          gracePeriodActive: true,
          daysRemaining: graceStatus.daysRemaining,
          requiresUpgrade: true
        };
      } else if (graceStatus.shouldEnforce) {
        // Grace period expired - block operation
        return {
          allowed: false,
          reason: 'Commercial license required. Grace period expired.',
          gracePeriodActive: false,
          requiresUpgrade: true
        };
      }
    }
    
    // Valid commercial license - allow operation
    return {
      allowed: true,
      gracePeriodActive: false,
      requiresUpgrade: false
    };
  }
  
  // Check if operation requires commercial license
  private static isCommercialOperation(operation: CommercialOperation): boolean {
    const commercialOperationTypes = Object.values(COMMERCIAL_OPERATIONS);
    return commercialOperationTypes.includes(operation.operationId);
  }
  
  // Enforce API rate limiting
  static async enforceAPIRateLimit(identityHash: string, endpoint: string): Promise<EnforcementResult> {
    const apiCallFrequency = await LicenseVerification.monitorAPICallFrequency(identityHash);
    
    if (apiCallFrequency > ENFORCEMENT_THRESHOLDS.API_CALL_LIMIT) {
      return await this.validateOperation(identityHash, {
        operationId: COMMERCIAL_OPERATIONS.API_HIGH_FREQUENCY,
        operationType: 'api_call',
        resourceId: endpoint,
        metadata: { callCount: apiCallFrequency }
      });
    }
    
    return {
      allowed: true,
      gracePeriodActive: false,
      requiresUpgrade: false
    };
  }
  
  // Enforce enterprise feature access
  static async enforceEnterpriseFeatureAccess(
    identityHash: string, 
    featureId: string
  ): Promise<EnforcementResult> {
    
    return await this.validateOperation(identityHash, {
      operationId: featureId as any,
      operationType: 'enterprise_feature',
      resourceId: featureId
    });
  }
  
  // Enforce bulk operations
  static async enforceBulkOperation(
    identityHash: string, 
    operationType: string, 
    recordCount: number
  ): Promise<EnforcementResult> {
    
    if (recordCount > ENFORCEMENT_THRESHOLDS.BULK_OPERATION_LIMIT) {
      return await this.validateOperation(identityHash, {
        operationId: COMMERCIAL_OPERATIONS.BULK_OPERATIONS,
        operationType: 'bulk_operation',
        metadata: { recordCount, operationType }
      });
    }
    
    return {
      allowed: true,
      gracePeriodActive: false,
      requiresUpgrade: false
    };
  }
  
  // Enforce multi-user operations
  static async enforceMultiUserOperation(
    identityHash: string, 
    userCount: number
  ): Promise<EnforcementResult> {
    
    if (userCount > ENFORCEMENT_THRESHOLDS.USER_COUNT_LIMIT) {
      return await this.validateOperation(identityHash, {
        operationId: COMMERCIAL_OPERATIONS.MULTI_USER_MANAGEMENT,
        operationType: 'integration',
        metadata: { userCount }
      });
    }
    
    return {
      allowed: true,
      gracePeriodActive: false,
      requiresUpgrade: false
    };
  }
  
  // Enforce integration limits
  static async enforceIntegrationLimit(
    identityHash: string, 
    integrationCount: number
  ): Promise<EnforcementResult> {
    
    if (integrationCount > ENFORCEMENT_THRESHOLDS.INTEGRATION_COUNT_LIMIT) {
      return await this.validateOperation(identityHash, {
        operationId: COMMERCIAL_OPERATIONS.INTEGRATION_MANAGEMENT,
        operationType: 'integration',
        metadata: { integrationCount }
      });
    }
    
    return {
      allowed: true,
      gracePeriodActive: false,
      requiresUpgrade: false
    };
  }
  
  // Protocol-level transaction validation
  static async validateTransaction(
    identityHash: string, 
    transactionType: string, 
    transactionData: any
  ): Promise<EnforcementResult> {
    
    // Check if transaction involves commercial operations
    const commercialTransactionTypes = [
      'bulk_identity_verification',
      'enterprise_data_export',
      'white_label_deployment',
      'multi_tenant_setup',
      'advanced_analytics_query'
    ];
    
    if (commercialTransactionTypes.includes(transactionType)) {
      return await this.validateOperation(identityHash, {
        operationId: transactionType as any,
        operationType: 'enterprise_feature',
        metadata: transactionData
      });
    }
    
    return {
      allowed: true,
      gracePeriodActive: false,
      requiresUpgrade: false
    };
  }
  
  // SDK-level enforcement wrapper
  static async enforceSDKOperation(
    identityHash: string, 
    operation: string, 
    params: any = {}
  ): Promise<EnforcementResult> {
    
    // Map SDK operations to commercial operation types
    const operationMapping: { [key: string]: CommercialOperation } = {
      'bulkVerify': {
        operationId: COMMERCIAL_OPERATIONS.BULK_OPERATIONS,
        operationType: 'bulk_operation',
        metadata: params
      },
      'advancedAnalytics': {
        operationId: COMMERCIAL_OPERATIONS.ADVANCED_ANALYTICS,
        operationType: 'enterprise_feature',
        metadata: params
      },
      'whiteLabel': {
        operationId: COMMERCIAL_OPERATIONS.WHITE_LABEL,
        operationType: 'white_label',
        metadata: params
      },
      'multiTenant': {
        operationId: COMMERCIAL_OPERATIONS.MULTI_TENANT,
        operationType: 'multi_tenant',
        metadata: params
      },
      'customIntegration': {
        operationId: COMMERCIAL_OPERATIONS.CUSTOM_INTEGRATIONS,
        operationType: 'integration',
        metadata: params
      }
    };
    
    const commercialOperation = operationMapping[operation];
    if (commercialOperation) {
      return await this.validateOperation(identityHash, commercialOperation);
    }
    
    return {
      allowed: true,
      gracePeriodActive: false,
      requiresUpgrade: false
    };
  }
  
  // Get enforcement status for display
  static async getEnforcementStatus(identityHash: string): Promise<{
    isEnforced: boolean;
    gracePeriodActive: boolean;
    daysRemaining?: number;
    blockedOperations: string[];
    allowedOperations: string[];
  }> {
    const graceStatus = LicenseVerification.getGracePeriodStatus(identityHash);
    const licenseStatus = await LicenseVerification.getLicenseStatus(identityHash);
    
    const isEnforced = graceStatus.shouldEnforce && !licenseStatus.isCommercial;
    
    return {
      isEnforced,
      gracePeriodActive: graceStatus.isActive,
      daysRemaining: graceStatus.daysRemaining,
      blockedOperations: isEnforced ? Object.values(COMMERCIAL_OPERATIONS) : [],
      allowedOperations: isEnforced ? [] : Object.values(COMMERCIAL_OPERATIONS)
    };
  }
  
  // Simulate operation execution with enforcement
  static async executeOperation(
    identityHash: string, 
    operation: CommercialOperation, 
    executeFn: () => Promise<any>
  ): Promise<any> {
    
    const enforcementResult = await this.validateOperation(identityHash, operation);
    
    if (!enforcementResult.allowed) {
      throw new Error(`Operation blocked: ${enforcementResult.reason}`);
    }
    
    if (enforcementResult.requiresUpgrade) {
      console.warn(`Commercial license recommended: ${enforcementResult.reason}`);
    }
    
    // Execute the operation
    return await executeFn();
  }
}

// Export for use in other modules
export default DecentralizedEnforcement;
