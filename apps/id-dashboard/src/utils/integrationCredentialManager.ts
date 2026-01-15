/**
 * Integration Credential Manager
 * 
 * Securely stores OAuth tokens and API credentials for integrations
 * (Google Drive, Firebase, GitHub, etc.)
 * NEVER stores credentials in plaintext - all credentials are encrypted before storage.
 * 
 * SECURITY: Integration credentials are sensitive and should be encrypted at rest.
 * All credentials are encrypted using AES-GCM 256-bit encryption with a key
 * derived from the user's pnName + passcode, ensuring only authenticated users
 * can decrypt their integration credentials.
 */

import { SecureStorage } from './storage';

interface EncryptedCredential {
  encryptedData: string;
  iv: string;
  salt: string;
}

interface IntegrationCredentials {
  accessToken?: string;
  refreshToken?: string;
  email?: string;
  name?: string;
  picture?: string;
  expiresAt?: number;
  // Additional credential fields for various integrations
  apiKey?: string;
  apiSecret?: string;
  clientId?: string;
  clientSecret?: string;
  endpoint?: string;
  region?: string;
  bucket?: string;
  accountId?: string;
  [key: string]: any; // Allow additional fields
}

export class IntegrationCredentialManager {
  private static readonly STORAGE_PREFIX = 'encrypted_integration_';
  private static readonly CREDENTIALS_STORE = 'integration_credentials';
  private static storage: SecureStorage | null = null;

  /**
   * Initialize the credential manager
   */
  static async initialize(): Promise<void> {
    if (!this.storage) {
      this.storage = new SecureStorage();
      await this.storage.init();
    }
  }

  /**
   * Generate encryption key from user credentials
   * Uses pnName + passcode to derive encryption key for integration credentials
   */
  private static async deriveEncryptionKey(
    sessionId: string,
    pnName: string,
    passcode: string
  ): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = encoder.encode(`${sessionId}::${pnName}::${passcode}`);
    
