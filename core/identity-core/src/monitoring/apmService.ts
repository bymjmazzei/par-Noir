/**
 * APM (Application Performance Monitoring) Service
 * Provides comprehensive performance monitoring and metrics
 */

export interface APMConfig {
  serviceName: string;
  serverUrl: string;
  enabled: boolean;
  debug: boolean;
  sampleRate: number;
  maxQueueSize: number;
  flushInterval: number;
}

export interface APMTransaction {
  id: string;
  name: string;
  type: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  result?: string;
  outcome?: 'success' | 'failure' | 'unknown';
  context?: {
    user?: {
      id?: string;
      email?: string;
      username?: string;
    };
    request?: {
      method?: string;
      url?: string;
      headers?: Record<string, string>;
      body?: any;
    };
    response?: {
      status_code?: number;
      headers?: Record<string, string>;
      body?: any;
    };
    tags?: Record<string, string>;
    custom?: Record<string, any>;
  };
  spans: APMSpan[];
}

export interface APMSpan {
  id: string;
  transactionId: string;
  name: string;
  type: string;
  subtype?: string;
  action?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  context?: {
    db?: {
      statement?: string;
      type?: string;
      user?: string;
      rows_affected?: number;
    };
    http?: {
      url?: string;
      method?: string;
      status_code?: number;
    };
    tags?: Record<string, string>;
    custom?: Record<string, any>;
  };
}

export interface APMError {
  id: string;
  transactionId?: string;
  spanId?: string;
  timestamp: number;
  culprit: string;
  exception: {
    type: string;
    message: string;
    stacktrace?: string[];
  };
  context?: {
    user?: {
      id?: string;
      email?: string;
      username?: string;
    };
    tags?: Record<string, string>;
    custom?: Record<string, any>;
  };
}

export interface APMMetrics {
  transactions: {
    total: number;
    successful: number;
    failed: number;
    avgDuration: number;
    p95Duration: number;
    p99Duration: number;
  };
  errors: {
    total: number;
    byType: Record<string, number>;
  };
  performance: {
    memoryUsage: number;
    cpuUsage: number;
    responseTime: number;
    throughput: number;
  };
}

export class APMService {
  private config: APMConfig;
  private isInitialized = false;
  private transactions: Map<string, APMTransaction> = new Map();
  private errors: APMError[] = [];
  private metrics: APMMetrics;
  private queue: any[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(config: APMConfig) {
    this.config = config;
    this.metrics = this.initializeMetrics();
    this.startFlushTimer();
  }

  /**
   * Initialize APM
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      console.log('APM is disabled');
      return;
    }

    try {
      // In production, this would use the APM agent
      // For now, we'll simulate the connection
      await this.simulateAPMConnection();
      
      this.isInitialized = true;
      console.log('APM initialized successfully');
    } catch (error) {
      throw new Error(`Failed to initialize APM: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Simulate APM connection for development/testing
   */
  private async simulateAPMConnection(): Promise<void> {
    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Simulate connection test
    const success = Math.random() > 0.1; // 90% success rate
    
    if (!success) {
      throw new Error('Failed to connect to APM');
    }
  }

  /**
   * Start transaction
   */
  startTransaction(name: string, type: string): string {
    const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const transaction: APMTransaction = {
      id: transactionId,
      name,
      type,
      startTime: Date.now(),
      spans: []
    };

    this.transactions.set(transactionId, transaction);
    return transactionId;
  }

  /**
   * End transaction
   */
  endTransaction(
    transactionId: string,
    result?: string,
    outcome?: 'success' | 'failure' | 'unknown'
  ): void {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      return;
    }

    transaction.endTime = Date.now();
    transaction.duration = transaction.endTime - transaction.startTime;
    transaction.result = result;
    transaction.outcome = outcome;

    // Send transaction data
    this.sendTransaction(transaction);
    
    // Remove from map
    this.transactions.delete(transactionId);
  }

