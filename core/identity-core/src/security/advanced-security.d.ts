export interface SecurityConfig {
    threatDetectionEnabled: boolean;
    behavioralAnalysisEnabled: boolean;
    secureEnclaveEnabled: boolean;
    realTimeMonitoringEnabled: boolean;
    anomalyThreshold: number;
    maxFailedAttempts: number;
    lockoutDuration: number;
    sessionTimeout: number;
    securityLevel: 'standard' | 'military' | 'top-secret';
    quantumResistant: boolean;
    hsmEnabled: boolean;
}
export interface SecurityEvent {
    id: string;
    timestamp: string;
    type: SecurityEventType;
    severity: 'low' | 'medium' | 'high' | 'critical';
    details: any;
    source: string;
    ipAddress?: string;
    userAgent?: string;
    deviceFingerprint?: string;
    location?: string;
    riskScore: number;
    mitigated: boolean;
    mitigationAction?: string;
}
export interface ThreatIndicator {
    id: string;
    type: ThreatType;
    confidence: number;
    source: string;
    timestamp: string;
    details: any;
    ioc?: string;
    ttp?: string;
}
export interface BehavioralProfile {
    userId: string;
    patterns: {
        loginTimes: number[];
        locations: string[];
        devices: string[];
        actions: string[];
        typingPatterns: number[];
        mouseMovements: number[];
    };
    baseline: {
        averageLoginTime: number;
        commonLocations: string[];
        commonDevices: string[];
        commonActions: string[];
        averageTypingSpeed: number;
        averageMouseSpeed: number;
    };
    lastUpdated: string;
    confidence: number;
}
export interface SecureEnclave {
    id: string;
    type: 'tpm' | 'secure-enclave' | 'trustzone' | 'sgx';
    status: 'active' | 'inactive' | 'compromised';
    capabilities: string[];
    keyStore: Map<string, any>;
    lastHealthCheck: string;
    healthScore: number;
}
export type SecurityEventType = 'login_attempt' | 'authentication_success' | 'authentication_failure' | 'suspicious_activity' | 'threat_detected' | 'anomaly_detected' | 'security_violation' | 'key_compromise' | 'data_breach_attempt' | 'privilege_escalation' | 'session_hijacking' | 'man_in_the_middle' | 'quantum_attack_detected' | 'hsm_compromise' | 'secure_enclave_breach' | 'security_initialized' | 'security_initialization_failed' | 'secure_enclaves_initialized' | 'secure_enclave_initialization_failed' | 'critical_response_triggered' | 'ip_blocked' | 'sessions_revoked' | 'account_lockdown' | 'secure_enclave_health_check_failed' | 'expired_sessions_cleaned' | 'account_locked';
export type ThreatType = 'brute_force' | 'credential_stuffing' | 'phishing' | 'malware' | 'social_engineering' | 'insider_threat' | 'advanced_persistent_threat' | 'quantum_attack' | 'side_channel_attack' | 'timing_attack' | 'power_analysis' | 'fault_injection';
export declare class CertificatePinning {
    private pinnedCertificates;
    pinCertificate(domain: string, fingerprints: string[]): void;
    verifyCertificate(domain: string, fingerprint: string): boolean;
    getPinnedCertificates(): Map<string, string[]>;
}
export declare class ThreatDetectionEngine {
    private threats;
    private riskScores;
    detectThreat(data: any): {
        isThreat: boolean;
        riskScore: number;
        details: any;
    };
    private calculateRiskScore;
}
export declare class DistributedRateLimiter {
    private limits;
    checkLimit(key: string, limit: number, windowMs: number): boolean;
    resetLimit(key: string): void;
}
export declare class AdvancedSecurityManager {
    private config;
    private securityEvents;
    private threatIndicators;
    private behavioralProfiles;
    private secureEnclaves;
    private failedAttempts;
    private activeSessions;
    private anomalyScores;
    private securityMetrics;
    constructor(config?: Partial<SecurityConfig>);
    private initializeSecurity;
    private initializeSecureEnclaves;
    private isTPMAvailable;
    private isSGXAvailable;
    private isTrustZoneAvailable;
    private isSecureEnclaveAvailable;
    private startRealTimeMonitoring;
    private startSessionCleanupTimer;
    private startSecurityMetricsTimer;
    private logSecurityEvent;
    private generateEventId;
    private getClientIP;
    private generateDeviceFingerprint;
    private getClientLocation;
    private calculateRiskScore;
    private triggerCriticalEventResponse;
    private immediateThreatResponse;
    private notifySecurityTeam;
    private activateEmergencyProtocols;
    private blockIP;
    private revokeUserSessions;
    private lockdownAccount;
    private detectAnomalies;
    private calculateAnomalyScore;
    private updateThreatIndicators;
    private checkSecureEnclaveHealth;
    private cleanupExpiredSessions;
    private updateSecurityMetrics;
    recordAuthenticationAttempt(userId: string, success: boolean, details?: any): void;
    private updateBehavioralProfile;
    private createBehavioralProfile;
    private createSession;
    private generateSessionId;
    private recordFailedAttempt;
    private shouldLockAccount;
    private lockAccount;
    getSecurityStatus(): {
        overallStatus: 'secure' | 'warning' | 'critical';
        activeThreats: number;
        recentAnomalies: number;
        secureEnclaveHealth: number;
        lastIncident: string;
        recommendations: string[];
    };
    getSecurityMetrics(): typeof this.securityMetrics;
    getSecurityEvents(limit?: number): SecurityEvent[];
    getThreatIndicators(): ThreatIndicator[];
    getBehavioralProfiles(): BehavioralProfile[];
    getSecureEnclaves(): SecureEnclave[];
    getFailedAttempts(): Map<string, {
        count: number;
        lastAttempt: number;
        ipAddress?: string;
        userAgent?: string;
    }>;
    getActiveSessions(): Map<string, {
        userId: string;
        startTime: number;
        lastActivity: number;
        ipAddress: string;
        deviceFingerprint: string;
    }>;
    getAnomalyScores(): Map<string, number>;
}
//# sourceMappingURL=advanced-security.d.ts.map