import { 
  Identity, 
  AuthRequest, 
  AuthResponse, 
  TokenInfo, 
  UserSession, 
  SDKConfig, 
  IdentityProvider,
  IdentityError,
  ErrorCodes,
  EventTypes,
  IdentityEvent,
  ComplianceData,
  DataCollectionRequest
} from './types';

// Import security systems
import { MetadataValidator } from '../../core/identity-core/src/security/metadata-validator';
import { SessionManager, SecureSession } from '../../core/identity-core/src/security/session-manager';
import { ZKProofManager, TimestampedZKProof } from '../../core/identity-core/src/security/zk-proof-manager';
import { ThreatDetector } from '../../core/identity-core/src/security/threat-detector';

// Import storage implementations
import { IndexedDBStorage } from './IndexedDBStorage';
import { MemoryStorage } from './MemoryStorage';

export class IdentitySDK {
  private config: SDKConfig;
  private session: UserSession | null = null;
  private secureSession: SecureSession | null = null;
  private eventListeners: Map<string, Function[]> = new Map();
  private storage: Storage | IndexedDBStorage | MemoryStorage | null = null;

  constructor(config: SDKConfig) {
    this.config = config;
    this.initializeStorage().catch(error => {
      // Fallback to memory storage if initialization fails
      this.storage = new MemoryStorage();
    });
  }

  /**
   * Initialize the SDK with platform-specific storage
   */
  private async initializeStorage(): Promise<void> {
    try {
      switch (this.config.storage) {
        case 'localStorage':
          this.storage = window.localStorage;
          break;
        case 'sessionStorage':
          this.storage = window.sessionStorage;
          break;
        case 'indexedDB':
          if (IndexedDBStorage.isSupported()) {
            this.storage = new IndexedDBStorage();
            await (this.storage as IndexedDBStorage).initialize();
          } else {
            this.storage = window.localStorage; // fallback
          }
          break;
        case 'memory':
          this.storage = new MemoryStorage();
          break;
        default:
          this.storage = window.localStorage;
      }
    } catch (error) {
      // Silently fallback to memory storage in production
      this.storage = new MemoryStorage();
    }
  }

  /**
   * Start authentication flow (OAuth-like) with enhanced security
   */
  async authenticate(platform: string, options?: {
    scope?: string[];
    state?: string;
    nonce?: string;
    responseType?: 'code' | 'token' | 'id_token';
  }): Promise<void> {
    // Record security event
    ThreatDetector.recordEvent({
      eventType: 'authentication_started',
      userId: 'anonymous',
      dashboardId: this.config.dashboardId || 'unknown',
      details: { platform, options },
      riskLevel: 'low'
    });
    try {
      this.emit(EventTypes.AUTH_STARTED, { platform, options });

      const provider = this.getProvider(platform);
      const authRequest: AuthRequest = {
        clientId: provider.config.clientId,
        redirectUri: provider.config.redirectUri,
        scope: options?.scope || provider.config.scopes,
        state: options?.state || this.generateState(),
        nonce: options?.nonce || this.generateNonce(),
        responseType: options?.responseType || 'code'
      };

      // Build authorization URL
      const authUrl = this.buildAuthUrl(provider, authRequest);
      
      // Store auth state for verification
      this.storeAuthState(authRequest);

      // Redirect to authorization endpoint
      window.location.href = authUrl;

    } catch (error) {
      const identityError = this.createError(ErrorCodes.SERVER_ERROR, error);
      this.emit(EventTypes.AUTH_ERROR, identityError);
      throw identityError;
    }
  }

  /**
   * Handle authentication callback
   */
  async handleCallback(url: string): Promise<UserSession> {
    try {
      const params = new URLSearchParams(url.split('?')[1] || '');
      const code = params.get('code');
      const state = params.get('state');
      const error = params.get('error');

      if (error) {
        throw new Error(`Authentication failed: ${error}`);
      }

      if (!code) {
        throw new Error('No authorization code received');
      }

      // Verify state parameter
      const storedState = this.getStoredAuthState();
      if (state !== storedState) {
        throw new Error('State parameter mismatch');
      }

      // Exchange code for tokens
      const tokens = await this.exchangeCodeForTokens(code);
      
      // Get user information
      const identity = await this.getUserInfo(tokens.accessToken);
      
      // Create session
      this.session = {
        identity,
        tokens,
        platform: this.config.identityProvider.name,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
      };

      // Store session
      this.storeSession(this.session);

      this.emit(EventTypes.AUTH_SUCCESS, this.session);
      return this.session;

    } catch (error) {
      const identityError = this.createError(ErrorCodes.SERVER_ERROR, error);
      this.emit(EventTypes.AUTH_ERROR, identityError);
      throw identityError;
    }
  }

  /**
   * Get current user session
   */
  getCurrentSession(): UserSession | null {
    if (!this.session) {
      this.session = this.getStoredSession();
    }
    return this.session;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    const session = this.getCurrentSession();
    if (!session) return false;

    // Check if token is expired
    const expiryTime = new Date(session.tokens.expiresIn * 1000);
    const now = new Date();
    
    if (now >= expiryTime) {
      this.logout();
      return false;
    }

    return true;
  }

