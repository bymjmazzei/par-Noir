import { cryptoWorkerManager } from './cryptoWorkerManager';
// Error Analyzer - Handles error analysis, severity determination, and sanitization
import { ErrorContext, ErrorHandlerConfig } from '../types/errorHandler';

export class ErrorAnalyzer {
  private config: ErrorHandlerConfig;

  constructor(config: ErrorHandlerConfig) {
    this.config = config;
  }

  /**
   * Determine error severity
   */
  determineSeverity(message: string, _context: Partial<ErrorContext>): 'low' | 'medium' | 'high' | 'critical' {
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
  sanitizeMessage(message: string): string {
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
  buildContext(context: Partial<ErrorContext>, stack?: string): ErrorContext {
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
  sanitizeMetadata(context: Partial<ErrorContext>): any {
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
}
