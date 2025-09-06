import { SecurityEvent, ThreatDetectionConfig } from '../types/threatDetection';
// import { SecureRandom } from '../../utils/secureRandom';

export class EventManager {
  private config: ThreatDetectionConfig;
  private events: SecurityEvent[] = [];
  private maxEvents: number = 10000;

  constructor(config: ThreatDetectionConfig) {
    this.config = config;
  }

  recordEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): SecurityEvent {
    const newEvent: SecurityEvent = {
      ...event,
      id: this.generateEventId(),
      timestamp: new Date().toISOString()
    };

    this.events.push(newEvent);
    this.cleanupOldEvents();
    return newEvent;
  }

  getEvents(): SecurityEvent[] {
    return [...this.events];
  }

  getEventsByUserId(userId: string): SecurityEvent[] {
    return this.events.filter(event => event.userId === userId);
  }

  getEventsByType(type: SecurityEvent['type']): SecurityEvent[] {
    return this.events.filter(event => event.type === type);
  }

  getEventsBySeverity(severity: SecurityEvent['severity']): SecurityEvent[] {
    return this.events.filter(event => event.severity === severity);
  }

  getRecentEvents(limit: number = 100): SecurityEvent[] {
    return this.events.slice(-limit);
  }

  getEventsCount(): number {
    return this.events.length;
  }

  getEventsPerHour(): number {
    const oneHourAgo = Date.now() - 3600000;
    return this.events.filter(event => 
      new Date(event.timestamp).getTime() > oneHourAgo
    ).length;
  }

  getHighRiskEvents(threshold: number = 70): SecurityEvent[] {
    return this.events.filter(event => event.riskScore >= threshold);
  }

  updateEventAction(eventId: string, action: SecurityEvent['action']): boolean {
    const event = this.events.find(e => e.id === eventId);
    if (event) {
      event.action = action;
      return true;
    }
    return false;
  }

  clearEvents(): void {
    this.events = [];
  }

  private cleanupOldEvents(): void {
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }

  private generateEventId(): string {
    return `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
