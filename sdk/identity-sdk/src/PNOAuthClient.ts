/**
 * pN OAuth Client
 * Provides OAuth 2.0 authorization code flow with popup window support
 * Similar to Google OAuth - developers can integrate pN login into their platforms
 */

export interface PNOAuthConfig {
  clientId: string;
  redirectUri?: string; // Optional for popup flow
  apiEndpoint?: string;
  scopes?: string[];
  usePopup?: boolean; // Default: true
}

export interface PNOAuthTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export interface PNOAuthUserInfo {
  sub: string;
  did: string;
  pn_name?: string;
}

export interface PNOAuthSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  did: string;
  pnName?: string;
}

export class PNOAuthClient {
  private config: Required<PNOAuthConfig>;
  private popup: Window | null = null;
  private messageListener: ((event: MessageEvent) => void) | null = null;

  constructor(config: PNOAuthConfig) {
    this.config = {
      clientId: config.clientId,
      redirectUri: config.redirectUri || (typeof window !== 'undefined' ? `${window.location.origin}/oauth-callback.html` : ''),
      apiEndpoint: config.apiEndpoint || 'https://api.parnoir.com',
      scopes: config.scopes || ['openid', 'profile'],
      usePopup: config.usePopup !== false // Default to popup
    };
  }

  /**
   * Start OAuth flow - opens popup window
   * Similar to Google OAuth: window.open() with authorization URL
   */
  async authenticate(options?: {
    scope?: string[];
    state?: string;
  }): Promise<PNOAuthSession> {
    return new Promise((resolve, reject) => {
      if (!this.config.usePopup) {
        // Redirect flow (fallback)
        const authUrl = this.buildAuthorizationUrl(options);
        window.location.href = authUrl;
        return;
      }

      // Popup flow
      const state = options?.state || this.generateState();
      const scope = options?.scope || this.config.scopes;
      
      // Store state for verification
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('pn_oauth_state', state);
      }

      // Build authorization URL pointing to oauth-authorize.html
      const authUrl = this.buildPopupAuthorizationUrl({
        scope,
        state
      });

      // Open popup window (like Google OAuth)
      const popupWidth = 500;
      const popupHeight = 700;
      const left = (window.screen.width - popupWidth) / 2;
      const top = (window.screen.height - popupHeight) / 2;

      this.popup = window.open(
        authUrl,
        'pn_oauth',
        `width=${popupWidth},height=${popupHeight},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );

      if (!this.popup) {
        reject(new Error('Popup blocked. Please allow popups for this site.'));
        return;
      }

      // Listen for OAuth callback from popup
      this.messageListener = async (event: MessageEvent) => {
        // Verify origin
        if (event.origin !== window.location.origin) {
          return;
        }

        if (event.data.type === 'oauth_callback') {
          // Clean up listener
          if (this.messageListener) {
            window.removeEventListener('message', this.messageListener);
            this.messageListener = null;
          }

          const { code, error, state: returnedState } = event.data;

          if (error) {
            this.popup?.close();
            reject(new Error(error === 'access_denied' ? 'Authorization denied' : error));
            return;
          }

          if (!code) {
            this.popup?.close();
            reject(new Error('No authorization code received'));
            return;
          }

          // Verify state
          const storedState = sessionStorage.getItem('pn_oauth_state');
          if (storedState !== returnedState) {
            this.popup?.close();
            reject(new Error('Invalid state parameter'));
            return;
          }

          try {
            // Exchange code for tokens
            const tokenResponse = await this.exchangeCodeForToken(code);
            
            // Get user info
            const userInfo = await this.getUserInfo(tokenResponse.access_token);

            // Create session
            const session: PNOAuthSession = {
              accessToken: tokenResponse.access_token,
              refreshToken: tokenResponse.refresh_token,
              expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
              did: userInfo.did,
              pnName: userInfo.pn_name
            };

            // Close popup
            this.popup?.close();
            this.popup = null;

            // Clear state
            sessionStorage.removeItem('pn_oauth_state');

            resolve(session);
          } catch (err: any) {
            this.popup?.close();
            this.popup = null;
            reject(err);
          }
        }
      };

      window.addEventListener('message', this.messageListener);

      // Monitor popup for close (user might have cancelled)
      const checkClosed = setInterval(() => {
        if (this.popup?.closed) {
          clearInterval(checkClosed);
          if (this.messageListener) {
            window.removeEventListener('message', this.messageListener);
            this.messageListener = null;
          }
          reject(new Error('Popup closed by user'));
        }
      }, 500);
    });
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<PNOAuthTokenResponse> {
    const response = await fetch(`${this.config.apiEndpoint}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code,
        client_id: this.config.clientId,
        redirect_uri: this.config.redirectUri,
        grant_type: 'authorization_code'
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Token exchange failed' }));
      throw new Error(error.error_description || error.error || 'Token exchange failed');
    }

    return response.json();
  }

  /**
   * Get user info using access token
   */
  async getUserInfo(accessToken: string): Promise<PNOAuthUserInfo> {
    const response = await fetch(`${this.config.apiEndpoint}/oauth/userinfo`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get user info' }));
      throw new Error(error.error_description || error.error || 'Failed to get user info');
    }

    return response.json();
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken: string): Promise<PNOAuthTokenResponse> {
    const response = await fetch(`${this.config.apiEndpoint}/oauth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
        client_id: this.config.clientId
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Token refresh failed' }));
      throw new Error(error.error_description || error.error || 'Token refresh failed');
    }

    return response.json();
  }

  /**
   * Revoke token
   */
  async revokeToken(token: string, tokenTypeHint?: 'access_token' | 'refresh_token'): Promise<void> {
    const response = await fetch(`${this.config.apiEndpoint}/oauth/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token,
        token_type_hint: tokenTypeHint
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Token revocation failed' }));
      throw new Error(error.error_description || error.error || 'Token revocation failed');
    }
  }

  /**
   * Build authorization URL for popup flow
   */
  private buildPopupAuthorizationUrl(options?: {
    scope?: string[];
    state?: string;
  }): string {
    const scope = options?.scope || this.config.scopes;
    const state = options?.state || this.generateState();
    const nonce = this.generateNonce();

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: scope.join(' '),
      state,
      nonce
    });

    // For popup flow, point to oauth-authorize.html
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/oauth-authorize.html?${params.toString()}`;
    }

    return `${this.config.apiEndpoint}/oauth/authorize?${params.toString()}`;
  }

  /**
   * Build authorization URL for redirect flow
   */
  private buildAuthorizationUrl(options?: {
    scope?: string[];
    state?: string;
  }): string {
    const scope = options?.scope || this.config.scopes;
    const state = options?.state || this.generateState();
    const nonce = this.generateNonce();

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: scope.join(' '),
      state,
      nonce
    });

    return `${this.config.apiEndpoint}/oauth/authorize?${params.toString()}`;
  }

  /**
   * Generate random state for CSRF protection
   */
  private generateState(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Generate random nonce for replay protection
   */
  private generateNonce(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }
}

/**
 * Create a pN OAuth client instance
 * Easy-to-use function for developers
 */
export function createPNOAuthClient(config: PNOAuthConfig): PNOAuthClient {
  return new PNOAuthClient(config);
}

