import { IdentityCoreEventType, IdentityCoreEventHandler, SecurityEvent } from '../types/identityCore';

export class EventManager {
  private eventHandlers: Map<IdentityCoreEventType, Set<IdentityCoreEventHandler<any>>> = new Map();

  /**
   * Register event handler
   */
  on<T extends IdentityCoreEventType>(
    event: T,
    handler: IdentityCoreEventHandler<T>
  ): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Remove event handler
   */
  off<T extends IdentityCoreEventType>(
    event: T,
    handler: IdentityCoreEventHandler<T>
  ): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Emit event to all registered handlers
   */
  emit<T extends IdentityCoreEventType>(
    event: T,
    data: Parameters<IdentityCoreEventHandler<T>>[0]
  ): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          // Console statement removed for production
          this.logSecurityEvent('event_handler_error', { event, error }, 'medium');
        }
      });
    }
  }

  /**
   * Emit security event
   */
  emitSecurityEvent(event: string, details: any, riskLevel: 'low' | 'medium' | 'high' | 'critical'): void {
    const securityEvent: SecurityEvent = {
      timestamp: new Date().toISOString(),
      event,
      details,
      riskLevel,
      didId: details.didId || 'system'
    };
    
    // Emit security event for external monitoring
    this.emit('security:event', securityEvent);
  }

  /**
   * Get all registered event handlers for an event
   */
  getEventHandlers(event: IdentityCoreEventType): Set<IdentityCoreEventHandler<any>> {
    return this.eventHandlers.get(event) || new Set();
  }

  /**
   * Get all registered events
   */
  getRegisteredEvents(): IdentityCoreEventType[] {
    return Array.from(this.eventHandlers.keys());
  }

  /**
   * Get total number of event handlers
   */
  getTotalEventHandlers(): number {
    let total = 0;
    for (const handlers of this.eventHandlers.values()) {
      total += handlers.size;
    }
    return total;
  }

  /**
   * Clear all event handlers for a specific event
   */
  clearEventHandlers(event: IdentityCoreEventType): void {
    this.eventHandlers.delete(event);
  }

  /**
   * Clear all event handlers
   */
  clearAllEventHandlers(): void {
    this.eventHandlers.clear();
  }

  /**
   * Check if an event has any handlers
   */
  hasEventHandlers(event: IdentityCoreEventType): boolean {
    const handlers = this.eventHandlers.get(event);
    return handlers ? handlers.size > 0 : false;
  }

  /**
   * Get event handler count for a specific event
   */
  getEventHandlerCount(event: IdentityCoreEventType): number {
    const handlers = this.eventHandlers.get(event);
    return handlers ? handlers.size : 0;
  }

  /**
   * Emit multiple events in sequence
   */
  async emitMultipleEvents(events: Array<{ event: IdentityCoreEventType; data: any }>): Promise<void> {
    for (const { event, data } of events) {
      this.emit(event, data);
      // Small delay to prevent overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  /**
   * Emit event with retry logic
   */
  async emitWithRetry<T extends IdentityCoreEventType>(
    event: T,
    data: Parameters<IdentityCoreEventHandler<T>>[0],
    maxRetries: number = 3,
    retryDelay: number = 1000
  ): Promise<void> {
    let retries = 0;
    
    while (retries < maxRetries) {
      try {
        this.emit(event, data);
        return;
      } catch (error) {
        retries++;
        if (retries >= maxRetries) {
          throw error;
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, retryDelay * retries));
      }
    }
  }

  /**
   * Log security event (placeholder for actual logging implementation)
   */
  private logSecurityEvent(event: string, details: any, riskLevel: 'low' | 'medium' | 'high' | 'critical'): void {
    // In production, this would integrate with a proper logging system
    // Console statement removed for production}]: ${event}`, details);
  }

  /**
   * Get event statistics
   */
  getEventStats(): {
    totalEvents: number;
    totalHandlers: number;
    eventsWithHandlers: number;
    mostPopularEvent: string;
    handlerDistribution: Record<string, number>;
  } {
    const totalEvents = this.eventHandlers.size;
    const totalHandlers = this.getTotalEventHandlers();
    let eventsWithHandlers = 0;
    let mostPopularEvent = '';
    let maxHandlers = 0;
    const handlerDistribution: Record<string, number> = {};

    for (const [event, handlers] of this.eventHandlers.entries()) {
      const handlerCount = handlers.size;
      handlerDistribution[event] = handlerCount;
      
      if (handlerCount > 0) {
        eventsWithHandlers++;
      }
      
      if (handlerCount > maxHandlers) {
        maxHandlers = handlerCount;
        mostPopularEvent = event;
      }
    }

    return {
      totalEvents,
      totalHandlers,
      eventsWithHandlers,
      mostPopularEvent,
      handlerDistribution
    };
  }
}
