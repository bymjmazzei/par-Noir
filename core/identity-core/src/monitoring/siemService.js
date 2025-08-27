"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.siemService = exports.SIEMService = void 0;
class SIEMService {
    constructor(config) {
        this.isInitialized = false;
        this.events = [];
        this.alerts = [];
        this.threatIntel = new Map();
        this.correlationEngine = new Map();
        this.config = config;
    }
    async initialize() {
        if (!this.config.enabled) {
            console.log('SIEM is disabled');
            return;
        }
        try {
            await this.simulateSIEMConnection();
            this.isInitialized = true;
            console.log('SIEM initialized successfully');
        }
        catch (error) {
            throw new Error(`Failed to initialize SIEM: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async simulateSIEMConnection() {
        await new Promise(resolve => setTimeout(resolve, 100));
        const success = Math.random() > 0.1;
        if (!success) {
            throw new Error('Failed to connect to SIEM');
        }
    }
    async logSecurityEvent(event) {
        if (!this.isInitialized) {
            console.log('SIEM not initialized, logging event:', event);
            return 'siem_disabled';
        }
        const securityEvent = {
            ...event,
            id: this.generateEventId(),
            timestamp: Date.now()
        };
        this.events.push(securityEvent);
        this.correlateEvents(securityEvent);
        await this.checkThreatIntel(securityEvent);
        await this.sendEvent(securityEvent);
        return securityEvent.id;
    }
    async logAuthEvent(eventType, userId, success, details) {
        const severity = this.determineAuthEventSeverity(eventType, success);
        return this.logSecurityEvent({
            source: 'authentication',
            category: 'authentication',
            severity,
            eventType,
            description: `${eventType} ${success ? 'successful' : 'failed'} for user ${userId}`,
            user: { id: userId },
            metadata: {
                success,
                ...details
            }
        });
    }
    async logDIDEvent(operation, didId, success, details) {
        const severity = success ? 'low' : 'medium';
        return this.logSecurityEvent({
            source: 'did_operations',
            category: 'identity_management',
            severity,
            eventType: `did_${operation}`,
            description: `DID ${operation} ${success ? 'successful' : 'failed'} for ${didId}`,
            metadata: {
                didId,
                success,
                ...details
            }
        });
    }
    async logSuspiciousActivity(activity, userId, indicators, details) {
        const severity = this.determineThreatSeverity(indicators);
        return this.logSecurityEvent({
            source: 'threat_detection',
            category: 'suspicious_activity',
            severity,
            eventType: 'suspicious_activity',
            description: `Suspicious activity detected: ${activity}`,
            user: { id: userId },
            indicators,
            metadata: details
        });
    }
    async logNetworkEvent(eventType, sourceIp, destinationIp, severity, details) {
        return this.logSecurityEvent({
            source: 'network',
            category: 'network_security',
            severity,
            eventType,
            description: `Network event: ${eventType} from ${sourceIp} to ${destinationIp}`,
            source_ip: sourceIp,
            destination_ip: destinationIp,
            metadata: details
        });
    }
    async createAlert(title, description, events, severity) {
        const alertId = this.generateAlertId();
        const alert = {
            id: alertId,
            timestamp: Date.now(),
            severity,
            title,
            description,
            category: 'security_alert',
            source: 'siem',
            events,
            indicators: this.extractIndicators(events),
            status: 'new'
        };
        this.alerts.push(alert);
        await this.sendAlert(alert);
        return alertId;
    }
    async updateAlertStatus(alertId, status, assignedTo, notes) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (!alert) {
            return false;
        }
        alert.status = status;
        if (assignedTo) {
            alert.assigned_to = assignedTo;
        }
        if (notes) {
            alert.notes = alert.notes || [];
            alert.notes.push(notes);
        }
        return true;
    }
    async checkThreatIntel(event) {
        const threats = [];
        if (event.source_ip) {
            const threat = await this.lookupThreatIntel(event.source_ip, 'ip');
            if (threat) {
                threats.push(threat);
            }
        }
        if (event.user_agent) {
            const threat = await this.lookupThreatIntel(event.user_agent, 'hash');
            if (threat) {
                threats.push(threat);
            }
        }
        return threats;
    }
    async lookupThreatIntel(indicator, type) {
        const maliciousIndicators = [
            '192.168.1.100',
            'malicious.example.com',
            'malware@evil.com',
            'abc123def456',
            'http://evil.com/malware'
        ];
        if (maliciousIndicators.includes(indicator)) {
            return {
                indicator,
                type,
                threat_level: 'high',
                confidence: 0.9,
                sources: ['internal_threat_feed'],
                first_seen: Date.now() - 86400000,
                last_seen: Date.now(),
                tags: ['malware', 'phishing'],
                description: 'Known malicious indicator'
            };
        }
        return null;
    }
    correlateEvents(event) {
        const key = `${event.user?.id || 'anonymous'}_${event.source_ip || 'unknown'}`;
        if (!this.correlationEngine.has(key)) {
            this.correlationEngine.set(key, []);
        }
        const events = this.correlationEngine.get(key);
        events.push(event);
        const cutoff = Date.now() - this.config.correlationWindow;
        const recentEvents = events.filter(e => e.timestamp > cutoff);
        this.correlationEngine.set(key, recentEvents);
        this.checkCorrelationPatterns(key, recentEvents);
    }
    checkCorrelationPatterns(key, events) {
        const failedLogins = events.filter(e => e.eventType === 'failed_login' && e.severity === 'medium');
        if (failedLogins.length >= 5) {
            this.createAlert('Multiple Failed Login Attempts', `Detected ${failedLogins.length} failed login attempts`, failedLogins, 'high');
        }
        const suspiciousEvents = events.filter(e => e.severity === 'high' || e.severity === 'critical');
        if (suspiciousEvents.length >= 3) {
            this.createAlert('Suspicious Activity Pattern', `Detected ${suspiciousEvents.length} suspicious events`, suspiciousEvents, 'critical');
        }
    }
    determineAuthEventSeverity(eventType, success) {
        if (eventType === 'failed_login') {
            return 'medium';
        }
        else if (eventType === 'account_locked') {
            return 'high';
        }
        else if (success) {
            return 'low';
        }
        else {
            return 'medium';
        }
    }
    determineThreatSeverity(indicators) {
        if (indicators.length === 0) {
            return 'low';
        }
        const maxThreatLevel = indicators.reduce((max, indicator) => {
            const levels = { low: 1, medium: 2, high: 3, critical: 4 };
            return Math.max(max, levels[indicator.threat_level]);
        }, 0);
        const levelMap = { 1: 'low', 2: 'medium', 3: 'high', 4: 'critical' };
        return levelMap[maxThreatLevel];
    }
    extractIndicators(events) {
        const indicators = [];
        for (const event of events) {
            if (event.indicators) {
                indicators.push(...event.indicators);
            }
            if (event.source_ip) {
                indicators.push({
                    type: 'ip',
                    value: event.source_ip,
                    confidence: 0.8,
                    threat_level: 'medium',
                    source: 'event_extraction'
                });
            }
        }
        return indicators;
    }
    async sendEvent(event) {
        try {
            await this.simulateEventSending(event);
            if (this.config.debug) {
                console.log('SIEM event sent:', event);
            }
        }
        catch (error) {
            console.error('Failed to send SIEM event:', error);
        }
    }
    async sendAlert(alert) {
        try {
            await this.simulateAlertSending(alert);
            if (this.config.debug) {
                console.log('SIEM alert sent:', alert);
            }
        }
        catch (error) {
            console.error('Failed to send SIEM alert:', error);
        }
    }
    async simulateEventSending(event) {
        await new Promise(resolve => setTimeout(resolve, 50));
        const success = Math.random() > 0.05;
        if (!success) {
            throw new Error('Failed to send event to SIEM');
        }
    }
    async simulateAlertSending(alert) {
        await new Promise(resolve => setTimeout(resolve, 100));
        const success = Math.random() > 0.05;
        if (!success) {
            throw new Error('Failed to send alert to SIEM');
        }
    }
    generateEventId() {
        return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    generateAlertId() {
        return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    getStats() {
        const stats = {
            events: {
                total: this.events.length,
                bySeverity: {},
                byCategory: {},
                bySource: {}
            },
            alerts: {
                total: this.alerts.length,
                bySeverity: {},
                byStatus: {}
            },
            threats: {
                total: this.threatIntel.size,
                byLevel: {},
                byType: {}
            }
        };
        for (const event of this.events) {
            stats.events.bySeverity[event.severity] = (stats.events.bySeverity[event.severity] || 0) + 1;
            stats.events.byCategory[event.category] = (stats.events.byCategory[event.category] || 0) + 1;
            stats.events.bySource[event.source] = (stats.events.bySource[event.source] || 0) + 1;
        }
        for (const alert of this.alerts) {
            stats.alerts.bySeverity[alert.severity] = (stats.alerts.bySeverity[alert.severity] || 0) + 1;
            stats.alerts.byStatus[alert.status] = (stats.alerts.byStatus[alert.status] || 0) + 1;
        }
        for (const threat of this.threatIntel.values()) {
            stats.threats.byLevel[threat.threat_level] = (stats.threats.byLevel[threat.threat_level] || 0) + 1;
            stats.threats.byType[threat.type] = (stats.threats.byType[threat.type] || 0) + 1;
        }
        return stats;
    }
    isReady() {
        return this.isInitialized;
    }
    getConfig() {
        return { ...this.config };
    }
    async updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        if (newConfig.enabled !== undefined && newConfig.enabled !== this.config.enabled) {
            await this.initialize();
        }
    }
    getEvents() {
        return [...this.events];
    }
    getAlerts() {
        return [...this.alerts];
    }
    getThreatIntel() {
        return Array.from(this.threatIntel.values());
    }
    clearOldEvents(olderThan) {
        const cutoff = Date.now() - olderThan;
        this.events = this.events.filter(e => e.timestamp > cutoff);
    }
}
exports.SIEMService = SIEMService;
exports.siemService = new SIEMService({
    provider: process.env.SIEM_PROVIDER || 'splunk',
    apiKey: process.env.SIEM_API_KEY || '',
    endpoint: process.env.SIEM_ENDPOINT || 'https://siem.your-domain.com',
    enabled: process.env.SIEM_ENABLED === 'true',
    debug: process.env.NODE_ENV === 'development',
    alertThreshold: 5,
    correlationWindow: 300000
});
//# sourceMappingURL=siemService.js.map