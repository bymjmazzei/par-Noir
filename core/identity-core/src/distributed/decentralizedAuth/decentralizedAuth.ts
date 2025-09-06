// Main DecentralizedAuth Class - Maintains backward compatibility while using modular components
import { DIDResolver } from '../DIDResolver';
import { AuthChallenge, AuthSignature, AuthSession, KeyPair } from '../types/decentralizedAuth';
import { AuthenticationManager } from './authenticationManager';
import { SessionManager } from './sessionManager';
import { CryptoManager } from './cryptoManager';
import { SecurityManager } from './securityManager';

export class DecentralizedAuth {
  private resolver: DIDResolver;
  private authenticationManager: AuthenticationManager;
  private sessionManager: SessionManager;
  private cryptoManager: CryptoManager;
  private securityManager: SecurityManager;

  constructor(resolver?: DIDResolver) {
    this.resolver = resolver || new DIDResolver();
    this.authenticationManager = new AuthenticationManager(this.resolver);
    this.sessionManager = new SessionManager();
    this.cryptoManager = new CryptoManager();
    this.securityManager = new SecurityManager();
  }

  /**
   * Create authentication challenge
   */
  async createChallenge(did: string, expiresIn: number = 300000): Promise<AuthChallenge> {
    return this.authenticationManager.createChallenge(did, expiresIn);
  }

  /**
   * Authenticate user with signature
   */
  async authenticate(did: string, signature: AuthSignature): Promise<AuthSession | null> {
    return this.authenticationManager.authenticate(did, signature);
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(did: string): Promise<boolean> {
    return this.authenticationManager.isAuthenticated(did);
  }

  /**
   * Get user session
   */
  getSession(did: string): AuthSession | null {
    return this.authenticationManager.getSession(did);
  }

  /**
   * Logout user
   */
  async logout(did: string): Promise<void> {
    return this.authenticationManager.logout(did);
  }

  /**
   * Generate authentication challenge
   */
  generateChallenge(): string {
    return this.cryptoManager.generateChallenge();
  }

  /**
   * Create signature
   */
  async createSignature(challenge: string, privateKey: CryptoKey): Promise<{ challenge: string; signature: string; publicKey: string; timestamp: string }> {
    return this.cryptoManager.createSignature(challenge, privateKey);
  }

  /**
   * Generate key pair
   */
  async generateKeyPair(): Promise<KeyPair> {
    return this.cryptoManager.generateKeyPair();
  }

  /**
   * Export public key
   */
  async exportPublicKey(publicKey: CryptoKey): Promise<string> {
    return this.cryptoManager.exportPublicKey(publicKey);
  }

  /**
   * Get audit log for security monitoring
   */
  getAuditLog(): Array<{ timestamp: string; event: string; details: any }> {
    return this.securityManager.getAuditLog();
  }

  /**
   * Clear audit log
   */
  clearAuditLog(): void {
    this.securityManager.clearAuditLog();
  }
}
