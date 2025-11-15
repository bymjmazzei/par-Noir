/**
 * pN OAuth Client Service
 * Handles OAuth 2.0 authorization code flow for browser app
 * Similar to Google OAuth flow
 */

const API_ENDPOINT = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
const CLIENT_ID = process.env.REACT_APP_PN_CLIENT_ID || 'browser-app';
const REDIRECT_URI = typeof window !== 'undefined' 
  ? `${window.location.origin}${window.location.pathname}`
  : 'http://localhost:3000';

export interface OAuthTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export interface OAuthUserInfo {
  sub: string;
  did: string;
  pn_name?: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  did: string;
  pnName?: string;
}

export class PNOAuthService {
  /**
   * Generate authorization URL (synchronous version for storing params)
   */
  static getAuthorizationUrl(params?: {
    scope?: string[];
    state?: string;
    nonce?: string;
  }): string {
    const scope = params?.scope || ['openid', 'profile'];
    const state = params?.state || this.generateState();
    const nonce = params?.nonce || this.generateNonce();

    // Store state and nonce for verification
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('pn_oauth_state', state);
      sessionStorage.setItem('pn_oauth_nonce', nonce);
    }

    const paramsStr = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: scope.join(' '),
      state,
      nonce
    }).toString();

    return `${API_ENDPOINT}/oauth/authorize?${paramsStr}`;
  }

  /**
   * Generate authorization URL and get the actual redirect URL (async version)
   * Returns the authorization URL to redirect to (handles JSON responses)
   */
  static async getAuthorizationUrlAsync(params?: {
    scope?: string[];
    state?: string;
    nonce?: string;
  }): Promise<string> {
    const scope = params?.scope || ['openid', 'profile'];
    const state = params?.state || this.generateState();
    const nonce = params?.nonce || this.generateNonce();

    // Store state and nonce for verification
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('pn_oauth_state', state);
      sessionStorage.setItem('pn_oauth_nonce', nonce);
    }

    const paramsStr = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: scope.join(' '),
      state,
      nonce
    }).toString();

    const authEndpoint = `${API_ENDPOINT}/oauth/authorize?${paramsStr}`;
    
    // Try to fetch - the endpoint may return JSON with authorization_url
    try {
      const response = await fetch(authEndpoint, { 
        method: 'GET',
        redirect: 'manual' // Don't follow redirects automatically
      });
      
      if (response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          // If it returns JSON, extract the authorization_url
          const data = await response.json();
          if (data.authorization_url) {
            // Return the actual authorization URL
            if (data.authorization_url.startsWith('http')) {
              return data.authorization_url;
            } else {
              // Relative path - try with API_ENDPOINT first, but if it starts with /, use the same origin as API_ENDPOINT
              const baseUrl = new URL(API_ENDPOINT);
              return `${baseUrl.protocol}//${baseUrl.host}${data.authorization_url}`;
            }
          }
        }
      } else if (response.status >= 300 && response.status < 400) {
        // If it's a redirect, get the Location header
        const location = response.headers.get('Location');
        if (location) {
          return location;
        }
      }
    } catch (err) {
      // If fetch fails (CORS, etc.), just return the endpoint URL
      console.warn('Could not fetch authorization URL:', err);
    }
    
    // Fallback: return the endpoint URL directly
    return authEndpoint;
  }

  /**
   * Authenticate with pN identity file and passcode
   * Returns authorization code
   */
  static async authenticate(params: {
    encryptedIdentity: any; // Encrypted pN identity file
    passcode: string;
    publicKey: string;
    did: string;
    scope?: string[];
    state?: string;
    nonce?: string;
    clientId?: string;
    redirectUri?: string;
  }): Promise<{ code: string; state?: string }> {
    const scope = params.scope || ['openid', 'profile'];
    const state = params.state || sessionStorage.getItem('pn_oauth_state') || undefined;
    const nonce = params.nonce || sessionStorage.getItem('pn_oauth_nonce') || undefined;
    const clientId = params.clientId || CLIENT_ID;
    const redirectUri = params.redirectUri || REDIRECT_URI;

    const response = await fetch(`${API_ENDPOINT}/oauth/authorize/authenticate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: scope.join(' '),
        state,
        nonce,
        encrypted_identity: params.encryptedIdentity,
        passcode: params.passcode,
        public_key: params.publicKey,
        did: params.did
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Authentication failed' }));
      throw new Error(error.error_description || error.error || 'Authentication failed');
    }

    return response.json();
  }

  /**
   * Exchange authorization code for access token
   */
  static async exchangeCodeForToken(code: string): Promise<OAuthTokenResponse> {
    const response = await fetch(`${API_ENDPOINT}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code,
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
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
   * Refresh access token using refresh token
   */
  static async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
    const response = await fetch(`${API_ENDPOINT}/oauth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
        client_id: CLIENT_ID
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Token refresh failed' }));
      throw new Error(error.error_description || error.error || 'Token refresh failed');
    }

    return response.json();
  }

  /**
   * Get user info using access token
   */
  static async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    const response = await fetch(`${API_ENDPOINT}/oauth/userinfo`, {
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
   * Revoke token
   */
  static async revokeToken(token: string, tokenTypeHint?: 'access_token' | 'refresh_token'): Promise<void> {
    const response = await fetch(`${API_ENDPOINT}/oauth/revoke`, {
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
   * Complete OAuth flow: authenticate and get tokens
   */
  static async completeAuthFlow(params: {
    encryptedIdentity: any;
    passcode: string;
    publicKey: string;
    did: string;
  }): Promise<AuthSession> {
    // Step 1: Authenticate and get authorization code
    const { code } = await this.authenticate({
      encryptedIdentity: params.encryptedIdentity,
      passcode: params.passcode,
      publicKey: params.publicKey,
      did: params.did
    });

    // Step 2: Exchange code for tokens
    const tokenResponse = await this.exchangeCodeForToken(code);

    // Step 3: Get user info
    const userInfo = await this.getUserInfo(tokenResponse.access_token);

    // Step 4: Create session
    const session: AuthSession = {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
      did: userInfo.did,
      pnName: userInfo.pn_name
    };

    // Store session
    this.saveSession(session);

    // Clear OAuth state
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('pn_oauth_state');
      sessionStorage.removeItem('pn_oauth_nonce');
    }

    return session;
  }

  /**
   * Save session to localStorage
   */
  static saveSession(session: AuthSession): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pn_oauth_session', JSON.stringify(session));
    }
  }

  /**
   * Load session from localStorage
   */
  static loadSession(): AuthSession | null {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      const stored = localStorage.getItem('pn_oauth_session');
      if (!stored) {
        return null;
      }

      const session: AuthSession = JSON.parse(stored);
      
      // Check if session is expired
      if (session.expiresAt < Date.now()) {
        // Try to refresh if we have a refresh token
        if (session.refreshToken) {
          // Refresh will be handled by caller
          return session;
        }
        // Session expired and no refresh token
        this.clearSession();
        return null;
      }

      return session;
    } catch (error) {
      console.error('Failed to load session:', error);
      return null;
    }
  }

  /**
   * Clear session
   */
  static clearSession(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('pn_oauth_session');
    }
  }

  /**
   * Check if session is valid
   */
  static isSessionValid(session: AuthSession): boolean {
    return session.expiresAt > Date.now();
  }

  /**
   * Generate random state for CSRF protection
   */
  private static generateState(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Generate random nonce for replay protection
   */
  private static generateNonce(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }
}

