// Authentication Manager - Handles core authentication logic
import { DIDResolver } from '../DIDResolver';
import { AuthChallenge, AuthSignature, AuthSession } from '../types/decentralizedAuth';
import { SecurityManager } from './securityManager';
import { SessionManager } from './sessionManager';
import { CryptoManager } from './cryptoManager';
import { DIDValidator } from '../../utils/didValidator';

export class AuthenticationManager {
  private resolver: DIDResolver;
  private securityManager: SecurityManager;
  private sessionManager: SessionManager;
  private cryptoManager: CryptoManager;
  private challengeStore: Map<string, AuthChallenge>;

  constructor(resolver: DIDResolver) {
    this.resolver = resolver;
    this.securityManager = new SecurityManager();
    this.sessionManager = new SessionManager();
    this.cryptoManager = new CryptoManager();
    this.challengeStore = new Map();
  }

  /**
   * Create authentication challenge
   */
  async createChallenge(did: string, expiresIn: number = 300000): Promise<AuthChallenge> {
    const startTime = Date.now();
    
    try {
      if (!this.securityManager.checkRateLimit(did)) {
        throw new Error('Rate limit exceeded - too many challenge requests');
      }

      if (!this.isValidDIDFormat(did)) {
        throw new Error('Invalid DID format');
      }

      const challenge = this.cryptoManager.generateChallenge();
      const timestamp = new Date().toISOString();
      const expiresAt = new Date(Date.now() + expiresIn).toISOString();

      const authChallenge: AuthChallenge = {
        did,
        challenge,
        timestamp,
        expiresAt
      };

      this.challengeStore.set(did, authChallenge);
      
      this.securityManager.logSecurityEvent('challenge_created', {
        did,
        expiresIn,
        duration: Date.now() - startTime
      });

      return authChallenge;
    } catch (error) {
      this.securityManager.logSecurityEvent('challenge_creation_failed', {
        did,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
      throw error;
    }
  }

  /**
   * Authenticate user with signature
   */
  async authenticate(did: string, signature: AuthSignature): Promise<AuthSession | null> {
    const startTime = Date.now();
    
    try {
      if (!this.securityManager.checkRateLimit(did)) {
        throw new Error('Rate limit exceeded - too many authentication attempts');
      }

      if (!this.isValidSignatureFormat(signature)) {
        throw new Error('Invalid signature format');
      }

      const storedChallenge = this.challengeStore.get(did);
      if (!storedChallenge) {
        await this.securityManager.delay(100);
        throw new Error('No authentication challenge found');
      }

      if (new Date() > new Date(storedChallenge.expiresAt)) {
        await this.securityManager.delay(100);
        throw new Error('Authentication challenge expired');
      }

      if (!this.cryptoManager.constantTimeCompare(signature.challenge, storedChallenge.challenge)) {
        await this.securityManager.delay(100);
        throw new Error('Challenge mismatch');
      }

      const didResolution = await this.resolver.resolve(did);
      const publicKey = this.cryptoManager.extractPublicKey(didResolution.didDocument);
      
      if (!publicKey) {
        throw new Error('No public key found in DID document');
      }

      const isValid = await this.cryptoManager.verifySignature(signature.challenge, signature.signature, publicKey);
      
      if (!isValid) {
        await this.securityManager.delay(100);
        throw new Error('Invalid signature');
      }

      const deviceId = await this.cryptoManager.getDeviceId();
      const session: AuthSession = {
        did,
        authenticatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        deviceId,
        permissions: ['read', 'write', 'sync']
      };

      await this.sessionManager.createSession(did, session);
      this.challengeStore.delete(did);

      this.securityManager.logSecurityEvent('authentication_success', {
        did,
        deviceId: session.deviceId,
        duration: Date.now() - startTime
      });

      return session;
    } catch (error) {
      this.securityManager.logSecurityEvent('authentication_failed', {
        did,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
      
      if (process.env.NODE_ENV === 'development') {
        // Console statement removed for production
      }
      
      return null;
    }
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(did: string): Promise<boolean> {
    try {
      return await this.sessionManager.isSessionValid(did);
    } catch (error) {
      this.securityManager.logSecurityEvent('session_verification_failed', {
        did,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      if (process.env.NODE_ENV === 'development') {
        // Console statement removed for production
      }
      
      return false;
    }
  }

  /**
   * Get user session
   */
  getSession(did: string): AuthSession | null {
    return this.sessionManager.getSession(did);
  }

  /**
   * Logout user
   */
  async logout(did: string): Promise<void> {
    try {
      await this.sessionManager.removeSession(did);
      this.securityManager.logSecurityEvent('logout_success', { did });
    } catch (error) {
      this.securityManager.logSecurityEvent('logout_failed', {
        did,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Validate DID format
   */
  private isValidDIDFormat(did: string): boolean {
    const validation = DIDValidator.validateDID(did);
    return validation.isValid;
  }

  /**
   * Validate signature format
   */
  private isValidSignatureFormat(signature: AuthSignature): boolean {
    if (!signature.signature || !signature.publicKey) return false;
    
    const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
    return base64Pattern.test(signature.signature) && base64Pattern.test(signature.publicKey);
  }
}
