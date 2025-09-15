// import { cryptoWorkerManager } from '../encryption/cryptoWorkerManager';
import { SecurityConfig, SecurityEvent, SecurityStatus } from '../types/advancedSecurity';
import { CertificatePinning } from './certificatePinning';
import { ThreatDetectionEngine } from './threatDetectionEngine';
import { DistributedRateLimiter } from './distributedRateLimiter';
import { SecureEnclaveManager } from './secureEnclaveManager';
import { BehavioralAnalyzer } from './behavioralAnalyzer';
import { SessionManager } from './sessionManager';
import { SecurityMetricsReporter } from './securityMetricsReporter';

export class AdvancedSecurityManager {
    private config: SecurityConfig;
    private certificatePinning: CertificatePinning;
    private threatDetection: ThreatDetectionEngine;
    private rateLimiter: DistributedRateLimiter;
    private secureEnclaves: SecureEnclaveManager;
    private behavioralAnalyzer: BehavioralAnalyzer;
    private sessionManager: SessionManager;
    private metricsReporter: SecurityMetricsReporter;
    private isInitialized: boolean;

    constructor(config: SecurityConfig) {
        this.config = config;
        this.certificatePinning = new CertificatePinning();
        this.threatDetection = new ThreatDetectionEngine();
        this.rateLimiter = new DistributedRateLimiter();
        this.secureEnclaves = new SecureEnclaveManager();
        this.behavioralAnalyzer = new BehavioralAnalyzer(
            config.anomalyThreshold || 0.8,
            config.learningRate || 0.1
        );
        this.sessionManager = new SessionManager(
            config.maxFailedAttempts || 5,
            config.lockoutDuration || 300000,
            config.sessionTimeout || 3600000
        );
        this.metricsReporter = new SecurityMetricsReporter(
            config.maxHistorySize || 10000,
            config.reportingInterval || 300000
        );
        this.isInitialized = false;
    }

    /**
     * Initialize the security manager
     */
    async initialize(): Promise<void> {
        try {
            // Initialize secure enclaves
            await this.secureEnclaves.initializeSecureEnclaves();
            
            // Set up certificate pinning if configured
            if (this.config.certificatePinning) {
                for (const [domain, fingerprints] of Object.entries(this.config.certificatePinning)) {
                    this.certificatePinning.pinCertificate(domain, fingerprints);
                }
            }

            // Set up threat detection patterns
            if (this.config.threatPatterns) {
                for (const pattern of this.config.threatPatterns) {
                    this.threatDetection.addThreat(pattern.id, pattern);
                }
            }

            this.isInitialized = true;
        } catch (error) {
            throw new Error(`Failed to initialize AdvancedSecurityManager: ${error}`);
        }
    }

    /**
     * Process a security event
     */
    async processSecurityEvent(event: SecurityEvent): Promise<SecurityStatus> {
        if (!this.isInitialized) {
            throw new Error('AdvancedSecurityManager not initialized');
        }

        try {
            // Record event in metrics
            this.metricsReporter.recordEvent(event);

            // Update behavioral profile
            if (event.userId) {
                this.behavioralAnalyzer.updateBehavioralProfile(event.userId, event);
            }

            // Check for threats
            const threatResult = this.threatDetection.detectThreat(event);
            if (threatResult.isThreat) {
                event.severity = 'high';
                event.metadata = { ...event.metadata, threatDetected: true, threatType: threatResult.threatType };
            }

            // Check rate limits
            const rateLimitKey = `${event.userId}:${event.type}`;
            if (!this.rateLimiter.checkLimit(rateLimitKey, this.config.rateLimits?.[event.type] || 100, 60000)) {
                event.severity = 'high';
                event.metadata = { ...event.metadata, rateLimited: true };
            }

            // Check for behavioral anomalies
            if (event.userId) {
                const anomalyResult = this.behavioralAnalyzer.detectAnomalies(event.userId);
                if (anomalyResult.isAnomaly) {
                    event.severity = 'high';
                    event.metadata = { ...event.metadata, behavioralAnomaly: true, anomalyDetails: anomalyResult.details };
                }
            }

            // Check secure enclave health
            this.secureEnclaves.checkSecureEnclaveHealth();

            // Generate security status
            return this.metricsReporter.generateSecurityStatus();
        } catch (error) {
            // Record error event
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorEvent: SecurityEvent = {
                id: `error-${Date.now()}`,
                type: 'security_error',
                severity: 'high',
                timestamp: new Date().toISOString(),
                details: { error: errorMessage, originalEvent: event },
                source: 'advancedSecurityManager',
                ipAddress: event.ipAddress || 'unknown',
                userAgent: event.userAgent || 'unknown',
                deviceFingerprint: event.deviceFingerprint || 'unknown',
                location: event.location || 'unknown',
                riskScore: 0.8,
                mitigated: false,
                userId: event.userId || 'system',
                metadata: { error: errorMessage, originalEvent: event }
            };
            this.metricsReporter.recordEvent(errorEvent);

            throw error;
        }
    }

    /**
     * Verify certificate for a domain
     */
    verifyCertificate(domain: string, fingerprint: string): boolean {
        return this.certificatePinning.verifyCertificate(domain, fingerprint);
    }

