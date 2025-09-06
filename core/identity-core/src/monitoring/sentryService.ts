/**
 * Sentry Error Tracking Service Integration
 * 
 * This file is now a simple re-export wrapper for the new modular Sentry system.
 * All functionality has been broken down into specialized modules:
 *
 * - sentry/types/sentry.ts: Interfaces and types for Sentry service
 * - sentry/modules/breadcrumbManager.ts: Breadcrumb management and tracking
 * - sentry/modules/performanceManager.ts: Performance monitoring and spans
 * - sentry/modules/eventManager.ts: Event capture and management
 * - sentry/modules/sentryService.ts: Main Sentry service orchestrator
 * - sentry/index.ts: Re-exports all modular components
 */

// Re-export the main Sentry service and all modular components
export { SentryService, sentryService } from './sentry';

// Re-export types for backward compatibility
export * from './sentry/types/sentry';

// Re-export individual modules for direct access if needed
export { BreadcrumbManager } from './sentry/modules/breadcrumbManager';
export { PerformanceManager } from './sentry/modules/performanceManager';
export { EventManager } from './sentry/modules/eventManager';

// Default export for backward compatibility
export { SentryService as default } from './sentry';
