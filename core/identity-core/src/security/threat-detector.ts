/**
 * Threat Detection System
 * 
 * This file is now a simple re-export wrapper for the new modular threat detector system.
 * All functionality has been broken down into specialized modules:
 *
 * - threatDetector/types/threatDetector.ts: Interfaces and types for threat detection
 * - threatDetector/modules/threatPatternManager.ts: Threat pattern management
 * - threatDetector/modules/threatDetectionEngine.ts: Threat detection algorithms
 * - threatDetector/modules/threatDetector.ts: Main threat detector orchestrator
 * - threatDetector/index.ts: Re-exports all modular components
 */

// Re-export the main threat detector and all modular components
export { ThreatDetector } from './threatDetector';

// Re-export types for backward compatibility
export * from './threatDetector/types/threatDetector';

// Re-export individual modules for direct access if needed
export { ThreatPatternManager } from './threatDetector/modules/threatPatternManager';
export { ThreatDetectionEngine } from './threatDetector/modules/threatDetectionEngine';

// Default export for backward compatibility
export { ThreatDetector as default } from './threatDetector';
