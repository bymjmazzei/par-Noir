import { QuantumResistantConfig } from '../encryption/quantum-resistant';
import { HSMConfig } from './hsmManager';
import { ThreatDetectionConfig } from './threat-detection';
export interface SecurityMonitorConfig {
    enabled: boolean;
    quantumResistant: QuantumResistantConfig;
    hsm: HSMConfig;
    threatDetection: ThreatDetectionConfig;
    autoUpgrade: boolean;
    fallbackMode: boolean;
    monitoringLevel: 'basic' | 'enhanced' | 'enterprise';
}
export interface SecurityStatus {
    overall: 'secure' | 'warning' | 'critical';
    quantumResistant: 'enabled' | 'disabled' | 'unavailable';
    hsm: 'connected' | 'disconnected' | 'unavailable';
    threatDetection: 'active' | 'inactive' | 'error';
    lastCheck: string;
    alerts: number;
    events: number;
    recommendations: string[];
}
export interface SecurityMetrics {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    averageResponseTime: number;
    securityScore: number;
    uptime: number;
    lastIncident?: string;
}
export declare class SecurityMonitor {
    private config;
    private quantumCrypto;
    private hsmManager;
    private threatDetection;
    private status;
    private metrics;
    private isInitialized;
    private healthCheckInterval;
    constructor(config?: Partial<SecurityMonitorConfig>);
    initialize(): Promise<void>;
    private initializeQuantumResistant;
    private initializeHSM;
    private initializeThreatDetection;
    private startHealthMonitoring;
    private performHealthCheck;
    private updateStatus;
    private updateMetrics;
    private generateRecommendations;
    private enableFallbackMode;
    generateEnhancedKeyPair(): Promise<any>;
    signData(data: string, keyPair: any): Promise<string>;
    verifySignature(data: string, signature: string, publicKey: string): Promise<boolean>;
    upgradeSecurityLevel(): Promise<void>;
    getSecurityStatus(): SecurityStatus;
    getSecurityMetrics(): SecurityMetrics;
    getConfig(): SecurityMonitorConfig;
    updateConfig(newConfig: Partial<SecurityMonitorConfig>): void;
    isEnhancedSecurityAvailable(): boolean;
    private arrayBufferToBase64;
    private base64ToArrayBuffer;
    private log;
    destroy(): void;
}
//# sourceMappingURL=security-monitor.d.ts.map