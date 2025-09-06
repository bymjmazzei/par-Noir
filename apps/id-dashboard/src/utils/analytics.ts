export interface AnalyticsEvent {
  event: string;
  category: string;
  action: string;
  label?: string;
  value?: number;
  timestamp: number;
  sessionId: string;
  userId?: string;
}

export interface ErrorEvent {
  error: string;
  message: string;
  stack?: string;
  component?: string;
  userId?: string;
  timestamp: number;
  sessionId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface PerformanceMetric {
  metric: string;
  value: number;
  unit: string;
  timestamp: number;
  sessionId: string;
}

export class PrivacyAnalytics {
  private static instance: PrivacyAnalytics;
  private events: AnalyticsEvent[] = [];
  private errors: ErrorEvent[] = [];
  private performance: PerformanceMetric[] = [];
  private sessionId: string;
  private isEnabled: boolean = false;
  private maxStorageSize = 1000; // Max events to store locally
  // private isInitialized: boolean = false;

  static getInstance(): PrivacyAnalytics {
    if (!PrivacyAnalytics.instance) {
      PrivacyAnalytics.instance = new PrivacyAnalytics();
    }
    return PrivacyAnalytics.instance;
  }

  constructor() {
    this.sessionId = this.generateSessionId();
    this.loadSettings();
    this.startPerformanceMonitoring();
  }

  /**
   * Initialize analytics
   */
  async initialize(): Promise<void> {
    try {
      // this.isInitialized = true;
      this.startSession();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
      }
    }
  }

  /**
   * Enable analytics with user consent
   */
  enable(): void {
    this.isEnabled = true;
    localStorage.setItem('analytics_consent', 'true');
    this.startSession();
  }

  /**
   * Disable analytics
   */
  disable(): void {
    this.isEnabled = false;
    localStorage.setItem('analytics_consent', 'false');
    this.clearData();
  }

  /**
   * Track user event
   */
  trackEvent(category: string, action: string, label?: string, value?: number): void {
    if (!this.isEnabled) return;

    const event: AnalyticsEvent = {
      event: 'user_action',
      category,
      action,
      label,
      value,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      userId: this.getUserId()
    };

    this.events.push(event);
    this.saveEvents();
    this.checkStorageLimit();
  }

  /**
   * Track page view
   */
  trackPageView(page: string): void {
    this.trackEvent('navigation', 'page_view', page);
  }

  /**
   * Track feature usage
   */
  trackFeatureUsage(feature: string, action: string): void {
    this.trackEvent('feature', action, feature);
  }

  /**
   * Track error
   */
  trackError(error: Error, component?: string, severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'): void {
    const errorEvent: ErrorEvent = {
      error: error.name,
      message: error.message,
      stack: error.stack,
      component,
      userId: this.getUserId(),
      timestamp: Date.now(),
      sessionId: this.sessionId,
      severity
    };

    this.errors.push(errorEvent);
    this.saveErrors();
    
    if (severity === 'critical' && process.env.NODE_ENV === 'development') {
    }
  }

  /**
   * Track performance metric
   */
  trackPerformance(metric: string, value: number, unit: string = 'ms'): void {
    const performanceMetric: PerformanceMetric = {
      metric,
      value,
      unit,
      timestamp: Date.now(),
      sessionId: this.sessionId
    };

    this.performance.push(performanceMetric);
    this.savePerformance();
  }

  /**
   * Get analytics data
   */
  getAnalyticsData(): {
    events: AnalyticsEvent[];
    errors: ErrorEvent[];
    performance: PerformanceMetric[];
    sessionId: string;
    isEnabled: boolean;
  } {
    return {
      events: this.events,
      errors: this.errors,
      performance: this.performance,
      sessionId: this.sessionId,
      isEnabled: this.isEnabled
    };
  }

  /**
   * Export analytics data
   */
  exportData(): string {
    const data = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      events: this.events,
      errors: this.errors,
      performance: this.performance
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Clear all analytics data
   */
  clearData(): void {
    this.events = [];
    this.errors = [];
    this.performance = [];
    this.saveEvents();
    this.saveErrors();
    this.savePerformance();
  }

  /**
   * Get analytics summary
   */
  getSummary(): {
    totalEvents: number;
    totalErrors: number;
    totalPerformanceMetrics: number;
    sessionDuration: number;
    isEnabled: boolean;
  } {
    const now = Date.now();
    const sessionStart = this.getSessionStart();
    const sessionDuration = now - sessionStart;

    return {
      totalEvents: this.events.length,
      totalErrors: this.errors.length,
      totalPerformanceMetrics: this.performance.length,
      sessionDuration,
      isEnabled: this.isEnabled
    };
  }

  /**
   * Start performance monitoring
   */
  private startPerformanceMonitoring(): void {
    if (typeof window !== 'undefined') {
      // Monitor page load performance
      window.addEventListener('load', () => {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (navigation) {
          this.trackPerformance('page_load_time', navigation.loadEventEnd - navigation.loadEventStart);
          this.trackPerformance('dom_content_loaded', navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart);
        }
      });

      // Monitor memory usage
      if ('memory' in performance) {
        setInterval(() => {
          const memory = (performance as any).memory;
          this.trackPerformance('memory_usage', memory.usedJSHeapSize, 'bytes');
        }, 30000); // Every 30 seconds
      }
    }
  }

  /**
   * Start new session
   */
  private startSession(): void {
    this.sessionId = this.generateSessionId();
    localStorage.setItem('analytics_session_start', Date.now().toString());
    this.trackEvent('session', 'start');
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Get user ID from storage
   */
  private getUserId(): string | undefined {
    return localStorage.getItem('user_id') || undefined;
  }

  /**
   * Get session start time
   */
  private getSessionStart(): number {
    const start = localStorage.getItem('analytics_session_start');
    return start ? parseInt(start) : Date.now();
  }

  /**
   * Load settings from localStorage
   */
  private loadSettings(): void {
    try {
      const events = localStorage.getItem('analytics_events');
      const errors = localStorage.getItem('analytics_errors');
      const performance = localStorage.getItem('analytics_performance');

      if (events) this.events = JSON.parse(events);
      if (errors) this.errors = JSON.parse(errors);
      if (performance) this.performance = JSON.parse(performance);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
      }
    }
  }

  /**
   * Save events to localStorage
   */
  private saveEvents(): void {
    try {
      localStorage.setItem('analytics_events', JSON.stringify(this.events));
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
      }
    }
  }

  /**
   * Save errors to localStorage
   */
  private saveErrors(): void {
    try {
      localStorage.setItem('analytics_errors', JSON.stringify(this.errors));
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
      }
    }
  }

  /**
   * Save performance data to localStorage
   */
  private savePerformance(): void {
    try {
      localStorage.setItem('analytics_performance', JSON.stringify(this.performance));
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
      }
    }
  }

  /**
   * Check storage limit and clean old data
   */
  private checkStorageLimit(): void {
    if (this.events.length > this.maxStorageSize) {
      // Remove oldest events
      this.events = this.events.slice(-this.maxStorageSize / 2);
      this.saveEvents();
    }
  }
}

// Export singleton instance
export const analytics = PrivacyAnalytics.getInstance(); 