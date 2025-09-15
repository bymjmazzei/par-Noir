/**
 * Privacy manager for handling tool permissions and data sharing
 * 
 * This file is now a simple re-export wrapper for the new modular privacy manager system.
 * All functionality has been broken down into specialized modules:
 *
 * - privacy-manager/types/privacyManager.ts: Interfaces and types for privacy management
 * - privacy-manager/constants/privacyConstants.ts: Privacy-related constants and patterns
 * - privacy-manager/modules/validationManager.ts: Input validation and security checks
 * - privacy-manager/modules/auditManager.ts: Audit logging and monitoring
 * - privacy-manager/modules/toolAccessManager.ts: Tool access control and permissions
 * - privacy-manager/modules/privacyManager.ts: Main privacy manager orchestrator
 * - privacy-manager/index.ts: Re-exports all modular components
 */

// Re-export the main privacy manager and all modular components
export { PrivacyManager } from './privacy-manager/modules/privacyManager';

// Re-export types for backward compatibility
export * from './privacy-manager/types/privacyManager';

// Re-export constants for backward compatibility
export * from './privacy-manager/constants/privacyConstants';

// Re-export individual modules for direct access if needed
export { ValidationManager } from './privacy-manager/modules/validationManager';
export { AuditManager } from './privacy-manager/modules/auditManager';
export { ToolAccessManager } from './privacy-manager/modules/toolAccessManager';

// Default export for backward compatibility
export { PrivacyManager as default } from './privacy-manager/modules/privacyManager';
