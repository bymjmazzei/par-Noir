/**
 * pN OAuth Client
 * Provides OAuth 2.0 authorization code flow with popup window support
 * Similar to Google OAuth - developers can integrate pN login into their platforms
 */

import { buildOAuthConsentUrl, startPnOAuthPopup } from '@par-noir/oauth-ui';

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
   * Start OAuth flow — API-hosted consent, popup by default (same as par Noir browser).
   * Host app must serve static `oauth-callback.html` (postMessage bridge); copy from par Noir repo.
   */
  async authenticate(options?: {
    scope?: string[];
    state?: string;
  }): Promise<PNOAuthSession> {
    const state = options?.state || this.generateState();
    const scope = options?.scope || this.config.scopes;
    const nonce = this.generateNonce();

    if (typeof window !== 'undefined') {
      sessionStorage.setItem('pn_oauth_state', state);
    }

    const url = buildOAuthConsentUrl({
      clientId: this.config.clientId,
      apiEndpoint: this.config.apiEndpoint,
      redirectUri: this.config.redirectUri,
      scope: [...scope],
      state,
      nonce,
      forPopup: this.config.usePopup,
    });

    if (!this.config.usePopup) {
      window.location.href = url;
      return new Promise(() => {
        /* page unloads */
      });
    }

    let apiOrigin = '';
    try {
      apiOrigin = new URL(this.config.apiEndpoint.replace(/\/$/, '') || this.config.apiEndpoint).origin;
    } catch {
      /* ignore */
    }

    let result;
    try {
      result = await startPnOAuthPopup({
        url,
        expectedState: state,
        timeoutMs: 300_000,
        allowedMessageOrigins: apiOrigin ? [apiOrigin] : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'POPUP_BLOCKED') {
        throw new Error('Popup blocked. Please allow popups for this site.');
      }
      if (msg === 'POPUP_CLOSED') {
        throw new Error('Popup closed by user');
      }
      throw e;
    }

    if (result.error) {
      throw new Error(result.error === 'access_denied' ? 'Authorization denied' : result.error);
    }
    if (!result.code) {
      throw new Error('No authorization code received');
    }

    const tokenResponse = await this.exchangeCodeForToken(result.code);
    const userInfo = await this.getUserInfo(tokenResponse.access_token);

    sessionStorage.removeItem('pn_oauth_state');

    return {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: Date.now() + tokenResponse.expires_in * 1000,
      did: userInfo.did,
      pnName: userInfo.pn_name,
    };
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