    return crypto.subtle.importKey(
      'raw',
      keyMaterial,
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    ).then(keyMaterial =>
      crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: encoder.encode('integration_credentials_salt'),
          iterations: 100000,
          hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      )
    );
  }

  /**
   * Encrypt credentials before storage
   */
  private static async encryptCredentials(
    credentials: IntegrationCredentials,
    sessionId: string,
    pnName: string,
    passcode: string
  ): Promise<EncryptedCredential> {
    await this.initialize();
    
    const key = await this.deriveEncryptionKey(sessionId, pnName, passcode);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(credentials));
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    
    return {
      encryptedData: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
      iv: btoa(String.fromCharCode(...iv)),
      salt: 'integration_credentials_salt' // Static salt for key derivation
    };
  }

  /**
   * Decrypt credentials after retrieval
   */
  private static async decryptCredentials(
    encrypted: EncryptedCredential,
    sessionId: string,
    pnName: string,
    passcode: string
  ): Promise<IntegrationCredentials> {
    await this.initialize();
    
    const key = await this.deriveEncryptionKey(sessionId, pnName, passcode);
    const iv = Uint8Array.from(atob(encrypted.iv), c => c.charCodeAt(0));
    const encryptedData = Uint8Array.from(atob(encrypted.encryptedData), c => c.charCodeAt(0));
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encryptedData
    );
    
    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decrypted));
  }

  /**
   * Store integration credentials securely
   * @param integrationId - Unique identifier for the integration (e.g., 'google_drive', 'google_drive_backend_1')
   * @param credentials - The credentials to store
   * @param sessionId - Current user session ID
   */
  static async storeCredentials(
    integrationId: string,
    credentials: IntegrationCredentials,
    sessionId: string
  ): Promise<void> {
    await this.initialize();
    
    // Get user credentials from SecureCredentialManager
    const { SecureCredentialManager } = await import('./secureCredentialManager');
    const userCredentials = SecureCredentialManager.getCredentials(sessionId);
    
    if (!userCredentials) {
      throw new Error('User credentials not available - cannot encrypt integration credentials');
    }

    // CRITICAL: Merge with existing credentials to preserve fields not provided
    // This prevents overwriting refresh tokens during token refresh operations
    const existing = await this.getCredentials(integrationId, sessionId);
    const merged: IntegrationCredentials = {
      ...existing,  // Preserve existing fields
      ...credentials,  // Override with new fields
      // CRITICAL: Preserve refreshToken if not provided in new credentials
      // This is essential because Google doesn't return a new refresh token on refresh
      refreshToken: credentials.refreshToken ?? existing?.refreshToken ?? credentials.refreshToken
    };

    // Encrypt credentials
    const encrypted = await this.encryptCredentials(
      merged,
      sessionId,
      userCredentials.pnName,
      userCredentials.passcode
    );

    // Store in IndexedDB (encrypted)
    if (!this.storage) {
      throw new Error('Storage not initialized');
    }

    // Store encrypted credentials in localStorage (encrypted blob)
    // The data is already encrypted, so storing in localStorage is acceptable
    // as long as the encryption key is derived from user credentials
    const storageKey = `${this.STORAGE_PREFIX}${integrationId}`;
    
    try {
      const encryptedBlob = JSON.stringify(encrypted);
      localStorage.setItem(storageKey, encryptedBlob);
    } catch (error) {
      console.error('[IntegrationCredentialManager] Failed to store credentials:', error);
      throw new Error('Failed to store encrypted credentials');
    }
  }

  /**
   * Retrieve integration credentials
   * @param integrationId - Unique identifier for the integration
   * @param sessionId - Current user session ID
   */
  static async getCredentials(
    integrationId: string,
    sessionId: string
  ): Promise<IntegrationCredentials | null> {
    await this.initialize();
    
    // Get user credentials from SecureCredentialManager
    const { SecureCredentialManager } = await import('./secureCredentialManager');
    const userCredentials = SecureCredentialManager.getCredentials(sessionId);
    
    if (!userCredentials) {
      console.warn('[IntegrationCredentialManager] User credentials not available');
      return null;
    }

    const storageKey = `${this.STORAGE_PREFIX}${integrationId}`;
    
    try {
      const encryptedBlob = localStorage.getItem(storageKey);
      if (!encryptedBlob) {
        return null;
      }

      const encrypted: EncryptedCredential = JSON.parse(encryptedBlob);
      return await this.decryptCredentials(
        encrypted,
        sessionId,
        userCredentials.pnName,
        userCredentials.passcode
      );
    } catch (error) {
      console.error('[IntegrationCredentialManager] Failed to retrieve credentials:', error);
      return null;
    }
  }

  /**
   * Remove integration credentials
   */
  static async removeCredentials(integrationId: string): Promise<void> {
    await this.initialize();
    
    const storageKey = `${this.STORAGE_PREFIX}${integrationId}`;
    localStorage.removeItem(storageKey);
  }

  /**
   * Clear all integration credentials (on logout)
   */
  static async clearAll(): Promise<void> {
    await this.initialize();
    
    if (!this.storage) return;

    // Clear all encrypted integration credentials
    try {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.startsWith(this.STORAGE_PREFIX)) {
          localStorage.removeItem(key);
        }
      }
    } catch (error) {
      console.error('[IntegrationCredentialManager] Failed to clear credentials:', error);
    }
  }

  /**
   * Migrate plaintext credentials to encrypted storage
   * Call this on app startup to migrate existing plaintext tokens
   */
  static async migratePlaintextCredentials(
    integrationId: string,
    sessionId: string
  ): Promise<boolean> {
    await this.initialize();
    
    // Check if encrypted version already exists
    const encrypted = await this.getCredentials(integrationId, sessionId);
    if (encrypted) {
      return false; // Already migrated
    }

    // Try to find plaintext credentials in localStorage
    // Check for various key patterns that might contain tokens/email
    const plaintextKeys = [
      `${integrationId}_token`,
      `${integrationId}_refresh_token`,
      `${integrationId}_email`,
      `${integrationId}_api_key`,
      `${integrationId}_api_secret`,
      `${integrationId}_access_token`,
      `${integrationId}_client_id`,
      `${integrationId}_client_secret`,
      // Google Drive patterns
      'google_drive_token',
      'google_drive_refresh_token',
      'google_drive_email',
      // Firebase patterns
      'firebase_token',
      'firebase_api_key',
      'firebase_access_token',
      'firebase_refresh_token',
      'firebase_email',
      // GitHub patterns
      'github_token',
      'github_access_token',
      'github_refresh_token',
      'github_api_key',
      'github_client_id',
      'github_client_secret'
    ];
    
    // Also check for keyPrefix-based keys (e.g., google_drive_bymjmazzei-gmail-com-87d29d6d_token)
    const allLocalStorageKeys = Object.keys(localStorage);
    const keyPrefixPatterns = allLocalStorageKeys.filter(key => {
      const lowerKey = key.toLowerCase();
      const hasIntegration = lowerKey.includes(integrationId.toLowerCase()) || 
                            lowerKey.includes('google_drive') ||
                            lowerKey.includes('firebase') ||
                            lowerKey.includes('github');
      const hasCredential = key.includes('_token') || 
                          key.includes('_refresh_token') || 
                          key.includes('_email') ||
                          key.includes('_api_key') ||
                          key.includes('_api_secret') ||
                          key.includes('_access_token') ||
                          key.includes('_client_id') ||
                          key.includes('_client_secret');
      return hasIntegration && hasCredential;
    });
    plaintextKeys.push(...keyPrefixPatterns);

    let foundCredentials: IntegrationCredentials | null = null;

    for (const key of plaintextKeys) {
      const value = localStorage.getItem(key);
      if (!value) continue;
      
      if (!foundCredentials) {
        foundCredentials = {} as IntegrationCredentials;
      }
      
      const lowerKey = key.toLowerCase();
      
      // Map various credential patterns to IntegrationCredentials fields
      if (lowerKey.includes('refresh_token') || lowerKey.includes('refresh')) {
        foundCredentials.refreshToken = value;
      } else if (lowerKey.includes('access_token') || (lowerKey.includes('token') && !lowerKey.includes('refresh'))) {
        foundCredentials.accessToken = value;
      } else if (lowerKey.includes('email')) {
        foundCredentials.email = value;
      } else if (lowerKey.includes('api_key') || lowerKey.includes('apikey')) {
        foundCredentials.apiKey = value;
      } else if (lowerKey.includes('api_secret') || lowerKey.includes('apisecret')) {
        foundCredentials.apiSecret = value;
      } else if (lowerKey.includes('client_id') || lowerKey.includes('clientid')) {
        foundCredentials.clientId = value;
      } else if (lowerKey.includes('client_secret') || lowerKey.includes('clientsecret')) {
        foundCredentials.clientSecret = value;
      } else {
        // Store unknown fields in the credentials object
        const fieldName = key.split('_').pop() || key;
        foundCredentials[fieldName] = value;
      }
    }

    if (foundCredentials && foundCredentials.accessToken) {
      // Migrate to encrypted storage
      await this.storeCredentials(integrationId, foundCredentials, sessionId);
      
      // Remove plaintext versions
      for (const key of plaintextKeys) {
        localStorage.removeItem(key);
      }
      
      return true; // Migration successful
    }

    return false; // No plaintext credentials found
  }

  /**
   * Clean up ALL plaintext integration credentials from localStorage
   * This is a one-time cleanup that should be run on app startup
   * AGGRESSIVE: Removes ALL keys matching integration credential patterns
   * Handles: Google Drive, Firebase, GitHub, and other integrations
   */
  static async cleanupAllPlaintextCredentials(): Promise<{ cleaned: number }> {
    await this.initialize();
    
    let cleaned = 0;
    const keysToRemove: string[] = [];
    
    // Integration patterns to clean up
    const integrationPatterns = [
      { name: 'google_drive', patterns: ['google', 'drive'] },
      { name: 'firebase', patterns: ['firebase'] },
      { name: 'github', patterns: ['github'] }
    ];
    
    // Credential field patterns
    const credentialPatterns = [
      '_token',
      '_refresh_token',
      '_email',
      '_api_key',
      '_api_secret',
      '_access_token',
      '_client_id',
      '_client_secret',
      'token',
      'email',
      'apiKey',
      'apiSecret',
      'accessToken',
      'refreshToken'
    ];
    
    // Find all integration-related keys - AGGRESSIVE PATTERN MATCHING
    const allKeys = Object.keys(localStorage);
    for (const key of allKeys) {
      // Skip if already encrypted
      if (key.startsWith(this.STORAGE_PREFIX)) {
        continue;
      }
      
      const lowerKey = key.toLowerCase();
      
      // Check each integration pattern
      for (const integration of integrationPatterns) {
        const matchesIntegration = integration.patterns.every(pattern => 
          lowerKey.includes(pattern.toLowerCase())
        );
        
        if (matchesIntegration) {
          // Check if it's a credential key
          const isCredentialKey = credentialPatterns.some(pattern => 
            lowerKey.includes(pattern.toLowerCase()) || 
            key.includes(pattern)
          );
          
          if (isCredentialKey) {
            keysToRemove.push(key);
            break; // Found a match, move to next key
          }
        }
      }
      
      // Also catch generic credential patterns that might be integration-related
      // (e.g., firebase_token, github_access_token, etc.)
      const hasCredentialPattern = credentialPatterns.some(pattern => 
        lowerKey.includes(pattern.toLowerCase()) || 
        key.includes(pattern)
      );
      
      const hasIntegrationName = integrationPatterns.some(integration =>
        integration.patterns.some(pattern => lowerKey.includes(pattern.toLowerCase()))
      );
      
      if (hasCredentialPattern && hasIntegrationName && !keysToRemove.includes(key)) {
        keysToRemove.push(key);
      }
    }
    
    // Clean up Google Drive accounts array (remove email)
    try {
      const accountsKey = 'pn_google_drive_accounts';
      const accountsData = localStorage.getItem(accountsKey);
      if (accountsData) {
        try {
          const accounts = JSON.parse(accountsData);
          if (Array.isArray(accounts)) {
            let hasEmail = false;
            const cleanedAccounts = accounts.map((account: any) => {
              if (account.email) {
                hasEmail = true;
                const { email, ...rest } = account;
                return rest;
              }
              return account;
            });
            
            if (hasEmail) {
              localStorage.setItem(accountsKey, JSON.stringify(cleanedAccounts));
              console.log(`[Security] Removed email from ${accountsKey}`);
              cleaned++;
            }
          }
        } catch (parseError) {
          // If JSON is invalid, remove the entire key
          localStorage.removeItem(accountsKey);
          console.log(`[Security] Removed invalid ${accountsKey} entry`);
          cleaned++;
        }
      }
    } catch (error) {
      console.warn('[IntegrationCredentialManager] Failed to clean Google Drive accounts array:', error);
    }
    
    // Clean up Firebase accounts/credentials if they exist
    try {
      const firebaseKeys = ['pn_firebase_accounts', 'firebase_credentials', 'firebase_config'];
      for (const firebaseKey of firebaseKeys) {
        const firebaseData = localStorage.getItem(firebaseKey);
        if (firebaseData) {
          try {
            const data = JSON.parse(firebaseData);
            let hasCredentials = false;
            const cleanedData: any = {};
            
            // Remove sensitive fields
            for (const [key, value] of Object.entries(data)) {
              const lowerKey = key.toLowerCase();
              if (!lowerKey.includes('token') && 
                  !lowerKey.includes('key') && 
                  !lowerKey.includes('secret') &&
                  !lowerKey.includes('email') &&
                  !lowerKey.includes('credential')) {
                cleanedData[key] = value;
              } else {
                hasCredentials = true;
              }
            }
            
            if (hasCredentials) {
              localStorage.setItem(firebaseKey, JSON.stringify(cleanedData));
              console.log(`[Security] Removed credentials from ${firebaseKey}`);
              cleaned++;
            }
          } catch (parseError) {
            // If JSON is invalid or contains credentials, remove it
            localStorage.removeItem(firebaseKey);
            console.log(`[Security] Removed invalid ${firebaseKey} entry`);
            cleaned++;
          }
        }
      }
    } catch (error) {
      console.warn('[IntegrationCredentialManager] Failed to clean Firebase credentials:', error);
    }
    
    // Clean up GitHub accounts/credentials if they exist
    try {
      const githubKeys = ['pn_github_accounts', 'github_credentials', 'github_config', 'github_token'];
      for (const githubKey of githubKeys) {
        const githubData = localStorage.getItem(githubKey);
        if (githubData) {
          try {
            const data = JSON.parse(githubData);
            let hasCredentials = false;
            const cleanedData: any = {};
            
            // Remove sensitive fields
            for (const [key, value] of Object.entries(data)) {
              const lowerKey = key.toLowerCase();
              if (!lowerKey.includes('token') && 
                  !lowerKey.includes('key') && 
                  !lowerKey.includes('secret') &&
                  !lowerKey.includes('email') &&
                  !lowerKey.includes('credential') &&
                  !lowerKey.includes('password')) {
                cleanedData[key] = value;
              } else {
                hasCredentials = true;
              }
            }
            
            if (hasCredentials) {
              localStorage.setItem(githubKey, JSON.stringify(cleanedData));
              console.log(`[Security] Removed credentials from ${githubKey}`);
              cleaned++;
            }
          } catch (parseError) {
            // If it's a plain token string or invalid JSON, remove it
            localStorage.removeItem(githubKey);
            console.log(`[Security] Removed plaintext ${githubKey}`);
            cleaned++;
          }
        }
      }
    } catch (error) {
      console.warn('[IntegrationCredentialManager] Failed to clean GitHub credentials:', error);
    }
    
    // Remove all plaintext credentials
    for (const key of keysToRemove) {
      try {
        localStorage.removeItem(key);
        cleaned++;
        console.log(`[Security] Removed plaintext credential key: ${key}`);
      } catch (error) {
        console.warn(`[IntegrationCredentialManager] Failed to remove ${key}:`, error);
      }
    }
    
    if (cleaned > 0) {
      console.log(`[Security] Cleaned ${cleaned} plaintext integration credential keys from localStorage (Google Drive, Firebase, GitHub, etc.)`);
    }
    
    return { cleaned };
  }
}

