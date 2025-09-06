// Security Manager - Handles security-related functionality for decentralized auth
import { RateLimitEntry, AuditLogEntry } from '../types/decentralizedAuth';

export class SecurityManager {
  private rateLimiter = new Map<string, RateLimitEntry>();
  private auditLog: AuditLogEntry[] = [];

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
      this.logSecurityEvent('auth_rate_limit_exceeded', { identifier });
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
      userAgent: navigator.userAgent
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
   * Delay execution (for timing attack prevention)
   */
  delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
