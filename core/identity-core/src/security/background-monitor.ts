/**
 * Background Security Monitor
 * Runs security checks and cleanup tasks automatically
 * No user interaction required
 */

import { ThreatDetector } from './threat-detector';
import { SessionManager } from './session-manager';
import { ZKProofManager } from './zk-proof-manager';

export interface MonitorConfig {
  enabled: boolean;
  checkInterval: number; // milliseconds
  cleanupInterval: number; // milliseconds
  threatDetectionEnabled: boolean;
  sessionCleanupEnabled: boolean;
  proofCleanupEnabled: boolean;
  logLevel: 'none' | 'error' | 'warn' | 'info' | 'debug';
}

export class BackgroundMonitor {
  private static readonly DEFAULT_CONFIG: MonitorConfig = {
    enabled: true,
    checkInterval: 5 * 60 * 1000, // 5 minutes
    cleanupInterval: 60 * 60 * 1000, // 1 hour
    threatDetectionEnabled: true,
    sessionCleanupEnabled: true,
    proofCleanupEnabled: true,
    logLevel: 'warn'
  };

  private static monitorInterval: NodeJS.Timeout | null = null;
  private static cleanupInterval: NodeJS.Timeout | null = null;
  private static isRunning = false;

  /**
   * Start background monitoring
   */
  static start(config: Partial<MonitorConfig> = {}): void {
    if (this.isRunning) {
      this.log('Background monitor already running', 'warn');
      return;
    }

    const fullConfig = { ...this.DEFAULT_CONFIG, ...config };

    if (!fullConfig.enabled) {
      this.log('Background monitoring disabled', 'info');
      return;
    }

    this.log('Starting background security monitor', 'info');

    // Start threat detection monitoring
    if (fullConfig.threatDetectionEnabled) {
      this.monitorInterval = setInterval(() => {
        this.performThreatDetection();
      }, fullConfig.checkInterval);
    }

    // Start cleanup tasks
    if (fullConfig.sessionCleanupEnabled || fullConfig.proofCleanupEnabled) {
      this.cleanupInterval = setInterval(() => {
        this.performCleanupTasks(fullConfig);
      }, fullConfig.cleanupInterval);
    }

    this.isRunning = true;
    this.log('Background security monitor started', 'info');
  }

  /**
   * Stop background monitoring
   */
  static stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.log('Stopping background security monitor', 'info');

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.isRunning = false;
    this.log('Background security monitor stopped', 'info');
  }

  /**
   * Perform threat detection checks
   */
  private static performThreatDetection(): void {
    try {
      this.log('Performing threat detection scan', 'debug');

      // Generate threat report
      const threatReport = ThreatDetector.generateThreatReport();

      if (threatReport.threats.length > 0) {
        this.log(`Detected ${threatReport.threats.length} threats`, 'warn');
        
        // Log high-risk threats
        const highRiskThreats = threatReport.threats.filter(t => t.type === 'high');
        if (highRiskThreats.length > 0) {
          this.log(`High-risk threats detected: ${highRiskThreats.length}`, 'error');
          for (const threat of highRiskThreats) {
            this.log(`High-risk threat: ${threat.description}`, 'error');
          }
        }

        // Log recommendations
        if (threatReport.recommendations.length > 0) {
          this.log('Security recommendations:', 'warn');
          for (const recommendation of threatReport.recommendations) {
            this.log(`- ${recommendation}`, 'warn');
          }
        }
      } else {
        this.log('No threats detected', 'debug');
      }

    } catch (error) {
      this.log(`Threat detection error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  }

  /**
   * Perform cleanup tasks
   */
  private static performCleanupTasks(config: MonitorConfig): void {
    try {
      this.log('Performing cleanup tasks', 'debug');

      // Clean up old sessions
      if (config.sessionCleanupEnabled) {
        this.log('Cleaning up expired sessions', 'debug');
        SessionManager.cleanupExpiredSessions();
      }

      // Clean up expired proofs
      if (config.proofCleanupEnabled) {
        this.log('Cleaning up expired proofs', 'debug');
        ZKProofManager.cleanupExpiredProofs();
      }

      // Clean up old security events
      this.log('Cleaning up old security events', 'debug');
      ThreatDetector.cleanupOldEvents();

      this.log('Cleanup tasks completed', 'debug');

    } catch (error) {
      this.log(`Cleanup error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  }

  /**
   * Get monitoring statistics
   */
  static getStats(): {
    isRunning: boolean;
    threatStats: any;
    sessionStats: any;
    proofStats: any;
    lastCheck: string;
  } {
    return {
      isRunning: this.isRunning,
      threatStats: ThreatDetector.getThreatStats(),
      sessionStats: SessionManager.getSessionStats(),
      proofStats: ZKProofManager.getProofStats(),
      lastCheck: new Date().toISOString()
    };
  }

  /**
   * Manual threat detection check
   */
  static checkThreats(): void {
    this.performThreatDetection();
  }

  /**
   * Manual cleanup
   */
  static performCleanup(): void {
    this.performCleanupTasks(this.DEFAULT_CONFIG);
  }

  /**
   * Log message with appropriate level
   */
  private static log(message: string, level: 'error' | 'warn' | 'info' | 'debug'): void {
    const config = this.DEFAULT_CONFIG;
    
    // Check if we should log this level
    const levels = ['none', 'error', 'warn', 'info', 'debug'];
    const currentLevelIndex = levels.indexOf(config.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    
    if (messageLevelIndex <= currentLevelIndex) {
      const timestamp = new Date().toISOString();
      const prefix = `[BackgroundMonitor:${level.toUpperCase()}]`;
      
      switch (level) {
        case 'error':
          console.error(`${timestamp} ${prefix} ${message}`);
          break;
        case 'warn':
          console.warn(`${timestamp} ${prefix} ${message}`);
          break;
        case 'info':
          console.info(`${timestamp} ${prefix} ${message}`);
          break;
        case 'debug':
          console.debug(`${timestamp} ${prefix} ${message}`);
          break;
      }
    }
  }

  /**
   * Check if monitor is running
   */
  static isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Update configuration
   */
  static updateConfig(config: Partial<MonitorConfig>): void {
    const newConfig = { ...this.DEFAULT_CONFIG, ...config };
    
    // Restart monitor with new config
    if (this.isRunning) {
      this.stop();
      this.start(newConfig);
    }
  }
}
