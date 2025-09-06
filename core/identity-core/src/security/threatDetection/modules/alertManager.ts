import { ThreatAlert, SecurityEvent, ThreatDetectionConfig } from '../types/threatDetection';
// import { SecureRandom } from '../../utils/secureRandom';

export class AlertManager {
  private config: ThreatDetectionConfig;
  private alerts: ThreatAlert[] = [];
  private maxAlerts: number = 1000;

  constructor(config: ThreatDetectionConfig) {
    this.config = config;
  }

  createAlert(event: SecurityEvent, type: ThreatAlert['type'], message: string): ThreatAlert {
    const alert: ThreatAlert = {
      id: this.generateAlertId(),
      eventId: event.id,
      type,
      severity: event.severity,
      message,
      timestamp: new Date().toISOString(),
      acknowledged: false,
      resolved: false
    };

    this.alerts.push(alert);
    this.cleanupOldAlerts();

    return alert;
  }

  getAlerts(): ThreatAlert[] {
    return [...this.alerts];
  }

  getAlertsByType(type: ThreatAlert['type']): ThreatAlert[] {
    return this.alerts.filter(alert => alert.type === type);
  }

  getAlertsBySeverity(severity: ThreatAlert['severity']): ThreatAlert[] {
    return this.alerts.filter(alert => alert.severity === severity);
  }

  getUnresolvedAlerts(): ThreatAlert[] {
    return this.alerts.filter(alert => !alert.resolved);
  }

  getUnacknowledgedAlerts(): ThreatAlert[] {
    return this.alerts.filter(alert => !alert.acknowledged);
  }

  getRecentAlerts(limit: number = 50): ThreatAlert[] {
    return this.alerts.slice(-limit);
  }

  getAlertsCount(): number {
    return this.alerts.length;
  }

  getAlertsPerHour(): number {
    const oneHourAgo = Date.now() - 3600000;
    return this.alerts.filter(alert => 
      new Date(alert.timestamp).getTime() > oneHourAgo
    ).length;
  }

  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  resolveAlert(alertId: string, actionTaken?: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      if (actionTaken) {
        alert.actionTaken = actionTaken;
      }
      return true;
    }
    return false;
  }

  updateAlertAction(alertId: string, actionTaken: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.actionTaken = actionTaken;
      return true;
    }
    return false;
  }

  deleteAlert(alertId: string): boolean {
    const index = this.alerts.findIndex(a => a.id === alertId);
    if (index !== -1) {
      this.alerts.splice(index, 1);
      return true;
    }
    return false;
  }

  clearAlerts(): void {
    this.alerts = [];
  }

  clearResolvedAlerts(): void {
    this.alerts = this.alerts.filter(alert => !alert.resolved);
  }

  setMaxAlerts(max: number): void {
    this.maxAlerts = max;
    this.cleanupOldAlerts();
  }

  getMaxAlerts(): number {
    return this.maxAlerts;
  }

  exportAlerts(): string {
    return JSON.stringify(this.alerts, null, 2);
  }

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

  getAlertStats(): Record<string, any> {
    const stats: Record<string, any> = {
      total: this.alerts.length,
      byType: {},
      bySeverity: {},
      acknowledged: 0,
      resolved: 0,
      pending: 0
    };

    this.alerts.forEach(alert => {
      stats.byType[alert.type] = (stats.byType[alert.type] || 0) + 1;
      stats.bySeverity[alert.severity] = (stats.bySeverity[alert.severity] || 0) + 1;
      
      if (alert.acknowledged) stats.acknowledged++;
      if (alert.resolved) stats.resolved++;
      if (!alert.resolved) stats.pending++;
    });

    return stats;
  }

  private cleanupOldAlerts(): void {
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(-this.maxAlerts);
    }
  }

  private generateAlertId(): string {
    return `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
