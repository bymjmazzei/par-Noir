import { SentryConfig, SentryUser, SentryContext, SentryMetrics } from '../types/sentry';
import { BreadcrumbManager } from './breadcrumbManager';
import { PerformanceManager } from './performanceManager';
import { EventManager } from './eventManager';
// import { SecureRandom } from '../../../utils/secureRandom';

export class SentryService {
  private config: SentryConfig;
  private isInitialized = false;
  private user: SentryUser | null = null;
  
  // Modular managers
  private breadcrumbManager: BreadcrumbManager;
  private performanceManager: PerformanceManager;
  private eventManager: EventManager;

  constructor(config: SentryConfig) {
    this.config = config;
    
    // Initialize modular managers
    this.breadcrumbManager = new BreadcrumbManager();
    this.performanceManager = new PerformanceManager();
    this.eventManager = new EventManager();
  }

  /**
   * Initialize Sentry
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      // Sentry is disabled
      return;
    }

    try {
      // In production, this would use the Sentry SDK
      // For now, we'll simulate the connection
      await this.simulateSentryConnection();
      
      this.isInitialized = true;
      // Sentry initialized successfully
    } catch (error) {
      throw new Error(`Failed to initialize Sentry: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Simulate Sentry connection for development/testing
   */
  private async simulateSentryConnection(): Promise<void> {
    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Simulate connection test
    const success = Math.random() < 0.9; // 90% success rate
    
    if (!success) {
      throw new Error('Failed to connect to Sentry');
    }
  }

  /**
   * Capture message
   */
  captureMessage(
    message: string,
    level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info',
    context?: SentryContext
  ): string {
    if (!this.isInitialized) {
      return '';
    }

    return this.eventManager.captureMessage(message, level, context);
  }

  /**
   * Capture error
   */
  captureError(
    error: Error,
    context?: SentryContext
  ): string {
    if (!this.isInitialized) {
      return '';
    }

    // Add error breadcrumb
    this.breadcrumbManager.addErrorBreadcrumb(error, context?.tags?.context);

    return this.eventManager.captureError(error, context);
  }

  /**
   * Capture exception
   */
  captureException(
    exception: Error,
    context?: SentryContext
  ): string {
    if (!this.isInitialized) {
      return '';
    }

    // Add error breadcrumb
    this.breadcrumbManager.addErrorBreadcrumb(exception, context?.tags?.context);

    return this.eventManager.captureException(exception, context);
  }

  /**
   * Set user context
   */
  setUser(user: SentryUser): void {
    this.user = user;
  }

  /**
   * Clear user context
   */
  clearUser(): void {
    this.user = null;
  }

  /**
   * Add breadcrumb
   */
  addBreadcrumb(breadcrumb: any): void {
    if (!this.isInitialized) {
      return;
    }

    this.breadcrumbManager.addBreadcrumb(breadcrumb);
  }

  /**
   * Add navigation breadcrumb
   */
  addNavigationBreadcrumb(from: string, to: string, data?: Record<string, any>): void {
    if (!this.isInitialized) {
      return;
    }

    this.breadcrumbManager.addNavigationBreadcrumb(from, to, data);
  }

  /**
   * Add HTTP request breadcrumb
   */
  addHttpBreadcrumb(method: string, url: string, statusCode?: number, data?: Record<string, any>): void {
    if (!this.isInitialized) {
      return;
    }

    this.breadcrumbManager.addHttpBreadcrumb(method, url, statusCode, data);
  }

  /**
   * Add user action breadcrumb
   */
  addUserActionBreadcrumb(action: string, element?: string, data?: Record<string, any>): void {
    if (!this.isInitialized) {
      return;
    }

    this.breadcrumbManager.addUserActionBreadcrumb(action, element, data);
  }

  /**
   * Start performance span
   */
  startSpan(name: string, op: string, description?: string): string {
    if (!this.isInitialized) {
      return '';
    }

    return this.performanceManager.startSpan(name, op, description);
  }

