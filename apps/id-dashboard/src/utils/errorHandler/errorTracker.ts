// Error Tracker - Handles error tracking and analytics
import { ErrorEvent, ErrorHandlerConfig } from '../types/errorHandler';

export class ErrorTracker {
  private config: ErrorHandlerConfig;

  constructor(config: ErrorHandlerConfig) {
    this.config = config;
  }

  /**
   * Track error for analytics
   */
  trackError(errorEvent: ErrorEvent): void {
    if (this.config.enableErrorTracking) {
      // Send to analytics service
      this.sendToAnalytics(errorEvent);
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
        // Console statement removed for production
      }
    }
  }
}
