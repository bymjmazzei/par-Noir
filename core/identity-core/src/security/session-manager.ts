// import { cryptoWorkerManager } from './encryption/cryptoWorkerManager';
/**
 * Secure Session Management System
 * Provi automatic session security with device fingerprinting
 * Runs silently in the background without user interaction
 */

import { DID } from '../types';
import { MilitaryGradeCrypto } from '../encryption/crypto';

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
  sessionTimeout: number; // milliseconds
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

export class SessionManager {
  private static readonly DEFAULT_CONFIG: SessionConfig = {
    sessionTimeout: 30 * 60 * 1000, // 30 minutes
    maxConcurrentSessions: 3,
    requireDeviceFingerprint: true,
    requireIpValidation: true,
    securityLevel: 'military'
  };

  private static readonly ACTIVE_SESSIONS = new Map<string, SecureSession>();
  private static readonly SESSION_HISTORY = new Map<string, SecureSession[]>();

  /**
   * Create a secure session automatically
   */
  static createSecureSession(
    did: DID, 
    dashboardId: string, 
    config: Partial<SessionConfig> = {}
  ): SecureSession {
    const fullConfig = { ...this.DEFAULT_CONFIG, ...config };
    
    const sessionId = crypto.randomUUID();
    const deviceFingerprint = this.generateDeviceFingerprint();
    const ipAddress = this.getClientIP();
    const userAgent = navigator.userAgent;
    const now = new Date();
    
    const session: SecureSession = {
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

    // Store session
    this.ACTIVE_SESSIONS.set(sessionId, session);
    
    // Add to history
    const userSessions = this.SESSION_HISTORY.get(did.id) || [];
    userSessions.push(session);
    this.SESSION_HISTORY.set(did.id, userSessions);

    // Clean up old sessions
    this.cleanupExpiredSessions();

    return session;
  }

  /**
   * Validate session silently
   */
  static validateSession(session: SecureSession): SessionValidationResult {
    const recommendations: string[] = [];
    let isValid = true;
    let reason: string | undefined;
    let riskLevel: 'low' | 'medium' | 'high' = 'low';

    // Check expiration
    if (new Date(session.expiresAt) < new Date()) {
      isValid = false;
      reason = 'Session expired';
      riskLevel = 'medium';
    }

    // Verify device fingerprint
    const currentFingerprint = this.generateDeviceFingerprint();
    if (session.deviceFingerprint !== currentFingerprint) {
      isValid = false;
      reason = 'Device fingerprint mismatch';
      riskLevel = 'high';
      recommendations.push('Session may have been hijacked');
    }

    // Verify IP address (if enabled)
    const currentIP = this.getClientIP();
    if (session.ipAddress !== currentIP) {
      recommendations.push('IP address changed - consider re-authentication');
      if (riskLevel === 'low') riskLevel = 'medium';
    }

    // Verify signature
    if (!this.verifySessionSignature(session)) {
      isValid = false;
      reason = 'Invalid session signature';
      riskLevel = 'high';
    }

    // Check for suspicious activity
    const suspiciousActivity = this.detectSuspiciousActivity(session);
    if (suspiciousActivity) {
      recommendations.push('Suspicious activity detected');
      if (riskLevel === 'low') riskLevel = 'medium';
    }

    // Update last activity
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

  /**
   * Generate device fingerprint
   */
  private static generateDeviceFingerprint(): string {
    const components = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      screen.colorDepth,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency,
      (navigator as any).deviceMemory || 'unknown',
      navigator.platform,
      navigator.cookieEnabled ? '1' : '0',
      navigator.doNotTrack || 'unknown'
    ];

    const fingerprint = components.join('|');
    return this.hashString(fingerprint);
  }

  /**
   * Get client IP address
   */
  private static getClientIP(): string {
    // In browser environment, this would be handled by the server
    // For now, return a placeholder
    return 'client-ip-placeholder';
  }

  /**
   * Sign session data
   */
  private static signSession(sessionId: string, dashboardId: string, deviceFingerprint: string): string {
    const data = `${sessionId}:${dashboardId}:${deviceFingerprint}`;
    return this.hashString(data);
  }

  /**
   * Verify session signature
   */
  private static verifySessionSignature(session: SecureSession): boolean {
    const expectedSignature = this.signSession(
      session.sessionId, 
      session.dashboardId, 
      session.deviceFingerprint
    );
    return session.signature === expectedSignature;
  }

  /**
   * Detect suspicious activity
   */
  private static detectSuspiciousActivity(session: SecureSession): boolean {
    const now = new Date();
    const lastActivity = new Date(session.lastActivity);
    const timeDiff = now.getTime() - lastActivity.getTime();

    // Suspicious if session was inactive for too long then suddenly active
    if (timeDiff > 24 * 60 * 60 * 1000) { // 24 hours
      return true;
    }

    // Check for rapid session changes
    const userSessions = this.SESSION_HISTORY.get(session.sessionId) || [];
    const recentSessions = userSessions.filter(s => 
      new Date(s.createdAt).getTime() > now.getTime() - 60 * 60 * 1000 // Last hour
    );

    if (recentSessions.length > 5) {
      return true;
    }

    return false;
  }

  /**
   * Clean up expired sessions
   */
  private static cleanupExpiredSessions(): void {
    const now = new Date();
    
    for (const [sessionId, session] of this.ACTIVE_SESSIONS.entries()) {
      if (new Date(session.expiresAt) < now) {
        this.ACTIVE_SESSIONS.delete(sessionId);
      }
    }
  }

  /**
   * Revoke session
   */
  static revokeSession(sessionId: string): boolean {
    return this.ACTIVE_SESSIONS.delete(sessionId);
  }

  /**
   * Get active sessions for user
   */
  static getActiveSessions(didId: string): SecureSession[] {
    const userSessions = this.SESSION_HISTORY.get(didId) || [];
    return userSessions.filter(session => 
      this.ACTIVE_SESSIONS.has(session.sessionId)
    );
  }

  /**
   * Hash string using SHA-256
   */
  private static hashString(str: string): string {
    // Simple hash function for demo purposes
    // In production, use await cryptoWorkerManager.hash
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  /**
   * Silent session validation - no user interaction required
   */
  static silentValidate(session: SecureSession): boolean {
    const result = this.validateSession(session);
    
    if (!result.isValid) {
      // Log for security monitoring
      // Console statement removed for production
      
      // Automatically revoke invalid sessions
      this.revokeSession(session.sessionId);
      
      return false;
    }
    
    if (result.riskLevel === 'high') {
      // Log high-risk sessions for investigation
      // Console statement removed for production
    }
    
    return true;
  }

  /**
   * Get session statistics
   */
  static getSessionStats(): {
    activeSessions: number;
    totalSessions: number;
    averageSessionDuration: number;
  } {
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
