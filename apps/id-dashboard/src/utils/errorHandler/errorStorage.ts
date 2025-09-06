// Error Storage - Handles error storage and persistence
import { ErrorEvent, ErrorHandlerConfig } from '../types/errorHandler';

export class ErrorStorage {
  private errors: ErrorEvent[] = [];
  private config: ErrorHandlerConfig;

  constructor(config: ErrorHandlerConfig) {
    this.config = config;
    this.loadErrors();
  }

  /**
   * Store error in local storage
   */
  storeError(errorEvent: ErrorEvent): void {
    this.errors.push(errorEvent);

    // Limit the number of stored errors
    if (this.errors.length > this.config.maxErrors) {
      this.errors = this.errors.slice(-this.config.maxErrors);
    }

    // Clean up old errors
    this.cleanupOldErrors();

    // Store in localStorage for persistence
    this.persistErrors();
  }

  /**
   * Get all errors
   */
  getErrors(): ErrorEvent[] {
    return [...this.errors];
  }

  /**
   * Get errors by severity
   */
  getErrorsBySeverity(severity: 'low' | 'medium' | 'high' | 'critical'): ErrorEvent[] {
    return this.errors.filter(error => error.severity === severity);
  }

  /**
   * Get errors by component
   */
  getErrorsByComponent(component: string): ErrorEvent[] {
    return this.errors.filter(error => error.context.component === component);
  }

  /**
   * Mark error as resolved
   */
  resolveError(errorId: string): void {
    const error = this.errors.find(e => e.id === errorId);
    if (error) {
      error.resolved = true;
      error.resolvedAt = new Date().toISOString();
      this.persistErrors();
    }
  }

  /**
   * Clear all errors
   */
  clearErrors(): void {
    this.errors = [];
    try {
      localStorage.removeItem('error_log');
    } catch {
      // Silently handle localStorage errors
    }
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    total: number;
    resolved: number;
    unresolved: number;
    bySeverity: Record<string, number>;
    byComponent: Record<string, number>;
  } {
    const stats = {
      total: this.errors.length,
      resolved: this.errors.filter(e => e.resolved).length,
      unresolved: this.errors.filter(e => !e.resolved).length,
      bySeverity: {} as Record<string, number>,
      byComponent: {} as Record<string, number>
    };

    // Count by severity
    ['low', 'medium', 'high', 'critical'].forEach(severity => {
      stats.bySeverity[severity] = this.errors.filter(e => e.severity === severity).length;
    });

    // Count by component
    this.errors.forEach(error => {
      const component = error.context.component || 'unknown';
      stats.byComponent[component] = (stats.byComponent[component] || 0) + 1;
    });

    return stats;
  }

  /**
   * Clean up old errors
   */
  private cleanupOldErrors(): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.errorRetentionDays);

    this.errors = this.errors.filter(error => 
      new Date(error.createdAt) > cutoffDate
    );
  }

  /**
   * Persist errors to localStorage
   */
  private persistErrors(): void {
    try {
      const errorsToStore = this.errors.slice(-100); // Store only last 100 errors
      localStorage.setItem('error_log', JSON.stringify(errorsToStore));
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        // Console statement removed for production
      }
    }
  }

  /**
   * Load errors from localStorage
   */
  private loadErrors(): void {
    try {
      const storedErrors = localStorage.getItem('error_log');
      if (storedErrors) {
        this.errors = JSON.parse(storedErrors);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        // Console statement removed for production
      }
    }
  }
}
