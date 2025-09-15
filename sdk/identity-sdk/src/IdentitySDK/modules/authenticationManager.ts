import { cryptoWorkerManager } from '@identity-protocol/identity-core/src/encryption/cryptoWorkerManager';
import { 
  Identity, 
  AuthRequest, 
  AuthResponse, 
  TokenInfo, 
  UserSession, 
  SDKConfig, 
  IdentityProvider,
  IdentityError,
  ErrorCo,
  EventTypes
} from '../types';
import { 
  AuthState, 
  TokenExchangeData, 
  UserInfoData 
} from '../types/identitySDK';
import { SDK_DEFAULTS, STORAGE_KEYS, ERROR_MESSAGES } from '../constants/sdkConstants';

export class AuthenticationManager {
  private config: SDKConfig;
  private storage: any;
  private session: UserSession | null = null;

  constructor(config: SDKConfig, storage: any) {
    this.config = config;
    this.storage = storage;
  }

  /**
   * Initialize authentication flow
   */
  async initializeAuth(): Promise<AuthRequest> {
    const state = this.generateState();
    const nonce = this.generateNonce();
    
    const authRequest: AuthRequest = {
      clientId: this.config.identityProvider.config.clientId,
      redirectUri: this.config.identityProvider.config.redirectUri,
      scope: this.config.identityProvider.config.scope,
      responseType: 'code',
      state,
      nonce
    };

    // Store auth state
    this.storeAuthState({ state, nonce, timestamp: Date.now() });

    return authRequest;
  }

  /**
   * Handle authentication callback
   */
  async handleAuthCallback(url: string): Promise<AuthResponse> {
    try {
      const urlParams = new URLSearchParams(url.split('?')[1]);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      const error = urlParams.get('error');

      if (error) {
        throw new Error(`Authentication error: ${error}`);
      }

      if (!code || !state) {
        throw new Error('Missing authorization code or state');
      }

      // Verify state
      const storedState = await this.getStoredAuthState();
      if (!storedState || storedState.state !== state) {
        throw new Error(ERROR_MESSAGES.INVALID_STATE);
      }

      // Exchange code for tokens
      const tokenInfo = await this.exchangeCodeForTokens({ code, state, redirectUri: this.config.identityProvider.config.redirectUri });

      // Get user info
      const userInfo = await this.getUserInfo(tokenInfo.access_token);

      // Create session
      this.session = {
        accessToken: tokenInfo.access_token,
        refreshToken: tokenInfo.refresh_token,
        expiresAt: new Date(Date.now() + tokenInfo.expires_in * 1000).toISOString(),
        user: userInfo
      };

      // Store session
      this.storeSession(this.session);

      // Clear auth state
      this.clearStoredAuthState();

      return {
        success: true,
        session: this.session
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    try {
      if (this.session?.accessToken) {
        const provider = this.config.identityProvider;
        if (provider.config.endpoints.logout) {
          await fetch(provider.config.endpoints.logout, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.session.accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              client_id: provider.config.clientId,
              client_secret: provider.config.clientSecret
            })
          });
        }
      }

      // Clear session
      this.session = null;
      this.clearStoredSession();
      this.clearStoredAuthState();

    } catch (error) {
      // Silently handle logout errors in production
      if (process.env.NODE_ENV === 'development') {
        // Logout error
      }
      // Still clear local session even if server logout fails
      this.session = null;
      this.clearStoredSession();
      this.clearStoredAuthState();
    }
  }

  /**
   * Get current session
   */
  getCurrentSession(): UserSession | null {
    return this.session;
  }

  /**
   * Check if session is valid
   */
  isSessionValid(): boolean {
    if (!this.session) return false;
    
    const now = new Date();
    const expiresAt = new Date(this.session.expiresAt);
    
    return now < expiresAt;
  }

  /**
   * Refresh session if needed
   */
  async refreshSessionIfNeeded(): Promise<boolean> {
    if (!this.session || this.isSessionValid()) {
      return true;
    }

    try {
      const provider = this.config.identityProvider;
      if (provider.config.endpoints.token && this.session.refreshToken) {
        const response = await fetch(provider.config.endpoints.token, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: this.session.refreshToken,
            client_id: provider.config.clientId,
            client_secret: provider.config.clientSecret
          })
        });

        if (response.ok) {
          const tokenInfo: TokenInfo = await response.json();
          
          this.session.accessToken = tokenInfo.access_token;
          this.session.expiresAt = new Date(Date.now() + tokenInfo.expires_in * 1000).toISOString();
          
          this.storeSession(this.session);
          return true;
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        // Session refresh error
      }
    }

    return false;
  }

  /**
   * Exchange authorization code for tokens
   */
  private async exchangeCodeForTokens(data: TokenExchangeData): Promise<TokenInfo> {
    const provider = this.config.identityProvider;
    const response = await fetch(provider.config.endpoints.token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: data.code,
        redirect_uri: data.redirectUri,
        client_id: provider.config.clientId,
        client_secret: provider.config.clientSecret
      })
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get user information
   */
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

  /**
   * Generate random state
   */
  private generateState(): string {
    return this.generateRandomId(SDK_DEFAULTS.STATE_LENGTH);
  }

  /**
   * Generate random nonce
   */
  private generateNonce(): string {
    return this.generateRandomId(SDK_DEFAULTS.NONCE_LENGTH);
  }

  /**
   * Generate random ID
   */
  private generateRandomId(length: number): string {
    const bytes = new Uint8Array(length);
    cryptoWorkerManager.generateRandom(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Store authentication state
   */
  private storeAuthState(state: AuthState): void {
    if (this.storage) {
      this.storage.setItem(STORAGE_KEYS.AUTH_STATE, JSON.stringify(state));
    }
  }

  /**
   * Get stored authentication state
   */
  private async getStoredAuthState(): Promise<AuthState | null> {
    const stored = await this.storage?.getItem(STORAGE_KEYS.AUTH_STATE);
    return stored ? JSON.parse(stored) : null;
  }

  /**
   * Clear stored authentication state
   */
  private clearStoredAuthState(): void {
    this.storage?.removeItem(STORAGE_KEYS.AUTH_STATE);
  }

  /**
   * Store user session
   */
  private storeSession(session: UserSession): void {
    if (this.storage) {
      this.storage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
    }
  }

  /**
   * Get stored user session
   */
  private async getStoredSession(): Promise<UserSession | null> {
    const stored = await this.storage?.getItem(STORAGE_KEYS.SESSION);
    return stored ? JSON.parse(stored) : null;
  }

  /**
   * Clear stored user session
   */
  private clearStoredSession(): void {
    this.storage?.removeItem(STORAGE_KEYS.SESSION);
  }
}
