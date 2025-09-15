export interface DeviceSecurityConfig {
    enableWebAuthn: boolean;
    enableThreatDetection: boolean;
    enableBehavioralAnalysis: boolean;
    enableMalwareDetection: boolean;
    enableDeviceFingerprinting: boolean;
    securityLevel: 'standard' | 'military' | 'top-secret';
}
export interface DeviceFingerprint {
    id: string;
    components: {
        userAgent: string;
        screenResolution: string;
        timezone: string;
        language: string;
        platform: string;
        hardwareConcurrency: number;
        deviceMemory: number;
        maxTouchPoints: number;
        canvasFingerprint: string;
        webglFingerprint: string;
        audioFingerprint: string;
        fontFingerprint: string;
    };
    hash: string;
    timestamp: string;
}
export interface ThreatDetectionResult {
    isThreat: boolean;
    threatLevel: 'low' | 'medium' | 'high' | 'critical';
    threats: string[];
    confidence: number;
    recommendations: string[];
}
export interface BehavioralAnalysisResult {
    isAnomalous: boolean;
    anomalyScore: number;
    detectedBehaviors: string[];
    riskLevel: 'low' | 'medium' | 'high';
}
export interface WebAuthnConfig {
    rpName: string;
    rpID: string;
    userID: string;
    challenge: Uint8Array;
    timeout: number;
    attestation: 'direct' | 'indirect' | 'none';
    authenticatorSelection: {
        authenticatorAttachment: 'platform' | 'cross-platform';
        userVerification: 'required' | 'preferred' | 'discouraged';
        requireResidentKey: boolean;
    };
}
export declare class DeviceSecurityManager {
    private config;
    private deviceFingerprint;
    private threatHistory;
    private behavioralHistory;
    private securityEvents;
    constructor(config?: Partial<DeviceSecurityConfig>);
    initialize(): Promise<void>;
    private generateDeviceFingerprint;
    private generateCanvasFingerprint;
    private generateWebGLFingerprint;
    private generateAudioFingerprint;
    private generateFontFingerprint;
    private startThreatDetection;
    private detectThreats;
    private detectSuspiciousExtensions;
    private detectFingerprintChanges;
    private detectMalwareSignatures;
    private detectSuspiciousNetworkActivity;
    private startBehavioralAnalysis;
    private analyzeBehavior;
    private detectUnusualTypingPatterns;
    private detectUnusualMouseMovements;
    private detectUnusualTimingPatterns;
    private handleThreat;
    private handleAnomalousBehavior;
    private triggerEmergencyLockdown;
    private triggerEnhancedSecurity;
    private triggerWarning;
    private generateThreatRecommendations;
    private hashData;
    private logSecurityEvent;
    getDeviceFingerprint(): DeviceFingerprint | null;
    getThreatHistory(): ThreatDetectionResult[];
    getBehavioralHistory(): BehavioralAnalysisResult[];
    getSecurityEvents(): Array<{
        timestamp: string;
        event: string;
        details: any;
    }>;
}
//# sourceMappingURL=device-security.d.ts.map