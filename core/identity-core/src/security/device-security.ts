/**
 * Device Security Module - Hardware Security and Threat Detection
 * 
 * This file is now a simple re-export wrapper for the new modular device security system.
 * All functionality has been broken down into specialized modules:
 *
 * - deviceSecurity/types/deviceSecurity.ts: Interfaces and types for device security
 * - deviceSecurity/modules/fingerprintManager.ts: Device fingerprinting and management
 * - deviceSecurity/modules/threatDetectionManager.ts: Threat detection and monitoring
 * - deviceSecurity/modules/deviceSecurityManager.ts: Main device security orchestrator
 * - deviceSecurity/index.ts: Re-exports all modular components
 */

// Re-export the main device security manager and all modular components
export { DeviceSecurityManager } from './deviceSecurity';

// Re-export types for backward compatibility
export * from './deviceSecurity/types/deviceSecurity';

// Re-export individual modules for direct access if needed
export { FingerprintManager } from './deviceSecurity/modules/fingerprintManager';
export { ThreatDetectionManager } from './deviceSecurity/modules/threatDetectionManager';

// Default export for backward compatibility
export { DeviceSecurityManager as default } from './deviceSecurity';
