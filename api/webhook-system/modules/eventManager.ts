import { WebhookEvent } from '../types/webhookSystem';

export class EventManager {
  private events: Map<string, WebhookEvent> = new Map();

  /**
   * Create a new webhook event
   */
  async createEvent(type: string, data: any, clientId?: string, userId?: string): Promise<WebhookEvent> {
    const event: WebhookEvent = {
      id: this.generateEventId(),
      type,
      timestamp: new Date().toISOString(),
      data,
      clientId,
      userId
    };

    this.events.set(event.id, event);
    return event;
  }

  /**
   * Get a webhook event by ID
   */
  getEvent(id: string): WebhookEvent | undefined {
    return this.events.get(id);
  }

  /**
   * List webhook events with filtering
   */
  listEvents(clientId?: string, type?: string, limit: number = 50): WebhookEvent[] {
    let events = Array.from(this.events.values());

    if (clientId) {
      events = events.filter(event => event.clientId === clientId);
    }

    if (type) {
      events = events.filter(event => event.type === type);
    }

    // Sort by timestamp cending and limit
    return events
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  /**
   * Get events by type
   */
  getEventsByType(eventType: string): WebhookEvent[] {
    return Array.from(this.events.values()).filter(event => event.type === eventType);
  }

  /**
   * Get events by client ID
   */
  getEventsByClient(clientId: string): WebhookEvent[] {
    return Array.from(this.events.values()).filter(event => event.clientId === clientId);
  }

  /**
   * Get events by user ID
   */
  getEventsByUser(userId: string): WebhookEvent[] {
    return Array.from(this.events.values()).filter(event => event.userId === userId);
  }

  /**
   * Delete old events (cleanup)
   */
  deleteOldEvents(olderThanDays: number = 30): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    let deletedCount = 0;
    for (const [id, event] of this.events.entries()) {
      if (new Date(event.timestamp) < cutoffDate) {
        this.events.delete(id);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * Get event statistics
   */
  getEventStats(): {
    total: number;
    byType: Record<string, number>;
    byClient: Record<string, number>;
    recent: number; // Events in last 24 hours
  } {
    const allEvents = Array.from(this.events.values());
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const byType: Record<string, number> = {};
    const byClient: Record<string, number> = {};
    let recent = 0;

    for (const event of allEvents) {
      // Count by type
      byType[event.type] = (byType[event.type] || 0) + 1;

      // Count by client
      if (event.clientId) {
        byClient[event.clientId] = (byClient[event.clientId] || 0) + 1;
      }

      // Count recent events
      if (new Date(event.timestamp) > oneDayAgo) {
        recent++;
      }
    }

    return {
      total: allEvents.length,
      byType,
      byClient,
      recent
    };
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${crypto.getRandomValues(new Uint8Array(1))[0] / 255.toString(36).substr(2, 9)}`;
  }
}
