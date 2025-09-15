import { APMError, APMContext } from '../types/apm';
// import { SecureRandom } from '../../../utils/secureRandom';

export class ErrorManager {
  private errors: APMError[] = [];
  private maxErrors: number = 1000;

  /**
   * Capture an error
   */
  captureError(
    error: Error,
    transactionId?: string,
    spanId?: string,
    context?: APMContext
  ): string {
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const apmError: APMError = {
      id: errorId,
      transactionId,
      spanId,
      timestamp: Date.now(),
      culprit: this.extractCulprit(error),
      exception: {
        type: error.constructor.name,
        message: error.message,
        stacktrace: this.parseStacktrace(error.stack)
      },
      context
    };

    this.errors.push(apmError);
    
    // Maintain max error limit
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors);
    }

    return errorId;
  }

  /**
   * Get error by ID
   */
  getError(errorId: string): APMError | undefined {
    return this.errors.find(error => error.id === errorId);
  }

  /**
   * Get all errors
   */
  getErrors(): APMError[] {
    return [...this.errors];
  }

  /**
   * Get errors by filter
   */
  getErrorsByFilter(filter: {
    transactionId?: string;
    spanId?: string;
    type?: string;
    user?: string;
    timeRange?: {
      start: number;
      end: number;
    };
  }): APMError[] {
    return this.errors.filter(error => {
      let matches = true;
      
      if (filter.transactionId && error.transactionId !== filter.transactionId) {
        matches = false;
      }
      
      if (filter.spanId && error.spanId !== filter.spanId) {
        matches = false;
      }
      
      if (filter.type && error.exception.type !== filter.type) {
        matches = false;
      }
      
      if (filter.user && error.context?.user?.id !== filter.user) {
        matches = false;
      }
      
      if (filter.timeRange) {
        if (error.timestamp < filter.timeRange.start || error.timestamp > filter.timeRange.end) {
          matches = false;
        }
      }
      
      return matches;
    });
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    total: number;
    unhandled: number;
    handled: number;
    byType: Record<string, number>;
    byTransaction: Record<string, number>;
  } {
    const stats = {
      total: this.errors.length,
      unhandled: 0,
      handled: 0,
      byType: {} as Record<string, number>,
      byTransaction: {} as Record<string, number>
    };

    for (const error of this.errors) {
      // Count by type
      const type = error.exception.type;
      stats.byType[type] = (stats.byType[type] || 0) + 1;
      
      // Count by transaction
      if (error.transactionId) {
        stats.byTransaction[error.transactionId] = (stats.byTransaction[error.transactionId] || 0) + 1;
      }
      
      // Determine if handled (simplified logic)
      if (error.context?.tags?.handled === 'true') {
        stats.handled++;
      } else {
        stats.unhandled++;
      }
    }

    return stats;
  }

  /**
   * Mark error as handled
   */
  markErrorAsHandled(errorId: string): boolean {
    const error = this.getError(errorId);
    if (error) {
      if (!error.context) {
        error.context = {};
      }
      if (!error.context.tags) {
        error.context.tags = {};
      }
      error.context.tags.handled = 'true';
      return true;
    }
    return false;
  }

  /**
   * Add context to error
   */
  addErrorContext(errorId: string, context: APMContext): boolean {
    const error = this.getError(errorId);
    if (error) {
      error.context = { ...error.context, ...context };
      return true;
    }
    return false;
  }

  /**
   * Add tags to error
   */
  addErrorTags(errorId: string, tags: Record<string, string>): boolean {
    const error = this.getError(errorId);
    if (error) {
      if (!error.context) {
        error.context = {};
      }
      if (!error.context.tags) {
        error.context.tags = {};
      }
      error.context.tags = { ...error.context.tags, ...tags };
      return true;
    }
    return false;
  }

  /**
   * Clear all errors
   */
  clearErrors(): void {
    this.errors = [];
  }

  /**
   * Clear errors by filter
   */
  clearErrorsByFilter(filter: {
    transactionId?: string;
    spanId?: string;
    type?: string;
    user?: string;
    timeRange?: {
      start: number;
      end: number;
    };
  }): number {
    const initialCount = this.errors.length;
    this.errors = this.errors.filter(error => {
      let matches = true;
      
      if (filter.transactionId && error.transactionId === filter.transactionId) {
        matches = false;
      }
      
      if (filter.spanId && error.spanId === filter.spanId) {
        matches = false;
      }
      
      if (filter.type && error.exception.type === filter.type) {
        matches = false;
      }
      
      if (filter.user && error.context?.user?.id === filter.user) {
        matches = false;
      }
      
      if (filter.timeRange) {
        if (error.timestamp >= filter.timeRange.start && error.timestamp <= filter.timeRange.end) {
          matches = false;
        }
      }
      
      return matches;
    });
    
    return initialCount - this.errors.length;
  }

  /**
   * Get error count
   */
  getErrorCount(): number {
    return this.errors.length;
  }

  /**
   * Set maximum error limit
   */
  setMaxErrors(maxErrors: number): void {
    this.maxErrors = maxErrors;
    
    // Trim if current count exceeds new limit
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors);
    }
  }

  /**
   * Get maximum error limit
   */
  getMaxErrors(): number {
    return this.maxErrors;
  }

  /**
   * Extract culprit from error stack
   */
  private extractCulprit(error: Error): string {
    if (error.stack) {
      const lines = error.stack.split('\n');
      // Look for the first line that contains a file path (not node_modules)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.includes('(') && !line.includes('node_modules')) {
          return line;
        }
      }
    }
    return error.message;
  }

  /**
   * Parse stacktrace into array
   */
  private parseStacktrace(stack?: string): string[] {
    if (!stack) {
      return [];
    }
    
    return stack
      .split('\n')
      .slice(1) // Skip first line (error message)
      .map(line => line.trim())
      .filter(line => line.length > 0);
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit: number = 10): APMError[] {
    return this.errors.slice(-limit);
  }

  /**
   * Get errors by time range
   */
  getErrorsByTimeRange(start: number, end: number): APMError[] {
    return this.errors.filter(error => 
      error.timestamp >= start && error.timestamp <= end
    );
  }

  /**
   * Get error rate over time
   */
  getErrorRate(interval: number = 60000): Record<string, number> {
    const now = Date.now();
    const rates: Record<string, number> = {};
    
    for (const error of this.errors) {
      const timeSlot = Math.floor(error.timestamp / interval) * interval;
      const timeKey = new Date(timeSlot).toISOString();
      rates[timeKey] = (rates[timeKey] || 0) + 1;
    }
    
    return rates;
  }
}
