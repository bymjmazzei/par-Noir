import { Session, FailedAttempt, SecurityEvent } from '../types/advancedSecurity';

export class SessionManager {
    private activeSessions: Map<string, Session>;
    private failedAttempts: Map<string, FailedAttempt[]>;
    private maxFailedAttempts: number;
    private lockoutDuration: number;
    private sessionTimeout: number;

    constructor(maxFailedAttempts: number = 5, lockoutDuration: number = 300000, sessionTimeout: number = 3600000) {
        this.activeSessions = new Map();
        this.failedAttempts = new Map();
        this.maxFailedAttempts = maxFailedAttempts;
        this.lockoutDuration = lockoutDuration;
        this.sessionTimeout = sessionTimeout;
    }

    /**
     * Create a new session
     */
    createSession(userId: string, metadata: any = {}): Session {
        const sessionId = this.generateSessionId();
        const now = new Date();
        
        const session: Session = {
            id: sessionId,
            userId,
            createdAt: now.toISOString(),
            lastActivity: now.toISOString(),
            expiresAt: new Date(now.getTime() + this.sessionTimeout).toISOString(),
            metadata,
            isActive: true,
            ipAddress: metadata.ipAddress || 'unknown',
            userAgent: metadata.userAgent || 'unknown',
            location: metadata.location || 'unknown'
        };

        this.activeSessions.set(sessionId, session);
        return session;
    }

    /**
     * Validate session
     */
    validateSession(sessionId: string): { isValid: boolean; session?: Session; reason?: string } {
        const session = this.activeSessions.get(sessionId);
        
        if (!session) {
            return { isValid: false, reason: 'Session not found' };
        }

        if (!session.isActive) {
            return { isValid: false, reason: 'Session inactive' };
        }

        const now = new Date();
        const expiresAt = new Date(session.expiresAt);

        if (now > expiresAt) {
            this.invalidateSession(sessionId);
            return { isValid: false, reason: 'Session expired' };
        }

        // Update last activity
        session.lastActivity = now.toISOString();
        
        return { isValid: true, session };
    }

    /**
     * Invalidate session
     */
    invalidateSession(sessionId: string): boolean {
        const session = this.activeSessions.get(sessionId);
        if (session) {
            session.isActive = false;
            return true;
        }
        return false;
    }

    /**
     * Invalidate all sessions for a user
     */
    invalidateUserSessions(userId: string): number {
        let count = 0;
        for (const [sessionId, session] of this.activeSessions.entries()) {
            if (session.userId === userId && session.isActive) {
                session.isActive = false;
                count++;
            }
        }
        return count;
    }

    /**
     * Record failed login attempt
     */
    recordFailedAttempt(userId: string, metadata: any = {}): { isLocked: boolean; remainingAttempts: number; lockoutEnd?: Date } {
        if (!this.failedAttempts.has(userId)) {
            this.failedAttempts.set(userId, []);
        }

        const attempts = this.failedAttempts.get(userId)!;
        const now = new Date();

        // Clean up old attempts
        const recentAttempts = attempts.filter(attempt => 
            now.getTime() - new Date(attempt.timestamp).getTime() < this.lockoutDuration
        );

        const failedAttempt: FailedAttempt = {
            timestamp: now.toISOString(),
            metadata,
            ipAddress: metadata.ipAddress || 'unknown',
            userAgent: metadata.userAgent || 'unknown',
            location: metadata.location || 'unknown'
        };

        recentAttempts.push(failedAttempt);
        this.failedAttempts.set(userId, recentAttempts);

        const isLocked = recentAttempts.length >= this.maxFailedAttempts;
        const remainingAttempts = Math.max(0, this.maxFailedAttempts - recentAttempts.length);
        
        let lockoutEnd: Date | undefined;
        if (isLocked) {
            const oltAttempt = recentAttempts[0];
            lockoutEnd = new Date(new Date(oltAttempt.timestamp).getTime() + this.lockoutDuration);
        }

        return { isLocked, remainingAttempts, lockoutEnd };
    }

