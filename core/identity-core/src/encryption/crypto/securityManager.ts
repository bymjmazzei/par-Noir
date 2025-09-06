// Security Manager - Handles security-related functionality for crypto operations
import { SecurityEvent, FailedAttempt } from './types/crypto';
import { CRYPTO_CONSTANTS } from './constants/cryptoConstants';

export class SecurityManager {
  private failedAttempts: Map<string, FailedAttempt> = new Map();
  private securityAuditLog: SecurityEvent[] = [];

  constructor() {
    // Start cleanup timer for expired lockouts
    this.startCleanupTimer();
  }

  /**
   * Record failed login attempt
   */
  recordFailedAttempt(
    userId: string,
    metadata: {
      ipAddress?: string;
      userAgent?: string;
      deviceFingerprint?: string;
      timestamp?: number;
    } = {}
  ): { isLocked: boolean; remainingAttempts: number; lockoutEnd?: Date } {
    const now = Date.now();
    const existing = this.failedAttempts.get(userId);

    if (existing) {
      // Check if lockout has expired
      if (existing.lockedUntil && now < existing.lockedUntil) {
        return {
          isLocked: true,
          remainingAttempts: 0,
          lockoutEnd: new Date(existing.lockedUntil)
        };
      }

      // Reset if lockout expired
      if (existing.lockedUntil && now >= existing.lockedUntil) {
        existing.count = 0;
        existing.lockedUntil = undefined;
      }
    }

    const attempt: FailedAttempt = {
      userId,
      count: (existing?.count || 0) + 1,
      lastAttempt: now,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      deviceFingerprint: metadata.deviceFingerprint,
      riskScore: this.calculateRiskScore(metadata)
    };

    // Check if account should be locked
    if (attempt.count >= CRYPTO_CONSTANTS.MAX_LOGIN_ATTEMPTS) {
      attempt.lockedUntil = now + CRYPTO_CONSTANTS.LOCKOUT_DURATION;
      this.logSecurityEvent('account_locked', {
        userId,
        reason: 'max_failed_attempts',
        lockoutDuration: CRYPTO_CONSTANTS.LOCKOUT_DURATION,
        metadata
      }, 'high');
    }

    this.failedAttempts.set(userId, attempt);

    return {
      isLocked: !!attempt.lockedUntil,
      remainingAttempts: Math.max(0, CRYPTO_CONSTANTS.MAX_LOGIN_ATTEMPTS - attempt.count),
      lockoutEnd: attempt.lockedUntil ? new Date(attempt.lockedUntil) : undefined
    };
  }

  /**
   * Check if user is locked
   */
  isUserLocked(userId: string): { isLocked: boolean; remainingAttempts: number; lockoutEnd?: Date } {
    const attempt = this.failedAttempts.get(userId);
    if (!attempt) {
      return { isLocked: false, remainingAttempts: CRYPTO_CONSTANTS.MAX_LOGIN_ATTEMPTS, lockoutEnd: undefined };
    }

    const now = Date.now();
    if (attempt.lockedUntil && now < attempt.lockedUntil) {
      return {
        isLocked: true,
        remainingAttempts: 0,
        lockoutEnd: new Date(attempt.lockedUntil)
      };
    }

    // Lockout expired
    if (attempt.lockedUntil && now >= attempt.lockedUntil) {
      attempt.count = 0;
      attempt.lockedUntil = undefined;
      this.failedAttempts.set(userId, attempt);
    }

    return {
      isLocked: false,
      remainingAttempts: Math.max(0, CRYPTO_CONSTANTS.MAX_LOGIN_ATTEMPTS - attempt.count),
      lockoutEnd: undefined
    };
  }

  /**
   * Reset failed attempts for a user
   */
  resetFailedAttempts(userId: string): void {
    this.failedAttempts.delete(userId);
    this.logSecurityEvent('failed_attempts_reset', { userId }, 'low');
  }

