/**
 * Sentry Error Tracking Service Integration
 * Provides comprehensive error tracking and monitoring
 */

export interface SentryConfig {
  dsn: string;
  environment: string;
  release: string;
  enabled: boolean;
  debug: boolean;
  tracesSampleRate: number;
  profilesSampleRate: number;
  integrations: string[];
}

export interface SentryEvent {
  message: string;
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  tags?: Record<string, string>;
  extra?: Record<string, any>;
  user?: {
    id?: string;
    email?: string;
    username?: string;
    ip_address?: string;
  };
  contexts?: {
    app?: {
      name: string;
      version: string;
    };
    device?: {
      name: string;
      version: string;
    };
    os?: {
      name: string;
      version: string;
    };
    runtime?: {
      name: string;
      version: string;
    };
  };
  breadcrumbs?: SentryBreadcrumb[];
}

export interface SentryBreadcrumb {
  message: string;
  category: string;
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  data?: Record<string, any>;
  timestamp?: number;
}

export interface SentryPerformance {
  name: string;
  op: string;
  description?: string;
  startTimestamp: number;
  endTimestamp: number;
  tags?: Record<string, string>;
  data?: Record<string, any>;
}

export interface SentryUser {
  id: string;
  email?: string;
  username?: string;
  ip_address?: string;
  segment?: string;
}

export class SentryService {
  private config: SentryConfig;
  private isInitialized = false;
  private user: SentryUser | null = null;
  private breadcrumbs: SentryBreadcrumb[] = [];
  private performanceSpans: Map<string, SentryPerformance> = new Map();

  constructor(config: SentryConfig) {
    this.config = config;
  }

  /**
   * Initialize Sentry
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      console.log('Sentry is disabled');
      return;
    }

    try {
      // In production, this would use the Sentry SDK
      // For now, we'll simulate the connection
      await this.simulateSentryConnection();
      
      this.isInitialized = true;
      console.log('Sentry initialized successfully');
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
    const success = Math.random() > 0.1; // 90% success rate
    
    if (!success) {
      throw new Error('Failed to connect to Sentry');
    }
  }

  /**
   * Capture exception
   */
  async captureException(error: Error, context?: Partial<SentryEvent>): Promise<string> {
    if (!this.isInitialized) {
      console.error('Sentry not initialized, logging error:', error);
      return 'sentry_disabled';
    }

    // SECURITY: Sanitize error data before sending
    const sanitizedError = this.sanitizeErrorData(error, context);

    const event: SentryEvent = {
      message: sanitizedError.message,
      level: 'error',
      tags: {
        type: 'exception',
        ...sanitizedError.tags
      },
      extra: sanitizedError.extra,
      user: sanitizedError.user,
      contexts: {
        app: {
          name: 'Identity Protocol',
          version: this.config.release
        },
        device: {
          name: 'web',
          version: '[REDACTED]' // Don't send user agent
        },
        os: {
          name: 'web',
          version: '[REDACTED]' // Don't send platform info
        },
        runtime: {
          name: 'javascript',
          version: '1.0'
        }
      },
      breadcrumbs: [] // Don't send breadcrumbs for security
    };

    return this.sendEvent(event);
  }

