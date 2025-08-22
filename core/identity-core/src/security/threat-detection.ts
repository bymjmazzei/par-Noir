/**
 * Advanced Threat Detection System
 * Monitors user behavior and system events for potential security threats
 * Runs in the background without affecting user experience
 */

export interface ThreatDetectionConfig {
  enabled: boolean;
  sensitivity: 'low' | 'medium' | 'high';
  monitoringInterval: number; // milliseconds
  maxEventsPerHour: number;
  alertThreshold: number;
  autoBlock: boolean;
  logLevel: 'info' | 'warn' | 'error';
}

export interface SecurityEvent {
  id: string;
  type: 'authentication' | 'authorization' | 'data_access' | 'system' | 'network' | 'behavioral';
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  userId?: string;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
  details: Record<string, any>;
  riskScore: number; // 0-100
  action?: 'blocked' | 'flagged' | 'monitored' | 'allowed';
}

export interface BehavioralProfile {
  userId: string;
  deviceId: string;
  typingPattern: number[]; // Average time between keystrokes
  mouseMovement: number[]; // Mouse movement patterns
  sessionDuration: number; // Average session length
  loginTimes: string[]; // Typical login times
  locations: string[]; // Typical locations
  riskScore: number; // 0-100
  lastUpdated: string;
}

export interface ThreatAlert {
  id: string;
  eventId: string;
  type: 'suspicious_activity' | 'potential_breach' | 'anomaly_detected' | 'rate_limit_exceeded';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: string;
  acknowledged: boolean;
  resolved: boolean;
  actionTaken?: string;
}

export class ThreatDetectionSystem {
  private config: ThreatDetectionConfig;
  private events: SecurityEvent[] = [];
  private alerts: ThreatAlert[] = [];
  private behavioralProfiles: Map<string, BehavioralProfile> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isInitialized: boolean = false;

  constructor(config: Partial<ThreatDetectionConfig> = {}) {
    this.config = {
      enabled: false, // Disabled by default
      sensitivity: 'medium',
      monitoringInterval: 30000, // 30 seconds
      maxEventsPerHour: 1000,
      alertThreshold: 70,
      autoBlock: false,
      logLevel: 'warn',
      ...config
    };
  }

  /**
   * Initialize threat detection system
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      // Load existing behavioral profiles
      await this.loadBehavioralProfiles();
      
      // Start monitoring
      this.startMonitoring();
      
      // Initialize event listeners
      this.initializeEventListeners();
      
      this.isInitialized = true;
      this.log('info', 'Threat detection system initialized');
    } catch (error) {
      this.log('error', `Failed to initialize threat detection: ${error}`);
    }
  }

  /**
   * Record a security event
   */
  recordEvent(event: Omit<SecurityEvent, 'id' | 'timestamp' | 'riskScore'>): void {
    if (!this.config.enabled) {
      return;
    }

    try {
      const securityEvent: SecurityEvent = {
        ...event,
        id: this.generateEventId(),
        timestamp: new Date().toISOString(),
        riskScore: this.calculateRiskScore(event)
      };

      this.events.push(securityEvent);

      // Check if event exceeds threshold
      if (securityEvent.riskScore >= this.config.alertThreshold) {
        this.createAlert(securityEvent);
      }

      // Update behavioral profile
      this.updateBehavioralProfile(securityEvent);

      // Cleanup old events
      this.cleanupOldEvents();

      this.log('info', `Security event recorded: ${event.type} (risk: ${securityEvent.riskScore})`);
    } catch (error) {
      this.log('error', `Failed to record security event: ${error}`);
    }
  }

