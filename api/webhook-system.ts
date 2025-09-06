/**
 * Identity Protocol Webhook System
 * 
 * Provi real-time event notifications to third-party applications
 * 
 * This file is now a simple re-export wrapper for the new modular webhook system.
 * All functionality has been broken down into specialized modules:
 *
 * - webhook-system/types/webhookSystem.ts: Interfaces and types for webhook system
 * - webhook-system/constants/webhookConstants.ts: Webhook-related constants and configurations
 * - webhook-system/modules/subscriptionManager.ts: Webhook subscription management
 * - webhook-system/modules/eventManager.ts: Webhook event management
 * - webhook-system/modules/deliveryManager.ts: Webhook delivery and retry management
 * - webhook-system/modules/webhookSystem.ts: Main webhook system orchestrator
 * - webhook-system/index.ts: Re-exports all modular components
 */

// Re-export the main webhook system and all modular components
export { WebhookSystem } from './webhook-system';

// Re-export types for backward compatibility
export * from './webhook-system/types/webhookSystem';

// Re-export constants for backward compatibility
export * from './webhook-system/constants/webhookConstants';

// Re-export individual modules for direct access if needed
export { SubscriptionManager } from './webhook-system/modules/subscriptionManager';
export { EventManager } from './webhook-system/modules/eventManager';
export { DeliveryManager } from './webhook-system/modules/deliveryManager';

// Default export for backward compatibility
export { WebhookSystem as default } from './webhook-system';