  /**
   * Capture message
   */
  async captureMessage(
    message: string,
    level: SentryEvent['level'] = 'info',
    context?: Partial<SentryEvent>
  ): Promise<string> {
    if (!this.isInitialized) {
      console.log(`Sentry not initialized, logging message: ${message}`);
      return 'sentry_disabled';
    }

    // SECURITY: Sanitize message data before sending
    const sanitizedMessage = this.sanitizeMessageData(message, context);

    const event: SentryEvent = {
      message: sanitizedMessage.message,
      level,
      tags: {
        type: 'message',
        ...sanitizedMessage.tags
      },
      extra: sanitizedMessage.extra,
      user: sanitizedMessage.user,
      contexts: {
        app: {
          name: 'Identity Protocol',
          version: this.config.release
        }
      },
      breadcrumbs: [] // Don't send breadcrumbs for security
    };

    return this.sendEvent(event);
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
  addBreadcrumb(breadcrumb: SentryBreadcrumb): void {
    this.breadcrumbs.push({
      ...breadcrumb,
      timestamp: breadcrumb.timestamp || Date.now()
    });

    // Keep only last 100 breadcrumbs
    if (this.breadcrumbs.length > 100) {
      this.breadcrumbs = this.breadcrumbs.slice(-100);
    }
  }

  /**
   * Clear breadcrumbs
   */
  clearBreadcrumbs(): void {
    this.breadcrumbs = [];
  }

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
  finishSpan(spanId: string, tags?: Record<string, string>, data?: Record<string, any>): void {
    const span = this.performanceSpans.get(spanId);
    if (!span) {
      return;
    }

    span.endTimestamp = Date.now();
    if (tags) {
      span.tags = { ...span.tags, ...tags };
    }
    if (data) {
      span.data = { ...span.data, ...data };
    }

    // Send performance data
    this.sendPerformanceData(span);
    
    // Remove span from map
    this.performanceSpans.delete(spanId);
  }

  /**
   * Set tag
   */
  setTag(key: string, value: string): void {
    // In production, this would set a global tag
    console.log(`Sentry tag set: ${key} = ${value}`);
  }

  /**
   * Set extra data
   */
  setExtra(key: string, value: any): void {
    // In production, this would set global extra data
    console.log(`Sentry extra set: ${key} = ${value}`);
  }

  /**
   * Set context
   */
  setContext(name: string, context: Record<string, any>): void {
    // In production, this would set global context
    console.log(`Sentry context set: ${name}`, context);
  }

  /**
   * Capture security event
   */
  async captureSecurityEvent(
    event: string,
    details: Record<string, any>,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ): Promise<string> {
    return this.captureMessage(
      `Security Event: ${event}`,
      severity === 'critical' ? 'fatal' : severity === 'high' ? 'error' : 'warning',
      {
        tags: {
          type: 'security',
          event,
          severity
        },
        extra: details
      }
    );
  }

  /**
   * Capture authentication event
   */
  async captureAuthEvent(
    event: 'login' | 'logout' | 'register' | 'password_reset' | 'failed_login',
    userId: string,
    details?: Record<string, any>
  ): Promise<string> {
    return this.captureMessage(
      `Authentication Event: ${event}`,
      'info',
      {
        tags: {
          type: 'authentication',
          event
        },
        extra: {
          userId,
          ...details
        }
      }
    );
  }

  /**
   * Capture DID operation
   */
  async captureDIDOperation(
    operation: 'create' | 'update' | 'delete' | 'resolve' | 'verify',
    didId: string,
    success: boolean,
    details?: Record<string, any>
  ): Promise<string> {
    return this.captureMessage(
      `DID Operation: ${operation}`,
      success ? 'info' : 'error',
      {
        tags: {
          type: 'did_operation',
          operation,
          success: success.toString()
        },
        extra: {
          didId,
          ...details
        }
      }
    );
  }

  /**
   * Send event to Sentry
   */
  private async sendEvent(event: SentryEvent): Promise<string> {
    try {
      // In production, this would send to Sentry API
      const eventId = this.generateEventId();
      
      // Simulate sending
      await this.simulateEventSending(event);

      if (this.config.debug) {
        console.log('Sentry event sent:', event);
      }

      return eventId;
    } catch (error) {
      console.error('Failed to send Sentry event:', error);
      return 'send_failed';
    }
  }

  /**
   * Send performance data
   */
  private async sendPerformanceData(span: SentryPerformance): Promise<void> {
    try {
      // In production, this would send performance data to Sentry
      await this.simulatePerformanceSending(span);

      if (this.config.debug) {
        console.log('Sentry performance data sent:', span);
      }
    } catch (error) {
      console.error('Failed to send Sentry performance data:', error);
    }
  }

  /**
   * Simulate event sending
   */
  private async simulateEventSending(event: SentryEvent): Promise<void> {
    // Simulate sending delay
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Simulate success/failure
    const success = Math.random() > 0.05; // 95% success rate
    
    if (!success) {
      throw new Error('Failed to send event to Sentry');
    }
  }

  /**
   * Simulate performance data sending
   */
  private async simulatePerformanceSending(span: SentryPerformance): Promise<void> {
    // Simulate sending delay
    await new Promise(resolve => setTimeout(resolve, 30));
    
    // Simulate success/failure
    const success = Math.random() > 0.05; // 95% success rate
    
    if (!success) {
      throw new Error('Failed to send performance data to Sentry');
    }
  }

  /**
   * SECURITY: Sanitize error data before sending to Sentry
   */
  private sanitizeErrorData(error: Error, context?: Partial<SentryEvent>): {
    message: string;
    tags: Record<string, string>;
    extra: Record<string, any>;
    user: any;
  } {
    // List of sensitive patterns to filter out
    const sensitivePatterns = [
      /password/i,
      /token/i,
      /key/i,
      /secret/i,
      /private.*key/i,
      /mnemonic/i,
      /seed.*phrase/i,
      /did.*document/i,
      /crypto.*key/i,
      /encryption.*key/i,
      /jwt.*secret/i,
      /api.*key/i,
      /auth.*token/i,
      /session.*secret/i
    ];

    // Sanitize error message
    let sanitizedMessage = error.message;
    sensitivePatterns.forEach(pattern => {
      sanitizedMessage = sanitizedMessage.replace(pattern, '[REDACTED]');
    });

    // Sanitize stack trace
    let sanitizedStack = error.stack;
    if (sanitizedStack) {
      sensitivePatterns.forEach(pattern => {
        sanitizedStack = sanitizedStack!.replace(pattern, '[REDACTED]');
      });
    }

    // Sanitize extra data
    const sanitizedExtra: Record<string, any> = {};
    if (context?.extra) {
      Object.entries(context.extra).forEach(([key, value]) => {
        const stringValue = String(value);
        let sanitizedValue = stringValue;
        
        sensitivePatterns.forEach(pattern => {
          sanitizedValue = sanitizedValue.replace(pattern, '[REDACTED]');
        });
        
        sanitizedExtra[key] = sanitizedValue;
      });
    }

    // Sanitize user data - only send anonymous ID
    const sanitizedUser = this.user ? {
      id: this.user.id ? `user_${this.user.id.slice(0, 8)}` : undefined,
      email: undefined, // Never send email
      username: undefined, // Never send username
      ip_address: undefined // Never send IP
    } : undefined;

    return {
      message: sanitizedMessage,
      tags: context?.tags || {},
      extra: {
        stack: sanitizedStack,
        ...sanitizedExtra
      },
      user: sanitizedUser
    };
  }

  /**
   * SECURITY: Sanitize message data before sending to Sentry
   */
  private sanitizeMessageData(message: string, context?: Partial<SentryEvent>): {
    message: string;
    tags: Record<string, string>;
    extra: Record<string, any>;
    user: any;
  } {
    // List of sensitive patterns to filter out
    const sensitivePatterns = [
      /password/i,
      /token/i,
      /key/i,
      /secret/i,
      /private.*key/i,
      /mnemonic/i,
      /seed.*phrase/i,
      /did.*document/i,
      /crypto.*key/i,
      /encryption.*key/i,
      /jwt.*secret/i,
      /api.*key/i,
      /auth.*token/i,
      /session.*secret/i
    ];

    // Sanitize message
    let sanitizedMessage = message;
    sensitivePatterns.forEach(pattern => {
      sanitizedMessage = sanitizedMessage.replace(pattern, '[REDACTED]');
    });

    // Sanitize extra data
    const sanitizedExtra: Record<string, any> = {};
    if (context?.extra) {
      Object.entries(context.extra).forEach(([key, value]) => {
        const stringValue = String(value);
        let sanitizedValue = stringValue;
        
        sensitivePatterns.forEach(pattern => {
          sanitizedValue = sanitizedValue.replace(pattern, '[REDACTED]');
        });
        
        sanitizedExtra[key] = sanitizedValue;
      });
    }

    // Sanitize user data - only send anonymous ID
    const sanitizedUser = this.user ? {
      id: this.user.id ? `user_${this.user.id.slice(0, 8)}` : undefined,
      email: undefined, // Never send email
      username: undefined, // Never send username
      ip_address: undefined // Never send IP
    } : undefined;

    return {
      message: sanitizedMessage,
      tags: context?.tags || {},
      extra: sanitizedExtra,
      user: sanitizedUser
    };
  }

  /**
   * Generate event ID
   */
  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
  getBreadcrumbs(): SentryBreadcrumb[] {
    return [...this.breadcrumbs];
  }

  /**
   * Get active spans
   */
  getActiveSpans(): Map<string, SentryPerformance> {
    return new Map(this.performanceSpans);
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
