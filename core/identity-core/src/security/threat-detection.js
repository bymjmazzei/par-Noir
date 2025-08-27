"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThreatDetectionSystem = void 0;
class ThreatDetectionSystem {
    constructor(config = {}) {
        this.events = [];
        this.alerts = [];
        this.behavioralProfiles = new Map();
        this.monitoringInterval = null;
        this.isInitialized = false;
        this.config = {
            enabled: false,
            sensitivity: 'medium',
            monitoringInterval: 30000,
            maxEventsPerHour: 1000,
            alertThreshold: 70,
            autoBlock: false,
            logLevel: 'warn',
            ...config
        };
    }
    async initialize() {
        if (!this.config.enabled) {
            return;
        }
        try {
            await this.loadBehavioralProfiles();
            this.startMonitoring();
            this.initializeEventListeners();
            this.isInitialized = true;
            this.log('info', 'Threat detection system initialized');
        }
        catch (error) {
            this.log('error', `Failed to initialize threat detection: ${error}`);
        }
    }
    recordEvent(event) {
        if (!this.config.enabled) {
            return;
        }
        try {
            const securityEvent = {
                ...event,
                id: this.generateEventId(),
                timestamp: new Date().toISOString(),
                riskScore: this.calculateRiskScore(event)
            };
            this.events.push(securityEvent);
            if (securityEvent.riskScore >= this.config.alertThreshold) {
                this.createAlert(securityEvent);
            }
            this.updateBehavioralProfile(securityEvent);
            this.cleanupOldEvents();
            this.log('info', `Security event recorded: ${event.type} (risk: ${securityEvent.riskScore})`);
        }
        catch (error) {
            this.log('error', `Failed to record security event: ${error}`);
        }
    }
    calculateRiskScore(event) {
        let riskScore = 0;
        switch (event.type) {
            case 'authentication':
                riskScore += 20;
                break;
            case 'authorization':
                riskScore += 15;
                break;
            case 'data_access':
                riskScore += 25;
                break;
            case 'system':
                riskScore += 10;
                break;
            case 'network':
                riskScore += 30;
                break;
            case 'behavioral':
                riskScore += 35;
                break;
        }
        switch (event.severity) {
            case 'low':
                riskScore *= 0.5;
                break;
            case 'medium':
                riskScore *= 1.0;
                break;
            case 'high':
                riskScore *= 1.5;
                break;
            case 'critical':
                riskScore *= 2.0;
                break;
        }
        if (event.userId && event.deviceId) {
            const profile = this.behavioralProfiles.get(`${event.userId}-${event.deviceId}`);
            if (profile) {
                const behavioralRisk = this.analyzeBehavioralRisk(event, profile);
                riskScore += behavioralRisk;
            }
        }
        const recentEvents = this.getRecentEvents(event.userId, 3600000);
        if (recentEvents.length > this.config.maxEventsPerHour) {
            riskScore += 50;
        }
        return Math.min(100, Math.max(0, riskScore));
    }
    analyzeBehavioralRisk(event, profile) {
        let risk = 0;
        const currentHour = new Date().getHours();
        const typicalHours = profile.loginTimes.map(time => new Date(time).getHours());
        if (!typicalHours.includes(currentHour)) {
            risk += 20;
        }
        if (event.details.sessionDuration) {
            const avgSessionDuration = profile.sessionDuration;
            const currentSessionDuration = event.details.sessionDuration;
            const deviation = Math.abs(currentSessionDuration - avgSessionDuration) / avgSessionDuration;
            if (deviation > 0.5) {
                risk += 15;
            }
        }
        if (event.details.location && !profile.locations.includes(event.details.location)) {
            risk += 25;
        }
        return risk;
    }
    createAlert(event) {
        const alert = {
            id: this.generateAlertId(),
            eventId: event.id,
            type: this.determineAlertType(event),
            severity: event.severity,
            message: this.generateAlertMessage(event),
            timestamp: new Date().toISOString(),
            acknowledged: false,
            resolved: false
        };
        this.alerts.push(alert);
        if (this.config.autoBlock && event.riskScore >= 90) {
            this.blockUser(event.userId, event.deviceId);
            alert.actionTaken = 'user_blocked';
        }
        this.log('warn', `Threat alert created: ${alert.message}`);
    }
    determineAlertType(event) {
        if (event.type === 'behavioral') {
            return 'anomaly_detected';
        }
        else if (event.type === 'network') {
            return 'potential_breach';
        }
        else if (event.riskScore >= 80) {
            return 'suspicious_activity';
        }
        else {
            return 'rate_limit_exceeded';
        }
    }
    generateAlertMessage(event) {
        switch (event.type) {
            case 'authentication':
                return `Suspicious authentication attempt detected (Risk: ${event.riskScore})`;
            case 'authorization':
                return `Unauthorized access attempt detected (Risk: ${event.riskScore})`;
            case 'data_access':
                return `Unusual data access pattern detected (Risk: ${event.riskScore})`;
            case 'behavioral':
                return `Behavioral anomaly detected (Risk: ${event.riskScore})`;
            case 'network':
                return `Network security threat detected (Risk: ${event.riskScore})`;
            default:
                return `Security event detected (Risk: ${event.riskScore})`;
        }
    }
    updateBehavioralProfile(event) {
        if (!event.userId || !event.deviceId) {
            return;
        }
        const profileKey = `${event.userId}-${event.deviceId}`;
        let profile = this.behavioralProfiles.get(profileKey);
        if (!profile) {
            profile = {
                userId: event.userId,
                deviceId: event.deviceId,
                typingPattern: [],
                mouseMovement: [],
                sessionDuration: 0,
                loginTimes: [],
                locations: [],
                riskScore: 0,
                lastUpdated: new Date().toISOString()
            };
        }
        if (event.details.typingPattern) {
            profile.typingPattern.push(event.details.typingPattern);
            if (profile.typingPattern.length > 100) {
                profile.typingPattern = profile.typingPattern.slice(-100);
            }
        }
        if (event.details.mouseMovement) {
            profile.mouseMovement.push(event.details.mouseMovement);
            if (profile.mouseMovement.length > 100) {
                profile.mouseMovement = profile.mouseMovement.slice(-100);
            }
        }
        if (event.details.sessionDuration) {
            profile.sessionDuration = (profile.sessionDuration + event.details.sessionDuration) / 2;
        }
        if (event.type === 'authentication') {
            profile.loginTimes.push(new Date().toISOString());
            if (profile.loginTimes.length > 50) {
                profile.loginTimes = profile.loginTimes.slice(-50);
            }
        }
        if (event.details.location && !profile.locations.includes(event.details.location)) {
            profile.locations.push(event.details.location);
            if (profile.locations.length > 10) {
                profile.locations = profile.locations.slice(-10);
            }
        }
        profile.riskScore = event.riskScore;
        profile.lastUpdated = new Date().toISOString();
        this.behavioralProfiles.set(profileKey, profile);
    }
    startMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
        this.monitoringInterval = setInterval(() => {
            this.performPeriodicAnalysis();
        }, this.config.monitoringInterval);
    }
    performPeriodicAnalysis() {
        try {
            const recentEvents = this.events.filter(event => {
                const eventTime = new Date(event.timestamp).getTime();
                const oneHourAgo = Date.now() - 3600000;
                return eventTime > oneHourAgo;
            });
            this.detectPatterns(recentEvents);
            this.updateBehavioralProfiles();
            this.cleanupOldData();
        }
        catch (error) {
            this.log('error', `Periodic analysis failed: ${error}`);
        }
    }
    detectPatterns(events) {
        const authEvents = events.filter(e => e.type === 'authentication');
        const authByUser = new Map();
        authEvents.forEach(event => {
            if (event.userId) {
                if (!authByUser.has(event.userId)) {
                    authByUser.set(event.userId, []);
                }
                authByUser.get(event.userId).push(event);
            }
        });
        authByUser.forEach((userEvents, userId) => {
            if (userEvents.length > 10) {
                this.recordEvent({
                    type: 'authentication',
                    severity: 'high',
                    userId,
                    details: {
                        pattern: 'brute_force_attempt',
                        attemptCount: userEvents.length,
                        timeWindow: '1_hour'
                    }
                });
            }
        });
        const dataAccessEvents = events.filter(e => e.type === 'data_access');
        if (dataAccessEvents.length > 100) {
            this.recordEvent({
                type: 'data_access',
                severity: 'medium',
                details: {
                    pattern: 'excessive_data_access',
                    accessCount: dataAccessEvents.length,
                    timeWindow: '1_hour'
                }
            });
        }
    }
    initializeEventListeners() {
        this.monitorAuthenticationEvents();
        this.monitorDataAccessEvents();
        this.monitorSystemEvents();
    }
    monitorAuthenticationEvents() {
        const originalAuthenticate = window.fetch;
        window.fetch = async (...args) => {
            const [url, options] = args;
            if (typeof url === 'string' && url.includes('/auth')) {
                this.recordEvent({
                    type: 'authentication',
                    severity: 'medium',
                    details: {
                        url: url,
                        method: options?.method || 'GET',
                        timestamp: new Date().toISOString()
                    }
                });
            }
            return originalAuthenticate.apply(window, args);
        };
    }
    monitorDataAccessEvents() {
        const originalOpen = indexedDB.open;
        indexedDB.open = function (...args) {
            return originalOpen.apply(indexedDB, args);
        };
    }
    monitorSystemEvents() {
        window.addEventListener('beforeunload', () => {
            this.recordEvent({
                type: 'system',
                severity: 'low',
                details: {
                    event: 'page_unload',
                    timestamp: new Date().toISOString()
                }
            });
        });
    }
    blockUser(userId, deviceId) {
        this.log('warn', `User blocked: ${userId} (device: ${deviceId})`);
    }
    getRecentEvents(userId, timeWindow = 3600000) {
        const cutoff = Date.now() - timeWindow;
        return this.events.filter(event => {
            const eventTime = new Date(event.timestamp).getTime();
            return eventTime > cutoff && (!userId || event.userId === userId);
        });
    }
    cleanupOldEvents() {
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        this.events = this.events.filter(event => {
            const eventTime = new Date(event.timestamp).getTime();
            return eventTime > oneDayAgo;
        });
    }
    cleanupOldData() {
        const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        this.alerts = this.alerts.filter(alert => {
            const alertTime = new Date(alert.timestamp).getTime();
            return alertTime > oneWeekAgo;
        });
    }
    async loadBehavioralProfiles() {
        try {
            const stored = localStorage.getItem('threat-detection-profiles');
            if (stored) {
                const profiles = JSON.parse(stored);
                this.behavioralProfiles = new Map(Object.entries(profiles));
            }
        }
        catch (error) {
            this.log('error', `Failed to load behavioral profiles: ${error}`);
        }
    }
    updateBehavioralProfiles() {
        try {
            const profiles = Object.fromEntries(this.behavioralProfiles);
            localStorage.setItem('threat-detection-profiles', JSON.stringify(profiles));
        }
        catch (error) {
            this.log('error', `Failed to save behavioral profiles: ${error}`);
        }
    }
    generateEventId() {
        return `event-${Date.now()}-${Math.random().toString(36).substring(2)}`;
    }
    generateAlertId() {
        return `alert-${Date.now()}-${Math.random().toString(36).substring(2)}`;
    }
    log(level, message) {
        if (this.shouldLog(level)) {
            console.log(`[ThreatDetection] ${level.toUpperCase()}: ${message}`);
        }
    }
    shouldLog(level) {
        const levels = { info: 0, warn: 1, error: 2 };
        const configLevel = levels[this.config.logLevel];
        const messageLevel = levels[level];
        return messageLevel >= configLevel;
    }
    getEvents() {
        return [...this.events];
    }
    getAlerts() {
        return [...this.alerts];
    }
    getBehavioralProfiles() {
        return Array.from(this.behavioralProfiles.values());
    }
    acknowledgeAlert(alertId) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert) {
            alert.acknowledged = true;
        }
    }
    resolveAlert(alertId) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert) {
            alert.resolved = true;
        }
    }
    getConfig() {
        return { ...this.config };
    }
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        if (newConfig.monitoringInterval) {
            this.startMonitoring();
        }
    }
    isEnabled() {
        return this.config.enabled && this.isInitialized;
    }
    destroy() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        this.isInitialized = false;
    }
}
exports.ThreatDetectionSystem = ThreatDetectionSystem;
//# sourceMappingURL=threat-detection.js.map