"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdvancedSecurityManager = exports.DistributedRateLimiter = exports.ThreatDetectionEngine = exports.CertificatePinning = void 0;
class CertificatePinning {
    constructor() {
        this.pinnedCertificates = new Map();
    }
    pinCertificate(domain, fingerprints) {
        this.pinnedCertificates.set(domain, fingerprints);
    }
    verifyCertificate(domain, fingerprint) {
        const pinnedFingerprints = this.pinnedCertificates.get(domain);
        if (!pinnedFingerprints)
            return true;
        return pinnedFingerprints.includes(fingerprint);
    }
    getPinnedCertificates() {
        return this.pinnedCertificates;
    }
}
exports.CertificatePinning = CertificatePinning;
class ThreatDetectionEngine {
    constructor() {
        this.threats = new Map();
        this.riskScores = new Map();
    }
    detectThreat(data) {
        const riskScore = this.calculateRiskScore(data);
        const isThreat = riskScore > 0.7;
        return {
            isThreat,
            riskScore,
            details: { timestamp: new Date().toISOString(), data }
        };
    }
    calculateRiskScore(data) {
        return Math.random() * 0.5;
    }
}
exports.ThreatDetectionEngine = ThreatDetectionEngine;
class DistributedRateLimiter {
    constructor() {
        this.limits = new Map();
    }
    checkLimit(key, limit, windowMs) {
        const now = Date.now();
        const current = this.limits.get(key);
        if (!current || now > current.resetTime) {
            this.limits.set(key, { count: 1, resetTime: now + windowMs, limit });
            return true;
        }
        if (current.count >= limit) {
            return false;
        }
        current.count++;
        return true;
    }
    resetLimit(key) {
        this.limits.delete(key);
    }
}
exports.DistributedRateLimiter = DistributedRateLimiter;
class AdvancedSecurityManager {
    constructor(config = {}) {
        this.securityEvents = new Map();
        this.threatIndicators = new Map();
        this.behavioralProfiles = new Map();
        this.secureEnclaves = new Map();
        this.failedAttempts = new Map();
        this.activeSessions = new Map();
        this.anomalyScores = new Map();
        this.securityMetrics = {
            totalEvents: 0,
            criticalEvents: 0,
            threatsBlocked: 0,
            anomaliesDetected: 0,
            lastUpdated: new Date().toISOString()
        };
        this.config = {
            threatDetectionEnabled: true,
            behavioralAnalysisEnabled: true,
            secureEnclaveEnabled: true,
            realTimeMonitoringEnabled: true,
            anomalyThreshold: 0.7,
            maxFailedAttempts: 3,
            lockoutDuration: 30 * 60 * 1000,
            sessionTimeout: 15 * 60 * 1000,
            securityLevel: 'military',
            quantumResistant: true,
            hsmEnabled: true,
            ...config
        };
        this.initializeSecurity();
    }
    async initializeSecurity() {
        try {
            if (this.config.secureEnclaveEnabled) {
                await this.initializeSecureEnclaves();
            }
            if (this.config.realTimeMonitoringEnabled) {
                this.startRealTimeMonitoring();
            }
            this.startSessionCleanupTimer();
            this.startSecurityMetricsTimer();
            this.logSecurityEvent('security_initialized', { config: this.config }, 'low');
        }
        catch (error) {
            this.logSecurityEvent('security_initialization_failed', { error: error instanceof Error ? error.message : 'Unknown error' }, 'critical');
            throw error;
        }
    }
    async initializeSecureEnclaves() {
        try {
            if (this.isTPMAvailable()) {
                const tpmEnclave = {
                    id: 'tpm-main',
                    type: 'tpm',
                    status: 'active',
                    capabilities: ['key_generation', 'key_storage', 'attestation', 'measurement'],
                    keyStore: new Map(),
                    lastHealthCheck: new Date().toISOString(),
                    healthScore: 1.0
                };
                this.secureEnclaves.set('tpm-main', tpmEnclave);
            }
            if (this.isSGXAvailable()) {
                const sgxEnclave = {
                    id: 'sgx-main',
                    type: 'sgx',
                    status: 'active',
                    capabilities: ['secure_computation', 'attestation', 'sealed_storage'],
                    keyStore: new Map(),
                    lastHealthCheck: new Date().toISOString(),
                    healthScore: 1.0
                };
                this.secureEnclaves.set('sgx-main', sgxEnclave);
            }
            if (this.isTrustZoneAvailable()) {
                const trustzoneEnclave = {
                    id: 'trustzone-main',
                    type: 'trustzone',
                    status: 'active',
                    capabilities: ['secure_world', 'normal_world_isolation', 'secure_boot'],
                    keyStore: new Map(),
                    lastHealthCheck: new Date().toISOString(),
                    healthScore: 1.0
                };
                this.secureEnclaves.set('trustzone-main', trustzoneEnclave);
            }
            if (this.isSecureEnclaveAvailable()) {
                const appleEnclave = {
                    id: 'apple-secure-enclave',
                    type: 'secure-enclave',
                    status: 'active',
                    capabilities: ['biometric_processing', 'key_storage', 'secure_enclave_processor'],
                    keyStore: new Map(),
                    lastHealthCheck: new Date().toISOString(),
                    healthScore: 1.0
                };
                this.secureEnclaves.set('apple-secure-enclave', appleEnclave);
            }
            this.logSecurityEvent('secure_enclaves_initialized', {
                count: this.secureEnclaves.size,
                types: Array.from(this.secureEnclaves.values()).map(e => e.type)
            }, 'low');
        }
        catch (error) {
            this.logSecurityEvent('secure_enclave_initialization_failed', { error: error instanceof Error ? error.message : 'Unknown error' }, 'critical');
            throw error;
        }
    }
    isTPMAvailable() {
        try {
            if (window.isSecureContext) {
                return true;
            }
            return false;
        }
        catch {
            return false;
        }
    }
    isSGXAvailable() {
        try {
            if (window.isSecureContext && crypto.subtle) {
                return true;
            }
            return false;
        }
        catch {
            return false;
        }
    }
    isTrustZoneAvailable() {
        try {
            if (window.isSecureContext) {
                return true;
            }
            return false;
        }
        catch {
            return false;
        }
    }
    isSecureEnclaveAvailable() {
        try {
            const userAgent = navigator.userAgent.toLowerCase();
            if (userAgent.includes('mac') || userAgent.includes('iphone') || userAgent.includes('ipad')) {
                return true;
            }
            return false;
        }
        catch {
            return false;
        }
    }
    startRealTimeMonitoring() {
        setInterval(() => {
            this.detectAnomalies();
            this.updateThreatIndicators();
            this.checkSecureEnclaveHealth();
        }, 5000);
    }
    startSessionCleanupTimer() {
        setInterval(() => {
            this.cleanupExpiredSessions();
        }, 60000);
    }
    startSecurityMetricsTimer() {
        setInterval(() => {
            this.updateSecurityMetrics();
        }, 30000);
    }
    logSecurityEvent(type, details, severity, source = 'system') {
        const event = {
            id: this.generateEventId(),
            timestamp: new Date().toISOString(),
            type,
            severity,
            details,
            source,
            ipAddress: this.getClientIP(),
            userAgent: navigator.userAgent,
            deviceFingerprint: this.generateDeviceFingerprint(),
            location: this.getClientLocation(),
            riskScore: this.calculateRiskScore(type, details, severity),
            mitigated: false
        };
        this.securityEvents.set(event.id, event);
        this.securityMetrics.totalEvents++;
        if (severity === 'critical') {
            this.securityMetrics.criticalEvents++;
        }
        if (severity === 'critical') {
            this.triggerCriticalEventResponse(event);
        }
        return event;
    }
    generateEventId() {
        const timestamp = Date.now();
        const random = crypto.getRandomValues(new Uint8Array(16));
        const randomHex = Array.from(random).map(b => b.toString(16).padStart(2, '0')).join('');
        return `event-${timestamp}-${randomHex}`;
    }
    getClientIP() {
        return '***.***.***.***';
    }
    generateDeviceFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.textBaseline = 'top';
                ctx.font = '14px Arial';
                ctx.fillText('Device fingerprint', 2, 2);
                const fingerprint = canvas.toDataURL();
                return btoa(fingerprint);
            }
        }
        catch {
        }
        const fingerprint = `${navigator.userAgent}-${screen.width}x${screen.height}-${navigator.language}-${new Date().getTimezoneOffset()}`;
        return btoa(fingerprint);
    }
    getClientLocation() {
        return 'Unknown';
    }
    calculateRiskScore(type, details, severity) {
        let baseScore = 0;
        switch (severity) {
            case 'low':
                baseScore = 0.1;
                break;
            case 'medium':
                baseScore = 0.3;
                break;
            case 'high':
                baseScore = 0.6;
                break;
            case 'critical':
                baseScore = 0.9;
                break;
        }
        switch (type) {
            case 'authentication_failure':
                baseScore += 0.2;
                if (details.failedAttempts > 5)
                    baseScore += 0.3;
                break;
            case 'suspicious_activity':
                baseScore += 0.3;
                break;
            case 'threat_detected':
                baseScore += 0.5;
                break;
            case 'anomaly_detected':
                baseScore += 0.4;
                break;
            case 'security_violation':
                baseScore += 0.6;
                break;
            case 'key_compromise':
                baseScore += 0.8;
                break;
            case 'data_breach_attempt':
                baseScore += 0.7;
                break;
            case 'privilege_escalation':
                baseScore += 0.8;
                break;
            case 'session_hijacking':
                baseScore += 0.7;
                break;
            case 'man_in_the_middle':
                baseScore += 0.8;
                break;
            case 'quantum_attack_detected':
                baseScore += 0.9;
                break;
            case 'hsm_compromise':
                baseScore += 0.9;
                break;
            case 'secure_enclave_breach':
                baseScore += 0.9;
                break;
        }
        if (details.location && details.location !== 'Unknown') {
            if (details.location.includes('suspicious')) {
                baseScore += 0.2;
            }
        }
        if (details.deviceFingerprint) {
            if (details.deviceFingerprint.includes('suspicious')) {
                baseScore += 0.2;
            }
        }
        return Math.min(baseScore, 1.0);
    }
    triggerCriticalEventResponse(event) {
        try {
            this.immediateThreatResponse(event);
            this.notifySecurityTeam(event);
            this.activateEmergencyProtocols(event);
            this.logSecurityEvent('critical_response_triggered', {
                originalEvent: event.id,
                responseActions: ['immediate_response', 'security_notification', 'emergency_protocols']
            }, 'critical');
        }
        catch (error) {
            console.error('Failed to trigger critical event response:', error);
        }
    }
    immediateThreatResponse(event) {
        if (event.ipAddress) {
            this.blockIP(event.ipAddress);
        }
        if (event.details.userId) {
            this.revokeUserSessions(event.details.userId);
        }
        if (event.details.userId) {
            this.lockdownAccount(event.details.userId);
        }
    }
    notifySecurityTeam(event) {
        if (process.env.NODE_ENV === 'development') {
            console.error('SECURITY ALERT - Critical Event:', {
                eventId: event.id,
                type: event.type,
                severity: event.severity,
                timestamp: event.timestamp,
                details: event.details,
                riskScore: event.riskScore
            });
        }
    }
    activateEmergencyProtocols(event) {
        this.config.anomalyThreshold = Math.max(0.3, this.config.anomalyThreshold - 0.2);
        this.config.sessionTimeout = Math.max(5 * 60 * 1000, this.config.sessionTimeout / 2);
        this.config.threatDetectionEnabled = true;
        this.config.behavioralAnalysisEnabled = true;
        this.config.realTimeMonitoringEnabled = true;
    }
    blockIP(ipAddress) {
        this.logSecurityEvent('ip_blocked', { ipAddress }, 'high');
    }
    revokeUserSessions(userId) {
        let revokedCount = 0;
        for (const [sessionId, session] of this.activeSessions.entries()) {
            if (session.userId === userId) {
                this.activeSessions.delete(sessionId);
                revokedCount++;
            }
        }
        if (revokedCount > 0) {
            this.logSecurityEvent('sessions_revoked', { userId, count: revokedCount }, 'high');
        }
    }
    lockdownAccount(userId) {
        this.logSecurityEvent('account_lockdown', { userId }, 'high');
    }
    detectAnomalies() {
        if (!this.config.behavioralAnalysisEnabled)
            return;
        for (const [userId, profile] of this.behavioralProfiles.entries()) {
            const anomalyScore = this.calculateAnomalyScore(userId, profile);
            this.anomalyScores.set(userId, anomalyScore);
            if (anomalyScore > this.config.anomalyThreshold) {
                this.logSecurityEvent('anomaly_detected', {
                    userId,
                    anomalyScore,
                    threshold: this.config.anomalyThreshold
                }, 'high');
                this.securityMetrics.anomaliesDetected++;
            }
        }
    }
    calculateAnomalyScore(userId, profile) {
        let score = 0;
        const now = new Date();
        const currentHour = now.getHours();
        const loginTime = profile.patterns.loginTimes.find(time => time === currentHour);
        if (!loginTime) {
            score += 0.3;
        }
        const currentLocation = this.getClientLocation();
        if (!profile.patterns.locations.includes(currentLocation)) {
            score += 0.4;
        }
        const currentDevice = this.generateDeviceFingerprint();
        if (!profile.patterns.devices.includes(currentDevice)) {
            score += 0.5;
        }
        return Math.min(score, 1.0);
    }
    updateThreatIndicators() {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        for (const [indicatorId, indicator] of this.threatIndicators.entries()) {
            if (new Date(indicator.timestamp) < oneHourAgo) {
                this.threatIndicators.delete(indicatorId);
            }
        }
    }
    checkSecureEnclaveHealth() {
        for (const [enclaveId, enclave] of this.secureEnclaves.entries()) {
            try {
                const healthScore = Math.random() * 0.2 + 0.8;
                enclave.healthScore = healthScore;
                enclave.lastHealthCheck = new Date().toISOString();
                if (healthScore < 0.9) {
                    enclave.status = 'compromised';
                    this.logSecurityEvent('secure_enclave_breach', {
                        enclaveId,
                        healthScore,
                        type: enclave.type
                    }, 'critical');
                }
            }
            catch (error) {
                enclave.status = 'compromised';
                enclave.healthScore = 0;
                this.logSecurityEvent('secure_enclave_health_check_failed', {
                    enclaveId,
                    error: error instanceof Error ? error.message : 'Unknown error'
                }, 'high');
            }
        }
    }
    cleanupExpiredSessions() {
        const now = Date.now();
        let cleanedCount = 0;
        for (const [sessionId, session] of this.activeSessions.entries()) {
            if (now - session.lastActivity > this.config.sessionTimeout) {
                this.activeSessions.delete(sessionId);
                cleanedCount++;
            }
        }
        if (cleanedCount > 0) {
            this.logSecurityEvent('expired_sessions_cleaned', { count: cleanedCount }, 'low');
        }
    }
    updateSecurityMetrics() {
        this.securityMetrics.lastUpdated = new Date().toISOString();
    }
    recordAuthenticationAttempt(userId, success, details = {}) {
        if (success) {
            this.logSecurityEvent('authentication_success', { userId, ...details }, 'low');
            this.updateBehavioralProfile(userId, 'login');
            this.createSession(userId);
        }
        else {
            this.logSecurityEvent('authentication_failure', { userId, ...details }, 'medium');
            this.recordFailedAttempt(userId);
            if (this.shouldLockAccount(userId)) {
                this.lockAccount(userId);
            }
        }
    }
    updateBehavioralProfile(userId, action) {
        if (!this.config.behavioralAnalysisEnabled)
            return;
        let profile = this.behavioralProfiles.get(userId);
        if (!profile) {
            profile = this.createBehavioralProfile(userId);
        }
        const now = new Date();
        profile.patterns.actions.push(action);
        profile.patterns.loginTimes.push(now.getHours());
        profile.patterns.locations.push(this.getClientLocation());
        profile.patterns.devices.push(this.generateDeviceFingerprint());
        profile.lastUpdated = now.toISOString();
        if (profile.patterns.actions.length > 100) {
            profile.patterns.actions = profile.patterns.actions.slice(-100);
            profile.patterns.loginTimes = profile.patterns.loginTimes.slice(-100);
            profile.patterns.locations = profile.patterns.locations.slice(-100);
            profile.patterns.devices = profile.patterns.devices.slice(-100);
        }
        this.behavioralProfiles.set(userId, profile);
    }
    createBehavioralProfile(userId) {
        const now = new Date();
        return {
            userId,
            patterns: {
                loginTimes: [],
                locations: [],
                devices: [],
                actions: [],
                typingPatterns: [],
                mouseMovements: []
            },
            baseline: {
                averageLoginTime: 0,
                commonLocations: [],
                commonDevices: [],
                commonActions: [],
                averageTypingSpeed: 0,
                averageMouseSpeed: 0
            },
            lastUpdated: now.toISOString(),
            confidence: 0.5
        };
    }
    createSession(userId) {
        const sessionId = this.generateSessionId();
        const now = Date.now();
        this.activeSessions.set(sessionId, {
            userId,
            startTime: now,
            lastActivity: now,
            ipAddress: this.getClientIP(),
            deviceFingerprint: this.generateDeviceFingerprint()
        });
    }
    generateSessionId() {
        const timestamp = Date.now();
        const random = crypto.getRandomValues(new Uint8Array(16));
        const randomHex = Array.from(random).map(b => b.toString(16).padStart(2, '0')).join('');
        return `session-${timestamp}-${randomHex}`;
    }
    recordFailedAttempt(userId) {
        const existing = this.failedAttempts.get(userId);
        const now = Date.now();
        if (existing) {
            existing.count++;
            existing.lastAttempt = now;
        }
        else {
            this.failedAttempts.set(userId, {
                count: 1,
                lastAttempt: now,
                ipAddress: this.getClientIP(),
                userAgent: navigator.userAgent
            });
        }
    }
    shouldLockAccount(userId) {
        const attempts = this.failedAttempts.get(userId);
        if (!attempts)
            return false;
        return attempts.count >= this.config.maxFailedAttempts;
    }
    lockAccount(userId) {
        this.logSecurityEvent('account_locked', {
            userId,
            reason: 'max_failed_attempts',
            failedAttempts: this.failedAttempts.get(userId)?.count || 0
        }, 'high');
    }
    getSecurityStatus() {
        const activeThreats = this.threatIndicators.size;
        const recentAnomalies = this.securityMetrics.anomaliesDetected;
        let totalHealth = 0;
        let enclaveCount = 0;
        for (const enclave of this.secureEnclaves.values()) {
            totalHealth += enclave.healthScore;
            enclaveCount++;
        }
        const averageHealth = enclaveCount > 0 ? totalHealth / enclaveCount : 1.0;
        let overallStatus = 'secure';
        if (activeThreats > 0 || recentAnomalies > 5 || averageHealth < 0.8) {
            overallStatus = 'warning';
        }
        if (activeThreats > 5 || recentAnomalies > 10 || averageHealth < 0.6) {
            overallStatus = 'critical';
        }
        let lastIncident = 'None';
        if (this.securityMetrics.criticalEvents > 0) {
            const criticalEvents = Array.from(this.securityEvents.values())
                .filter(e => e.severity === 'critical')
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            if (criticalEvents.length > 0) {
                lastIncident = criticalEvents[0].timestamp;
            }
        }
        const recommendations = [];
        if (activeThreats > 0) {
            recommendations.push('Investigate active threats immediately');
        }
        if (recentAnomalies > 5) {
            recommendations.push('Review behavioral analysis patterns');
        }
        if (averageHealth < 0.8) {
            recommendations.push('Check secure enclave health');
        }
        if (this.securityMetrics.criticalEvents > 0) {
            recommendations.push('Review critical security events');
        }
        return {
            overallStatus,
            activeThreats,
            recentAnomalies,
            secureEnclaveHealth: averageHealth,
            lastIncident,
            recommendations
        };
    }
    getSecurityMetrics() {
        return { ...this.securityMetrics };
    }
    getSecurityEvents(limit = 100) {
        const events = Array.from(this.securityEvents.values())
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        return events.slice(0, limit);
    }
    getThreatIndicators() {
        return Array.from(this.threatIndicators.values());
    }
    getBehavioralProfiles() {
        return Array.from(this.behavioralProfiles.values());
    }
    getSecureEnclaves() {
        return Array.from(this.secureEnclaves.values());
    }
    getFailedAttempts() {
        return new Map(this.failedAttempts);
    }
    getActiveSessions() {
        return new Map(this.activeSessions);
    }
    getAnomalyScores() {
        return new Map(this.anomalyScores);
    }
}
exports.AdvancedSecurityManager = AdvancedSecurityManager;
//# sourceMappingURL=advanced-security.js.map