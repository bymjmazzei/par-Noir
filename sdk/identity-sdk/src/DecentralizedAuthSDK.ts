import { cryptoWorkerManager } from './cryptoWorkerManager';
/**
 * Decentralized Authentication SDK
 * 
 * Provi DID-based authentication without centralized OAuth servers
 * Users authenticate using their own cryptographic keys
 */

// Stub implementations for SDK compatibility
export interface AuthChallenge {
  challenge: string;
  expiresAt: string;
  did: string;
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
  async createChallenge(did: string): Promise<AuthChallenge> {
    throw new Error('Not implemented');
  }
  
  async authenticate(did: string, signature: AuthSignature): Promise<AuthSession | null> {
    throw new Error('Not implemented');
  }
  
  async isAuthenticated(did: string): Promise<boolean> {
    throw new Error('Not implemented');
  }
}
import { Identity } from './types';

export interface DecentralizedAuthConfig {
  apiUrl: string;
  timeout: number;
  retryAttempts: number;
  enableWebSocket: boolean;
}

export interface AuthenticationResult {
  success: boolean;
  session?: AuthSession;
  error?: string;
  did?: string;
}

export interface ChallengeResult {
  success: boolean;
  challenge?: AuthChallenge;
  error?: string;
}

export interface UserInfo {
  sub: string;
  name: string;
  email?: string;
  username?: string;
  created_at: string;
  updated_at: string;
  verified: boolean;
}

export class DecentralizedAuthSDK {
  private auth: DecentralizedAuth;
  private apiUrl: string = '';
  private config: DecentralizedAuthConfig;
  private ws: WebSocket | null = null;

  constructor(config: Partial<DecentralizedAuthConfig> = {}) {
    this.config = {
      apiUrl: config.apiUrl || 'https://api.identityprotocol.com',
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      enableWebSocket: config.enableWebSocket || false,
      ...config
    };

    this.auth = new DecentralizedAuth();
    
    if (this.config.enableWebSocket) {
      this.initializeWebSocket();
    }
  }

  /**
   * Initialize WebSocket connection for real-time authentication
   */
  private initializeWebSocket(): void {
    try {
      const wsUrl = this.config.apiUrl.replace('https://', 'wss://').replace('http://', 'ws://');
      this.ws = new WebSocket(`${wsUrl}/socket.io/?EIO=4&transport=websocket`);

      this.ws.onopen = () => {
        // WebSocket connected for decentralized authentication
      };

      this.ws.onerror = (error) => {
        // WebSocket connection failed
      };

      this.ws.onclose = () => {
        // WebSocket disconnected
        // Attempt to reconnect after 5 seconds
        setTimeout(() => {
          if (this.config.enableWebSocket) {
            this.initializeWebSocket();
          }
        }, 5000);
      };
    } catch (error) {
      // Failed to initialize WebSocket
    }
  }

