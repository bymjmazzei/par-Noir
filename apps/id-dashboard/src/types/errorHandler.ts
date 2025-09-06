// Error Handler Types and Interfaces
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
