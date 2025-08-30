interface ErrorEvent {
  message: string;
  stack?: string;
  componentStack?: string;
  timestamp: Date;
  userAgent: string;
  url: string;
  userId?: string;
  sessionId?: string;
}

class ErrorMonitor {
  private errors: ErrorEvent[] = [];
  private maxErrors = 100;
  private isProduction = process.env.NODE_ENV === 'production';

  constructor() {
    this.setupGlobalErrorHandling();
  }

  private setupGlobalErrorHandling() {
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.captureError(new Error(event.reason), 'Unhandled Promise Rejection');
    });

    // Handle JavaScript errors
    window.addEventListener('error', (event) => {
      this.captureError(event.error || new Error(event.message), 'JavaScript Error');
    });
  }

  public captureError(error: Error, _context?: string): void {
    const errorEvent: ErrorEvent = {
      message: error.message,
      stack: error.stack,
      timestamp: new Date(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      userId: this.getUserId(),
      sessionId: this.getSessionId(),
    };

    // Add to local storage for debugging
    this.errors.push(errorEvent);
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    if (process.env.NODE_ENV === 'development') {
    }

    // Send to monitoring service in production
    if (this.isProduction) {
      this.sendToMonitoringService(errorEvent);
    }

    // Store in localStorage for persistence
    this.persistErrors();
  }

  private getUserId(): string | undefined {
    // Get user ID from secure storage if available
    try {
      const userData = localStorage.getItem('identity_user');
      if (userData) {
        const user = JSON.parse(userData);
        return user.id;
      }
    } catch (error) {
      // Ignore parsing errors
    }
    return undefined;
  }

  private getSessionId(): string {
    let sessionId = sessionStorage.getItem('session_id');
    if (!sessionId) {
      sessionId = this.generateSessionId();
      sessionStorage.setItem('session_id', sessionId);
    }
    return sessionId;
  }

  private generateSessionId(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  private async sendToMonitoringService(_errorEvent: ErrorEvent): Promise<void> {
    try {
      // In production, this would send to a real monitoring service
      if (process.env.NODE_ENV === 'development') {
      }
      
      // Example: Send to monitoring service
      // await fetch('/api/errors', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(errorEvent)
      // });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
      }
    }
  }

  private persistErrors(): void {
    try {
      localStorage.setItem('error_log', JSON.stringify(this.errors));
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
      }
    }
  }

  public getErrors(): ErrorEvent[] {
    return [...this.errors];
  }

  public clearErrors(): void {
    this.errors = [];
    localStorage.removeItem('error_log');
  }

  public getErrorStats(): {
    total: number;
    last24Hours: number;
    last7Days: number;
    byType: Record<string, number>;
  } {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const last24Hours = this.errors.filter(e => e.timestamp > oneDayAgo).length;
    const last7Days = this.errors.filter(e => e.timestamp > sevenDaysAgo).length;

    const byType: Record<string, number> = {};
    this.errors.forEach(error => {
      const type = error.message.split(':')[0] || 'Unknown';
      byType[type] = (byType[type] || 0) + 1;
    });

    return {
      total: this.errors.length,
      last24Hours,
      last7Days,
      byType,
    };
  }

  public exportErrorLog(): string {
    return JSON.stringify({
      errors: this.errors,
      stats: this.getErrorStats(),
      exportTime: new Date().toISOString(),
    }, null, 2);
  }
}

// Create singleton instance
export const errorMonitor = new ErrorMonitor();

// Export for use in components
export const captureError = (error: Error, context?: string) => {
  errorMonitor.captureError(error, context);
}; 