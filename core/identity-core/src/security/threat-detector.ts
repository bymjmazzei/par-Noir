/**
 * Threat Detection System
 * Monitors for suspicious activity and security threats
 * Runs silently in the background without user interaction
 */

export interface SecurityEvent {
  id: string;
  timestamp: string;
  eventType: string;
  userId: string;
  dashboardId: string;
  details: any;
  riskLevel: 'low' | 'medium' | 'high';
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
}

export interface ThreatReport {
  threats: Threat[];
  riskLevel: 'low' | 'medium' | 'high';
  recommendations: string[];
  timestamp: string;
}

export interface Threat {
  type: 'low' | 'medium' | 'high';
  event: SecurityEvent;
  timestamp: string;
  confidence: number;
  description: string;
}

export interface ThreatPattern {
  pattern: RegExp;
  risk: 'low' | 'medium' | 'high';
  description: string;
  threshold: number;
}

export class ThreatDetector {
  private static readonly EVENT_HISTORY: SecurityEvent[] = [];
  private static readonly THREAT_PATTERNS: ThreatPattern[] = [
    // Multiple recovery attempts
    {
      pattern: /multiple_recovery_attempts/,
      risk: 'high',
      description: 'Multiple identity recovery attempts detected',
      threshold: 3
    },
    
    // Rapid metadata changes
    {
      pattern: /rapid_metadata_changes/,
      risk: 'medium',
      description: 'Unusually rapid metadata modifications',
      threshold: 10
    },
    
    // Unusual device patterns
    {
      pattern: /unusual_device_patterns/,
      risk: 'medium',
      description: 'Suspicious device fingerprint changes',
      threshold: 2
    },
    
    // Suspicious IP addresses
    {
      pattern: /suspicious_ip_addresses/,
      risk: 'high',
      description: 'Access from suspicious IP addresses',
      threshold: 1
    },
    
    // Failed authentication attempts
    {
      pattern: /failed_authentication/,
      risk: 'medium',
      description: 'Multiple failed authentication attempts',
      threshold: 5
    },
    
    // Unusual proof generation
    {
      pattern: /unusual_proof_generation/,
      risk: 'medium',
      description: 'Unusually high proof generation rate',
      threshold: 50
    },
    
    // Cross-dashboard anomalies
    {
      pattern: /cross_dashboard_anomalies/,
      risk: 'high',
      description: 'Suspicious activity across multiple dashboards',
      threshold: 1
    },
    
    // Data injection attempts
    {
      pattern: /data_injection_attempts/,
      risk: 'high',
      description: 'Potential data injection or XSS attempts',
      threshold: 1
    },
    
    // Session hijacking indicators
    {
      pattern: /session_hijacking/,
      risk: 'high',
      description: 'Potential session hijacking detected',
      threshold: 1
    },
    
    // Brute force attempts
    {
      pattern: /brute_force_attempts/,
      risk: 'high',
      description: 'Brute force attack patterns detected',
      threshold: 10
    }
  ];

  private static readonly SUSPICIOUS_IPS = new Set([
    '0.0.0.0',
    '127.0.0.1',
    '255.255.255.255'
  ]);

