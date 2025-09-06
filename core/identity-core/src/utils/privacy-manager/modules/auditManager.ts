import { AuditLogEntry, SecurityEvent } from '../types/privacyManager';
import { AUDIT_LOG_MAX_SIZE } from '../constants/privacyConstants';

export class AuditManager {
  private auditLog: AuditLogEntry[] = [];

  /**
   * Log audit entry
   */
  logAuditEntry(entry: AuditLogEntry): void {
    this.auditLog.push(entry);
    
    // Keep only last 1000 entries
    if (this.auditLog.length > AUDIT_LOG_MAX_SIZE) {
      this.auditLog = this.auditLog.slice(-AUDIT_LOG_MAX_SIZE);
    }
  }

  /**
   * Get audit log for a specific DID
   */
  getAuditLog(didId: string): AuditLogEntry[] {
    return this.auditLog.filter(entry => entry.toolId === didId);
  }

  /**
   * Get all audit logs
   */
  getAllAuditLogs(): AuditLogEntry[] {
    return [...this.auditLog];
  }

  /**
   * Get audit logs by action type
   */
  getAuditLogsByAction(action: string): AuditLogEntry[] {
    return this.auditLog.filter(entry => entry.action === action);
  }

  /**
   * Get audit logs by date range
   */
  getAuditLogsByDateRange(startDate: Date, endDate: Date): AuditLogEntry[] {
    return this.auditLog.filter(entry => {
      const entryDate = new Date(entry.timestamp);
      return entryDate >= startDate && entryDate <= endDate;
    });
  }

  /**
   * Clear audit logs
   */
  clearAuditLogs(): void {
    this.auditLog = [];
  }

  /**
   * Get audit log statistics
   */
  getAuditLogStats(): {
    totalEntries: number;
    entriesByAction: Record<string, number>;
    entriesByTool: Record<string, number>;
    oltEntry: string | null;
    newestEntry: string | null;
  } {
    const stats = {
      totalEntries: this.auditLog.length,
      entriesByAction: {} as Record<string, number>,
      entriesByTool: {} as Record<string, number>,
      oltEntry: null as string | null,
      newestEntry: null as string | null
    };

    if (this.auditLog.length === 0) {
      return stats;
    }

    // Count entries by action
    this.auditLog.forEach(entry => {
      stats.entriesByAction[entry.action] = (stats.entriesByAction[entry.action] || 0) + 1;
      stats.entriesByTool[entry.toolId] = (stats.entriesByTool[entry.toolId] || 0) + 1;
    });

    // Find olt and newest entries
    const timestamps = this.auditLog.map(entry => new Date(entry.timestamp).getTime());
    const oltTime = Math.min(...timestamps);
    const newestTime = Math.max(...timestamps);

    stats.oltEntry = new Date(oltTime).toISOString();
    stats.newestEntry = new Date(newestTime).toISOString();

    return stats;
  }

  /**
   * Log security events for audit and monitoring
   */
  logSecurityEvent(securityEvent: SecurityEvent): void {
    // Store security event in audit log
    const auditEntry: AuditLogEntry = {
      timestamp: securityEvent.timestamp || new Date().toISOString(),
      toolId: securityEvent.didId || 'system',
      action: securityEvent.event || 'security_event',
      dataRequested: [],
      dataShared: [],
      userConsent: false
    };
    
    this.logAuditEntry(auditEntry);
  }

  /**
   * Export audit logs
   */
  exportAuditLogs(): string {
    return JSON.stringify(this.auditLog, null, 2);
  }

  /**
   * Import audit logs
   */
  importAuditLogs(logsJson: string): void {
    try {
      const logs = JSON.parse(logsJson);
      if (Array.isArray(logs)) {
        this.auditLog = logs;
      }
    } catch (error) {
      // Console statement removed for production
    }
  }
}
