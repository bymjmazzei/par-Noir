// Re-export all modular Sentry components
export { SentryService, sentryService } from './modules/sentryService';
export { BreadcrumbManager } from './modules/breadcrumbManager';
export { PerformanceManager } from './modules/performanceManager';
export { EventManager } from './modules/eventManager';

// Re-export types
export * from './types/sentry';
