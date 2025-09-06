/**
 * Comprehensive Error Handling and Logging System
 * Provides consistent error handling across the Identity Protocol
 */

export interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  sessionId?: string;
  timestamp: string;
  userAgent: string;
  url: string;
  stack?: string;
}

export interface ErrorEvent {
  id: string;
  type: 'error' | 'warning' | 'info';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  context: ErrorContext;
  metadata?: any;
  resolved: boolean;
  createdAt: string;
  resolvedAt?: string;
}

export interface ErrorHandlerConfig {
  enableConsoleLogging: boolean;
  enableRemoteLogging: boolean;
  enableErrorTracking: boolean;
  maxErrors: number;
  errorRetentionDays: number;
  sensitiveDataPatterns: RegExp[];
}

export class ErrorHandler {
  private static instance: ErrorHandler;
  private errors: ErrorEvent[] = [];
  private config: ErrorHandlerConfig;
  private errorCount = 0;
  private isProduction: boolean;

  constructor(config: Partial<ErrorHandlerConfig> = {}) {
    this.config = {
      enableConsoleLogging: process.env.NODE_ENV === 'development',
      enableRemoteLogging: process.env.NODE_ENV === 'production',
      enableErrorTracking: true,
      maxErrors: 1000,
      errorRetentionDays: 30,
      sensitiveDataPatterns: [
        /password/gi,
        /passcode/gi,
        /privatekey/gi,
        /secret/gi,
        /token/gi,
        /key/gi
      ],
      ...config
    };

    this.isProduction = process.env.NODE_ENV === 'production';
    this.initialize();
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<ErrorHandlerConfig>): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler(config);
    }
    return ErrorHandler.instance;
  }

  /**
   * Initialize error handling
   */
  private initialize(): void {
    // Set up global error handlers
    this.setupGlobalErrorHandlers();
    
    // Set up unhandled promise rejection handler
    this.setupPromiseRejectionHandler();
    
    // Set up performance monitoring
    this.setupPerformanceMonitoring();
  }

  /**
   * Set up global error handlers
   */
  private setupGlobalErrorHandlers(): void {
    // Handle JavaScript errors
    window.addEventListener('error', (event) => {
      this.handleError(event.error || new Error(event.message), {
        component: 'global',
        action: 'javascript_error'
      });
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.handleError(new Error(event.reason), {
        component: 'global',
        action: 'unhandled_promise_rejection'
      });
    });
  }

  /**
   * Set up promise rejection handler
   */
  private setupPromiseRejectionHandler(): void {
    window.addEventListener('unhandledrejection', (event) => {
      event.preventDefault();
      this.handleError(new Error(event.reason), {
        component: 'global',
        action: 'promise_rejection'
      });
    });
  }

  /**
   * Set up performance monitoring
   */
  private setupPerformanceMonitoring(): void {
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'measure' && entry.duration > 1000) {
            this.handleWarning(`Performance issue: ${entry.name} took ${entry.duration}ms`, {
              component: 'performance',
              action: 'slow_operation',
              // metadata: { duration: entry.duration, name: entry.name }
            });
          }
        }
      });
      
      observer.observe({ entryTypes: ['measure'] });
    }
  }

  /**
   * Handle error with context
   */
  handleError(error: Error | string, context: Partial<ErrorContext> = {}): void {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const errorStack = error instanceof Error ? error.stack : undefined;

    const errorEvent: ErrorEvent = {
      id: this.generateErrorId(),
      type: 'error',
      severity: this.determineSeverity(errorMessage, context),
      message: this.sanitizeMessage(errorMessage),
      context: this.buildContext(context, errorStack),
      metadata: this.sanitizeMetadata(context),
      resolved: false,
      createdAt: new Date().toISOString()
    };

    this.logError(errorEvent);
    this.storeError(errorEvent);
    this.trackError(errorEvent);
  }

  /**
   * Handle warning with context
   */
  handleWarning(message: string, context: Partial<ErrorContext> = {}): void {
    const warningEvent: ErrorEvent = {
      id: this.generateErrorId(),
      type: 'warning',
      severity: 'medium',
      message: this.sanitizeMessage(message),
      context: this.buildContext(context),
      metadata: this.sanitizeMetadata(context),
      resolved: false,
      createdAt: new Date().toISOString()
    };

    this.logWarning(warningEvent);
    this.storeError(warningEvent);
  }

  /**
   * Handle info message with context
   */
  handleInfo(message: string, context: Partial<ErrorContext> = {}): void {
    const infoEvent: ErrorEvent = {
      id: this.generateErrorId(),
      type: 'info',
      severity: 'low',
      message: this.sanitizeMessage(message),
      context: this.buildContext(context),
      metadata: this.sanitizeMetadata(context),
      resolved: false,
      createdAt: new Date().toISOString()
    };

    this.logInfo(infoEvent);
    this.storeError(infoEvent);
  }

  /**
   * Log error to appropriate channels
   */
  private logError(errorEvent: ErrorEvent): void {
    if (this.config.enableConsoleLogging && !this.isProduction) {
    }

    if (this.config.enableRemoteLogging && this.isProduction) {
      this.sendToRemoteLogging(errorEvent);
    }
  }

  /**
   * Log warning to appropriate channels
   */
  private logWarning(warningEvent: ErrorEvent): void {
    if (this.config.enableConsoleLogging && !this.isProduction) {
    }
  }

  /**
   * Log info to appropriate channels
   */
  private logInfo(infoEvent: ErrorEvent): void {
    if (this.config.enableConsoleLogging && !this.isProduction) {
      console.info('Info:', infoEvent.message, infoEvent.context);
    }
  }

  /**
   * Store error in local storage
   */
  private storeError(errorEvent: ErrorEvent): void {
    this.errors.push(errorEvent);
    this.errorCount++;

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
   * Track error for analytics
   */
  private trackError(errorEvent: ErrorEvent): void {
    if (this.config.enableErrorTracking) {
      // Send to analytics service
      this.sendToAnalytics(errorEvent);
    }
  }

  /**
   * Determine error severity
   */
  private determineSeverity(message: string, _context: Partial<ErrorContext>): 'low' | 'medium' | 'high' | 'critical' {
    const criticalPatterns = [
      /authentication failed/i,
      /invalid signature/i,
      /cryptographic error/i,
      /security violation/i,
      /unauthorized access/i
    ];

    const highPatterns = [
      /network error/i,
      /timeout/i,
      /connection failed/i,
      /storage error/i,
      /database error/i
    ];

    const mediumPatterns = [
      /validation error/i,
      /format error/i,
      /parsing error/i,
      /invalid input/i
    ];

    if (criticalPatterns.some(pattern => pattern.test(message))) {
      return 'critical';
    }

    if (highPatterns.some(pattern => pattern.test(message))) {
      return 'high';
    }

    if (mediumPatterns.some(pattern => pattern.test(message))) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Sanitize error message
   */
  private sanitizeMessage(message: string): string {
    // Remove sensitive data patterns
    let sanitized = message;
    this.config.sensitiveDataPatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    });

    // Limit message length
    if (sanitized.length > 500) {
      sanitized = sanitized.substring(0, 500) + '...';
    }

    return sanitized;
  }

  /**
   * Build error context
   */
  private buildContext(context: Partial<ErrorContext>, stack?: string): ErrorContext {
    return {
      component: context.component || 'unknown',
      action: context.action || 'unknown',
      userId: context.userId || this.getUserId(),
      sessionId: context.sessionId || this.getSessionId(),
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      stack: stack
    };
  }

  /**
   * Sanitize metadata
   */
  private sanitizeMetadata(context: Partial<ErrorContext>): any {
    const metadata: any = {};

    // Only include safe metadata
    if (context.component) metadata.component = context.component;
    if (context.action) metadata.action = context.action;

    // Remove any sensitive data
    this.config.sensitiveDataPatterns.forEach(pattern => {
      Object.keys(metadata).forEach(key => {
        if (pattern.test(key) || (typeof metadata[key] === 'string' && pattern.test(metadata[key]))) {
          metadata[key] = '[REDACTED]';
        }
      });
    });

    return metadata;
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    return `error_${Date.now()}_${Array.from(crypto.getRandomValues(new Uint8Array(1)))[0] / 255.toString(36).substr(2, 9)}`;
  }

  /**
   * Get user ID from storage
   */
  private getUserId(): string | undefined {
    try {
      return localStorage.getItem('user_id') || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Get session ID from storage
   */
  private getSessionId(): string | undefined {
    try {
      return sessionStorage.getItem('session_id') || undefined;
    } catch {
      return undefined;
    }
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
      }
    }
  }

  /**
   * Load errors from localStorage
   */


  /**
   * Send error to remote logging service
   */
  private async sendToRemoteLogging(errorEvent: ErrorEvent): Promise<void> {
    try {
      // In production, this would send to a real logging service
      // For now, we'll simulate the API call
      await fetch('/api/errors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(errorEvent)
      });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
      }
    }
  }

  /**
   * Send error to analytics service
   */
  private async sendToAnalytics(errorEvent: ErrorEvent): Promise<void> {
    try {
      // In production, this would send to analytics service
      // For now, we'll simulate the API call
      await fetch('/api/analytics/error', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          errorId: errorEvent.id,
          type: errorEvent.type,
          severity: errorEvent.severity,
          component: errorEvent.context.component,
          action: errorEvent.context.action
        })
      });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
      }
    }
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
   * Get error count
   */
  getErrorCount(): number {
    return this.errorCount;
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
    this.errorCount = 0;
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
   * Create a wrapped function with error handling
   */
  wrapFunction<T extends (...args: any[]) => any>(
    fn: T,
    context: Partial<ErrorContext>
  ): (...args: Parameters<T>) => ReturnType<T> {
    return (...args: Parameters<T>): ReturnType<T> => {
      try {
        return fn(...args);
      } catch (error) {
        this.handleError(error instanceof Error ? error : new Error(String(error)), context);
        throw error;
      }
    };
  }

  /**
   * Create a wrapped async function with error handling
   */
  wrapAsyncFunction<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    context: Partial<ErrorContext>
  ): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>> {
    return async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
      try {
        return await fn(...args);
      } catch (error) {
        this.handleError(error instanceof Error ? error : new Error(String(error)), context);
        throw error;
      }
    };
  }
}

// Export singleton instance
export const errorHandler = ErrorHandler.getInstance();
