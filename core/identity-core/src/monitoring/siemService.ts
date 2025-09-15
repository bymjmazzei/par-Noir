/**
 * SIEM (Security Information and Event Management) Service
 * 
 * This file is now a simple re-export wrapper for the new modular SIEM system.
 * All functionality has been broken down into specialized modules:
 *
 * - siem/types/siem.ts: Interfaces and types for SIEM service
 * - siem/modules/eventManager.ts: Security event logging and management
 * - siem/modules/alertManager.ts: Security alert creation and management
 * - siem/modules/threatIntelManager.ts: Threat intelligence management
 * - siem/modules/siemService.ts: Main SIEM service orchestrator
 * - siem/index.ts: Re-exports all modular components
 */

// Re-export the main SIEM service and all modular components
export { SIEMService, siemService } from './siem';

// Re-export types for backward compatibility
export * from './siem/types/siem';

// Re-export individual modules for direct access if needed
export { EventManager } from './siem/modules/eventManager';
export { AlertManager } from './siem/modules/alertManager';
export { ThreatIntelManager } from './siem/modules/threatIntelManager';

// Default export for backward compatibility
export { SIEMService as default } from './siem';
