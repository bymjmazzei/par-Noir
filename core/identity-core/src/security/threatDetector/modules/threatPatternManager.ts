import { ThreatPattern, SecurityEvent } from '../types/threatDetector';

export class ThreatPatternManager {
  private static readonly THREAT_PATTERNS: ThreatPattern[] = [
    {
      pattern: /multiple_recovery_attempts/,
      risk: 'high',
      description: 'Multiple identity recovery attempts detected',
      threshold: 3
    },
    {
      pattern: /rapid_metadata_changes/,
      risk: 'medium',
      description: 'Unusually rapid metadata modifications',
      threshold: 10
    },
    {
      pattern: /unusual_device_patterns/,
      risk: 'medium',
      description: 'Suspicious device fingerprint changes',
      threshold: 2
    },
    {
      pattern: /suspicious_ip_addresses/,
      risk: 'high',
      description: 'Access from suspicious IP addresses',
      threshold: 1
    },
    {
      pattern: /failed_authentication/,
      risk: 'medium',
      description: 'Multiple failed authentication attempts',
      threshold: 5
    },
    {
      pattern: /unusual_proof_generation/,
      risk: 'medium',
      description: 'Unusually high proof generation rate',
      threshold: 50
    },
    {
      pattern: /cross_dashboard_anomalies/,
      risk: 'high',
      description: 'Suspicious activity across multiple dashboards',
      threshold: 1
    }
  ];

  private static readonly SUSPICIOUS_IPS = new Set([
    '192.168.1.100',
    '10.0.0.50',
    '172.16.0.25'
  ]);

  private static readonly KNOWN_MALICIOUS_PATTERNS = [
    /<script>/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /eval\s*\(/i,
    /document\.cookie/i
  ];

  static getThreatPatterns(): ThreatPattern[] {
    return [...this.THREAT_PATTERNS];
  }

  static getSuspiciousIPs(): Set<string> {
    return new Set(this.SUSPICIOUS_IPS);
  }

  static getMaliciousPatterns(): RegExp[] {
    return [...this.KNOWN_MALICIOUS_PATTERNS];
  }

  static addThreatPattern(pattern: ThreatPattern): void {
    this.THREAT_PATTERNS.push(pattern);
  }

  static removeThreatPattern(index: number): boolean {
    if (index >= 0 && index < this.THREAT_PATTERNS.length) {
      this.THREAT_PATTERNS.splice(index, 1);
      return true;
    }
    return false;
  }

  static updateThreatPattern(index: number, pattern: ThreatPattern): boolean {
    if (index >= 0 && index < this.THREAT_PATTERNS.length) {
      this.THREAT_PATTERNS[index] = pattern;
      return true;
    }
    return false;
  }

  static getPatternsByRisk(risk: 'low' | 'medium' | 'high'): ThreatPattern[] {
    return this.THREAT_PATTERNS.filter(pattern => pattern.risk === risk);
  }

  static getPatternsByDescription(description: string): ThreatPattern[] {
    return this.THREAT_PATTERNS.filter(pattern => 
              pattern.description.toLowerCase().includes(description.toLowerCase())
    );
  }

  static isSuspiciousIP(ip: string): boolean {
    return this.SUSPICIOUS_IPS.has(ip);
  }

  static addSuspiciousIP(ip: string): void {
    this.SUSPICIOUS_IPS.add(ip);
  }

  static removeSuspiciousIP(ip: string): boolean {
    return this.SUSPICIOUS_IPS.delete(ip);
  }

  static testPattern(pattern: RegExp, text: string): boolean {
    return pattern.test(text);
  }

  static getPatternStats(): Record<string, any> {
    const stats = {
      totalPatterns: this.THREAT_PATTERNS.length,
      byRisk: {
        low: 0,
        medium: 0,
        high: 0
      },
      suspiciousIPs: this.SUSPICIOUS_IPS.size,
      maliciousPatterns: this.KNOWN_MALICIOUS_PATTERNS.length
    };

    this.THREAT_PATTERNS.forEach(pattern => {
      stats.byRisk[pattern.risk]++;
    });

    return stats;
  }
}
