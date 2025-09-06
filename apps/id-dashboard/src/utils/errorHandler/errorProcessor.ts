// Error Processing - Handles errors, warnings, and info messages
import { ErrorEvent, ErrorContext } from '../types/errorHandler';
import { ErrorLogger } from './errorLogger';
import { ErrorStorage } from './errorStorage';
import { ErrorTracker } from './errorTracker';
import { ErrorAnalyzer } from './errorAnalyzer';

export class ErrorProcessor {
  private logger: ErrorLogger;
  private storage: ErrorStorage;
  private tracker: ErrorTracker;
  private analyzer: ErrorAnalyzer;

  constructor(logger: ErrorLogger, storage: ErrorStorage, tracker: ErrorTracker, analyzer: ErrorAnalyzer) {
    this.logger = logger;
    this.storage = storage;
    this.tracker = tracker;
    this.analyzer = analyzer;
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
      severity: this.analyzer.determineSeverity(errorMessage, context),
      message: this.analyzer.sanitizeMessage(errorMessage),
      context: this.analyzer.buildContext(context, errorStack),
      metadata: this.analyzer.sanitizeMetadata(context),
      resolved: false,
      createdAt: new Date().toISOString()
    };

    this.logger.logError(errorEvent);
    this.storage.storeError(errorEvent);
    this.tracker.trackError(errorEvent);
  }

  /**
   * Handle warning with context
   */
  handleWarning(message: string, context: Partial<ErrorContext> = {}): void {
    const warningEvent: ErrorEvent = {
      id: this.generateErrorId(),
      type: 'warning',
      severity: 'medium',
      message: this.analyzer.sanitizeMessage(message),
      context: this.analyzer.buildContext(context),
      metadata: this.analyzer.sanitizeMetadata(context),
      resolved: false,
      createdAt: new Date().toISOString()
    };

    this.logger.logWarning(warningEvent);
    this.storage.storeError(warningEvent);
  }

  /**
   * Handle info message with context
   */
  handleInfo(message: string, context: Partial<ErrorContext> = {}): void {
    const infoEvent: ErrorEvent = {
      id: this.generateErrorId(),
      type: 'info',
      severity: 'low',
      message: this.analyzer.sanitizeMessage(message),
      context: this.analyzer.buildContext(context),
      metadata: this.analyzer.sanitizeMetadata(context),
      resolved: false,
      createdAt: new Date().toISOString()
    };

    this.logger.logInfo(infoEvent);
    this.storage.storeError(infoEvent);
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    return `error_${Date.now()}_${crypto.getRandomValues(new Uint8Array(1))[0] / 255.toString(36).substr(2, 9)}`;
  }
}