  /**
   * Create an authentication challenge for a DID
   */
  async createChallenge(did: string): Promise<ChallengeResult> {
    try {
      // Try WebSocket first if available
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        return await this.createChallengeViaWebSocket(did);
      }

      // Fallback to HTTP
      return await this.createChallengeViaHTTP(did);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create challenge'
      };
    }
  }

  /**
   * Create challenge via WebSocket for real-time communication
   */
  private async createChallengeViaWebSocket(did: string): Promise<ChallengeResult> {
    return new Promise((resolve) => {
      if (!this.ws) {
        resolve({ success: false, error: 'WebSocket not available' });
        return;
      }

      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Challenge creation timeout' });
      }, this.config.timeout);

      const handleMessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'challenge_created') {
            clearTimeout(timeout);
            this.ws?.removeEventListener('message', handleMessage);
            resolve({ success: true, challenge: data.challenge });
          } else if (data.type === 'error') {
            clearTimeout(timeout);
            this.ws?.removeEventListener('message', handleMessage);
            resolve({ success: false, error: data.error });
          }
        } catch (error) {
          // Ignore non-JSON messages
        }
      };

      this.ws.addEventListener('message', handleMessage);
      this.ws.send(JSON.stringify({ type: 'auth_challenge', did }));
    });
  }

  /**
   * Create challenge via HTTP
   */
  private async createChallengeViaHTTP(did: string): Promise<ChallengeResult> {
    const response = await fetch(`${this.config.apiUrl}/auth/challenge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ did }),
      signal: AbortSignal.timeout(this.config.timeout)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || `HTTP ${response.status}`
      };
    }

    const challenge = await response.json();
    return { success: true, challenge };
  }

  /**
   * Authenticate using a DID and cryptographic signature
   */
  async authenticate(identity: Identity, challenge: AuthChallenge): Promise<AuthenticationResult> {
    try {
      // Sign the challenge with the user's private key
      if (!identity.privateKey) {
        throw new Error('Private key is required for authentication');
      }
      const signature = await this.signChallenge(challenge.challenge, identity.privateKey);
      
      // Submit authentication
      const response = await fetch(`${this.config.apiUrl}/auth/authenticate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          did: identity.id,
          signature
        }),
        signal: AbortSignal.timeout(this.config.timeout)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.message || `Authentication failed: ${response.status}`,
          did: identity.id
        };
      }

      const sessionData = await response.json();
      
      // Convert to AuthSession format
      const session: AuthSession = {
        did: sessionData.session_id,
        authenticatedAt: sessionData.authenticated_at,
        expiresAt: sessionData.expires_at,
        deviceId: sessionData.device_id,
        permissions: sessionData.permissions
      };

      return {
        success: true,
        session,
        did: identity.id
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
        did: identity.id
      };
    }
  }

  /**
   * Sign a challenge with the user's private key
   */
  private async signChallenge(challenge: string, privateKey: CryptoKey): Promise<AuthSignature> {
    const encoder = new TextEncoder();
    const data = encoder.encode(challenge);
    
    const signature = await await cryptoWorkerManager.sign(
      { name: 'Ed25519' },
      privateKey,
      data
    );

    const publicKey = await this.exportPublicKey(privateKey);

    return {
      challenge,
      signature: Buffer.from(signature).toString('base64'),
      publicKey,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Export public key from private key
   */
  private async exportPublicKey(privateKey: CryptoKey): Promise<string> {
    // For Ed25519, we need to derive the public key from the private key
    // This is a simplified implementation - in production you'd want to store the public key separately
    const exported = await await cryptoWorkerManager.exportKey('raw', privateKey);
    return Buffer.from(exported).toString('base64');
  }

  /**
   * Get user information for an authenticated DID
   */
  async getUserInfo(did: string): Promise<UserInfo | null> {
    try {
      const response = await fetch(`${this.config.apiUrl}/auth/userinfo`, {
        headers: {
          'x-identity-did': did
        },
        signal: AbortSignal.timeout(this.config.timeout)
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      // Failed to get user info
      return null;
    }
  }

  /**
   * Validate if a session is still active
   */
  async validateSession(did: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.apiUrl}/auth/validate`, {
        headers: {
          'x-identity-did': did
        },
        signal: AbortSignal.timeout(this.config.timeout)
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      return data.authenticated === true;
    } catch (error) {
      // Failed to validate session
      return false;
    }
  }

  /**
   * Logout and invalidate session
   */
  async logout(did: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.apiUrl}/auth/logout`, {
        method: 'POST',
        headers: {
          'x-identity-did': did
        },
        signal: AbortSignal.timeout(this.config.timeout)
      });

      return response.ok;
    } catch (error) {
      // Failed to logout
      return false;
    }
  }

  /**
   * Resolve a DID to get its document
   */
  async resolveDID(did: string): Promise<any> {
    try {
      const response = await fetch(`${this.config.apiUrl}/auth/resolve/${encodeURIComponent(did)}`, {
        signal: AbortSignal.timeout(this.config.timeout)
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      // Failed to resolve DID
      return null;
    }
  }

  /**
   * Complete authentication flow with retry logic
   */
  async authenticateWithRetry(identity: Identity): Promise<AuthenticationResult> {
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        // Step 1: Create challenge
        const challengeResult = await this.createChallenge(identity.id);
        if (!challengeResult.success || !challengeResult.challenge) {
          lastError = challengeResult.error;
          continue;
        }

        // Step 2: Authenticate with challenge
        const authResult = await this.authenticate(identity, challengeResult.challenge);
        if (authResult.success) {
          return authResult;
        }

        lastError = authResult.error;
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
      }

      // Wait before retry (exponential backoff)
      if (attempt < this.config.retryAttempts) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }

    return {
      success: false,
      error: lastError || 'Authentication failed after all retry attempts',
      did: identity.id
    };
  }

  /**
   * Clean up resources
   */
  troy(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Export singleton instance
export const decentralizedAuthSDK = new DecentralizedAuthSDK();