    /**
     * Pin a certificate for a domain
     */
    pinCertificate(domain: string, fingerprints: string[]): void {
        this.certificatePinning.pinCertificate(domain, fingerprints);
    }

    /**
     * Check if a user is rate limited
     */
    isRateLimited(key: string, limit: number, windowMs: number): boolean {
        return !this.rateLimiter.checkLimit(key, limit, windowMs);
    }

    /**
     * Create a new session
     */
    createSession(userId: string, metadata: any = {}): any {
        return this.sessionManager.createSession(userId, metadata);
    }

    /**
     * Validate a session
     */
    validateSession(sessionId: string): { isValid: boolean; session?: any; reason?: string } {
        return this.sessionManager.validateSession(sessionId);
    }

    /**
     * Record a failed login attempt
     */
    recordFailedAttempt(userId: string, metadata: any = {}): { isLocked: boolean; remainingAttempts: number; lockoutEnd?: Date } {
        return this.sessionManager.recordFailedAttempt(userId, metadata);
    }

    /**
     * Check if user is locked out
     */
    isUserLocked(userId: string): { isLocked: boolean; remainingAttempts: number; lockoutEnd?: Date } {
        return this.sessionManager.isUserLocked(userId);
    }

    /**
     * Get behavioral profile for a user
     */
    getBehavioralProfile(userId: string): any {
        return this.behavioralAnalyzer.getBehavioralProfile(userId);
    }

    /**
     * Detect behavioral anomalies for a user
     */
    detectBehavioralAnomalies(userId: string): { isAnomaly: boolean; confidence: number; details: string[] } {
        return this.behavioralAnalyzer.detectAnomalies(userId);
    }

    /**
     * Get secure enclave information
     */
    getSecureEnclaves(): Map<string, any> {
        return this.secureEnclaves.getSecureEnclaves();
    }

    /**
     * Get security metrics
     */
    getSecurityMetrics(): any {
        return this.metricsReporter.getDetailedMetrics();
    }

    /**
     * Get security status
     */
    getSecurityStatus(): SecurityStatus {
        return this.metricsReporter.generateSecurityStatus();
    }

    /**
     * Get event history
     */
    getEventHistory(limit: number = 100): SecurityEvent[] {
        return this.metricsReporter.getEventHistory(limit);
    }

    /**
     * Export security data
     */
    exportSecurityData(): string {
        return JSON.stringify({
            metrics: this.metricsReporter.exportMetrics(),
            behavioralProfiles: Array.from(this.behavioralAnalyzer.getAllBehavioralProfiles().entries()),
            secureEnclaves: Array.from(this.secureEnclaves.getSecureEnclaves().entries()),
            sessions: this.sessionManager.getAllActiveSessions(),
            exportTime: new Date().toISOString()
        }, null, 2);
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig: Partial<SecurityConfig>): void {
        this.config = { ...this.config, ...newConfig };
        
        // Update components with new config
        if (newConfig.anomalyThreshold !== undefined) {
            this.behavioralAnalyzer.setAnomalyThreshold(newConfig.anomalyThreshold);
        }
        
        if (newConfig.learningRate !== undefined) {
            this.behavioralAnalyzer.setLearningRate(newConfig.learningRate);
        }
        
        if (newConfig.maxFailedAttempts !== undefined) {
            this.sessionManager.setMaxFailedAttempts(newConfig.maxFailedAttempts);
        }
        
        if (newConfig.lockoutDuration !== undefined) {
            this.sessionManager.setLockoutDuration(newConfig.lockoutDuration);
        }
        
        if (newConfig.sessionTimeout !== undefined) {
            this.sessionManager.setSessionTimeout(newConfig.sessionTimeout);
        }
        
        if (newConfig.maxHistorySize !== undefined) {
            this.metricsReporter.setMaxHistorySize(newConfig.maxHistorySize);
        }
        
        if (newConfig.reportingInterval !== undefined) {
            this.metricsReporter.setReportingInterval(newConfig.reportingInterval);
        }
    }

    /**
     * Get current configuration
     */
    getConfig(): SecurityConfig {
        return { ...this.config };
    }

    /**
     * Reset all security data
     */
    reset(): void {
        this.metricsReporter.resetMetrics();
        this.behavioralAnalyzer.clearAllProfiles();
        this.sessionManager.clearAllSessions();
        this.sessionManager.clearAllFailedAttempts();
        this.rateLimiter.clearAll();
        this.threatDetection.clear();
    }

    /**
     * Check if manager is initialized
     */
    isReady(): boolean {
        return this.isInitialized;
    }

    /**
     * Get component status
     */
    getComponentStatus(): {
        certificatePinning: boolean;
        threatDetection: boolean;
        rateLimiter: boolean;
        secureEnclaves: boolean;
        behavioralAnalyzer: boolean;
        sessionManager: boolean;
        metricsReporter: boolean;
    } {
        return {
            certificatePinning: true,
            threatDetection: true,
            rateLimiter: true,
            secureEnclaves: this.secureEnclaves.getEnclaveCount() > 0,
            behavioralAnalyzer: true,
            sessionManager: true,
            metricsReporter: true
        };
    }
}