  /**
   * Finish performance span
   */
  finishSpan(spanId: string, tags?: Record<string, string>, data?: Record<string, any>): void {
    if (!this.isInitialized || !spanId) {
      return;
    }

    this.performanceManager.finishSpan(spanId, tags, data);
  }

  /**
   * Start transaction
   */
  startTransaction(name: string, op: string, description?: string): string {
    if (!this.isInitialized) {
      return '';
    }

    return this.performanceManager.startTransaction(name, op, description);
  }

  /**
   * Finish transaction
   */
  finishTransaction(
    transactionId: string, 
    tags?: Record<string, string>, 
    data?: Record<string, any>
  ): void {
    if (!this.isInitialized || !transactionId) {
      return;
    }

    this.performanceManager.finishTransaction(transactionId, tags, data);
  }

  /**
   * Set tag
   */
  setTag(key: string, value: string): void {
    if (!this.isInitialized) {
      return;
    }

    // In production, this would set a global tag
          // Sentry tag set
  }

  /**
   * Set extra data
   */
  setExtra(key: string, value: any): void {
    if (!this.isInitialized) {
      return;
    }

    // In production, this would set global extra data
    // Console statement removed for production
  }

  /**
   * Get metrics
   */
  getMetrics(): SentryMetrics {
    const eventStats = this.eventManager.getEventStats();
    const performanceStats = this.performanceManager.getPerformanceStats();
    const breadcrumbStats = this.breadcrumbManager.getBreadcrumbStats();

    return {
      events: {
        total: eventStats.total,
        byLevel: eventStats.byLevel,
        byCategory: eventStats.byCategory
      },
      performance: {
        totalSpans: performanceStats.totalSpans,
        activeSpans: performanceStats.activeSpans,
        averageDuration: performanceStats.averageSpanDuration
      },
      breadcrumbs: {
        total: breadcrumbStats.total,
        byCategory: breadcrumbStats.byCategory
      },
      users: {
        total: this.user ? 1 : 0,
        active: this.user ? 1 : 0
      }
    };
  }

  /**
   * Check if Sentry is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get configuration
   */
  getConfig(): SentryConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  async updateConfig(newConfig: Partial<SentryConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    
    // Reinitialize if enabled status changed
    if (newConfig.enabled !== undefined && newConfig.enabled !== this.config.enabled) {
      await this.initialize();
    }
  }

  /**
   * Get current user
   */
  getCurrentUser(): SentryUser | null {
    return this.user;
  }

  /**
   * Get breadcrumbs
   */
  getBreadcrumbs(): any[] {
    return this.breadcrumbManager.getBreadcrumbs();
  }

  /**
   * Get active spans
   */
  getActiveSpans(): Map<string, any> {
    return this.performanceManager.getActiveSpans();
  }

  /**
   * Get breadcrumb manager
   */
  getBreadcrumbManager(): BreadcrumbManager {
    return this.breadcrumbManager;
  }

  /**
   * Get performance manager
   */
  getPerformanceManager(): PerformanceManager {
    return this.performanceManager;
  }

  /**
   * Get event manager
   */
  getEventManager(): EventManager {
    return this.eventManager;
  }

  /**
   * Clear all data
   */
  clearAllData(): void {
    this.breadcrumbManager.clearBreadcrumbs();
    this.performanceManager.clearSpans();
    this.performanceManager.clearTransactions();
    this.eventManager.clearEvents();
  }

  /**
   * Destroy Sentry service
   */
  troy(): void {
    this.clearAllData();
    this.isInitialized = false;
  }
}

// Export singleton instance
export const sentryService = new SentryService({
  dsn: process.env.SENTRY_DSN || '',
  environment: process.env.SENTRY_ENVIRONMENT || 'development',
  release: process.env.SENTRY_RELEASE || '1.0.0',
  enabled: process.env.SENTRY_ENABLED === 'true',
  debug: process.env.NODE_ENV === 'development',
  tracesSampleRate: 0.1,
  profilesSampleRate: 0.1,
  integrations: ['http', 'console', 'dom']
});
