// import { cryptoWorkerManager } from '../../../encryption/cryptoWorkerManager';
import { SecurityAlert, SecurityEvent, SecurityIndicator, AlertContext } from '../types/siem';
// import { SecureRandom } from '../../../utils/secureRandom';

export class AlertManager {
  private alerts: SecurityAlert[] = [];
  private maxAlerts: number = 1000;

  /**
   * Create security alert
   */
  async createAlert(
    title: string,
    description: string,
    events: SecurityEvent[],
    severity: 'low' | 'medium' | 'high' | 'critical',
    context?: AlertContext
  ): Promise<string> {
    const alertId = this.generateAlertId();
    
    const alert: SecurityAlert = {
      id: alertId,
      timestamp: Date.now(),
      severity,
      title,
      description,
      category: 'security_alert',
      source: 'siem',
      events,
      indicators: this.extractIndicators(events),
      status: 'new',
      assigned_to: context?.assigned_to,
      notes: context?.notes || [],
      metadata: context?.metadata
    };

    this.alerts.push(alert);
    
    // Maintain max alert limit
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(-this.maxAlerts);
    }

    return alertId;
  }

  /**
   * Update alert status
   */
  updateAlertStatus(alertId: string, status: 'new' | 'investigating' | 'resolved' | 'false_positive'): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) {
      return false;
    }

    alert.status = status;
    
    // Add note about status change
    if (!alert.notes) {
      alert.notes = [];
    }
    alert.notes.push(`Status changed to ${status} at ${new Date().toISOString()}`);

    return true;
  }

  /**
   * Assign alert to user
   */
  assignAlert(alertId: string, userId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) {
      return false;
    }

    alert.assigned_to = userId;
    
    // Add note about assignment
    if (!alert.notes) {
      alert.notes = [];
    }
    alert.notes.push(`Assigned to ${userId} at ${new Date().toISOString()}`);

    return true;
  }

  /**
   * Add note to alert
   */
  addAlertNote(alertId: string, note: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) {
      return false;
    }

    if (!alert.notes) {
      alert.notes = [];
    }
    alert.notes.push(`${new Date().toISOString()}: ${note}`);

    return true;
  }

  /**
   * Mark alert as false positive
   */
  markAsFalsePositive(alertId: string, reason: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) {
      return false;
    }

    alert.status = 'false_positive';
    
    // Add note about false positive
    if (!alert.notes) {
      alert.notes = [];
    }
    alert.notes.push(`Marked as false positive: ${reason} at ${new Date().toISOString()}`);

    return true;
  }

  /**
   * Get all alerts
   */
  getAlerts(): SecurityAlert[] {
    return [...this.alerts];
  }

  /**
   * Get alert by ID
   */
  getAlert(alertId: string): SecurityAlert | undefined {
    return this.alerts.find(alert => alert.id === alertId);
  }

  /**
   * Get alerts by status
   */
  getAlertsByStatus(status: 'new' | 'investigating' | 'resolved' | 'false_positive'): SecurityAlert[] {
    return this.alerts.filter(alert => alert.status === status);
  }

  /**
   * Get alerts by severity
   */
  getAlertsBySeverity(severity: 'low' | 'medium' | 'high' | 'critical'): SecurityAlert[] {
    return this.alerts.filter(alert => alert.severity === severity);
  }

  /**
   * Get alerts by assigned user
   */
  getAlertsByAssignee(userId: string): SecurityAlert[] {
    return this.alerts.filter(alert => alert.assigned_to === userId);
  }

  /**
   * Get alerts by time range
   */
  getAlertsByTimeRange(start: number, end: number): SecurityAlert[] {
    return this.alerts.filter(alert => 
      alert.timestamp >= start && alert.timestamp <= end
    );
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(limit: number = 50): SecurityAlert[] {
    return this.alerts.slice(-limit);
  }

  /**
   * Get alert count
   */
  getAlertCount(): number {
    return this.alerts.length;
  }

  /**
   * Get alert statistics
   */
  getAlertStats(): {
    total: number;
    bySeverity: Record<string, number>;
    byStatus: Record<string, number>;
    byAssignee: Record<string, number>;
  } {
    const stats = {
      total: this.alerts.length,
      bySeverity: {} as Record<string, number>,
      byStatus: {} as Record<string, number>,
      byAssignee: {} as Record<string, number>
    };

    for (const alert of this.alerts) {
      stats.bySeverity[alert.severity] = (stats.bySeverity[alert.severity] || 0) + 1;
      stats.byStatus[alert.status] = (stats.byStatus[alert.status] || 0) + 1;
      
      if (alert.assigned_to) {
        stats.byAssignee[alert.assigned_to] = (stats.byAssignee[alert.assigned_to] || 0) + 1;
      }
    }

    return stats;
  }

  /**
   * Clear all alerts
   */
  clearAlerts(): void {
    this.alerts = [];
  }

  /**
   * Clear resolved alerts
   */
  clearResolvedAlerts(): number {
    const initialCount = this.alerts.length;
    this.alerts = this.alerts.filter(alert => alert.status !== 'resolved');
    return initialCount - this.alerts.length;
  }

  /**
   * Clear false positive alerts
   */
  clearFalsePositiveAlerts(): number {
    const initialCount = this.alerts.length;
    this.alerts = this.alerts.filter(alert => alert.status !== 'false_positive');
    return initialCount - this.alerts.length;
  }

  /**
   * Set maximum alert limit
   */
  setMaxAlerts(max: number): void {
    this.maxAlerts = max;
    
    // Trim if current count exceeds new limit
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(-this.maxAlerts);
    }
  }

  /**
   * Get maximum alert limit
   */
  getMaxAlerts(): number {
    return this.maxAlerts;
  }

  /**
   * Export alerts for debugging
   */
  exportAlerts(): string {
    return JSON.stringify(this.alerts, null, 2);
  }

  /**
   * Import alerts from string
   */
  importAlerts(data: string): boolean {
    try {
      const imported = JSON.parse(data);
      if (Array.isArray(imported)) {
        this.alerts = imported;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Generate alert ID
   */
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Extract indicators from events
   */
  private extractIndicators(events: SecurityEvent[]): SecurityIndicator[] {
    const indicators: SecurityIndicator[] = [];
    
    for (const event of events) {
      if (event.indicators) {
        indicators.push(...event.indicators);
      }
    }

    // Remove duplicates based on value and type
    const uniqueIndicators = indicators.filter((indicator, index, self) => 
      index === self.findIndex(i => i.value === indicator.value && i.type === indicator.type)
    );

    return uniqueIndicators;
  }
}
