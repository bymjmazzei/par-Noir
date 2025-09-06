import { SentryEvent, SentryContext, SentryError, SentryUser } from '../types/sentry';
// import { SecureRandom } from '../../../utils/secureRandom';

export class EventManager {
  private events: SentryEvent[] = [];
  private maxEvents: number = 1000;

  /**
   * Capture message event
   */
  captureMessage(
    message: string,
    level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info',
    context?: SentryContext
  ): string {
    const eventId = this.generateEventId();
    
    const event: SentryEvent = {
      message,
      level,
      tags: context?.tags || {},
      extra: context?.extra || {},
      user: context?.user || undefined,
      contexts: this.getDefaultContexts(),
      breadcrumbs: [] // Don't send breadcrumbs for security
    };

    this.events.push(event);
    return eventId;
  }

  /**
   * Capture error event
   */
  captureError(
    error: Error,
    context?: SentryContext
  ): string {
    const eventId = this.generateEventId();
    
    const event: SentryEvent = {
      message: error.message,
      level: 'error',
      tags: context?.tags || {},
      extra: context?.extra || {},
      user: context?.user || undefined,
      contexts: this.getDefaultContexts(),
      breadcrumbs: [] // Don't send breadcrumbs for security
    };

    this.events.push(event);
    return eventId;
  }

  /**
   * Capture exception event
   */
  captureException(
    exception: Error,
    context?: SentryContext
  ): string {
    const eventId = this.generateEventId();
    
    const event: SentryEvent = {
      message: exception.message,
      level: 'error',
      tags: context?.tags || {},
      extra: context?.extra || {},
      user: context?.user || undefined,
      contexts: this.getDefaultContexts(),
      breadcrumbs: [] // Don't send breadcrumbs for security
    };

    this.events.push(event);
    return eventId;
  }

  /**
   * Capture fatal event
   */
  captureFatal(
    message: string,
    context?: SentryContext
  ): string {
    const eventId = this.generateEventId();
    
    const event: SentryEvent = {
      message,
      level: 'fatal',
      tags: context?.tags || {},
      extra: context?.extra || {},
      user: context?.user || undefined,
      contexts: this.getDefaultContexts(),
      breadcrumbs: [] // Don't send breadcrumbs for security
    };

    this.events.push(event);
    return eventId;
  }

  /**
   * Capture warning event
   */
  captureWarning(
    message: string,
    context?: SentryContext
  ): string {
    const eventId = this.generateEventId();
    
    const event: SentryEvent = {
      message,
      level: 'warning',
      tags: context?.tags || {},
      extra: context?.extra || {},
      user: context?.user || undefined,
      contexts: this.getDefaultContexts(),
      breadcrumbs: [] // Don't send breadcrumbs for security
    };

    this.events.push(event);
    return eventId;
  }

  /**
   * Capture info event
   */
  captureInfo(
    message: string,
    context?: SentryContext
  ): string {
    const eventId = this.generateEventId();
    
    const event: SentryEvent = {
      message,
      level: 'info',
      tags: context?.tags || {},
      extra: context?.extra || {},
      user: context?.user || undefined,
      contexts: this.getDefaultContexts(),
      breadcrumbs: [] // Don't send breadcrumbs for security
    };

    this.events.push(event);
    return eventId;
  }

  /**
   * Get all events
   */
  getEvents(): SentryEvent[] {
    return [...this.events];
  }

  /**
   * Get events by level
   */
  getEventsByLevel(level: 'fatal' | 'error' | 'warning' | 'info' | 'debug'): SentryEvent[] {
    return this.events.filter(event => event.level === level);
  }

  /**
   * Get events by time range
   */
  getEventsByTimeRange(start: number, end: number): SentryEvent[] {
    // Note: This is a simplified implementation since SentryEvent doesn't have timestamp
    // In production, you'd add timestamp to the event
    return this.events;
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit: number = 10): SentryEvent[] {
    return this.events.slice(-limit);
  }

  /**
   * Clear all events
   */
  clearEvents(): void {
    this.events = [];
  }

  /**
   * Clear events by level
   */
  clearEventsByLevel(level: 'fatal' | 'error' | 'warning' | 'info' | 'debug'): number {
    const initialCount = this.events.length;
    this.events = this.events.filter(event => event.level !== level);
    return initialCount - this.events.length;
  }

  /**
   * Get event count
   */
  getEventCount(): number {
    return this.events.length;
  }

  /**
   * Get event statistics
   */
  getEventStats(): {
    total: number;
    byLevel: Record<string, number>;
    byCategory: Record<string, number>;
  } {
    const stats = {
      total: this.events.length,
      byLevel: {} as Record<string, number>,
      byCategory: {} as Record<string, number>
    };

    for (const event of this.events) {
      // Count by level
      stats.byLevel[event.level] = (stats.byLevel[event.level] || 0) + 1;
      
      // Count by category (simplified - could be enhanced with more sophisticated categorization)
      const category = this.categorizeEvent(event);
      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
    }

    return stats;
  }

  /**
   * Set maximum event limit
   */
  setMaxEvents(max: number): void {
    this.maxEvents = max;
    
    // Trim if current count exceeds new limit
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }

  /**
   * Get maximum event limit
   */
  getMaxEvents(): number {
    return this.maxEvents;
  }

  /**
   * Export events for debugging
   */
  exportEvents(): string {
    return JSON.stringify(this.events, null, 2);
  }

  /**
   * Import events from string
   */
  importEvents(data: string): boolean {
    try {
      const imported = JSON.parse(data);
      if (Array.isArray(imported)) {
        this.events = imported;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Generate event ID
   */
  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get default contexts
   */
  private getDefaultContexts(): SentryEvent['contexts'] {
    return {
      app: {
        name: 'identity-protocol',
        version: '1.0.0'
      },
      device: {
        name: 'web',
        version: '1.0.0'
      },
      os: {
        name: 'web',
        version: '1.0.0'
      },
      runtime: {
        name: 'javascript',
        version: '1.0.0'
      }
    };
  }

  /**
   * Categorize event (simplified implementation)
   */
  private categorizeEvent(event: SentryEvent): string {
    if (event.message.includes('error') || event.message.includes('Error')) {
      return 'error';
    } else if (event.message.includes('warning') || event.message.includes('Warning')) {
      return 'warning';
    } else if (event.message.includes('info') || event.message.includes('Info')) {
      return 'info';
    } else if (event.message.includes('debug') || event.message.includes('Debug')) {
      return 'debug';
    } else {
      return 'general';
    }
  }
}
