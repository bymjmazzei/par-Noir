import { SecurityEvent, Threat, ThreatPattern } from '../types/threatDetector';
import { ThreatPatternManager } from './threatPatternManager';

export class ThreatDetectionEngine {
  static detectThreats(events: SecurityEvent[]): Threat[] {
    const threats: Threat[] = [];
    
    // Check for pattern-based threats
    const patternThreats = this.detectPatternThreats(events);
    threats.push(...patternThreats);

    // Check for specific threat patterns
    const specificThreats = this.detectSpecificThreats(events);
    threats.push(...specificThreats);

    return threats;
  }

  private static detectPatternThreats(events: SecurityEvent[]): Threat[] {
    const threats: Threat[] = [];
    const patterns = ThreatPatternManager.getThreatPatterns();

    patterns.forEach(pattern => {
      const matchingEvents = events.filter(event => 
        pattern.pattern.test(event.eventType) || 
        pattern.pattern.test(JSON.stringify(event.details))
      );

      if (matchingEvents.length >= pattern.threshold) {
        threats.push({
          type: pattern.risk,
          event: matchingEvents[matchingEvents.length - 1],
          timestamp: new Date().toISOString(),
          confidence: this.calculateConfidence(matchingEvents, pattern),
          description: pattern.description
        });
      }
    });

    return threats;
  }

  private static detectSpecificThreats(events: SecurityEvent[]): Threat[] {
    const threats: Threat[] = [];
    const now = Date.now();

    // Check for multiple recovery attempts
    const recoveryEvents = events.filter(event => 
      event.eventType === 'recovery_attempt' && 
      now - new Date(event.timestamp).getTime() < 24 * 60 * 60 * 1000
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
      now - new Date(event.timestamp).getTime() < 60 * 60 * 1000
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
      event.ipAddress && ThreatPatternManager.isSuspiciousIP(event.ipAddress)
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
    const maliciousPatterns = ThreatPatternManager.getMaliciousPatterns();
    const injectionEvents = events.filter(event => 
      maliciousPatterns.some(pattern => 
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

  private static calculateConfidence(events: SecurityEvent[], pattern: ThreatPattern): number {
    const eventCount = events.length;
    const threshold = pattern.threshold;
    
    if (eventCount >= threshold * 2) return 0.95;
    if (eventCount >= threshold * 1.5) return 0.85;
    if (eventCount >= threshold) return 0.75;
    
    return 0.5;
  }

  static analyzeEvent(event: SecurityEvent): Threat[] {
    return this.detectThreats([event]);
  }

  static getThreatLevel(events: SecurityEvent[]): 'low' | 'medium' | 'high' {
    const threats = this.detectThreats(events);
    const highRiskCount = threats.filter(t => t.type === 'high').length;
    const mediumRiskCount = threats.filter(t => t.type === 'medium').length;

    if (highRiskCount > 0) return 'high';
    if (mediumRiskCount > 2 || threats.length > 5) return 'medium';
    return 'low';
  }

  static getThreatSummary(events: SecurityEvent[]): {
    totalThreats: number;
    highRiskCount: number;
    mediumRiskCount: number;
    lowRiskCount: number;
    overallRisk: 'low' | 'medium' | 'high';
  } {
    const threats = this.detectThreats(events);
    const highRiskCount = threats.filter(t => t.type === 'high').length;
    const mediumRiskCount = threats.filter(t => t.type === 'medium').length;
    const lowRiskCount = threats.filter(t => t.type === 'low').length;

    return {
      totalThreats: threats.length,
      highRiskCount,
      mediumRiskCount,
      lowRiskCount,
      overallRisk: this.getThreatLevel(events)
    };
  }
}
