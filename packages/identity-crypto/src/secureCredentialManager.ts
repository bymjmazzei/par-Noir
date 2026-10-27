/**
 * Secure Credential Manager
 * 
 * Stores Key 1 and Key 2 ONLY in memory during authentication.
 * NEVER persists to IndexedDB, localStorage, or any storage.
 * 
 * CRITICAL: Key 1 + Key 2 = 2FA credentials. Must remain secret.
 * Both are SECRETS and must be treated identically.
 */

import { MemorySecurity } from './memorySecurity';

interface Credentials {
  key1: string;
  key2: string;
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
   * @param key1 - The Key 1 (part of 2FA - SECRET)
   * @param key2 - The Key 2 (part of 2FA - SECRET)
   * @param expiresIn - Optional expiration time in milliseconds (default: 1 hour)
   */
  static setCredentials(
    sessionId: string, 
    key1: string, 
    key2: string,
    expiresIn: number = this.DEFAULT_EXPIRY
  ): void {
    // Clear any existing credentials for this session
    this.clearCredentials(sessionId);
    
    const expiresAt = Date.now() + expiresIn;
    
    this.credentials.set(sessionId, {
      key1,
      key2,
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
  static getCredentials(sessionId: string): { key1: string; key2: string } | null {
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
      key1: creds.key1,
      key2: creds.key2
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
        key1: creds.key1,
        key2: creds.key2
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
        key1: creds.key1,
        key2: creds.key2
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