    /**
     * Check if user is locked out
     */
    isUserLocked(userId: string): { isLocked: boolean; remainingAttempts: number; lockoutEnd?: Date } {
        const attempts = this.failedAttempts.get(userId);
        if (!attempts) {
            return { isLocked: false, remainingAttempts: this.maxFailedAttempts };
        }

        const now = new Date();
        const recentAttempts = attempts.filter(attempt => 
            now.getTime() - new Date(attempt.timestamp).getTime() < this.lockoutDuration
        );

        const isLocked = recentAttempts.length >= this.maxFailedAttempts;
        const remainingAttempts = Math.max(0, this.maxFailedAttempts - recentAttempts.length);
        
        let lockoutEnd: Date | undefined;
        if (isLocked) {
            const oltAttempt = recentAttempts[0];
            lockoutEnd = new Date(new Date(oltAttempt.timestamp).getTime() + this.lockoutDuration);
        }

        return { isLocked, remainingAttempts, lockoutEnd };
    }

    /**
     * Reset failed attempts for user
     */
    resetFailedAttempts(userId: string): void {
        this.failedAttempts.delete(userId);
    }

    /**
     * Get active sessions for user
     */
    getUserSessions(userId: string): Session[] {
        return Array.from(this.activeSessions.values())
            .filter(session => session.userId === userId && session.isActive);
    }

    /**
     * Get all active sessions
     */
    getAllActiveSessions(): Session[] {
        return Array.from(this.activeSessions.values())
            .filter(session => session.isActive);
    }

    /**
     * Get session by ID
     */
    getSession(sessionId: string): Session | undefined {
        return this.activeSessions.get(sessionId);
    }

    /**
     * Update session metadata
     */
    updateSessionMetadata(sessionId: string, metadata: any): boolean {
        const session = this.activeSessions.get(sessionId);
        if (session) {
            session.metadata = { ...session.metadata, ...metadata };
            session.lastActivity = new Date().toISOString();
            return true;
        }
        return false;
    }

    /**
     * Extend session
     */
    extendSession(sessionId: string, additionalTime: number = this.sessionTimeout): boolean {
        const session = this.activeSessions.get(sessionId);
        if (session && session.isActive) {
            const now = new Date();
            session.expiresAt = new Date(now.getTime() + additionalTime).toISOString();
            session.lastActivity = now.toISOString();
            return true;
        }
        return false;
    }

    /**
     * Clean up expired sessions
     */
    cleanupExpiredSessions(): number {
        let count = 0;
        const now = new Date();
        
        for (const [sessionId, session] of this.activeSessions.entries()) {
            if (new Date(session.expiresAt) <= now) {
                session.isActive = false;
                count++;
            }
        }
        
        return count;
    }

    /**
     * Get session statistics
     */
    getSessionStats(): { totalSessions: number; activeSessions: number; expiredSessions: number } {
        const totalSessions = this.activeSessions.size;
        const activeSessions = Array.from(this.activeSessions.values())
            .filter(session => session.isActive).length;
        const expiredSessions = totalSessions - activeSessions;
        
        return { totalSessions, activeSessions, expiredSessions };
    }

    /**
     * Generate unique session ID
     */
    private generateSessionId(): string {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2);
        return `${timestamp}-${random}`;
    }

    /**
     * Set max failed attempts
     */
    setMaxFailedAttempts(max: number): void {
        this.maxFailedAttempts = Math.max(1, max);
    }

    /**
     * Set lockout duration
     */
    setLockoutDuration(duration: number): void {
        this.lockoutDuration = Math.max(0, duration);
    }

    /**
     * Set session timeout
     */
    setSessionTimeout(timeout: number): void {
        this.sessionTimeout = Math.max(0, timeout);
    }

    /**
     * Clear all sessions
     */
    clearAllSessions(): void {
        this.activeSessions.clear();
    }

    /**
     * Clear all failed attempts
     */
    clearAllFailedAttempts(): void {
        this.failedAttempts.clear();
    }
}
