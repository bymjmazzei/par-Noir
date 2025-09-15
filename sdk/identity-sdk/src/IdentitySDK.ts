/**
 * Identity Protocol SDK
 * 
 * Provi client-side functionality for identity management, authentication, and data collection
 * 
 * This file is now a simple re-export wrapper for the new modular IdentitySDK system.
 * All functionality has been broken down into specialized modules:
 *
 * - IdentitySDK/types/identitySDK.ts: Interfaces and types for the SDK
 * - IdentitySDK/constants/sdkConstants.ts: SDK-related constants and configurations
 * - IdentitySDK/modules/authenticationManager.ts: Authentication and session management
 * - IdentitySDK/modules/zkpManager.ts: Zero-knowledge proof generation and verification
 * - IdentitySDK/modules/dataCollectionManager.ts: Data collection and compliance management
 * - IdentitySDK/modules/identitySDK.ts: Main SDK orchestrator
 * - IdentitySDK/index.ts: Re-exports all modular components
 */

// Re-export the main IdentitySDK and all modular components
export { IdentitySDK } from './IdentitySDK';

// Re-export types for backward compatibility
export * from './IdentitySDK/types/identitySDK';

// Re-export constants for backward compatibility
export * from './IdentitySDK/constants/sdkConstants';

// Re-export individual modules for direct access if needed
export { AuthenticationManager } from './IdentitySDK/modules/authenticationManager';
export { ZKPManager } from './IdentitySDK/modules/zkpManager';
export { DataCollectionManager } from './IdentitySDK/modules/dataCollectionManager';

// Default export for backward compatibility
export { IdentitySDK as default } from './IdentitySDK';
