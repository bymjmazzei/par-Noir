export interface ThreatDetectionConfig {
    enabled: boolean;
    sensitivity: 'low' | 'medium' | 'high';
    monitoringInterval: number;
    maxEventsPerHour: number;
    alertThreshold: number;
    autoBlock: boolean;
    logLevel: 'info' | 'warn' | 'error';
}
export interface SecurityEvent {
    id: string;
    type: 'authentication' | 'authorization' | 'data_access' | 'system' | 'network' | 'behavioral';
    severity: 'low' | 'medium' | 'high' | 'critical';
    timestamp: string;
    userId?: string;
    deviceId?: string;
    ipAddress?: string;
    userAgent?: string;
    details: Record<string, any>;
    riskScore: number;
    action?: 'blocked' | 'flagged' | 'monitored' | 'allowed';
}
export interface BehavioralProfile {
    userId: string;
    deviceId: string;
    typingPattern: number[];
    mouseMovement: number[];
    sessionDuration: number;
    loginTimes: string[];
    locations: string[];
    riskScore: number;
    lastUpdated: string;
}
export interface ThreatAlert {
    id: string;
    eventId: string;
    type: 'suspicious_activity' | 'potential_breach' | 'anomaly_detected' | 'rate_limit_exceeded';
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    timestamp: string;
    acknowledged: boolean;
    resolved: boolean;
    actionTaken?: string;
}
export declare class ThreatDetectionSystem {
    private config;
    private events;
    private alerts;
    private behavioralProfiles;
    private monitoringInterval;
    private isInitialized;
    constructor(config?: Partial<ThreatDetectionConfig>);
    initialize(): Promise<void>;
    recordEvent(event: Omit<SecurityEvent, 'id' | 'timestamp' | 'riskScore'>): void;
    private calculateRiskScore;
    private analyzeBehavioralRisk;
    private createAlert;
    private determineAlertType;
    private generateAlertMessage;
    private updateBehavioralProfile;
    private startMonitoring;
    private performPeriodicAnalysis;
    private detectPatterns;
    private initializeEventListeners;
    private monitorAuthenticationEvents;
    private monitorDataAccessEvents;
    private monitorSystemEvents;
    private blockUser;
    private getRecentEvents;
    private cleanupOldEvents;
    private cleanupOldData;
    private loadBehavioralProfiles;
    private updateBehavioralProfiles;
    private generateEventId;
    private generateAlertId;
    private log;
    private shouldLog;
    getEvents(): SecurityEvent[];
    getAlerts(): ThreatAlert[];
    getBehavioralProfiles(): BehavioralProfile[];
    acknowledgeAlert(alertId: string): void;
    resolveAlert(alertId: string): void;
    getConfig(): ThreatDetectionConfig;
    updateConfig(newConfig: Partial<ThreatDetectionConfig>): void;
    isEnabled(): boolean;
    destroy(): void;
}
//# sourceMappingURL=threat-detection.d.ts.map