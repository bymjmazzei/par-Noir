// Compliance Manager - Handles compliance and reporting functionality for crypto operations
import { ComplianceReport, KeyStoreInfo, QuantumResistanceStatus, HSMStatus, SecurityEvent } from './types/crypto';

export class ComplianceManager {
  private lastReportTime: number = Date.now();
  private reportInterval: number = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    // Start compliance reporting timer
    this.startComplianceTimer();
  }

  /**
   * Generate compliance report
   */
  generateComplianceReport(
    keyStoreInfo: KeyStoreInfo,
    quantumResistanceStatus: QuantumResistanceStatus,
    hsmStatus: HSMStatus,
    securityEvents: SecurityEvent[]
  ): ComplianceReport {
    const now = Date.now();
    const fips140Level = this.assessFIPS140Compliance(keyStoreInfo, hsmStatus);
    const quantumResistance = this.assessQuantumResistanceCompliance(quantumResistanceStatus);
    const hardwareBacking = this.assessHardwareBackingCompliance(keyStoreInfo, hsmStatus);
    const keyRotation = this.assessKeyRotationCompliance(keyStoreInfo);
    const auditLogging = this.assessAuditLoggingCompliance(securityEvents);

    const recommendations = this.generateRecommendations(
      fips140Level,
      quantumResistance,
      hardwareBacking,
      keyRotation,
      auditLogging
    );

    this.lastReportTime = now;

    return {
      fips140Level,
      quantumResistance,
      hardwareBacking,
      keyRotation,
      auditLogging,
      recommendations
    };
  }

  /**
   * Assess FIPS 140-3 compliance
   */
  private assessFIPS140Compliance(keyStoreInfo: KeyStoreInfo, hsmStatus: HSMStatus): string {
    let score = 0;
    let maxScore = 100;

    // Key management (30 points)
    if (keyStoreInfo.totalKeys > 0) {
      const keyManagementScore = Math.min(30, (keyStoreInfo.totalKeys * 3));
      score += keyManagementScore;
    }

    // Hardware backing (25 points)
    if (hsmStatus.enabled && hsmStatus.status === 'healthy') {
      score += 25;
    } else if (hsmStatus.enabled && hsmStatus.status === 'degraded') {
      score += 15;
    }

    // Security level (25 points)
    if (keyStoreInfo.securityLevel === 'top-secret') {
      score += 25;
    } else if (keyStoreInfo.securityLevel === 'military') {
      score += 20;
    } else if (keyStoreInfo.securityLevel === 'standard') {
      score += 10;
    }

    // Key rotation (20 points)
    if (keyStoreInfo.expiredKeys === 0) {
      score += 20;
    } else if (keyStoreInfo.expiredKeys < keyStoreInfo.totalKeys * 0.1) {
      score += 15;
    } else if (keyStoreInfo.expiredKeys < keyStoreInfo.totalKeys * 0.25) {
      score += 10;
    }

    const percentage = Math.round((score / maxScore) * 100);

    if (percentage >= 90) return 'Level 4';
    if (percentage >= 80) return 'Level 3';
    if (percentage >= 70) return 'Level 2';
    if (percentage >= 60) return 'Level 1';
    return 'Non-Compliant';
  }

  /**
   * Assess quantum resistance compliance
   */
  private assessQuantumResistanceCompliance(quantumResistanceStatus: QuantumResistanceStatus): string {
    if (!quantumResistanceStatus.enabled) {
      return 'Not Enabled';
    }

    let score = 0;
    let maxScore = 100;

    // Algorithm support (40 points)
    if (quantumResistanceStatus.algorithms.length >= 3) {
      score += 40;
    } else if (quantumResistanceStatus.algorithms.length >= 2) {
      score += 30;
    } else if (quantumResistanceStatus.algorithms.length >= 1) {
      score += 20;
    }

    // Key sizes (30 points)
    const maxKeySize = Math.max(...quantumResistanceStatus.keySizes);
    if (maxKeySize >= 2048) {
      score += 30;
    } else if (maxKeySize >= 1024) {
      score += 25;
    } else if (maxKeySize >= 512) {
      score += 20;
    }

    // Security level (30 points)
    if (quantumResistanceStatus.securityLevel === '256') {
      score += 30;
    } else if (quantumResistanceStatus.securityLevel === '192') {
      score += 25;
    } else if (quantumResistanceStatus.securityLevel === '128') {
      score += 20;
    }

    const percentage = Math.round((score / maxScore) * 100);

    if (percentage >= 90) return 'Excellent';
    if (percentage >= 80) return 'Good';
    if (percentage >= 70) return 'Adequate';
    if (percentage >= 60) return 'Basic';
    return 'Poor';
  }

  /**
   * Assess hardware backing compliance
   */
  private assessHardwareBackingCompliance(keyStoreInfo: KeyStoreInfo, hsmStatus: HSMStatus): string {
    if (!hsmStatus.enabled) {
      return 'Not Enabled';
    }

    let score = 0;
    let maxScore = 100;

    // HSM health (40 points)
    if (hsmStatus.status === 'healthy') {
      score += 40;
    } else if (hsmStatus.status === 'degraded') {
      score += 25;
    } else {
      score += 0;
    }

    // Hardware-backed key coverage (40 points)
    if (keyStoreInfo.totalKeys > 0) {
      const coverage = (keyStoreInfo.hardwareBackedKeys / keyStoreInfo.totalKeys) * 100;
      if (coverage >= 90) {
        score += 40;
      } else if (coverage >= 75) {
        score += 30;
      } else if (coverage >= 50) {
        score += 20;
      } else if (coverage >= 25) {
        score += 10;
      }
    }

    // Error rate (20 points)
    if (hsmStatus.errorCount === 0) {
      score += 20;
    } else if (hsmStatus.errorCount <= 5) {
      score += 15;
    } else if (hsmStatus.errorCount <= 10) {
      score += 10;
    } else if (hsmStatus.errorCount <= 20) {
      score += 5;
    }

    const percentage = Math.round((score / maxScore) * 100);

    if (percentage >= 90) return 'Excellent';
    if (percentage >= 80) return 'Good';
    if (percentage >= 70) return 'Adequate';
    if (percentage >= 60) return 'Basic';
    return 'Poor';
  }

  /**
   * Assess key rotation compliance
   */
  private assessKeyRotationCompliance(keyStoreInfo: KeyStoreInfo): string {
    if (keyStoreInfo.totalKeys === 0) {
      return 'No Keys';
    }

    const expiredPercentage = (keyStoreInfo.expiredKeys / keyStoreInfo.totalKeys) * 100;

    if (expiredPercentage === 0) {
      return 'Excellent';
    } else if (expiredPercentage <= 5) {
      return 'Good';
    } else if (expiredPercentage <= 15) {
      return 'Adequate';
    } else if (expiredPercentage <= 30) {
      return 'Poor';
    } else {
      return 'Critical';
    }
  }

  /**
   * Assess audit logging compliance
   */
  private assessAuditLoggingCompliance(securityEvents: SecurityEvent[]): string {
    if (securityEvents.length === 0) {
      return 'No Events';
    }

    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const recentEvents = securityEvents.filter(event => 
      new Date(event.timestamp).getTime() > oneDayAgo
    );

    const highRiskEvents = recentEvents.filter(event => 
      event.riskLevel === 'high' || event.riskLevel === 'critical'
    );

    const eventVolume = recentEvents.length;
    const riskLevel = highRiskEvents.length;

    if (eventVolume >= 100 && riskLevel === 0) {
      return 'Excellent';
    } else if (eventVolume >= 50 && riskLevel <= 2) {
      return 'Good';
    } else if (eventVolume >= 25 && riskLevel <= 5) {
      return 'Adequate';
    } else if (eventVolume >= 10 && riskLevel <= 10) {
      return 'Poor';
    } else {
      return 'Critical';
    }
  }

  /**
   * Generate compliance recommendations
   */
  private generateRecommendations(
    fips140Level: string,
    quantumResistance: string,
    hardwareBacking: string,
    keyRotation: string,
    auditLogging: string
  ): string[] {
    const recommendations: string[] = [];

    // FIPS 140-3 recommendations
    if (fips140Level === 'Non-Compliant' || fips140Level === 'Level 1') {
      recommendations.push('Implement hardware security modules (HSM) for key storage');
      recommendations.push('Upgrade to military-grade security level');
      recommendations.push('Implement automatic key rotation');
    } else if (fips140Level === 'Level 2') {
      recommendations.push('Consider upgrading to Level 3 or 4 for higher security');
      recommendations.push('Implement additional hardware-backed security features');
    }

    // Quantum resistance recommendations
    if (quantumResistance === 'Not Enabled' || quantumResistance === 'Poor') {
      recommendations.push('Enable quantum-resistant cryptography');
      recommendations.push('Implement multiple quantum-resistant algorithms');
      recommendations.push('Use larger key sizes (2048+ bits)');
    } else if (quantumResistance === 'Basic' || quantumResistance === 'Adequate') {
      recommendations.push('Upgrade to higher security levels');
      recommendations.push('Implement additional quantum-resistant algorithms');
    }

    // Hardware backing recommendations
    if (hardwareBacking === 'Not Enabled' || hardwareBacking === 'Poor') {
      recommendations.push('Enable HSM integration');
      recommendations.push('Use secure enclaves and TPM where available');
      recommendations.push('Implement WebAuthn for biometric authentication');
    } else if (hardwareBacking === 'Basic' || hardwareBacking === 'Adequate') {
      recommendations.push('Improve HSM health monitoring');
      recommendations.push('Increase hardware-backed key coverage');
      recommendations.push('Reduce HSM error rates');
    }

    // Key rotation recommendations
    if (keyRotation === 'Poor' || keyRotation === 'Critical') {
      recommendations.push('Implement automatic key rotation');
      recommendations.push('Set shorter key expiration periods');
      recommendations.push('Monitor key expiration dates');
    } else if (keyRotation === 'Adequate') {
      recommendations.push('Optimize key rotation schedules');
      recommendations.push('Implement proactive key renewal');
    }

    // Audit logging recommendations
    if (auditLogging === 'Poor' || auditLogging === 'Critical') {
      recommendations.push('Increase audit logging frequency');
      recommendations.push('Implement real-time security monitoring');
      recommendations.push('Reduce high-risk security events');
    } else if (auditLogging === 'Adequate') {
      recommendations.push('Enhance event correlation and analysis');
      recommendations.push('Implement automated threat detection');
    }

    return recommendations;
  }

  /**
   * Start compliance reporting timer
   */
  private startComplianceTimer(): void {
    setInterval(() => {
      // This would trigger compliance reporting
      // In a real implementation, you might send reports to compliance systems
      // Console statement removed for production
    }, this.reportInterval);
  }

  /**
   * Get compliance report schedule
   */
  getComplianceSchedule(): {
    lastReport: string;
    nextReport: string;
    interval: number;
  } {
    return {
      lastReport: new Date(this.lastReportTime).toISOString(),
      nextReport: new Date(this.lastReportTime + this.reportInterval).toISOString(),
      interval: this.reportInterval
    };
  }

  /**
   * Update compliance report interval
   */
  updateReportInterval(newInterval: number): void {
    this.reportInterval = newInterval;
  }

  /**
   * Export compliance data
   */
  exportComplianceData(): string {
    const data = {
      lastReportTime: new Date(this.lastReportTime).toISOString(),
      reportInterval: this.reportInterval,
      exportTimestamp: new Date().toISOString()
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Clear any timers or resources
  }
}
