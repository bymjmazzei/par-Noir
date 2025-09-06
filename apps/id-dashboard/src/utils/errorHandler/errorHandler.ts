// Main ErrorHandler Class - Maintains backward compatibility while using modular components
import { ErrorHandlerConfig, ErrorEvent } from '../types/errorHandler';
import { ErrorInitializer } from './errorInitializer';
import { ErrorProcessor } from './errorProcessor';
import { ErrorLogger } from './errorLogger';
import { ErrorStorage } from './errorStorage';
import { ErrorTracker } from './errorTracker';
import { ErrorAnalyzer } from './errorAnalyzer';
import { FunctionWrapper } from './functionWrapper';

export class ErrorHandler {
  private static instance: ErrorHandler;
  private processor: ErrorProcessor;
  private storage: ErrorStorage;
  private config: ErrorHandlerConfig;
  private errorCount = 0;

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

    // Initialize components
    const logger = new ErrorLogger(this.config);
    this.storage = new ErrorStorage(this.config);
    const tracker = new ErrorTracker(this.config);
    const analyzer = new ErrorAnalyzer(this.config);
    this.processor = new ErrorProcessor(logger, this.storage, tracker, analyzer);

    // Initialize error handling
    const initializer = new ErrorInitializer(this.config);
    initializer.initialize();
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
   * Handle error with context
   */
  handleError(error: Error | string, context: Partial<ErrorContext> = {}): void {
    this.processor.handleError(error, context);
    this.errorCount++;
  }

  /**
   * Handle warning with context
   */
  handleWarning(message: string, context: Partial<ErrorContext> = {}): void {
    this.processor.handleWarning(message, context);
  }

  /**
   * Handle info message with context
   */
  handleInfo(message: string, context: Partial<ErrorContext> = {}): void {
    this.processor.handleInfo(message, context);
  }

  /**
   * Get all errors
   */
  getErrors(): ErrorEvent[] {
    return this.storage.getErrors();
  }

  /**
   * Get errors by severity
   */
  getErrorsBySeverity(severity: 'low' | 'medium' | 'high' | 'critical'): ErrorEvent[] {
    return this.storage.getErrorsBySeverity(severity);
  }

  /**
   * Get errors by component
   */
  getErrorsByComponent(component: string): ErrorEvent[] {
    return this.storage.getErrorsByComponent(component);
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
    this.storage.resolveError(errorId);
  }

  /**
   * Clear all errors
   */
  clearErrors(): void {
    this.storage.clearErrors();
    this.errorCount = 0;
  }

  /**
   * Get error statistics
   */
  getErrorStats() {
    return this.storage.getErrorStats();
  }

  /**
   * Create a wrapped function with error handling
   */
  wrapFunction<T extends (...args: any[]) => any>(
    fn: T,
    context: Partial<ErrorContext>
  ): (...args: Parameters<T>) => ReturnType<T> {
    return FunctionWrapper.wrapFunction(fn, context, this.handleError.bind(this));
  }

  /**
   * Create a wrapped async function with error handling
   */
  wrapAsyncFunction<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    context: Partial<ErrorContext>
  ): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>> {
    return FunctionWrapper.wrapAsyncFunction(fn, context, this.handleError.bind(this));
  }
}