  private static readonly KNOWN_MALICIOUS_PATTERNS = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /data:text\/html/gi,
    /on\w+\s*=/gi,
    /expression\s*\(/gi,
    /eval\s*\(/gi,
    /union\s+select/gi,
    /drop\s+table/gi,
    /exec\s*\(/gi
  ];

  /**
   * Record a security event
   */
  static recordEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): void {
    const securityEvent: SecurityEvent = {
      ...event,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    };

    this.EVENT_HISTORY.push(securityEvent);
    
    // Keep only last 1000 events
    if (this.EVENT_HISTORY.length > 1000) {
      this.EVENT_HISTORY.splice(0, this.EVENT_HISTORY.length - 1000);
    }

    // Check for threats immediately
    const threats = this.detectThreats([securityEvent]);
    if (threats.length > 0) {
      this.handleThreats(threats);
    }
  }

  /**
   * Detect threats from recent events
   */
  static detectThreats(events: SecurityEvent[] = this.EVENT_HISTORY): Threat[] {
    const threats: Threat[] = [];
    const now = Date.now();

    // Analyze events for patterns
    for (const pattern of this.THREAT_PATTERNS) {
      const matchingEvents = events.filter(event => 
        pattern.pattern.test(event.eventType) ||
        pattern.pattern.test(JSON.stringify(event.details))
      );

      if (matchingEvents.length >= pattern.threshold) {
        const recentEvents = matchingEvents.filter(event => 
          now - new Date(event.timestamp).getTime() < 60 * 60 * 1000 // Last hour
        );

        if (recentEvents.length >= pattern.threshold) {
          threats.push({
            type: pattern.risk,
            event: recentEvents[recentEvents.length - 1],
            timestamp: new Date().toISOString(),
            confidence: this.calculateConfidence(recentEvents, pattern),
            description: pattern.description
          });
        }
      }
    }

    // Check for specific threat patterns
    const specificThreats = this.detectSpecificThreats(events);
    threats.push(...specificThreats);

    return threats;
  }

  /**
   * Detect specific threat patterns
   */
  private static detectSpecificThreats(events: SecurityEvent[]): Threat[] {
    const threats: Threat[] = [];
    const now = Date.now();

    // Check for multiple recovery attempts
    const recoveryEvents = events.filter(event => 
      event.eventType === 'recovery_attempt' && 
      now - new Date(event.timestamp).getTime() < 24 * 60 * 60 * 1000 // Last 24 hours
    );

    if (recoveryEvents.length > 3) {
      threats.push({
        type: 'high',
        event: recoveryEvents[recoveryEvents.length - 1],
        timestamp: new Date().toISOString(),
        confidence: 0.9,
        description: 'Multiple identity recovery attempts detected'
      });
    }

    // Check for rapid metadata changes
    const metadataEvents = events.filter(event => 
      event.eventType === 'metadata_update' && 
      now - new Date(event.timestamp).getTime() < 60 * 60 * 1000 // Last hour
    );

    if (metadataEvents.length > 10) {
      threats.push({
        type: 'medium',
        event: metadataEvents[metadataEvents.length - 1],
        timestamp: new Date().toISOString(),
        confidence: 0.7,
        description: 'Unusually rapid metadata modifications'
      });
    }

    // Check for suspicious IP addresses
    const suspiciousIPEvents = events.filter(event => 
      event.ipAddress && this.SUSPICIOUS_IPS.has(event.ipAddress)
    );

    if (suspiciousIPEvents.length > 0) {
      threats.push({
        type: 'high',
        event: suspiciousIPEvents[suspiciousIPEvents.length - 1],
        timestamp: new Date().toISOString(),
        confidence: 0.8,
        description: 'Access from suspicious IP addresses'
      });
    }

    // Check for injection attempts
    const injectionEvents = events.filter(event => 
      this.KNOWN_MALICIOUS_PATTERNS.some(pattern => 
        pattern.test(JSON.stringify(event.details))
      )
    );

    if (injectionEvents.length > 0) {
      threats.push({
        type: 'high',
        event: injectionEvents[injectionEvents.length - 1],
        timestamp: new Date().toISOString(),
        confidence: 0.95,
        description: 'Potential data injection or XSS attempts'
      });
    }

    // Check for session anomalies
    const sessionEvents = events.filter(event => 
      event.eventType === 'session_validation' && 
      event.details?.isValid === false
    );

    if (sessionEvents.length > 5) {
      threats.push({
        type: 'high',
        event: sessionEvents[sessionEvents.length - 1],
        timestamp: new Date().toISOString(),
        confidence: 0.85,
        description: 'Multiple session validation failures'
      });
    }

    return threats;
  }

  /**
   * Calculate threat confidence
   */
  private static calculateConfidence(events: SecurityEvent[], pattern: ThreatPattern): number {
    const recentEvents = events.filter(event => 
      Date.now() - new Date(event.timestamp).getTime() < 60 * 60 * 1000 // Last hour
    );

    const frequency = recentEvents.length / pattern.threshold;
    const timeSpan = recentEvents.length > 1 ? 
      new Date(recentEvents[recentEvents.length - 1].timestamp).getTime() - 
      new Date(recentEvents[0].timestamp).getTime() : 0;

    let confidence = Math.min(frequency, 1.0);

    // Adjust confidence based on time span
    if (timeSpan < 5 * 60 * 1000) { // Less than 5 minutes
      confidence *= 1.2;
    } else if (timeSpan > 60 * 60 * 1000) { // More than 1 hour
      confidence *= 0.8;
    }

    // Adjust confidence based on risk level
    if (pattern.risk === 'high') {
      confidence *= 1.1;
    } else if (pattern.risk === 'low') {
      confidence *= 0.9;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Handle detected threats
   */
  private static handleThreats(threats: Threat[]): void {
    const highRiskThreats = threats.filter(threat => threat.type === 'high');
    const mediumRiskThreats = threats.filter(threat => threat.type === 'medium');

    // Log all threats for monitoring
    console.warn('Security threats detected:', threats);

    // Handle high-risk threats immediately
    for (const threat of highRiskThreats) {
      this.handleHighRiskThreat(threat);
    }

    // Handle medium-risk threats
    for (const threat of mediumRiskThreats) {
      this.handleMediumRiskThreat(threat);
    }
  }

  /**
   * Handle high-risk threats
   */
  private static handleHighRiskThreat(threat: Threat): void {
    // Log for immediate attention
    console.error('HIGH RISK THREAT DETECTED:', threat);

    // In a real implementation, you would:
    // 1. Send alerts to security team
    // 2. Temporarily lock affected accounts
    // 3. Increase monitoring for affected users
    // 4. Trigger additional security measures

    // For now, just log the threat
    this.recordEvent({
      eventType: 'high_risk_threat_handled',
      userId: threat.event.userId,
      dashboardId: threat.event.dashboardId,
      details: {
        threatType: threat.type,
        description: threat.description,
        confidence: threat.confidence,
        originalEvent: threat.event
      },
      riskLevel: 'high'
    });
  }

  /**
   * Handle medium-risk threats
   */
  private static handleMediumRiskThreat(threat: Threat): void {
    // Log for monitoring
    console.warn('MEDIUM RISK THREAT DETECTED:', threat);

    // In a real implementation, you would:
    // 1. Increase monitoring for affected users
    // 2. Send notifications to users
    // 3. Require additional authentication for sensitive operations

    this.recordEvent({
      eventType: 'medium_risk_threat_handled',
      userId: threat.event.userId,
      dashboardId: threat.event.dashboardId,
      details: {
        threatType: threat.type,
        description: threat.description,
        confidence: threat.confidence,
        originalEvent: threat.event
      },
      riskLevel: 'medium'
    });
  }

  /**
   * Generate threat report
   */
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

  /**
   * Calculate overall risk level
   */
  private static calculateOverallRiskLevel(threats: Threat[]): 'low' | 'medium' | 'high' {
    const highRiskCount = threats.filter(t => t.type === 'high').length;
    const mediumRiskCount = threats.filter(t => t.type === 'medium').length;

    if (highRiskCount > 0) return 'high';
    if (mediumRiskCount > 2 || threats.length > 5) return 'medium';
    return 'low';
  }

  /**
   * Generate security recommendations
   */
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

  /**
   * Get threat statistics
   */
  static getThreatStats(): {
    totalThreats: number;
    highRiskThreats: number;
    mediumRiskThreats: number;
    lowRiskThreats: number;
    averageConfidence: number;
  } {
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
      averageConfidence
    };
  }

  /**
   * Clean up old events
   */
  static cleanupOldEvents(): void {
    const cutoffTime = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days ago
    
    const oldEventCount = this.EVENT_HISTORY.length;
    this.EVENT_HISTORY.splice(0, this.EVENT_HISTORY.length);
    
    // Keep only recent events
    this.EVENT_HISTORY.push(...this.EVENT_HISTORY.filter(event => 
      new Date(event.timestamp).getTime() > cutoffTime
    ));

    console.log(`Cleaned up ${oldEventCount - this.EVENT_HISTORY.length} old security events`);
  }
}
