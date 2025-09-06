// Security Manager - Handles security-related functionality for DID resolution
import { RateLimitEntry, AuditLogEntry } from '../types/didResolver';

export class SecurityManager {
  private rateLimiter = new Map<string, RateLimitEntry>();
  private auditLog: AuditLogEntry[] = [];

  /**
   * Rate limiting to prevent abuse
   */
  checkRateLimit(did: string): boolean {
    const now = Date.now();
    const limit = this.rateLimiter.get(did);
    
    if (!limit || now > limit.resetTime) {
      this.rateLimiter.set(did, { count: 1, resetTime: now + 60000 }); // 1 minute window
      return true;
    }
    
    if (limit.count >= 10) { // Max 10 attempts per minute
      this.logSecurityEvent('did_resolution_rate_limit_exceeded', { did });
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
}
