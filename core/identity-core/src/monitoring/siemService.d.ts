export interface SIEMConfig {
    provider: string;
    apiKey: string;
    endpoint: string;
    enabled: boolean;
    debug: boolean;
    alertThreshold: number;
    correlationWindow: number;
}
export interface SecurityEvent {
    id: string;
    timestamp: number;
    source: string;
    category: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    eventType: string;
    description: string;
    user?: {
        id?: string;
        email?: string;
        username?: string;
        ip_address?: string;
    };
    source_ip?: string;
    destination_ip?: string;
    user_agent?: string;
    session_id?: string;
    request_id?: string;
    metadata?: Record<string, any>;
    indicators?: SecurityIndicator[];
}
export interface SecurityIndicator {
    type: 'ip' | 'domain' | 'email' | 'hash' | 'url';
    value: string;
    confidence: number;
    threat_level: 'low' | 'medium' | 'high' | 'critical';
    source: string;
}
export interface SecurityAlert {
    id: string;
    timestamp: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    category: string;
    source: string;
    events: SecurityEvent[];
    indicators: SecurityIndicator[];
    status: 'new' | 'investigating' | 'resolved' | 'false_positive';
    assigned_to?: string;
    notes?: string[];
    metadata?: Record<string, any>;
}
export interface ThreatIntel {
    indicator: string;
    type: 'ip' | 'domain' | 'email' | 'hash' | 'url';
    threat_level: 'low' | 'medium' | 'high' | 'critical';
    confidence: number;
    sources: string[];
    first_seen: number;
    last_seen: number;
    tags: string[];
    description?: string;
}
export interface SIEMStats {
    events: {
        total: number;
        bySeverity: Record<string, number>;
        byCategory: Record<string, number>;
        bySource: Record<string, number>;
    };
    alerts: {
        total: number;
        bySeverity: Record<string, number>;
        byStatus: Record<string, number>;
    };
    threats: {
        total: number;
        byLevel: Record<string, number>;
        byType: Record<string, number>;
    };
}
export declare class SIEMService {
    private config;
    private isInitialized;
    private events;
    private alerts;
    private threatIntel;
    private correlationEngine;
    constructor(config: SIEMConfig);
    initialize(): Promise<void>;
    private simulateSIEMConnection;
    logSecurityEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): Promise<string>;
    logAuthEvent(eventType: 'login' | 'logout' | 'failed_login' | 'password_reset' | 'account_locked', userId: string, success: boolean, details?: Record<string, any>): Promise<string>;
    logDIDEvent(operation: 'create' | 'update' | 'delete' | 'resolve' | 'verify', didId: string, success: boolean, details?: Record<string, any>): Promise<string>;
    logSuspiciousActivity(activity: string, userId: string, indicators: SecurityIndicator[], details?: Record<string, any>): Promise<string>;
    logNetworkEvent(eventType: string, sourceIp: string, destinationIp: string, severity: 'low' | 'medium' | 'high' | 'critical', details?: Record<string, any>): Promise<string>;
    createAlert(title: string, description: string, events: SecurityEvent[], severity: 'low' | 'medium' | 'high' | 'critical'): Promise<string>;
    updateAlertStatus(alertId: string, status: SecurityAlert['status'], assignedTo?: string, notes?: string): Promise<boolean>;
    checkThreatIntel(event: SecurityEvent): Promise<ThreatIntel[]>;
    lookupThreatIntel(indicator: string, type: 'ip' | 'domain' | 'email' | 'hash' | 'url'): Promise<ThreatIntel | null>;
    private correlateEvents;
    private checkCorrelationPatterns;
    private determineAuthEventSeverity;
    private determineThreatSeverity;
    private extractIndicators;
    private sendEvent;
    private sendAlert;
    private simulateEventSending;
    private simulateAlertSending;
    private generateEventId;
    private generateAlertId;
    getStats(): SIEMStats;
    isReady(): boolean;
    getConfig(): SIEMConfig;
    updateConfig(newConfig: Partial<SIEMConfig>): Promise<void>;
    getEvents(): SecurityEvent[];
    getAlerts(): SecurityAlert[];
    getThreatIntel(): ThreatIntel[];
    clearOldEvents(olderThan: number): void;
}
export declare const siemService: SIEMService;
//# sourceMappingURL=siemService.d.ts.map