  /**
   * Start span
   */
  startSpan(
    transactionId: string,
    name: string,
    type: string,
    subtype?: string,
    action?: string
  ): string {
    const spanId = `span_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const span: APMSpan = {
      id: spanId,
      transactionId,
      name,
      type,
      subtype,
      action,
      startTime: Date.now()
    };

    const transaction = this.transactions.get(transactionId);
    if (transaction) {
      transaction.spans.push(span);
    }

    return spanId;
  }

  /**
   * End span
   */
  endSpan(spanId: string, context?: APMSpan['context']): void {
    // Find span in transactions
    for (const transaction of this.transactions.values()) {
      const span = transaction.spans.find(s => s.id === spanId);
      if (span) {
        span.endTime = Date.now();
        span.duration = span.endTime - span.startTime;
        if (context) {
          span.context = { ...span.context, ...context };
        }
        break;
      }
    }
  }

  /**
   * Capture error
   */
  captureError(
    error: Error,
    transactionId?: string,
    spanId?: string,
    context?: APMError['context']
  ): string {
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const apmError: APMError = {
      id: errorId,
      transactionId,
      spanId,
      timestamp: Date.now(),
      culprit: error.stack?.split('\n')[1] || error.message,
      exception: {
        type: error.constructor.name,
        message: error.message,
        stacktrace: error.stack?.split('\n').slice(1) || []
      },
      context
    };

    this.errors.push(apmError);
    this.sendError(apmError);

    return errorId;
  }

  /**
   * Set transaction context
   */
  setTransactionContext(
    transactionId: string,
    context: APMTransaction['context']
  ): void {
    const transaction = this.transactions.get(transactionId);
    if (transaction) {
      transaction.context = { ...transaction.context, ...context };
    }
  }

  /**
   * Add custom metric
   */
  addCustomMetric(name: string, value: number, tags?: Record<string, string>): void {
    const metric = {
      name,
      value,
      tags,
      timestamp: Date.now()
    };

    this.queue.push({ type: 'metric', data: metric });
  }

  /**
   * Add custom event
   */
  addCustomEvent(name: string, data: Record<string, any>): void {
    const event = {
      name,
      data,
      timestamp: Date.now()
    };

    this.queue.push({ type: 'event', data: event });
  }

  /**
   * Get performance metrics
   */
  getMetrics(): APMMetrics {
    const transactions = Array.from(this.transactions.values());
    const completedTransactions = transactions.filter(t => t.duration !== undefined);
    
    if (completedTransactions.length > 0) {
      const durations = completedTransactions.map(t => t.duration!).sort((a, b) => a - b);
      const successful = completedTransactions.filter(t => t.outcome === 'success').length;
      
      this.metrics.transactions = {
        total: completedTransactions.length,
        successful,
        failed: completedTransactions.length - successful,
        avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
        p95Duration: durations[Math.floor(durations.length * 0.95)],
        p99Duration: durations[Math.floor(durations.length * 0.99)]
      };
    }

    this.metrics.errors = {
      total: this.errors.length,
      byType: this.errors.reduce((acc, error) => {
        const type = error.exception.type;
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };

    // Update performance metrics
    this.updatePerformanceMetrics();

    return { ...this.metrics };
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(): void {
    // Simulate performance data
    this.metrics.performance = {
      memoryUsage: Math.random() * 100,
      cpuUsage: Math.random() * 100,
      responseTime: Math.random() * 1000,
      throughput: Math.random() * 1000
    };
  }

  /**
   * Initialize metrics
   */
  private initializeMetrics(): APMMetrics {
    return {
      transactions: {
        total: 0,
        successful: 0,
        failed: 0,
        avgDuration: 0,
        p95Duration: 0,
        p99Duration: 0
      },
      errors: {
        total: 0,
        byType: {}
      },
      performance: {
        memoryUsage: 0,
        cpuUsage: 0,
        responseTime: 0,
        throughput: 0
      }
    };
  }

  /**
   * Send transaction data
   */
  private async sendTransaction(transaction: APMTransaction): Promise<void> {
    try {
      // In production, this would send to APM server
      await this.simulateDataSending('transaction', transaction);

      if (this.config.debug) {
        console.log('APM transaction sent:', transaction);
      }
    } catch (error) {
      console.error('Failed to send APM transaction:', error);
    }
  }

  /**
   * Send error data
   */
  private async sendError(error: APMError): Promise<void> {
    try {
      // In production, this would send to APM server
      await this.simulateDataSending('error', error);

      if (this.config.debug) {
        console.log('APM error sent:', error);
      }
    } catch (error) {
      console.error('Failed to send APM error:', error);
    }
  }

  /**
   * Simulate data sending
   */
  private async simulateDataSending(type: string, data: any): Promise<void> {
    // Simulate sending delay
    await new Promise(resolve => setTimeout(resolve, 20));
    
    // Simulate success/failure
    const success = Math.random() > 0.05; // 95% success rate
    
    if (!success) {
      throw new Error(`Failed to send ${type} to APM`);
    }
  }

  /**
   * Start flush timer
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(() => {
      this.flushQueue();
    }, this.config.flushInterval);
  }

  /**
   * Flush queue
   */
  private async flushQueue(): Promise<void> {
    if (this.queue.length === 0) {
      return;
    }

    const batch = this.queue.splice(0, this.config.maxQueueSize);
    
    try {
      // In production, this would send batch to APM server
      await this.simulateBatchSending(batch);

      if (this.config.debug) {
        console.log('APM batch sent:', batch.length, 'items');
      }
    } catch (error) {
      console.error('Failed to send APM batch:', error);
      // Re-queue failed items
      this.queue.unshift(...batch);
    }
  }

  /**
   * Simulate batch sending
   */
  private async simulateBatchSending(batch: any[]): Promise<void> {
    // Simulate sending delay
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Simulate success/failure
    const success = Math.random() > 0.05; // 95% success rate
    
    if (!success) {
      throw new Error('Failed to send batch to APM');
    }
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

    // Restart flush timer if interval changed
    if (newConfig.flushInterval) {
      this.startFlushTimer();
    }
  }

  /**
   * Get active transactions
   */
  getActiveTransactions(): Map<string, APMTransaction> {
    return new Map(this.transactions);
  }

  /**
   * Get errors
   */
  getErrors(): APMError[] {
    return [...this.errors];
  }

  /**
   * Clear errors
   */
  clearErrors(): void {
    this.errors = [];
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Flush queue immediately
   */
  async flush(): Promise<void> {
    await this.flushQueue();
  }

  /**
   * Destroy APM service
   */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    
    // Flush remaining data
    this.flushQueue();
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
