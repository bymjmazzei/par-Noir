import { SentryPerformance, SentryTransaction } from '../types/sentry';
// import { SecureRandom } from '../../../utils/secureRandom';

export class PerformanceManager {
  private performanceSpans: Map<string, SentryPerformance> = new Map();
  private transactions: Map<string, SentryTransaction> = new Map();

  /**
   * Start performance span
   */
  startSpan(name: string, op: string, description?: string): string {
    const spanId = `span_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const span: SentryPerformance = {
      name,
      op,
      description,
      startTimestamp: Date.now(),
      endTimestamp: 0,
      tags: {},
      data: {}
    };

    this.performanceSpans.set(spanId, span);
    return spanId;
  }

  /**
   * Finish performance span
   */
  finishSpan(spanId: string, tags?: Record<string, string>, data?: Record<string, any>): SentryPerformance | null {
    const span = this.performanceSpans.get(spanId);
    if (!span) {
      return null;
    }

    span.endTimestamp = Date.now();
    if (tags) {
      span.tags = { ...span.tags, ...tags };
    }
    if (data) {
      span.data = { ...span.data, ...data };
    }

    // Remove span from map
    this.performanceSpans.delete(spanId);
    
    return span;
  }

  /**
   * Start transaction
   */
  startTransaction(name: string, op: string, description?: string): string {
    const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const transaction: SentryTransaction = {
      name,
      op,
      description,
      startTimestamp: Date.now(),
      tags: {},
      data: {},
      spans: []
    };

    this.transactions.set(transactionId, transaction);
    return transactionId;
  }

  /**
   * Finish transaction
   */
  finishTransaction(
    transactionId: string, 
    tags?: Record<string, string>, 
    data?: Record<string, any>
  ): SentryTransaction | null {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      return null;
    }

    transaction.endTimestamp = Date.now();
    if (tags) {
      transaction.tags = { ...transaction.tags, ...tags };
    }
    if (data) {
      transaction.data = { ...transaction.data, ...data };
    }

    // Remove transaction from map
    this.transactions.delete(transactionId);
    
    return transaction;
  }

  /**
   * Add span to transaction
   */
  addSpanToTransaction(transactionId: string, span: SentryPerformance): boolean {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      return false;
    }

    if (!transaction.spans) {
      transaction.spans = [];
    }
    
    transaction.spans.push(span);
    return true;
  }

  /**
   * Get active spans
   */
  getActiveSpans(): Map<string, SentryPerformance> {
    return new Map(this.performanceSpans);
  }

  /**
   * Get active transactions
   */
  getActiveTransactions(): Map<string, SentryTransaction> {
    return new Map(this.transactions);
  }

  /**
   * Get span by ID
   */
  getSpan(spanId: string): SentryPerformance | undefined {
    return this.performanceSpans.get(spanId);
  }

  /**
   * Get transaction by ID
   */
  getTransaction(transactionId: string): SentryTransaction | undefined {
    return this.transactions.get(transactionId);
  }

  /**
   * Set span tags
   */
  setSpanTags(spanId: string, tags: Record<string, string>): boolean {
    const span = this.performanceSpans.get(spanId);
    if (!span) {
      return false;
    }

    span.tags = { ...span.tags, ...tags };
    return true;
  }

  /**
   * Set span data
   */
  setSpanData(spanId: string, data: Record<string, any>): boolean {
    const span = this.performanceSpans.get(spanId);
    if (!span) {
      return false;
    }

    span.data = { ...span.data, ...data };
    return true;
  }

  /**
   * Set transaction tags
   */
  setTransactionTags(transactionId: string, tags: Record<string, string>): boolean {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      return false;
    }

    transaction.tags = { ...transaction.tags, ...tags };
    return true;
  }

  /**
   * Set transaction data
   */
  setTransactionData(transactionId: string, data: Record<string, any>): boolean {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      return false;
    }

    transaction.data = { ...transaction.data, ...data };
    return true;
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    totalSpans: number;
    activeSpans: number;
    totalTransactions: number;
    activeTransactions: number;
    averageSpanDuration: number;
    averageTransactionDuration: number;
  } {
    const activeSpans = this.performanceSpans.size;
    const activeTransactions = this.transactions.size;
    
    // Calculate average durations (simplified)
    let totalSpanDuration = 0;
    let spanCount = 0;
    
    for (const span of this.performanceSpans.values()) {
      if (span.endTimestamp) {
        totalSpanDuration += span.endTimestamp - span.startTimestamp;
        spanCount++;
      }
    }

    let totalTransactionDuration = 0;
    let transactionCount = 0;
    
    for (const transaction of this.transactions.values()) {
      if (transaction.endTimestamp) {
        totalTransactionDuration += transaction.endTimestamp - transaction.startTimestamp;
        transactionCount++;
      }
    }

    return {
      totalSpans: activeSpans,
      activeSpans,
      totalTransactions: activeTransactions,
      activeTransactions,
      averageSpanDuration: spanCount > 0 ? totalSpanDuration / spanCount : 0,
      averageTransactionDuration: transactionCount > 0 ? totalTransactionDuration / transactionCount : 0
    };
  }

  /**
   * Clear all spans
   */
  clearSpans(): void {
    this.performanceSpans.clear();
  }

  /**
   * Clear all transactions
   */
  clearTransactions(): void {
    this.transactions.clear();
  }

  /**
   * Clear expired spans (older than specified time)
   */
  clearExpiredSpans(maxAge: number): number {
    const now = Date.now();
    const initialCount = this.performanceSpans.size;
    
    for (const [id, span] of this.performanceSpans.entries()) {
      if (now - span.startTimestamp > maxAge) {
        this.performanceSpans.delete(id);
      }
    }
    
    return initialCount - this.performanceSpans.size;
  }

  /**
   * Clear expired transactions (older than specified time)
   */
  clearExpiredTransactions(maxAge: number): number {
    const now = Date.now();
    const initialCount = this.transactions.size;
    
    for (const [id, transaction] of this.transactions.entries()) {
      if (now - transaction.startTimestamp > maxAge) {
        this.transactions.delete(id);
      }
    }
    
    return initialCount - this.transactions.size;
  }

  /**
   * Get spans by operation
   */
  getSpansByOperation(op: string): SentryPerformance[] {
    return Array.from(this.performanceSpans.values()).filter(span => span.op === op);
  }

  /**
   * Get transactions by operation
   */
  getTransactionsByOperation(op: string): SentryTransaction[] {
    return Array.from(this.transactions.values()).filter(tx => tx.op === op);
  }

  /**
   * Get spans by time range
   */
  getSpansByTimeRange(start: number, end: number): SentryPerformance[] {
    return Array.from(this.performanceSpans.values()).filter(span => 
      span.startTimestamp >= start && span.startTimestamp <= end
    );
  }

  /**
   * Get transactions by time range
   */
  getTransactionsByTimeRange(start: number, end: number): SentryTransaction[] {
    return Array.from(this.transactions.values()).filter(tx => 
      tx.startTimestamp >= start && tx.startTimestamp <= end
    );
  }
}
