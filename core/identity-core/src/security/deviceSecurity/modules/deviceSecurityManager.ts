import { DeviceSecurityConfig, SecurityEvent, SecurityMetrics } from '../types/deviceSecurity';
import { FingerprintManager } from './fingerprintManager';
import { ThreatDetectionManager } from './threatDetectionManager';

export class DeviceSecurityManager {
  private config: DeviceSecurityConfig;
  private securityEvents: Array<SecurityEvent> = [];
  private maxSecurityEvents: number = 1000;
  
  // Modular managers
  private fingerprintManager: FingerprintManager;
  private threatDetectionManager: ThreatDetectionManager;

  constructor(config: Partial<DeviceSecurityConfig> = {}) {
    this.config = {
      enableWebAuthn: true,
      enableThreatDetection: true,
      enableBehavioralAnalysis: true,
      enableMalwareDetection: true,
      enableDeviceFingerprinting: true,
      securityLevel: 'military',
      ...config
    };

    // Initialize modular managers
    this.fingerprintManager = new FingerprintManager();
    this.threatDetectionManager = new ThreatDetectionManager();
  }

  /**
   * Initialize device security
   */
  async initialize(): Promise<void> {
    try {
      // Generate device fingerprint
      if (this.config.enableDeviceFingerprinting) {
        await this.fingerprintManager.generateDeviceFingerprint();
      }

      // Start threat detection
      if (this.config.enableThreatDetection) {
        this.threatDetectionManager.startThreatDetection();
      }

      this.logSecurityEvent('initialized', { config: this.config });
    } catch (error) {
      this.logSecurityEvent('initialization_error', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Get device fingerprint
   */
  getDeviceFingerprint() {
    return this.fingerprintManager.getDeviceFingerprint();
  }

  /**
   * Check if fingerprint has changed
   */
  async hasFingerprintChanged(): Promise<boolean> {
    return this.fingerprintManager.hasFingerprintChanged();
  }

  /**
   * Update device fingerprint
   */
  async updateDeviceFingerprint() {
    return this.fingerprintManager.updateDeviceFingerprint();
  }

  /**
   * Get threat history
   */
  getThreatHistory() {
    return this.threatDetectionManager.getThreatHistory();
  }

  /**
   * Get recent threats
   */
  getRecentThreats(limit: number = 10) {
    return this.threatDetectionManager.getRecentThreats(limit);
  }

  /**
   * Get threats by level
   */
  getThreatsByLevel(level: 'low' | 'medium' | 'high' | 'critical') {
    return this.threatDetectionManager.getThreatsByLevel(level);
  }

  /**
   * Get threat count
   */
  getThreatCount(): number {
    return this.threatDetectionManager.getThreatCount();
  }

  /**
   * Get security events
   */
  getSecurityEvents(): Array<SecurityEvent> {
    return [...this.securityEvents];
  }

  /**
   * Get security metrics
   */
  getSecurityMetrics(): SecurityMetrics {
    const threatCount = this.threatDetectionManager.getThreatCount();
    const anomalyCount = this.securityEvents.filter(e => e.event.includes('anomaly')).length;
    const integrityScore = this.calculateIntegrityScore();
    const lastCheck = Date.now();
    const uptime = this.calculateUptime();

    return {
      threatCount,
      anomalyCount,
      integrityScore,
      lastCheck,
      uptime
    };
  }

  /**
   * Check device integrity
   */
  async checkDeviceIntegrity(): Promise<{
    isHealthy: boolean;
    score: number;
    issues: string[];
  }> {
    const issues: string[] = [];
    let score = 100;

    // Check fingerprint stability
    const fingerprintChanged = await this.fingerprintManager.hasFingerprintChanged();
    if (fingerprintChanged) {
      issues.push('Device fingerprint has changed unexpectedly');
      score -= 20;
    }

    // Check threat detection status
    if (!this.threatDetectionManager.isMonitoringActive()) {
      issues.push('Threat detection monitoring is not active');
      score -= 15;
    }

    // Check for recent threats
    const recentThreats = this.threatDetectionManager.getRecentThreats(10);
    const criticalThreats = recentThreats.filter(t => t.threatLevel === 'critical');
    const highThreats = recentThreats.filter(t => t.threatLevel === 'high');

    if (criticalThreats.length > 0) {
      issues.push(`${criticalThreats.length} critical threats detected`);
      score -= 30;
    }

    if (highThreats.length > 0) {
      issues.push(`${highThreats.length} high-level threats detected`);
      score -= 20;
    }

    return {
      isHealthy: score >= 70,
      score: Math.max(0, score),
      issues
    };
  }

  /**
   * Get configuration
   */
  getConfig(): DeviceSecurityConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  async updateConfig(newConfig: Partial<DeviceSecurityConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    
    // Restart services if needed
    if (newConfig.enableThreatDetection !== undefined) {
      if (newConfig.enableThreatDetection) {
        this.threatDetectionManager.startThreatDetection();
      } else {
        this.threatDetectionManager.stopThreatDetection();
      }
    }

    this.logSecurityEvent('config_updated', { newConfig });
  }

  /**
   * Get fingerprint manager
   */
  getFingerprintManager(): FingerprintManager {
    return this.fingerprintManager;
  }

  /**
   * Get threat detection manager
   */
  getThreatDetectionManager(): ThreatDetectionManager {
    return this.threatDetectionManager;
  }

  /**
   * Clear all data
   */
  clearAllData(): void {
    this.fingerprintManager.clearDeviceFingerprint();
    this.threatDetectionManager.clearThreatHistory();
    this.clearSecurityEvents();
  }

  /**
   * Clear security events
   */
  clearSecurityEvents(): void {
    this.securityEvents = [];
  }

  /**
   * Destroy device security manager
   */
  troy(): void {
    this.threatDetectionManager.stopThreatDetection();
    this.clearAllData();
  }

  /**
   * Log security event
   */
  private logSecurityEvent(event: string, details: any): void {
    this.securityEvents.push({
      timestamp: new Date().toISOString(),
      event,
      details
    });

    // Keep only last N events
    if (this.securityEvents.length > this.maxSecurityEvents) {
      this.securityEvents = this.securityEvents.slice(-this.maxSecurityEvents);
    }
  }

  /**
   * Calculate integrity score
   */
  private calculateIntegrityScore(): number {
    let score = 100;
    
    // Reduce score based on recent threats
    const recentThreats = this.threatDetectionManager.getRecentThreats(24);
    for (const threat of recentThreats) {
      switch (threat.threatLevel) {
        case 'low':
          score -= 1;
          break;
        case 'medium':
          score -= 5;
          break;
        case 'high':
          score -= 15;
          break;
        case 'critical':
          score -= 30;
          break;
      }
    }

    return Math.max(0, score);
  }

  /**
   * Calculate uptime
   */
  private calculateUptime(): number {
    // This is a simplified implementation
    // In production, you'd track actual start time
    return Date.now();
  }
}
