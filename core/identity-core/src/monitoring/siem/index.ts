// Re-export all modular SIEM components
export { SIEMService, siemService } from './modules/siemService';
export { EventManager } from './modules/eventManager';
export { AlertManager } from './modules/alertManager';
export { ThreatIntelManager } from './modules/threatIntelManager';

// Re-export types
export * from './types/siem';
