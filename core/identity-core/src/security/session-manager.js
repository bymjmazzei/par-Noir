"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionManager = void 0;
class SessionManager {
    static createSecureSession(did, dashboardId, config = {}) {
        const fullConfig = { ...this.DEFAULT_CONFIG, ...config };
        const sessionId = crypto.randomUUID();
        const deviceFingerprint = this.generateDeviceFingerprint();
        const ipAddress = this.getClientIP();
        const userAgent = navigator.userAgent;
        const now = new Date();
        const session = {
            sessionId,
            dashboardId,
            deviceFingerprint,
            ipAddress,
            userAgent,
            createdAt: now.toISOString(),
            expiresAt: new Date(now.getTime() + fullConfig.sessionTimeout).toISOString(),
            permissions: ['read', 'update_metadata', 'generate_proofs'],
            signature: this.signSession(sessionId, dashboardId, deviceFingerprint),
            lastActivity: now.toISOString(),
            securityLevel: fullConfig.securityLevel
        };
        this.ACTIVE_SESSIONS.set(sessionId, session);
        const userSessions = this.SESSION_HISTORY.get(did.id) || [];
        userSessions.push(session);
        this.SESSION_HISTORY.set(did.id, userSessions);
        this.cleanupExpiredSessions();
        return session;
    }
    static validateSession(session) {
        const recommendations = [];
        let isValid = true;
        let reason;
        let riskLevel = 'low';
        if (new Date(session.expiresAt) < new Date()) {
            isValid = false;
            reason = 'Session expired';
            riskLevel = 'medium';
        }
        const currentFingerprint = this.generateDeviceFingerprint();
        if (session.deviceFingerprint !== currentFingerprint) {
            isValid = false;
            reason = 'Device fingerprint mismatch';
            riskLevel = 'high';
            recommendations.push('Session may have been hijacked');
        }
        const currentIP = this.getClientIP();
        if (session.ipAddress !== currentIP) {
            recommendations.push('IP address changed - consider re-authentication');
            if (riskLevel === 'low')
                riskLevel = 'medium';
        }
        if (!this.verifySessionSignature(session)) {
            isValid = false;
            reason = 'Invalid session signature';
            riskLevel = 'high';
        }
        const suspiciousActivity = this.detectSuspiciousActivity(session);
        if (suspiciousActivity) {
            recommendations.push('Suspicious activity detected');
            if (riskLevel === 'low')
                riskLevel = 'medium';
        }
        if (isValid) {
            session.lastActivity = new Date().toISOString();
            this.ACTIVE_SESSIONS.set(session.sessionId, session);
        }
        return {
            isValid,
            reason,
            riskLevel,
            recommendations
        };
    }
    static generateDeviceFingerprint() {
        const components = [
            navigator.userAgent,
            navigator.language,
            screen.width + 'x' + screen.height,
            screen.colorDepth,
            new Date().getTimezoneOffset(),
            navigator.hardwareConcurrency,
            navigator.deviceMemory || 'unknown',
            navigator.platform,
            navigator.cookieEnabled ? '1' : '0',
            navigator.doNotTrack || 'unknown'
        ];
        const fingerprint = components.join('|');
        return this.hashString(fingerprint);
    }
    static getClientIP() {
        return 'client-ip-placeholder';
    }
    static signSession(sessionId, dashboardId, deviceFingerprint) {
        const data = `${sessionId}:${dashboardId}:${deviceFingerprint}`;
        return this.hashString(data);
    }
    static verifySessionSignature(session) {
        const expectedSignature = this.signSession(session.sessionId, session.dashboardId, session.deviceFingerprint);
        return session.signature === expectedSignature;
    }
    static detectSuspiciousActivity(session) {
        const now = new Date();
        const lastActivity = new Date(session.lastActivity);
        const timeDiff = now.getTime() - lastActivity.getTime();
        if (timeDiff > 24 * 60 * 60 * 1000) {
            return true;
        }
        const userSessions = this.SESSION_HISTORY.get(session.sessionId) || [];
        const recentSessions = userSessions.filter(s => new Date(s.createdAt).getTime() > now.getTime() - 60 * 60 * 1000);
        if (recentSessions.length > 5) {
            return true;
        }
        return false;
    }
    static cleanupExpiredSessions() {
        const now = new Date();
        for (const [sessionId, session] of this.ACTIVE_SESSIONS.entries()) {
            if (new Date(session.expiresAt) < now) {
                this.ACTIVE_SESSIONS.delete(sessionId);
            }
        }
    }
    static revokeSession(sessionId) {
        return this.ACTIVE_SESSIONS.delete(sessionId);
    }
    static getActiveSessions(didId) {
        const userSessions = this.SESSION_HISTORY.get(didId) || [];
        return userSessions.filter(session => this.ACTIVE_SESSIONS.has(session.sessionId));
    }
    static hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16);
    }
    static silentValidate(session) {
        const result = this.validateSession(session);
        if (!result.isValid) {
            console.warn('Session validation failed:', result.reason);
            this.revokeSession(session.sessionId);
            return false;
        }
        if (result.riskLevel === 'high') {
            console.warn('High-risk session detected:', result.recommendations);
        }
        return true;
    }
    static getSessionStats() {
        const activeSessions = this.ACTIVE_SESSIONS.size;
        let totalSessions = 0;
        let totalDuration = 0;
        for (const sessions of this.SESSION_HISTORY.values()) {
            totalSessions += sessions.length;
            for (const session of sessions) {
                const duration = new Date(session.expiresAt).getTime() - new Date(session.createdAt).getTime();
                totalDuration += duration;
            }
        }
        return {
            activeSessions,
            totalSessions,
            averageSessionDuration: totalSessions > 0 ? totalDuration / totalSessions : 0
        };
    }
}
exports.SessionManager = SessionManager;
SessionManager.DEFAULT_CONFIG = {
    sessionTimeout: 30 * 60 * 1000,
    maxConcurrentSessions: 3,
    requireDeviceFingerprint: true,
    requireIpValidation: true,
    securityLevel: 'military'
};
SessionManager.ACTIVE_SESSIONS = new Map();
SessionManager.SESSION_HISTORY = new Map();
//# sourceMappingURL=session-manager.js.map