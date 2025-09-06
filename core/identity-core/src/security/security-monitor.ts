/**
 * Security Monitor - Central Security Management System
 * 
 * This file is now a simple re-export wrapper for the new modular security monitor system.
 * All functionality has been broken down into specialized modules:
 *
 * - securityMonitor/types/securityMonitor.ts: Interfaces and types for security monitoring
 * - securityMonitor/modules/healthMonitor.ts: Health monitoring and system checks
 * - securityMonitor/modules/securityMonitor.ts: Main security monitor orchestrator
 * - securityMonitor/index.ts: Re-exports all modular components
 */

// Re-export the main security monitor and all modular components
export { SecurityMonitor } from './securityMonitor';

// Re-export types for backward compatibility
export * from './securityMonitor/types/securityMonitor';

// Re-export individual modules for direct access if needed
export { HealthMonitor } from './securityMonitor/modules/healthMonitor';

// Default export for backward compatibility
export { SecurityMonitor as default } from './securityMonitor'; 