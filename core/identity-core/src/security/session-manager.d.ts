import { DID } from '../types';
export interface SecureSession {
    sessionId: string;
    dashboardId: string;
    deviceFingerprint: string;
    ipAddress: string;
    userAgent: string;
    createdAt: string;
    expiresAt: string;
    permissions: string[];
    signature: string;
    lastActivity: string;
    securityLevel: 'standard' | 'military' | 'top-secret';
}
export interface SessionConfig {
    sessionTimeout: number;
    maxConcurrentSessions: number;
    requireDeviceFingerprint: boolean;
    requireIpValidation: boolean;
    securityLevel: 'standard' | 'military' | 'top-secret';
}
export interface SessionValidationResult {
    isValid: boolean;
    reason?: string;
    riskLevel: 'low' | 'medium' | 'high';
    recommendations: string[];
}
export declare class SessionManager {
    private static readonly DEFAULT_CONFIG;
    private static readonly ACTIVE_SESSIONS;
    private static readonly SESSION_HISTORY;
    static createSecureSession(did: DID, dashboardId: string, config?: Partial<SessionConfig>): SecureSession;
    static validateSession(session: SecureSession): SessionValidationResult;
    private static generateDeviceFingerprint;
    private static getClientIP;
    private static signSession;
    private static verifySessionSignature;
    private static detectSuspiciousActivity;
    private static cleanupExpiredSessions;
    static revokeSession(sessionId: string): boolean;
    static getActiveSessions(didId: string): SecureSession[];
    private static hashString;
    static silentValidate(session: SecureSession): boolean;
    static getSessionStats(): {
        activeSessions: number;
        totalSessions: number;
        averageSessionDuration: number;
    };
}
//# sourceMappingURL=session-manager.d.ts.map