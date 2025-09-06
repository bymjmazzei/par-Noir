import { ThreatDetectionConfig, SecurityEvent, ThreatAlert, BehavioralProfile } from '../types/threatDetection';
import { EventManager } from './eventManager';
import { AlertManager } from './alertManager';

export class ThreatDetectionSystem {
  private config: ThreatDetectionConfig;
  private isInitialized: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private behavioralProfiles: Map<string, BehavioralProfile> = new Map();
  
  // Modular managers
  private eventManager: EventManager;
  private alertManager: AlertManager;

  constructor(config: Partial<ThreatDetectionConfig> = {}) {
    this.config = {
      enabled: false,
      sensitivity: 'medium',
      monitoringInterval: 30000,
      maxEventsPerHour: 1000,
      alertThreshold: 70,
      autoBlock: false,
      logLevel: 'warn',
      ...config
    };

    // Initialize modular managers
    this.eventManager = new EventManager(this.config);
    this.alertManager = new AlertManager(this.config);
  }

  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      await this.loadBehavioralProfiles();
      this.startMonitoring();
      this.initializeEventListeners();
      this.isInitialized = true;
      this.log('info', 'Threat detection system initialized');
    } catch (error) {
      this.log('error', `Failed to initialize threat detection: ${error}`);
    }
  }

  private async loadBehavioralProfiles(): Promise<void> {
    try {
      // Use IndexedDB for secure storage instead of localStorage
      try {
        const request = indexedDB.open('ThreatDetection', 1);
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('profiles')) {
            db.createObjectStore('profiles', { keyPath: 'id' });
          }
        };
        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          const transaction = db.transaction(['profiles'], 'readonly');
          const store = transaction.objectStore('profiles');
          const getAllRequest = store.getAll();
          getAllRequest.onsuccess = () => {
            const profiles = getAllRequest.result;
            this.behavioralProfiles = new Map(profiles.map((p: any) => [p.id, p.profile]));
          };
        };
      } catch (error) {
        // Fallback to empty profiles if IndexedDB fails
        this.behavioralProfiles = new Map();
      }
    } catch (error) {
      this.log('error', `Failed to load behavioral profiles: ${error}`);
    }
  }

  private updateBehavioralProfiles(): void {
    try {
      const profiles = Object.fromEntries(this.behavioralProfiles);
      // Save to IndexedDB instead of localStorage
      try {
        const request = indexedDB.open('ThreatDetection', 1);
        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          const transaction = db.transaction(['profiles'], 'readwrite');
          const store = transaction.objectStore('profiles');
          
          // Save each profile individually
          for (const [id, profile] of this.behavioralProfiles) {
            store.put({ id, profile });
          }
        };
      } catch (error) {
        // Silently handle storage errors
      }
    } catch (error) {
      this.log('error', `Failed to save behavioral profiles: ${error}`);
    }
  }

  private startMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(() => {
      this.performPeriodicAnalysis();
    }, this.config.monitoringInterval);
  }

  private performPeriodicAnalysis(): void {
    try {
      const recentEvents = this.eventManager.getRecentEvents(100);
      this.detectPatterns(recentEvents);
      this.updateBehavioralProfiles();
      this.cleanupOldData();
    } catch (error) {
      this.log('error', `Periodic analysis failed: ${error}`);
    }
  }

  private detectPatterns(events: SecurityEvent[]): void {
    // Rate limiting detection
    const eventsPerHour = this.eventManager.getEventsPerHour();
    if (eventsPerHour > this.config.maxEventsPerHour) {
      const alert = this.alertManager.createAlert(
        events[0],
        'rate_limit_exceeded',
        `Rate limit exceeded: ${eventsPerHour} events per hour`
      );
    }

    // High-risk event detection
    const highRiskEvents = this.eventManager.getHighRiskEvents(this.config.alertThreshold);
    if (highRiskEvents.length > 0) {
      highRiskEvents.forEach(event => {
        if (event.riskScore >= 80) {
          this.alertManager.createAlert(
            event,
            'potential_breach',
            `High-risk event detected: ${event.type} with risk score ${event.riskScore}`
          );
        }
      });
    }
  }

  private initializeEventListeners(): void {
    // Listen for authentication events
    document.addEventListener('click', (e) => {
      this.recordUserBehavior('click', e);
    });

    document.addEventListener('keydown', (e) => {
      this.recordUserBehavior('keydown', e);
    });
  }

  private recordUserBehavior(type: string, event: Event): void {
    if (!this.isInitialized) return;

    const behaviorEvent: Omit<SecurityEvent, 'id' | 'timestamp'> = {
      type: 'behavioral',
      severity: 'low',
      userId: 'current-user',
      deviceId: 'current-device',
      details: {
        behaviorType: type,
        target: (event.target as HTMLElement)?.tagName || 'unknown',
        timestamp: Date.now()
      },
      riskScore: 10
    };

    const recordedEvent = this.eventManager.recordEvent(behaviorEvent);
    this.updateBehavioralProfile(recordedEvent);
  }

  private updateBehavioralProfile(event: SecurityEvent): void {
    const profileKey = `${event.userId}-${event.deviceId}`;
    let profile = this.behavioralProfiles.get(profileKey);

    if (!profile) {
      profile = {
        userId: event.userId || 'unknown',
        deviceId: event.deviceId || 'unknown',
        typingPattern: [],
        mouseMovement: [],
        sessionDuration: 0,
        loginTimes: [],
        locations: [],
        riskScore: 0,
        lastUpdated: new Date().toISOString()
      };
    }

    profile.riskScore = event.riskScore;
    profile.lastUpdated = new Date().toISOString();
    this.behavioralProfiles.set(profileKey, profile);
  }

  private cleanupOldData(): void {
    // Cleanup old events (keep last 1000)
    if (this.eventManager.getEventsCount() > 1000) {
      // This is handled by the EventManager internally
    }

    // Cleanup old alerts (keep last 500)
    if (this.alertManager.getAlertsCount() > 500) {
      // This is handled by the AlertManager internally
    }
  }

  recordEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): SecurityEvent {
    const recordedEvent = this.eventManager.recordEvent(event);
    
    // Check if event should trigger an alert
    if (event.riskScore >= this.config.alertThreshold) {
      this.alertManager.createAlert(
        recordedEvent,
        'suspicious_activity',
        `Suspicious activity detected: ${event.type} with risk score ${event.riskScore}`
      );
    }

    // Update behavioral profile
    this.updateBehavioralProfile(recordedEvent);

    return recordedEvent;
  }

  getEvents(): SecurityEvent[] {
    return this.eventManager.getEvents();
  }

  getAlerts(): ThreatAlert[] {
    return this.alertManager.getAlerts();
  }

  getBehavioralProfiles(): BehavioralProfile[] {
    return Array.from(this.behavioralProfiles.values());
  }

  acknowledgeAlert(alertId: string): void {
    this.alertManager.acknowledgeAlert(alertId);
  }

  resolveAlert(alertId: string): void {
    this.alertManager.resolveAlert(alertId);
  }

  getConfig(): ThreatDetectionConfig {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<ThreatDetectionConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.monitoringInterval) {
      this.startMonitoring();
    }
  }

  isEnabled(): boolean {
    return this.config.enabled && this.isInitialized;
  }

  getEventManager(): EventManager {
    return this.eventManager;
  }

  getAlertManager(): AlertManager {
    return this.alertManager;
  }

  private log(level: string, message: string): void {
    if (this.shouldLog(level)) {
      // Console statement removed for production}: ${message}`);
    }
  }

  private shouldLog(level: string): boolean {
    const levels = { info: 0, warn: 1, error: 2 };
    const configLevel = levels[this.config.logLevel];
    const messageLevel = levels[level as keyof typeof levels];
    return messageLevel >= configLevel;
  }

  troy(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isInitialized = false;
  }
}