  /**
   * Refresh access token
   */
  async refreshToken(): Promise<TokenInfo> {
    const session = this.getCurrentSession();
    if (!session?.tokens.refreshToken) {
      throw this.createError(ErrorCodes.INVALID_TOKEN, 'No refresh token available');
    }

    try {
      const provider = this.config.identityProvider;
      const response = await fetch(provider.config.endpoints.token, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: session.tokens.refreshToken,
          client_id: provider.config.clientId,
          ...(provider.config.clientSecret && {
            client_secret: provider.config.clientSecret
          })
        })
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.statusText}`);
      }

      const newTokens: TokenInfo = await response.json();
      
      // Update session
      if (this.session) {
        this.session.tokens = newTokens;
        this.session.lastActive = new Date().toISOString();
        this.storeSession(this.session);
      }

      this.emit(EventTypes.TOKEN_REFRESH, newTokens);
      return newTokens;

    } catch (error) {
      const identityError = this.createError(ErrorCodes.INVALID_TOKEN, error);
      this.emit(EventTypes.TOKEN_EXPIRED, identityError);
      throw identityError;
    }
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    try {
      const session = this.getCurrentSession();
      if (session?.tokens.accessToken) {
        // Revoke token if endpoint is available
        const provider = this.config.identityProvider;
        if (provider.config.endpoints.revocation) {
          await fetch(provider.config.endpoints.revocation, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              token: session.tokens.accessToken,
              client_id: provider.config.clientId,
              ...(provider.config.clientSecret && {
                client_secret: provider.config.clientSecret
              })
            })
          });
        }
      }

      // Clear session
      this.session = null;
      this.clearStoredSession();
      this.clearStoredAuthState();

      this.emit(EventTypes.LOGOUT);

    } catch (error) {
      // Silently handle logout errors in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      // Still clear local session even if server logout fails
      this.session = null;
      this.clearStoredSession();
      this.clearStoredAuthState();
    }
  }

  /**
   * Get compliance data for platform
   */
  getComplianceData(platform: string): ComplianceData {
    // This would typically come from the platform's configuration
    return {
      platform,
      requiredFields: ['email', 'displayName'],
      optionalFields: ['phone', 'address', 'dateOfBirth'],
      dataRetention: {
        period: 365, // days
        purpose: 'Account management and service provision'
      },
      consentRequired: true
    };
  }

  /**
   * Request additional data collection from user
   */
  async requestDataCollection(request: DataCollectionRequest): Promise<Record<string, any>> {
    return new Promise((resolve, reject) => {
      // This would typically show a modal or redirect to a data collection form
      const event = new CustomEvent('identity:dataCollection', {
        detail: { request, resolve, reject }
      });
      window.dispatchEvent(event);
    });
  }

  // Event handling
  on(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  off(event: string, callback: Function): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  private emit(event: string, data?: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          // Silently handle event listener errors in production
          if (process.env.NODE_ENV === 'development') {
            // Development logging only
          }
        }
      });
    }
  }

  // Helper methods
  private getProvider(platform: string): IdentityProvider {
    // For now, return the configured provider
    // In the future, this could support multiple providers
    return this.config.identityProvider;
  }

  private buildAuthUrl(provider: IdentityProvider, request: AuthRequest): string {
    const params = new URLSearchParams({
      client_id: request.clientId,
      redirect_uri: request.redirectUri,
      scope: request.scope.join(' '),
      response_type: request.responseType,
      state: request.state!,
      ...(request.nonce && { nonce: request.nonce })
    });

    return `${provider.config.endpoints.authorization}?${params.toString()}`;
  }

  private async exchangeCodeForTokens(code: string): Promise<TokenInfo> {
    const provider = this.config.identityProvider;
    const response = await fetch(provider.config.endpoints.token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: provider.config.redirectUri,
        client_id: provider.config.clientId,
        ...(provider.config.clientSecret && {
          client_secret: provider.config.clientSecret
        })
      })
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    return response.json();
  }

  private async getUserInfo(accessToken: string): Promise<Identity> {
    const provider = this.config.identityProvider;
    const response = await fetch(provider.config.endpoints.userInfo, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.statusText}`);
    }

    return response.json();
  }

  private generateState(): string {
    return Math.random().toString(36).substring(2);
  }

  private generateNonce(): string {
    return Math.random().toString(36).substring(2);
  }

  private createError(code: string, error: any): IdentityError {
    return {
      name: 'IdentityError',
      message: error.message || 'Unknown error',
      code,
      details: error
    };
  }

  // Storage methods
  private storeAuthState(request: AuthRequest): void {
    if (this.storage) {
      this.storage.setItem('identity_auth_state', request.state!);
    }
  }

  private getStoredAuthState(): string | null {
    return this.storage?.getItem('identity_auth_state') || null;
  }

  private clearStoredAuthState(): void {
    this.storage?.removeItem('identity_auth_state');
  }

  private storeSession(session: UserSession): void {
    if (this.storage) {
      this.storage.setItem('identity_session', JSON.stringify(session));
    }
  }

  private getStoredSession(): UserSession | null {
    const stored = this.storage?.getItem('identity_session');
    return stored ? JSON.parse(stored) : null;
  }

  private clearStoredSession(): void {
    this.storage?.removeItem('identity_session');
  }
}

// Memory storage fallback
class MemoryStorage implements Storage {
  private data: Map<string, string> = new Map();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) || null;
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] || null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
} 