  /**
   * Calculate risk score for an event
   */
  private calculateRiskScore(event: Omit<SecurityEvent, 'id' | 'timestamp' | 'riskScore'>): number {
    let riskScore = 0;

    // Base risk by event type
    switch (event.type) {
      case 'authentication':
        riskScore += 20;
        break;
      case 'authorization':
        riskScore += 15;
        break;
      case 'data_access':
        riskScore += 25;
        break;
      case 'system':
        riskScore += 10;
        break;
      case 'network':
        riskScore += 30;
        break;
      case 'behavioral':
        riskScore += 35;
        break;
    }

    // Severity multiplier
    switch (event.severity) {
      case 'low':
        riskScore *= 0.5;
        break;
      case 'medium':
        riskScore *= 1.0;
        break;
      case 'high':
        riskScore *= 1.5;
        break;
      case 'critical':
        riskScore *= 2.0;
        break;
    }

    // Behavioral analysis
    if (event.userId && event.deviceId) {
      const profile = this.behavioralProfiles.get(`${event.userId}-${event.deviceId}`);
      if (profile) {
        const behavioralRisk = this.analyzeBehavioralRisk(event, profile);
        riskScore += behavioralRisk;
      }
    }

    // Rate limiting
    const recentEvents = this.getRecentEvents(event.userId, 3600000); // Last hour
    if (recentEvents.length > this.config.maxEventsPerHour) {
      riskScore += 50;
    }

    return Math.min(100, Math.max(0, riskScore));
  }

  /**
   * Analyze behavioral risk
   */
  private analyzeBehavioralRisk(event: Omit<SecurityEvent, 'id' | 'timestamp' | 'riskScore'>, profile: BehavioralProfile): number {
    let risk = 0;

    // Check login time patterns
    const currentHour = new Date().getHours();
    const typicalHours = profile.loginTimes.map(time => new Date(time).getHours());
    if (!typicalHours.includes(currentHour)) {
      risk += 20;
    }

    // Check session duration
    if (event.details.sessionDuration) {
      const avgSessionDuration = profile.sessionDuration;
      const currentSessionDuration = event.details.sessionDuration;
      const deviation = Math.abs(currentSessionDuration - avgSessionDuration) / avgSessionDuration;
      if (deviation > 0.5) { // 50% deviation
        risk += 15;
      }
    }

    // Check location patterns
    if (event.details.location && !profile.locations.includes(event.details.location)) {
      risk += 25;
    }

    return risk;
  }

  /**
   * Create threat alert
   */
  private createAlert(event: SecurityEvent): void {
    const alert: ThreatAlert = {
      id: this.generateAlertId(),
      eventId: event.id,
      type: this.determineAlertType(event),
      severity: event.severity,
      message: this.generateAlertMessage(event),
      timestamp: new Date().toISOString(),
      acknowledged: false,
      resolved: false
    };

    this.alerts.push(alert);

    // Auto-block if configured
    if (this.config.autoBlock && event.riskScore >= 90) {
      this.blockUser(event.userId, event.deviceId);
      alert.actionTaken = 'user_blocked';
    }

    this.log('warn', `Threat alert created: ${alert.message}`);
  }

  /**
   * Determine alert type
   */
  private determineAlertType(event: SecurityEvent): ThreatAlert['type'] {
    if (event.type === 'behavioral') {
      return 'anomaly_detected';
    } else if (event.type === 'network') {
      return 'potential_breach';
    } else if (event.riskScore >= 80) {
      return 'suspicious_activity';
    } else {
      return 'rate_limit_exceeded';
    }
  }

  /**
   * Generate alert message
   */
  private generateAlertMessage(event: SecurityEvent): string {
    switch (event.type) {
      case 'authentication':
        return `Suspicious authentication attempt detected (Risk: ${event.riskScore})`;
      case 'authorization':
        return `Unauthorized access attempt detected (Risk: ${event.riskScore})`;
      case 'data_access':
        return `Unusual data access pattern detected (Risk: ${event.riskScore})`;
      case 'behavioral':
        return `Behavioral anomaly detected (Risk: ${event.riskScore})`;
      case 'network':
        return `Network security threat detected (Risk: ${event.riskScore})`;
      default:
        return `Security event detected (Risk: ${event.riskScore})`;
    }
  }