  /**
   * Log security event
   */
  logSecurityEvent(
    event: string,
    details: any,
    riskLevel: 'low' | 'medium' | 'high' | 'critical'
  ): void {
    const securityEvent: SecurityEvent = {
      timestamp: new Date().toISOString(),
      event,
      details,
      riskLevel
    };

    this.securityAuditLog.push(securityEvent);
    
    // Keep only last 1000 events
    if (this.securityAuditLog.length > 1000) {
      this.securityAuditLog = this.securityAuditLog.slice(-1000);
    }

    // Log to console for development
    if (process.env.NODE_ENV === 'development') {
      // Console statement removed for production
    }
  }

  /**
   * Get security audit log
   */
  getSecurityAuditLog(): SecurityEvent[] {
    return [...this.securityAuditLog];
  }

  /**
   * Get failed attempts for a user
   */
  getFailedAttempts(userId: string): FailedAttempt | undefined {
    return this.failedAttempts.get(userId);
  }

  /**
   * Get all failed attempts
   */
  getAllFailedAttempts(): Map<string, FailedAttempt> {
    return new Map(this.failedAttempts);
  }

  /**
   * Calculate risk score based on metadata
   */
  private calculateRiskScore(metadata: {
    ipAddress?: string;
    userAgent?: string;
    deviceFingerprint?: string;
  }): number {
    let riskScore = 0;

    // IP address risk (simplified)
    if (metadata.ipAddress) {
      // In a real implementation, you would check against known malicious IPs
      // For now, we'll use a simple heuristic
      if (metadata.ipAddress.includes('192.168.') || metadata.ipAddress.includes('10.')) {
        riskScore += 10; // Internal network
      } else {
        riskScore += 20; // External network
      }
    }

    // User agent risk
    if (metadata.userAgent) {
      if (metadata.userAgent.includes('bot') || metadata.userAgent.includes('crawler')) {
        riskScore += 30; // Bot/crawler
      } else if (metadata.userAgent.includes('curl') || metadata.userAgent.includes('wget')) {
        riskScore += 25; // Command line tools
      } else {
        riskScore += 5; // Normal browser
      }
    }

    // Device fingerprint risk
    if (metadata.deviceFingerprint) {
      // In a real implementation, you would check against known patterns
      // For now, we'll use a simple heuristic
      riskScore += 15;
    }

    return Math.min(100, riskScore);
  }

  /**
   * Start cleanup timer for expired lockouts
   */
  private startCleanupTimer(): void {
    setInterval(() => {
      this.cleanupExpiredLockouts();
    }, 60000); // Check every minute
  }

  /**
   * Cleanup expired lockouts
   */
  private cleanupExpiredLockouts(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [userId, attempt] of this.failedAttempts.entries()) {
      if (attempt.lockedUntil && now >= attempt.lockedUntil) {
        this.failedAttempts.delete(userId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logSecurityEvent('expired_lockouts_cleaned', { cleanedCount }, 'low');
    }
  }

  /**
   * Get security statistics
   */
  getSecurityStats(): {
    totalFailedAttempts: number;
    currentlyLockedUsers: number;
    totalSecurityEvents: number;
    highRiskEvents: number;
  } {
    const now = Date.now();
    const currentlyLockedUsers = Array.from(this.failedAttempts.values()).filter(
      attempt => attempt.lockedUntil && now < attempt.lockedUntil
    ).length;

    const highRiskEvents = this.securityAuditLog.filter(
      event => event.riskLevel === 'high' || event.riskLevel === 'critical'
    ).length;

    return {
      totalFailedAttempts: this.failedAttempts.size,
      currentlyLockedUsers,
      totalSecurityEvents: this.securityAuditLog.length,
      highRiskEvents
    };
  }

  /**
   * Export security data for analysis
   */
  exportSecurityData(): string {
    const data = {
      failedAttempts: Array.from(this.failedAttempts.entries()),
      securityAuditLog: this.securityAuditLog,
      stats: this.getSecurityStats(),
      exportTimestamp: new Date().toISOString()
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Clear all security data
   */
  clearAllData(): void {
    this.failedAttempts.clear();
    this.securityAuditLog.length = 0;
    this.logSecurityEvent('all_security_data_cleared', {}, 'medium');
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.failedAttempts.clear();
    this.securityAuditLog.length = 0;
  }
}

