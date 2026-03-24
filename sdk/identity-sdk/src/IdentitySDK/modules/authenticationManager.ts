import { cryptoWorkerManager } from '@identity-protocol/identity-core/src/encryption/cryptoWorkerManager';
import {
  Identity,
  AuthRequest,
  AuthCallbackResult,
  TokenInfo,
  UserSession,
  SDKConfig,
} from '../types';
import { AuthState, TokenExchangeData } from '../types/identitySDK';
import { SDK_DEFAULTS, STORAGE_KEYS, ERROR_MESSAGES } from '../constants/sdkConstants';

export class AuthenticationManager {
  private config: SDKConfig;
  private storage: any;
  private session: UserSession | null = null;

  constructor(config: SDKConfig, storage: any) {
    if (!config?.identityProvider?.config) {
      throw new Error(ERROR_MESSAGES.INVALID_CONFIG);
    }
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
      scope: this.config.identityProvider.config.scopes,
      responseType: 'code',
      state,
      nonce
    };

    this.storeAuthState({ state, nonce, timestamp: Date.now() });

    return authRequest;
  }

  /**
   * Handle authentication callback
   */
  async handleAuthCallback(url: string): Promise<AuthCallbackResult> {
    try {
      const query = url.includes('?') ? url.split('?')[1] ?? '' : '';
      const urlParams = new URLSearchParams(query);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      const error = urlParams.get('error');

      if (error) {
        throw new Error(`Authentication error: ${error}`);
      }

      if (!code || !state) {
        throw new Error('Missing authorization code or state');
      }

      const storedState = await this.getStoredAuthState();
      if (!storedState || storedState.state !== state) {
        throw new Error(ERROR_MESSAGES.INVALID_STATE);
      }

      const tokenInfo = await this.exchangeCodeForTokens({
        code,
        state,
        redirectUri: this.config.identityProvider.config.redirectUri
      });

      const identity = await this.getUserInfo(tokenInfo.accessToken);

      const now = new Date().toISOString();
      this.session = {
        identity,
        tokens: tokenInfo,
        platform: this.config.identityProvider.name,
        createdAt: now,
        lastActive: now
      };

      this.storeSession(this.session);
      this.clearStoredAuthState();

      return {
        success: true,
        session: this.session
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      };
    }
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    try {
      const accessToken = this.session?.tokens.accessToken;
      if (accessToken) {
        const provider = this.config.identityProvider;
        const logoutUrl = provider.config.endpoints.logout;
        if (logoutUrl) {
          await fetch(logoutUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              client_id: provider.config.clientId,
              client_secret: provider.config.clientSecret
            })
          });
        }
      }

      this.session = null;
      this.clearStoredSession();
      this.clearStoredAuthState();
    } catch {
      if (process.env.NODE_ENV === 'development') {
        // Logout error
      }
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
   * Check if session is valid (access token not past expiry, with buffer).
   */
  isSessionValid(): boolean {
    if (!this.session) return false;

    const issued = new Date(this.session.lastActive).getTime();
    const expiresMs = issued + this.session.tokens.expiresIn * 1000;
    const bufferSec = this.config.tokenExpiryBuffer ?? 60;
    return Date.now() < expiresMs - bufferSec * 1000;
  }

  /**
   * Refresh session if needed
   */
  async refreshSessionIfNeeded(): Promise<boolean> {
    if (!this.session) {
      return true;
    }
    if (this.isSessionValid()) {
      return true;
    }

    try {
      const provider = this.config.identityProvider;
      const refreshToken = this.session.tokens.refreshToken;
      if (!provider.config.endpoints.token || !refreshToken) {
        return false;
      }

      const body: Record<string, string> = {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: provider.config.clientId
      };
      if (provider.config.clientSecret) {
        body.client_secret = provider.config.clientSecret;
      }

      const response = await fetch(provider.config.endpoints.token, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams(body)
      });

      if (response.ok) {
        const raw = await response.json();
        const tokenInfo = this.normalizeTokenResponse(raw);
        this.session.tokens = tokenInfo;
        this.session.lastActive = new Date().toISOString();
        this.storeSession(this.session);
        return true;
      }
    } catch {
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
    const body: Record<string, string> = {
      grant_type: 'authorization_code',
      code: data.code,
      redirect_uri: data.redirectUri,
      client_id: provider.config.clientId
    };
    if (provider.config.clientSecret) {
      body.client_secret = provider.config.clientSecret;
    }

    const response = await fetch(provider.config.endpoints.token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(body)
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    const raw = await response.json();
    return this.normalizeTokenResponse(raw);
  }

  /**
   * Get user information
   */
  private async getUserInfo(accessToken: string): Promise<Identity> {
    const provider = this.config.identityProvider;
    const response = await fetch(provider.config.endpoints.userInfo, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.statusText}`);
    }

    const raw = await response.json();
    return this.mapUserInfoToIdentity(raw);
  }

  private normalizeTokenResponse(raw: unknown): TokenInfo {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error('Invalid token response');
    }
    const o = raw as Record<string, unknown>;
    const accessToken = String(o.access_token ?? o.accessToken ?? '');
    if (!accessToken) {
      throw new Error('Missing access token');
    }
    const expiresIn = Number(o.expires_in ?? o.expiresIn ?? 3600);
    const rt = o.refresh_token ?? o.refreshToken;
    const refreshToken = typeof rt === 'string' ? rt : undefined;
    let scope: string[] = [];
    const sc = o.scope;
    if (typeof sc === 'string') {
      scope = sc.split(/\s+/).filter(Boolean);
    } else if (Array.isArray(sc)) {
      scope = sc.map(String);
    }
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn,
      scope,
      refreshToken
    };
  }

  private mapUserInfoToIdentity(user: unknown): Identity {
    const u = user as Record<string, unknown>;
    const id = String(u.sub ?? u.id ?? '');
    const email = typeof u.email === 'string' ? u.email : undefined;
    const displayName =
      typeof u.name === 'string'
        ? u.name
        : typeof u.display_name === 'string'
          ? u.display_name
          : undefined;
    const now = new Date().toISOString();
    return {
      id,
      username: typeof u.preferred_username === 'string' ? u.preferred_username : id,
      displayName,
      email,
      createdAt: typeof u.created_at === 'string' ? u.created_at : now,
      updatedAt: now,
      status: 'active',
      metadata: {}
    };
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
   * Clear stored user session
   */
  private clearStoredSession(): void {
    this.storage?.removeItem(STORAGE_KEYS.SESSION);
  }
}
