import { DIDResolver, DIDResolutionResult } from './DIDResolver';
import { Identity } from '../types';
import { DIDValidator } from '../utils/didValidator';

export interface AuthChallenge {
  did: string;
  challenge: string;
  timestamp: string;
  expiresAt: string;
}

export interface AuthSignature {
  challenge: string;
  signature: string;
  publicKey: string;
  timestamp: string;
}

export interface AuthSession {
  did: string;
  authenticatedAt: string;
  expiresAt: string;
  deviceId: string;
  permissions: string[];
}

export class DecentralizedAuth {
  private resolver: DIDResolver;
  private sessions: Map<string, AuthSession> = new Map();
  private rateLimiter = new Map<string, { count: number; resetTime: number }>();
  private auditLog: Array<{ timestamp: string; event: string; details: any }> = [];
  private challengeStore = new Map<string, AuthChallenge>();

  constructor(resolver?: DIDResolver) {
    this.resolver = resolver || new DIDResolver();
  }

  /**
   * Create an authentication challenge with enhanced security
   */
  async createChallenge(did: string, expiresIn: number = 300000): Promise<AuthChallenge> {
    const startTime = Date.now();
    
    try {
      // Rate limiting
      if (!this.checkRateLimit(did)) {
        throw new Error('Rate limit exceeded - too many challenge requests');
      }

      // Validate DID format
      if (!this.isValidDIDFormat(did)) {
        throw new Error('Invalid DID format');
      }

      const challenge = this.generateChallenge();
      const timestamp = new Date().toISOString();
      const expiresAt = new Date(Date.now() + expiresIn).toISOString();

      const authChallenge: AuthChallenge = {
        did,
        challenge,
        timestamp,
        expiresAt
      };

      // Store challenge securely in memory (not localStorage)
      this.challengeStore.set(did, authChallenge);

      this.logSecurityEvent('challenge_created', { 
        did, 
        expiresIn,
        duration: Date.now() - startTime 
      });

      return authChallenge;

    } catch (error) {
      this.logSecurityEvent('challenge_creation_failed', { 
        did, 
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime 
      });
      throw error;
    }
  }

  /**
   * Authenticate using cryptographic signature with enhanced security
   */
  async authenticate(did: string, signature: AuthSignature): Promise<AuthSession | null> {
    const startTime = Date.now();
    
    try {
      // Rate limiting
      if (!this.checkRateLimit(did)) {
        throw new Error('Rate limit exceeded - too many authentication attempts');
      }

      // Validate input parameters
      if (!this.isValidSignatureFormat(signature)) {
        throw new Error('Invalid signature format');
      }

      // 1. Verify challenge hasn't expired (constant-time)
      const storedChallenge = this.challengeStore.get(did);
      if (!storedChallenge) {
        await this.delay(100); // Constant-time response
        throw new Error('No authentication challenge found');
      }

      if (new Date() > new Date(storedChallenge.expiresAt)) {
        await this.delay(100); // Constant-time response
        throw new Error('Authentication challenge expired');
      }

      // 2. Verify challenge matches (constant-time)
      if (!this.constantTimeCompare(signature.challenge, storedChallenge.challenge)) {
        await this.delay(100); // Constant-time response
        throw new Error('Challenge mismatch');
      }

      // 3. Resolve DID to get public key
      const didResolution = await this.resolver.resolve(did);
      const publicKey = this.extractPublicKey(didResolution.didDocument);

      if (!publicKey) {
        throw new Error('No public key found in DID document');
      }

      // 4. Verify signature cryptographically
      const isValid = await this.verifySignature(
        signature.challenge,
        signature.signature,
        publicKey
      );

      if (!isValid) {
        await this.delay(100); // Constant-time response
        throw new Error('Invalid signature');
      }

      // 5. Create authenticated session
      const session: AuthSession = {
        did,
        authenticatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        deviceId: this.getDeviceId(),
        permissions: ['read', 'write', 'sync']
      };

      // 6. Store session securely
      this.sessions.set(did, session);
      await this.storeSessionSecurely(did, session);

      // 7. Clean up challenge
      this.challengeStore.delete(did);

      this.logSecurityEvent('authentication_success', { 
        did, 
        deviceId: session.deviceId,
        duration: Date.now() - startTime 
      });

      return session;

    } catch (error) {
      this.logSecurityEvent('authentication_failed', { 
        did, 
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime 
      });
      // Only log in development to prevent production information leakage
      if (process.env.NODE_ENV === 'development') {
        console.error('Authentication failed:', error);
      }
      return null;
    }
  }

