"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThreatDetector = void 0;
class ThreatDetector {
    static recordEvent(event) {
        const securityEvent = {
            ...event,
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString()
        };
        this.EVENT_HISTORY.push(securityEvent);
        if (this.EVENT_HISTORY.length > 1000) {
            this.EVENT_HISTORY.splice(0, this.EVENT_HISTORY.length - 1000);
        }
        const threats = this.detectThreats([securityEvent]);
        if (threats.length > 0) {
            this.handleThreats(threats);
        }
    }
    static detectThreats(events = this.EVENT_HISTORY) {
        const threats = [];
        const now = Date.now();
        for (const pattern of this.THREAT_PATTERNS) {
            const matchingEvents = events.filter(event => pattern.pattern.test(event.eventType) ||
                pattern.pattern.test(JSON.stringify(event.details)));
            if (matchingEvents.length >= pattern.threshold) {
                const recentEvents = matchingEvents.filter(event => now - new Date(event.timestamp).getTime() < 60 * 60 * 1000);
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
        const specificThreats = this.detectSpecificThreats(events);
        threats.push(...specificThreats);
        return threats;
    }
    static detectSpecificThreats(events) {
        const threats = [];
        const now = Date.now();
        const recoveryEvents = events.filter(event => event.eventType === 'recovery_attempt' &&
            now - new Date(event.timestamp).getTime() < 24 * 60 * 60 * 1000);
        if (recoveryEvents.length > 3) {
            threats.push({
                type: 'high',
                event: recoveryEvents[recoveryEvents.length - 1],
                timestamp: new Date().toISOString(),
                confidence: 0.9,
                description: 'Multiple identity recovery attempts detected'
            });
        }
        const metadataEvents = events.filter(event => event.eventType === 'metadata_update' &&
            now - new Date(event.timestamp).getTime() < 60 * 60 * 1000);
        if (metadataEvents.length > 10) {
            threats.push({
                type: 'medium',
                event: metadataEvents[metadataEvents.length - 1],
                timestamp: new Date().toISOString(),
                confidence: 0.7,
                description: 'Unusually rapid metadata modifications'
            });
        }
        const suspiciousIPEvents = events.filter(event => event.ipAddress && this.SUSPICIOUS_IPS.has(event.ipAddress));
        if (suspiciousIPEvents.length > 0) {
            threats.push({
                type: 'high',
                event: suspiciousIPEvents[suspiciousIPEvents.length - 1],
                timestamp: new Date().toISOString(),
                confidence: 0.8,
                description: 'Access from suspicious IP addresses'
            });
        }
        const injectionEvents = events.filter(event => this.KNOWN_MALICIOUS_PATTERNS.some(pattern => pattern.test(JSON.stringify(event.details))));
        if (injectionEvents.length > 0) {
            threats.push({
                type: 'high',
                event: injectionEvents[injectionEvents.length - 1],
                timestamp: new Date().toISOString(),
                confidence: 0.95,
                description: 'Potential data injection or XSS attempts'
            });
        }
        const sessionEvents = events.filter(event => event.eventType === 'session_validation' &&
            event.details?.isValid === false);
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
    static calculateConfidence(events, pattern) {
        const recentEvents = events.filter(event => Date.now() - new Date(event.timestamp).getTime() < 60 * 60 * 1000);
        const frequency = recentEvents.length / pattern.threshold;
        const timeSpan = recentEvents.length > 1 ?
            new Date(recentEvents[recentEvents.length - 1].timestamp).getTime() -
                new Date(recentEvents[0].timestamp).getTime() : 0;
        let confidence = Math.min(frequency, 1.0);
        if (timeSpan < 5 * 60 * 1000) {
            confidence *= 1.2;
        }
        else if (timeSpan > 60 * 60 * 1000) {
            confidence *= 0.8;
        }
        if (pattern.risk === 'high') {
            confidence *= 1.1;
        }
        else if (pattern.risk === 'low') {
            confidence *= 0.9;
        }
        return Math.min(confidence, 1.0);
    }
    static handleThreats(threats) {
        const highRiskThreats = threats.filter(threat => threat.type === 'high');
        const mediumRiskThreats = threats.filter(threat => threat.type === 'medium');
        console.warn('Security threats detected:', threats);
        for (const threat of highRiskThreats) {
            this.handleHighRiskThreat(threat);
        }
        for (const threat of mediumRiskThreats) {
            this.handleMediumRiskThreat(threat);
        }
    }
    static handleHighRiskThreat(threat) {
        console.error('HIGH RISK THREAT DETECTED:', threat);
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
    static handleMediumRiskThreat(threat) {
        console.warn('MEDIUM RISK THREAT DETECTED:', threat);
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
    static generateThreatReport() {
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
    static calculateOverallRiskLevel(threats) {
        const highRiskCount = threats.filter(t => t.type === 'high').length;
        const mediumRiskCount = threats.filter(t => t.type === 'medium').length;
        if (highRiskCount > 0)
            return 'high';
        if (mediumRiskCount > 2 || threats.length > 5)
            return 'medium';
        return 'low';
    }
    static generateRecommendations(threats) {
        const recommendations = [];
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
    static getThreatStats() {
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
    static cleanupOldEvents() {
        const cutoffTime = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const oldEventCount = this.EVENT_HISTORY.length;
        this.EVENT_HISTORY.splice(0, this.EVENT_HISTORY.length);
        this.EVENT_HISTORY.push(...this.EVENT_HISTORY.filter(event => new Date(event.timestamp).getTime() > cutoffTime));
        console.log(`Cleaned up ${oldEventCount - this.EVENT_HISTORY.length} old security events`);
    }
}
exports.ThreatDetector = ThreatDetector;
ThreatDetector.EVENT_HISTORY = [];
ThreatDetector.THREAT_PATTERNS = [
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
    },
    {
        pattern: /data_injection_attempts/,
        risk: 'high',
        description: 'Potential data injection or XSS attempts',
        threshold: 1
    },
    {
        pattern: /session_hijacking/,
        risk: 'high',
        description: 'Potential session hijacking detected',
        threshold: 1
    },
    {
        pattern: /brute_force_attempts/,
        risk: 'high',
        description: 'Brute force attack patterns detected',
        threshold: 10
    }
];
ThreatDetector.SUSPICIOUS_IPS = new Set([
    '0.0.0.0',
    '127.0.0.1',
    '255.255.255.255'
]);
ThreatDetector.KNOWN_MALICIOUS_PATTERNS = [
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
//# sourceMappingURL=threat-detector.js.map