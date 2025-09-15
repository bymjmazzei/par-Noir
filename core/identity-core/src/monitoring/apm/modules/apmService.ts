import { APMConfig, APMMetrics, APMTransaction, APMSpan, APMError, APMContext } from '../types/apm';
import { TransactionManager } from './transactionManager';
import { ErrorManager } from './errorManager';
import { QueueManager } from './queueManager';
// import { SecureRandom } from '../../../utils/secureRandom';

export class APMService {
  private config: APMConfig;
  private isInitialized: boolean = false;
  
  // Modular managers
  private transactionManager: TransactionManager;
  private errorManager: ErrorManager;
  private queueManager: QueueManager;

  constructor(config: Partial<APMConfig> = {}) {
    this.config = {
      serviceName: 'identity-protocol',
      serverUrl: 'https://apm.your-domain.com',
      enabled: false,
      debug: false,
      sampleRate: 0.1,
      maxQueueSize: 100,
      flushInterval: 5000,
      ...config
    };

    // Initialize modular managers
    this.transactionManager = new TransactionManager();
    this.errorManager = new ErrorManager();
    this.queueManager = new QueueManager(
      this.config.maxQueueSize,
      this.config.flushInterval
    );
  }

  /**
   * Initialize APM service
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      // Initialize queue manager
      this.queueManager.startFlushTimer();
      
      this.isInitialized = true;
      
      if (this.config.debug) {
        // Console statement removed for production
      }
    } catch (error) {
      if (this.config.debug) {
        // Console statement removed for production
      }
      throw error;
    }
  }

  /**
   * Start a new transaction
   */
  startTransaction(name: string, type: string, context?: APMContext): string {
    if (!this.isInitialized || !this.shouldSample()) {
      return '';
    }

    return this.transactionManager.startTransaction(name, type, context);
  }

  /**
   * End a transaction
   */
  endTransaction(
    transactionId: string, 
    result?: string, 
    outcome?: 'success' | 'failure' | 'unknown'
  ): void {
    if (!this.isInitialized || !transactionId) {
      return;
    }

    const transaction = this.transactionManager.endTransaction(transactionId, result, outcome);
    if (transaction) {
      this.queueManager.addToQueue('transaction', transaction);
    }
  }

  /**
   * Start a span within a transaction
   */
  startSpan(
    transactionId: string,
    name: string,
    type: string,
    subtype?: string,
    action?: string
  ): string {
    if (!this.isInitialized || !transactionId) {
      return '';
    }

    return this.transactionManager.startSpan(transactionId, name, type, subtype, action);
  }

  /**
   * End a span
   */
  endSpan(spanId: string, context?: APMSpan['context']): void {
    if (!this.isInitialized || !spanId) {
      return;
    }

    this.transactionManager.endSpan(spanId, context);
  }

  /**
   * Capture an error
   */
  captureError(
    error: Error,
    transactionId?: string,
    spanId?: string,
    context?: APMContext
  ): string {
    if (!this.isInitialized) {
      return '';
    }

    const errorId = this.errorManager.captureError(error, transactionId, spanId, context);
    
    // Get the captured error and add to queue
    const apmError = this.errorManager.getError(errorId);
    if (apmError) {
      this.queueManager.addToQueue('error', apmError);
    }

    return errorId;
  }

  /**
   * Set transaction context
   */
  setTransactionContext(
    transactionId: string,
    context: APMContext
  ): void {
    if (!this.isInitialized || !transactionId) {
      return;
    }

    this.transactionManager.setTransactionContext(transactionId, context);
  }

  /**
   * Add tags to transaction
   */
  addTransactionTags(transactionId: string, tags: Record<string, string>): void {
    if (!this.isInitialized || !transactionId) {
      return;
    }

    this.transactionManager.addTransactionTags(transactionId, tags);
  }