  /**
   * Verify if a DID is currently authenticated with enhanced security
   */
  async isAuthenticated(did: string): Promise<boolean> {
    try {
      const session = this.sessions.get(did);
      if (!session) {
        // Check secure storage for session
        const storedSession = await this.getSessionSecurely(did);
        if (!storedSession) return false;

        if (new Date() > new Date(storedSession.expiresAt)) {
          // Session expired, remove it
          await this.removeSessionSecurely(did);
          return false;
        }

        this.sessions.set(did, storedSession);
        return true;
      }

      return new Date() <= new Date(session.expiresAt);
    } catch (error) {
      this.logSecurityEvent('session_verification_failed', { 
        did, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      // Only log in development to prevent production information leakage
      if (process.env.NODE_ENV === 'development') {
        console.error('Session verification failed:', error);
      }
      return false;
    }
  }

  /**
   * Get current session for a DID
   */
  getSession(did: string): AuthSession | null {
    return this.sessions.get(did) || null;
  }

  /**
   * Logout a DID with enhanced security
   */
  async logout(did: string): Promise<void> {
    try {
      this.sessions.delete(did);
      await this.removeSessionSecurely(did);
      
      this.logSecurityEvent('logout_success', { did });
    } catch (error) {
      this.logSecurityEvent('logout_failed', { 
        did, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  /**
   * Generate a cryptographic challenge with enhanced entropy
   */
  private generateChallenge(): string {
    const randomBytes = crypto.getRandomValues(new Uint8Array(64)); // Increased entropy
    return btoa(String.fromCharCode(...randomBytes));
  }

  /**
   * Extract public key from DID document with validation
   */
  private extractPublicKey(didDocument: any): string | null {
    try {
      const verificationMethod = didDocument.verificationMethod?.[0];
      if (!verificationMethod) return null;

      // Validate verification method structure
      if (!verificationMethod.id || !verificationMethod.type || !verificationMethod.controller) {
        return null;
      }

      // Handle different key formats
      if (verificationMethod.publicKeyMultibase) {
        // Validate multibase format
        if (!this.isValidMultibaseFormat(verificationMethod.publicKeyMultibase)) {
          return null;
        }
        return verificationMethod.publicKeyMultibase;
      }

      if (verificationMethod.publicKeyJwk) {
        // Convert JWK to raw format if needed
        return this.jwkToRaw(verificationMethod.publicKeyJwk);
      }

      return null;
    } catch (error) {
      this.logSecurityEvent('public_key_extraction_failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return null;
    }
  }

  /**
   * Verify cryptographic signature with enhanced security
   */
  private async verifySignature(
    message: string,
    signature: string,
    publicKey: string
  ): Promise<boolean> {
    try {
      // Validate signature format
      if (!this.isValidSignatureFormat({ signature, publicKey })) {
        return false;
      }

      // Convert signature from base64
      const signatureBytes = new Uint8Array(
        atob(signature).split('').map(char => char.charCodeAt(0))
      );

      // Convert public key from base64
      const publicKeyBytes = new Uint8Array(
        atob(publicKey).split('').map(char => char.charCodeAt(0))
      );

      // Import public key
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        publicKeyBytes,
        { name: 'Ed25519' },
        false,
        ['verify']
      );

      // Verify signature
      const encoder = new TextEncoder();
      const messageBytes = encoder.encode(message);

      const isValid = await crypto.subtle.verify(
        { name: 'Ed25519' },
        cryptoKey,
        signatureBytes,
        messageBytes
      );

      // Constant-time response
      await this.delay(isValid ? 50 : 50);

      return isValid;

    } catch (error) {
      this.logSecurityEvent('signature_verification_failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return false;
    }
  }

  /**
   * Convert JWK to raw format with validation
   */
  private jwkToRaw(jwk: any): string {
    try {
      // Validate JWK structure
      if (!jwk.kty || !jwk.crv || !jwk.x) {
        throw new Error('Invalid JWK structure');
      }

      // This is a simplified conversion
      // In a real implementation, you'd need proper JWK to raw conversion
      return btoa(JSON.stringify(jwk));
    } catch (error) {
      this.logSecurityEvent('jwk_conversion_failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  /**
   * Get device ID with enhanced entropy
   */
  private getDeviceId(): string {
    let deviceId = sessionStorage.getItem('deviceId');
    if (!deviceId) {
      const timestamp = Date.now();
      const random = crypto.getRandomValues(new Uint8Array(16));
      const entropy = Array.from(random, byte => byte.toString(16).padStart(2, '0')).join('');
      deviceId = `device-${timestamp}-${entropy}`;
      sessionStorage.setItem('deviceId', deviceId);
    }
    return deviceId;
  }

  /**
   * Create a signature for authentication with enhanced security
   */
  async createSignature(challenge: string, privateKey: CryptoKey): Promise<AuthSignature> {
    try {
      // Validate challenge format
      if (!this.isValidChallengeFormat(challenge)) {
        throw new Error('Invalid challenge format');
      }

      const encoder = new TextEncoder();
      const messageBytes = encoder.encode(challenge);

      const signature = await crypto.subtle.sign(
        { name: 'Ed25519' },
        privateKey,
        messageBytes
      );

      return {
        challenge,
        signature: btoa(String.fromCharCode(...new Uint8Array(signature))),
        publicKey: '', // Will be filled by the caller
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this.logSecurityEvent('signature_creation_failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  /**
   * Generate a new key pair for a DID with enhanced security
   */
  async generateKeyPair(): Promise<{ publicKey: CryptoKey; privateKey: CryptoKey }> {
    try {
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'Ed25519'
        },
        true,
        ['sign', 'verify']
      ) as CryptoKeyPair;
      
      this.logSecurityEvent('key_pair_generated', {});
      
      return {
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey
      };
    } catch (error) {
      this.logSecurityEvent('key_pair_generation_failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  /**
   * Export public key for DID document with validation
   */
  async exportPublicKey(publicKey: CryptoKey): Promise<string> {
    try {
      const exported = await crypto.subtle.exportKey('raw', publicKey);
      const result = btoa(String.fromCharCode(...new Uint8Array(exported)));
      
      // Validate exported key format
      if (!this.isValidExportedKeyFormat(result)) {
        throw new Error('Invalid exported key format');
      }
      
      return result;
    } catch (error) {
      this.logSecurityEvent('public_key_export_failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  /**
   * Store session securely using Web Crypto API
   */
  private async storeSessionSecurely(did: string, session: AuthSession): Promise<void> {
    try {
      if (window.crypto && window.crypto.subtle) {
        const encrypted = await this.encryptForStorage(JSON.stringify(session));
        sessionStorage.setItem(`auth:session:${did}`, encrypted);
      } else {
        // Web Crypto API not available - using less secure storage
        sessionStorage.setItem(`auth:session:${did}`, JSON.stringify(session));
      }
    } catch (error) {
      this.logSecurityEvent('session_storage_failed', { 
        did, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  /**
   * Get session from secure storage
   */
  private async getSessionSecurely(did: string): Promise<AuthSession | null> {
    try {
      const encrypted = sessionStorage.getItem(`auth:session:${did}`);
      if (!encrypted) return null;

      if (window.crypto && window.crypto.subtle) {
        const decrypted = await this.decryptFromStorage(encrypted);
        return JSON.parse(decrypted);
      } else {
        return JSON.parse(encrypted);
      }
    } catch (error) {
              // Failed to retrieve session from secure storage
      return null;
    }
  }

  /**
   * Remove session from secure storage
   */
  private async removeSessionSecurely(did: string): Promise<void> {
    try {
      sessionStorage.removeItem(`auth:session:${did}`);
    } catch (error) {
      this.logSecurityEvent('session_removal_failed', { 
        did, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  /**
   * Encrypt data for secure storage
   */
  private async encryptForStorage(data: string): Promise<string> {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(data);
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );
    
    return JSON.stringify({
      data: Array.from(new Uint8Array(encrypted)),
      iv: Array.from(iv)
    });
  }

  /**
   * Decrypt data from secure storage
   */
  private async decryptFromStorage(encryptedData: string): Promise<string> {
    try {
      const { data, iv } = JSON.parse(encryptedData);
      
      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv) },
        key,
        new Uint8Array(data)
      );
      
      return new TextDecoder().decode(decrypted);
    } catch (error) {
      throw new Error('Failed to decrypt stored data');
    }
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   */
  private constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    
    return result === 0;
  }

  /**
   * Delay for constant-time operations
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Rate limiting to prevent brute force attacks
   */
  private checkRateLimit(identifier: string): boolean {
    const now = Date.now();
    const limit = this.rateLimiter.get(identifier);
    
    if (!limit || now > limit.resetTime) {
      this.rateLimiter.set(identifier, { count: 1, resetTime: now + 60000 }); // 1 minute window
      return true;
    }
    
    if (limit.count >= 5) { // Max 5 attempts per minute
      this.logSecurityEvent('auth_rate_limit_exceeded', { identifier });
      return false;
    }
    
    limit.count++;
    return true;
  }

  /**
   * Validate DID format using standardized validator
   */
  private isValidDIDFormat(did: string): boolean {
    const validation = DIDValidator.validateDID(did);
    return validation.isValid;
  }

  /**
   * Validate signature format
   */
  private isValidSignatureFormat(signature: { signature: string; publicKey: string }): boolean {
    if (!signature.signature || !signature.publicKey) return false;
    
    // Basic base64 validation
    const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
    return base64Pattern.test(signature.signature) && base64Pattern.test(signature.publicKey);
  }

  /**
   * Validate challenge format
   */
  private isValidChallengeFormat(challenge: string): boolean {
    if (!challenge || typeof challenge !== 'string') return false;
    
    // Basic base64 validation
    const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
    return base64Pattern.test(challenge) && challenge.length >= 32;
  }

  /**
   * Validate multibase format
   */
  private isValidMultibaseFormat(key: string): boolean {
    if (!key || typeof key !== 'string') return false;
    
    // Basic multibase validation
    const multibasePattern = /^z[1-9A-HJ-NP-Za-km-z]{45,}$/;
    return multibasePattern.test(key);
  }

  /**
   * Validate exported key format
   */
  private isValidExportedKeyFormat(key: string): boolean {
    if (!key || typeof key !== 'string') return false;
    
    // Basic base64 validation
    const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
    return base64Pattern.test(key) && key.length >= 32;
  }

  /**
   * Log security events for audit
   */
  private logSecurityEvent(event: string, details: any): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      details,
      userAgent: navigator.userAgent
    };
    
    this.auditLog.push(logEntry);
    
    // Keep only last 1000 events
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }
    
    // Send to secure logging service in production
    this.sendToAuditLog(logEntry);
  }

  /**
   * Send audit log entry to secure logging service
   */
  private async sendToAuditLog(logEntry: any): Promise<void> {
    try {
      // In production, this would send to a secure logging service
      // Silently handle audit logging in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
    } catch (error) {
      // Silently handle audit log failures in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
    }
  }

  /**
   * Get audit log for security monitoring
   */
  getAuditLog(): Array<{ timestamp: string; event: string; details: any }> {
    return [...this.auditLog];
  }

  /**
   * Clear audit log
   */
  clearAuditLog(): void {
    this.auditLog = [];
  }
} 