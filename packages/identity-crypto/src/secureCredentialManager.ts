/**
 * Secure Credential Manager
 * 
 * Stores pn name and passcode ONLY in memory during authentication.
 * NEVER persists to IndexedDB, localStorage, or any storage.
 * 
 * CRITICAL: pn name + passcode = 2FA credentials. Must remain secret.
 * Both are SECRETS and must be treated identically.
 */

import { MemorySecurity } from './memorySecurity';

interface Credentials {
  pnName: string;
  passcode: string;
  sessionId: string;
  expiresAt: number; // Timestamp when credentials expire
}

export class SecureCredentialManager {
  // Store credentials in memory only - never persisted
  private static credentials: Map<string, Credentials> = new Map();
  
  // Default expiration: 15 minutes (reduced from 1 hour for better security)
  private static readonly DEFAULT_EXPIRY = 15 * 60 * 1000;
  
  /**
   * Store credentials temporarily in memory only
   * @param sessionId - The session/identity ID
   * @param pnName - The pn name (part of 2FA - SECRET)
   * @param passcode - The passcode (part of 2FA - SECRET)
   * @param expiresIn - Optional expiration time in milliseconds (default: 1 hour)
   */
  static setCredentials(
    sessionId: string, 
    pnName: string, 
    passcode: string,
    expiresIn: number = this.DEFAULT_EXPIRY
  ): void {
    // Clear any existing credentials for this session
    this.clearCredentials(sessionId);
    
    const expiresAt = Date.now() + expiresIn;
    
    this.credentials.set(sessionId, {
      pnName,
      passcode,
      sessionId,
      expiresAt
    });
    
    // Auto-cleanup expired credentials
    this.cleanupExpired();
  }
  
  /**
   * Retrieve credentials from memory only
   * Returns null if credentials don't exist or are expired
   */
  static getCredentials(sessionId: string): { pnName: string; passcode: string } | null {
    const creds = this.credentials.get(sessionId);
    
    if (!creds) {
      return null;
    }
    
    // Check if expired
    if (Date.now() > creds.expiresAt) {
      this.clearCredentials(sessionId);
      return null;
    }
    
    return {
      pnName: creds.pnName,
      passcode: creds.passcode
    };
  }
  
  /**
   * Check if credentials exist for a session
   */
  static hasCredentials(sessionId: string): boolean {
    const creds = this.credentials.get(sessionId);
    if (!creds) return false;
    
    // Check if expired
    if (Date.now() > creds.expiresAt) {
      this.clearCredentials(sessionId);
      return false;
    }
    
    return true;
  }
  
  /**
   * Clear credentials for a specific session
   * SECURITY: Zeroizes secrets from memory before deletion
   */
  static clearCredentials(sessionId: string): void {
    const creds = this.credentials.get(sessionId);
    if (creds) {
      // Zeroize secrets before deletion
      MemorySecurity.zeroizeCredentials({
        pnName: creds.pnName,
        passcode: creds.passcode
      });
    this.credentials.delete(sessionId);
    }
  }
  
  /**
   * Clear all credentials (call on logout)
   * SECURITY: Zeroizes all secrets from memory
   */
  static clearAll(): void {
    // Zeroize all credentials before clearing
    for (const creds of this.credentials.values()) {
      MemorySecurity.zeroizeCredentials({
        pnName: creds.pnName,
        passcode: creds.passcode
      });
    }
    this.credentials.clear();
  }
  
  /**
   * Remove expired credentials
   * SECURITY: Zeroizes expired secrets from memory
   */
  private static cleanupExpired(): void {
    const now = Date.now();
    const expired: string[] = [];
    
    for (const [sessionId, creds] of this.credentials.entries()) {
      if (now > creds.expiresAt) {
        expired.push(sessionId);
      }
    }
    
    // Zeroize and remove expired credentials
    expired.forEach(sessionId => {
      this.clearCredentials(sessionId);
    });
  }
  
  /**
   * Get count of active credentials (for debugging/monitoring)
   */
  static getActiveCredentialsCount(): number {
    this.cleanupExpired();
    return this.credentials.size;
  }
}

