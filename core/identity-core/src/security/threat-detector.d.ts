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
export declare class ThreatDetector {
    private static readonly EVENT_HISTORY;
    private static readonly THREAT_PATTERNS;
    private static readonly SUSPICIOUS_IPS;
    private static readonly KNOWN_MALICIOUS_PATTERNS;
    static recordEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): void;
    static detectThreats(events?: SecurityEvent[]): Threat[];
    private static detectSpecificThreats;
    private static calculateConfidence;
    private static handleThreats;
    private static handleHighRiskThreat;
    private static handleMediumRiskThreat;
    static generateThreatReport(): ThreatReport;
    private static calculateOverallRiskLevel;
    private static generateRecommendations;
    static getThreatStats(): {
        totalThreats: number;
        highRiskThreats: number;
        mediumRiskThreats: number;
        lowRiskThreats: number;
        averageConfidence: number;
    };
    static cleanupOldEvents(): void;
}
//# sourceMappingURL=threat-detector.d.ts.map