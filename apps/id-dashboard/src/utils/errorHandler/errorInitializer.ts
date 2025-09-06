// Error Initializer - Handles error handler initialization and setup
import { ErrorHandlerConfig } from '../types/errorHandler';

export class ErrorInitializer {
  private config: ErrorHandlerConfig;

  constructor(config: ErrorHandlerConfig) {
    this.config = config;
  }

  /**
   * Initialize error handling
   */
  initialize(): void {
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
      // This will be handled by the main ErrorHandler class
      // Console statement removed for production
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      // This will be handled by the main ErrorHandler class
      // Console statement removed for production
    });
  }

  /**
   * Set up promise rejection handler
   */
  private setupPromiseRejectionHandler(): void {
    window.addEventListener('unhandledrejection', (event) => {
      event.preventDefault();
      // This will be handled by the main ErrorHandler class
      // Console statement removed for production
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
            // This will be handled by the main ErrorHandler class
            // Console statement removed for production
          }
        }
      });
      
      observer.observe({ entryTypes: ['measure'] });
    }
  }
}
