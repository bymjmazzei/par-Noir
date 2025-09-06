/**
 * Advanced Threat Detection System
 * 
 * This file is now a simple re-export wrapper for the new modular threat detection system.
 * All functionality has been broken down into specialized modules:
 *
 * - threatDetection/types/threatDetection.ts: Interfaces and types for threat detection
 * - threatDetection/modules/eventManager.ts: Security event management
 * - threatDetection/modules/alertManager.ts: Threat alert management
 * - threatDetection/modules/threatDetectionSystem.ts: Main threat detection orchestrator
 * - threatDetection/index.ts: Re-exports all modular components
 */

// Re-export the main threat detection system and all modular components
export { ThreatDetectionSystem } from './threatDetection';

// Re-export types for backward compatibility
export * from './threatDetection/types/threatDetection';

// Re-export individual modules for direct access if needed
export { EventManager } from './threatDetection/modules/eventManager';
export { AlertManager } from './threatDetection/modules/alertManager';

// Default export for backward compatibility
export { ThreatDetectionSystem as default } from './threatDetection';