  /**
   * Update behavioral profile
   */
  private updateBehavioralProfile(event: SecurityEvent): void {
    if (!event.userId || !event.deviceId) {
      return;
    }

    const profileKey = `${event.userId}-${event.deviceId}`;
    let profile = this.behavioralProfiles.get(profileKey);

    if (!profile) {
      profile = {
        userId: event.userId,
        deviceId: event.deviceId,
        typingPattern: [],
        mouseMovement: [],
        sessionDuration: 0,
        loginTimes: [],
        locations: [],
        riskScore: 0,
        lastUpdated: new Date().toISOString()
      };
    }

    // Update typing pattern
    if (event.details.typingPattern) {
      profile.typingPattern.push(event.details.typingPattern);
      if (profile.typingPattern.length > 100) {
        profile.typingPattern = profile.typingPattern.slice(-100);
      }
    }

    // Update mouse movement
    if (event.details.mouseMovement) {
      profile.mouseMovement.push(event.details.mouseMovement);
      if (profile.mouseMovement.length > 100) {
        profile.mouseMovement = profile.mouseMovement.slice(-100);
      }
    }

    // Update session duration
    if (event.details.sessionDuration) {
      profile.sessionDuration = (profile.sessionDuration + event.details.sessionDuration) / 2;
    }

    // Update login times
    if (event.type === 'authentication') {
      profile.loginTimes.push(new Date().toISOString());
      if (profile.loginTimes.length > 50) {
        profile.loginTimes = profile.loginTimes.slice(-50);
      }
    }

    // Update locations
    if (event.details.location && !profile.locations.includes(event.details.location)) {
      profile.locations.push(event.details.location);
      if (profile.locations.length > 10) {
        profile.locations = profile.locations.slice(-10);
      }
    }

    // Update risk score
    profile.riskScore = event.riskScore;
    profile.lastUpdated = new Date().toISOString();

    this.behavioralProfiles.set(profileKey, profile);
  }