  /**
   * Get metrics
   */
  getMetrics(): APMMetrics {
    const transactionStats = this.transactionManager.getTransactionStats();
    const spanStats = this.transactionManager.getSpanStats();
    const errorStats = this.errorManager.getErrorStats();
    const queueStats = this.queueManager.getQueueStats();

    return {
      transactions: {
        total: transactionStats.total,
        active: transactionStats.active,
        completed: transactionStats.completed,
        failed: transactionStats.failed,
        averageDuration: transactionStats.averageDuration
      },
      spans: {
        total: spanStats.total,
        active: spanStats.active,
        completed: spanStats.completed,
        averageDuration: spanStats.averageDuration
      },
      errors: {
        total: errorStats.total,
        unhandled: errorStats.unhandled,
        handled: errorStats.handled
      },
      queue: {
        current: queueStats.current,
        max: queueStats.max,
        flushed: queueStats.flushed
      },
      performance: {
        memoryUsage: this.getMemoryUsage(),
        cpuUsage: this.getCPUUsage(),
        responseTime: this.getResponseTime()
      }
    };
  }

  /**
   * Check if APM is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get configuration
   */
  getConfig(): APMConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  async updateConfig(newConfig: Partial<APMConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    
    // Reinitialize if enabled status changed
    if (newConfig.enabled !== undefined && newConfig.enabled !== this.config.enabled) {
      await this.initialize();
    }

    // Update queue manager configuration
    if (newConfig.maxQueueSize !== undefined) {
      this.queueManager.updateMaxQueueSize(newConfig.maxQueueSize);
    }
    
    if (newConfig.flushInterval !== undefined) {
      this.queueManager.updateFlushInterval(newConfig.flushInterval);
    }
  }

  /**
   * Get active transactions
   */
  getActiveTransactions(): Map<string, APMTransaction> {
    return this.transactionManager.getActiveTransactions();
  }

  /**
   * Get errors
   */
  getErrors(): APMError[] {
    return this.errorManager.getErrors();
  }

  /**
   * Clear errors
   */
  clearErrors(): void {
    this.errorManager.clearErrors();
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.queueManager.getQueueSize();
  }

  /**
   * Flush queue immediately
   */
  async flush(): Promise<void> {
    await this.queueManager.flushQueue();
  }

  /**
   * Get transaction manager
   */
  getTransactionManager(): TransactionManager {
    return this.transactionManager;
  }

  /**
   * Get error manager
   */
  getErrorManager(): ErrorManager {
    return this.errorManager;
  }

  /**
   * Get queue manager
   */
  getQueueManager(): QueueManager {
    return this.queueManager;
  }

  /**
   * Destroy APM service
   */
  troy(): void {
    this.queueManager.troy();
    this.transactionManager.clearTransactions();
    this.errorManager.clearErrors();
    this.isInitialized = false;
  }

  /**
   * Determine if operation should be sampled
   */
  private shouldSample(): boolean {
    return crypto.getRandomValues(new Uint8Array(1))[0] / 255 < this.config.sampleRate;
  }

  /**
   * Get memory usage (simplified)
   */
  private getMemoryUsage(): number {
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      return (performance as any).memory.usedJSHeapSize;
    }
    return 0;
  }

  /**
   * Get CPU usage (simplified)
   */
  private getCPUUsage(): number {
    // This would require more sophisticated monitoring in production
    return 0;
  }

  /**
   * Get response time (simplified)
   */
  private getResponseTime(): number {
    // This would require more sophisticated monitoring in production
    return 0;
  }
}

// Export singleton instance
export const apmService = new APMService({
  serviceName: process.env.APM_SERVICE_NAME || 'identity-protocol',
  serverUrl: process.env.APM_SERVER_URL || 'https://apm.your-domain.com',
  enabled: process.env.APM_ENABLED === 'true',
  debug: process.env.NODE_ENV === 'development',
  sampleRate: 0.1,
  maxQueueSize: 100,
  flushInterval: 5000
});
