import { SecurityEvent, ThreatReport, Threat, ThreatStats } from '../types/threatDetector';
import { ThreatPatternManager } from './threatPatternManager';
import { ThreatDetectionEngine } from './threatDetectionEngine';

export class ThreatDetector {
  private static readonly EVENT_HISTORY: SecurityEvent[] = [];

  static recordEvent(event: SecurityEvent): void {
    this.EVENT_HISTORY.push(event);
    this.cleanupOldEvents();
  }

  static getEvents(): SecurityEvent[] {
    return [...this.EVENT_HISTORY];
  }

  static detectThreats(): Threat[] {
    return ThreatDetectionEngine.detectThreats(this.EVENT_HISTORY);
  }

  static generateThreatReport(): ThreatReport {
    const threats = this.detectThreats();
    const riskLevel = this.calculateOverallRiskLevel(threats);
    const recommendations = this.generateRecommendations(threats);

    return {
      threats,
      riskLevel,
      recommendations,
      timestamp: new Date().toISOString()
    };
  }

  private static calculateOverallRiskLevel(threats: Threat[]): 'low' | 'medium' | 'high' {
    const highRiskCount = threats.filter(t => t.type === 'high').length;
    const mediumRiskCount = threats.filter(t => t.type === 'medium').length;

    if (highRiskCount > 0) return 'high';
    if (mediumRiskCount > 2 || threats.length > 5) return 'medium';
    return 'low';
  }

  private static generateRecommendations(threats: Threat[]): string[] {
    const recommendations: string[] = [];

    const highRiskThreats = threats.filter(t => t.type === 'high');
    const mediumRiskThreats = threats.filter(t => t.type === 'medium');

    if (highRiskThreats.length > 0) {
      recommendations.push('Immediate security review required');
      recommendations.push('Consider temporary account suspension for affected users');
      recommendations.push('Increase monitoring and alerting');
    }

    if (mediumRiskThreats.length > 0) {
      recommendations.push('Review security policies and procedures');
      recommendations.push('Consider implementing additional authentication measures');
      recommendations.push('Monitor affected users more closely');
    }

    if (threats.length > 10) {
      recommendations.push('System-wide security audit recommended');
      recommendations.push('Review and update threat detection patterns');
    }

    return recommendations;
  }

  static getThreatStats(): ThreatStats {
    const threats = this.detectThreats();
    
    const highRiskCount = threats.filter(t => t.type === 'high').length;
    const mediumRiskCount = threats.filter(t => t.type === 'medium').length;
    const lowRiskCount = threats.filter(t => t.type === 'low').length;
    
    const totalConfidence = threats.reduce((sum, threat) => sum + threat.confidence, 0);
    const averageConfidence = threats.length > 0 ? totalConfidence / threats.length : 0;

    return {
      totalThreats: threats.length,
      highRiskThreats: highRiskCount,
      mediumRiskThreats: mediumRiskCount,
      lowRiskThreats: lowRiskCount,
      averageConfidence,
      threatsByLevel: { high: highRiskCount, medium: mediumRiskCount, low: lowRiskCount },
      threatsByType: { authentication: 0, authorization: 0, data_access: 0, system: 0, network: 0, behavioral: 0 },
      lastThreat: threats.length > 0 ? threats[threats.length - 1].timestamp : new Date().toISOString()
    };
  }

  static cleanupOldEvents(): void {
    const cutoffTime = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days ago
    
    const oldEventCount = this.EVENT_HISTORY.length;
    this.EVENT_HISTORY.splice(0, this.EVENT_HISTORY.length);
    
    // Keep only recent events
    this.EVENT_HISTORY.push(...this.EVENT_HISTORY.filter(event => 
      new Date(event.timestamp).getTime() > cutoffTime
    ));

    // Console statement removed for production
  }

  static getPatternManager(): typeof ThreatPatternManager {
    return ThreatPatternManager;
  }

  static getDetectionEngine(): typeof ThreatDetectionEngine {
    return ThreatDetectionEngine;
  }

  static getEventCount(): number {
    return this.EVENT_HISTORY.length;
  }

  static clearEvents(): void {
    this.EVENT_HISTORY.splice(0, this.EVENT_HISTORY.length);
  }

  static exportEvents(): string {
    return JSON.stringify(this.EVENT_HISTORY, null, 2);
  }

  static importEvents(data: string): boolean {
    try {
      const imported = JSON.parse(data);
      if (Array.isArray(imported)) {
        this.EVENT_HISTORY.splice(0, this.EVENT_HISTORY.length, ...imported);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}