  /**
   * Start monitoring
   */
  private startMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(() => {
      this.performPeriodicAnalysis();
    }, this.config.monitoringInterval);
  }

  /**
   * Perform periodic security analysis
   */
  private performPeriodicAnalysis(): void {
    try {
      // Analyze recent events
      const recentEvents = this.events.filter(event => {
        const eventTime = new Date(event.timestamp).getTime();
        const oneHourAgo = Date.now() - 3600000;
        return eventTime > oneHourAgo;
      });

      // Check for patterns
      this.detectPatterns(recentEvents);

      // Update behavioral profiles
      this.updateBehavioralProfiles();

      // Cleanup old data
      this.cleanupOldData();

    } catch (error) {
      this.log('error', `Periodic analysis failed: ${error}`);
    }
  }

  /**
   * Detect security patterns
   */
  private detectPatterns(events: SecurityEvent[]): void {
    // Detect brute force attempts
    const authEvents = events.filter(e => e.type === 'authentication');
    const authByUser = new Map<string, SecurityEvent[]>();
    
    authEvents.forEach(event => {
      if (event.userId) {
        if (!authByUser.has(event.userId)) {
          authByUser.set(event.userId, []);
        }
        authByUser.get(event.userId)!.push(event);
      }
    });

    // Check for rapid authentication attempts
    authByUser.forEach((userEvents, userId) => {
      if (userEvents.length > 10) { // More than 10 auth attempts per hour
        this.recordEvent({
          type: 'authentication',
          severity: 'high',
          userId,
          details: {
            pattern: 'brute_force_attempt',
            attemptCount: userEvents.length,
            timeWindow: '1_hour'
          }
        });
      }
    });

    // Detect unusual data access patterns
    const dataAccessEvents = events.filter(e => e.type === 'data_access');
    if (dataAccessEvents.length > 100) { // More than 100 data access events per hour
      this.recordEvent({
        type: 'data_access',
        severity: 'medium',
        details: {
          pattern: 'excessive_data_access',
          accessCount: dataAccessEvents.length,
          timeWindow: '1_hour'
        }
      });
    }
  }

  /**
   * Initialize event listeners
   */
  private initializeEventListeners(): void {
    // Monitor authentication events
    this.monitorAuthenticationEvents();
    
    // Monitor data access events
    this.monitorDataAccessEvents();
    
    // Monitor system events
    this.monitorSystemEvents();
  }

  /**
   * Monitor authentication events
   */
  private monitorAuthenticationEvents(): void {
    // This would hook into your authentication system
    // For now, we'll create a placeholder
    const originalAuthenticate = window.fetch;
    
    window.fetch = async (...args) => {
      const [url, options] = args;
      
      // Check if this is an authentication request
      if (typeof url === 'string' && url.includes('/auth')) {
        this.recordEvent({
          type: 'authentication',
          severity: 'medium',
          details: {
            url: url,
            method: options?.method || 'GET',
            timestamp: new Date().toISOString()
          }
        });
      }
      
      return originalAuthenticate.apply(window, args);
    };
  }

  /**
   * Monitor data access events
   */
  private monitorDataAccessEvents(): void {
    // Monitor IndexedDB access
    const originalOpen = indexedDB.open;
    indexedDB.open = function(...args) {
      // Record data access event
      return originalOpen.apply(indexedDB, args);
    };
  }

  /**
   * Monitor system events
   */
  private monitorSystemEvents(): void {
    // Monitor for suspicious browser behavior
    window.addEventListener('beforeunload', () => {
      this.recordEvent({
        type: 'system',
        severity: 'low',
        details: {
          event: 'page_unload',
          timestamp: new Date().toISOString()
        }
      });
    });
  }

  /**
   * Block user
   */
  private blockUser(userId?: string, deviceId?: string): void {
    // Implement user blocking logic
    this.log('warn', `User blocked: ${userId} (device: ${deviceId})`);
  }

  /**
   * Get recent events
   */
  private getRecentEvents(userId?: string, timeWindow: number = 3600000): SecurityEvent[] {
    const cutoff = Date.now() - timeWindow;
    return this.events.filter(event => {
      const eventTime = new Date(event.timestamp).getTime();
      return eventTime > cutoff && (!userId || event.userId === userId);
    });
  }

  /**
   * Cleanup old events
   */
  private cleanupOldEvents(): void {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    this.events = this.events.filter(event => {
      const eventTime = new Date(event.timestamp).getTime();
      return eventTime > oneDayAgo;
    });
  }

  /**
   * Cleanup old data
   */
  private cleanupOldData(): void {
    // Cleanup old alerts
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    this.alerts = this.alerts.filter(alert => {
      const alertTime = new Date(alert.timestamp).getTime();
      return alertTime > oneWeekAgo;
    });
  }

  /**
   * Load behavioral profiles
   */
  private async loadBehavioralProfiles(): Promise<void> {
    try {
      // Load from localStorage or IndexedDB
      const stored = localStorage.getItem('threat-detection-profiles');
      if (stored) {
        const profiles = JSON.parse(stored);
        this.behavioralProfiles = new Map(Object.entries(profiles));
      }
    } catch (error) {
      this.log('error', `Failed to load behavioral profiles: ${error}`);
    }
  }

  /**
   * Update behavioral profiles
   */
  private updateBehavioralProfiles(): void {
    try {
      // Save to localStorage
      const profiles = Object.fromEntries(this.behavioralProfiles);
      localStorage.setItem('threat-detection-profiles', JSON.stringify(profiles));
    } catch (error) {
      this.log('error', `Failed to save behavioral profiles: ${error}`);
    }
  }

  /**
   * Utility methods
   */
  private generateEventId(): string {
    return `event-${Date.now()}-${Math.random().toString(36).substring(2)}`;
  }

  private generateAlertId(): string {
    return `alert-${Date.now()}-${Math.random().toString(36).substring(2)}`;
  }

  private log(level: string, message: string): void {
    if (this.shouldLog(level)) {
      console.log(`[ThreatDetection] ${level.toUpperCase()}: ${message}`);
    }
  }

  private shouldLog(level: string): boolean {
    const levels = { info: 0, warn: 1, error: 2 };
    const configLevel = levels[this.config.logLevel];
    const messageLevel = levels[level as keyof typeof levels];
    return messageLevel >= configLevel;
  }

  /**
   * Public API methods
   */
  getEvents(): SecurityEvent[] {
    return [...this.events];
  }

  getAlerts(): ThreatAlert[] {
    return [...this.alerts];
  }

  getBehavioralProfiles(): BehavioralProfile[] {
    return Array.from(this.behavioralProfiles.values());
  }

  acknowledgeAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
    }
  }

  resolveAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
    }
  }

  getConfig(): ThreatDetectionConfig {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<ThreatDetectionConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart monitoring if interval changed
    if (newConfig.monitoringInterval) {
      this.startMonitoring();
    }
  }

  isEnabled(): boolean {
    return this.config.enabled && this.isInitialized;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isInitialized = false;
  }
}
