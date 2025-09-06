import { APMTransaction, APMSpan, APMContext } from '../types/apm';
// import { SecureRandom } from '../../../utils/secureRandom';

export class TransactionManager {
  private transactions: Map<string, APMTransaction> = new Map();

  /**
   * Start a new transaction
   */
  startTransaction(name: string, type: string, context?: APMContext): string {
    const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const transaction: APMTransaction = {
      id: transactionId,
      name,
      type,
      startTime: Date.now(),
      spans: [],
      context
    };

    this.transactions.set(transactionId, transaction);
    return transactionId;
  }

  /**
   * End a transaction
   */
  endTransaction(
    transactionId: string, 
    result?: string, 
    outcome?: 'success' | 'failure' | 'unknown'
  ): APMTransaction | null {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      return null;
    }

    transaction.endTime = Date.now();
    transaction.duration = transaction.endTime - transaction.startTime;
    transaction.result = result;
    transaction.outcome = outcome;

    // Remove from map
    this.transactions.delete(transactionId);
    
    return transaction;
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
   * End a span
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
   * Set transaction context
   */
  setTransactionContext(
    transactionId: string,
    context: APMContext
  ): void {
    const transaction = this.transactions.get(transactionId);
    if (transaction) {
      transaction.context = { ...transaction.context, ...context };
    }
  }

  /**
   * Add tags to transaction
   */
  addTransactionTags(transactionId: string, tags: Record<string, string>): void {
    const transaction = this.transactions.get(transactionId);
    if (transaction && transaction.context) {
      if (!transaction.context.tags) {
        transaction.context.tags = {};
      }
      transaction.context.tags = { ...transaction.context.tags, ...tags };
    }
  }

  /**
   * Get transaction by ID
   */
  getTransaction(transactionId: string): APMTransaction | undefined {
    return this.transactions.get(transactionId);
  }

  /**
   * Get all active transactions
   */
  getActiveTransactions(): Map<string, APMTransaction> {
    return new Map(this.transactions);
  }

  /**
   * Get transaction count
   */
  getTransactionCount(): number {
    return this.transactions.size;
  }

  /**
   * Check if transaction exists
   */
  hasTransaction(transactionId: string): boolean {
    return this.transactions.has(transactionId);
  }

  /**
   * Get transaction statistics
   */
  getTransactionStats(): {
    total: number;
    active: number;
    completed: number;
    failed: number;
    averageDuration: number;
  } {
    const active = this.transactions.size;
    
    // This is a simplified implementation
    // In production, you'd track completed transactions separately
    return {
      total: active,
      active,
      completed: 0,
      failed: 0,
      averageDuration: 0
    };
  }

  /**
   * Clear all transactions
   */
  clearTransactions(): void {
    this.transactions.clear();
  }

  /**
   * Get transactions by filter
   */
  getTransactionsByFilter(filter: {
    type?: string;
    outcome?: string;
    user?: string;
    tags?: Record<string, string>;
  }): APMTransaction[] {
    const results: APMTransaction[] = [];
    
    for (const transaction of this.transactions.values()) {
      let matches = true;
      
      if (filter.type && transaction.type !== filter.type) {
        matches = false;
      }
      
      if (filter.outcome && transaction.outcome !== filter.outcome) {
        matches = false;
      }
      
      if (filter.user && transaction.context?.user?.id !== filter.user) {
        matches = false;
      }
      
      if (filter.tags) {
        for (const [key, value] of Object.entries(filter.tags)) {
          if (transaction.context?.tags?.[key] !== value) {
            matches = false;
            break;
          }
        }
      }
      
      if (matches) {
        results.push(transaction);
      }
    }
    
    return results;
  }

  /**
   * Get span by ID
   */
  getSpan(spanId: string): APMSpan | null {
    for (const transaction of this.transactions.values()) {
      const span = transaction.spans.find(s => s.id === spanId);
      if (span) {
        return span;
      }
    }
    return null;
  }

  /**
   * Get all spans for a transaction
   */
  getTransactionSpans(transactionId: string): APMSpan[] {
    const transaction = this.transactions.get(transactionId);
    return transaction ? transaction.spans : [];
  }

  /**
   * Get span statistics
   */
  getSpanStats(): {
    total: number;
    active: number;
    completed: number;
    averageDuration: number;
  } {
    let total = 0;
    let active = 0;
    let completed = 0;
    let totalDuration = 0;
    
    for (const transaction of this.transactions.values()) {
      for (const span of transaction.spans) {
        total++;
        if (span.endTime) {
          completed++;
          totalDuration += span.duration || 0;
        } else {
          active++;
        }
      }
    }
    
    return {
      total,
      active,
      completed,
      averageDuration: completed > 0 ? totalDuration / completed : 0
    };
  }
}
