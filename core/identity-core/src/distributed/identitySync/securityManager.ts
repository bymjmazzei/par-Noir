// Security Manager - Handles security-related functionality for identity sync
import { RateLimitEntry, AuditLogEntry } from '../types/identitySync';

export class SecurityManager {
  private rateLimiter = new Map<string, RateLimitEntry>();
  private auditLog: AuditLogEntry[] = [];
  private deviceId: string;

  constructor() {
    this.deviceId = this.generateDeviceId();
  }

  /**
   * Check rate limit
   */
  checkRateLimit(identifier: string): boolean {
    const now = Date.now();
    const limit = this.rateLimiter.get(identifier);
    
    if (!limit || now > limit.resetTime) {
      this.rateLimiter.set(identifier, { count: 1, resetTime: now + 60000 }); // 1 minute window
      return true;
    }
    
    if (limit.count >= 5) { // Max 5 attempts per minute
      this.logSecurityEvent('rate_limit_exceeded', { identifier });
      return false;
    }
    
    limit.count++;
    return true;
  }

  /**
   * Log security events for audit
   */
  logSecurityEvent(event: string, details: any): void {
    const logEntry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      event,
      details,
      userAgent: navigator.userAgent,
      deviceId: this.deviceId
    };
    
    this.auditLog.push(logEntry);
    
    // Keep only last 1000 events
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }
    
    // Send to secure logging service in production
    this.sendToAuditLog(logEntry);
  }

  /**
   * Send audit log entry to secure logging service
   */
  private async sendToAuditLog(logEntry: AuditLogEntry): Promise<void> {
    try {
      // In production, this would send to a secure logging service
      // Silently handle audit logging in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
    } catch (error) {
      // Silently handle audit log failures in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
    }
  }

  /**
   * Get audit log for security monitoring
   */
  getAuditLog(): AuditLogEntry[] {
    return [...this.auditLog];
  }

  /**
   * Clear audit log
   */
  clearAuditLog(): void {
    this.auditLog = [];
  }

  /**
   * Generate device ID
   */
  private generateDeviceId(): string {
    const timestamp = Date.now();
    const random = crypto.getRandomValues(new Uint8Array(16));
    const entropy = Array.from(random, byte => byte.toString(16).padStart(2, '0')).join('');
    return `device-${timestamp}-${entropy}`;
  }

  /**
   * Get device ID
   */
  getDeviceId(): string {
    return this.deviceId;
  }
}
