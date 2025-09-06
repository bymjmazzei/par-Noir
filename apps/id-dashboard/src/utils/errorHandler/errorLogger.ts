// Error Logger - Handles logging to different channels
import { ErrorEvent } from '../types/errorHandler';
import { ErrorHandlerConfig } from '../types/errorHandler';

export class ErrorLogger {
  private config: ErrorHandlerConfig;
  private isProduction: boolean;

  constructor(config: ErrorHandlerConfig) {
    this.config = config;
    this.isProduction = process.env.NODE_ENV === 'production';
  }

  /**
   * Log error to appropriate channels
   */
  logError(errorEvent: ErrorEvent): void {
    if (this.config.enableConsoleLogging && !this.isProduction) {
      // Console statement removed for production
    }

    if (this.config.enableRemoteLogging && this.isProduction) {
      this.sendToRemoteLogging(errorEvent);
    }
  }

  /**
   * Log warning to appropriate channels
   */
  logWarning(warningEvent: ErrorEvent): void {
    if (this.config.enableConsoleLogging && !this.isProduction) {
      // Console statement removed for production
    }
  }

  /**
   * Log info to appropriate channels
   */
  logInfo(infoEvent: ErrorEvent): void {
    if (this.config.enableConsoleLogging && !this.isProduction) {
      // Console statement removed for production
    }
  }

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
        // Console statement removed for production
      }
    }
  }
}
