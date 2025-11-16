/**
 * pN OAuth Client Service
 * Handles OAuth 2.0 authorization code flow for browser app
 * Similar to Google OAuth flow
 */

const API_ENDPOINT = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
const CLIENT_ID = process.env.REACT_APP_PN_CLIENT_ID || 'browser-app';
// For popup flow, redirect_uri should be oauth-callback.html (matches oauth-authorize.html)
const REDIRECT_URI = typeof window !== 'undefined' 
  ? `${window.location.origin}/oauth-callback.html`
  : 'http://localhost:3000/oauth-callback.html';

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
  // pN name is NOT returned - it's a secret
  nickname?: string; // Optional nickname if available
}

export interface AuthSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  did: string;
  // pN name is NOT stored - it's a secret
  nickname?: string; // Optional nickname if available
}

export class PNOAuthService {
  /**
   * Generate authorization URL
   * For popup flow, redirect_uri should point to oauth-authorize.html
   */
  static getAuthorizationUrl(params?: {
    scope?: string[];
    state?: string;
    nonce?: string;
    usePopup?: boolean;
  }): string {
    const scope = params?.scope || ['openid', 'profile'];
    const state = params?.state || this.generateState();
    const nonce = params?.nonce || this.generateNonce();
    const usePopup = params?.usePopup !== false; // Default to popup

    // Store state and nonce for verification
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('pn_oauth_state', state);
      sessionStorage.setItem('pn_oauth_nonce', nonce);
    }

    // For popup flow, use oauth-authorize.html as the redirect target
    // The popup will handle the unlock UI and send code back via postMessage
    const redirectUri = usePopup 
      ? `${typeof window !== 'undefined' ? window.location.origin : ''}/oauth-callback.html`
      : REDIRECT_URI;

    const paramsStr = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scope.join(' '),
      state,
      nonce
    }).toString();

    // Return URL to oauth-authorize.html with params
    if (usePopup && typeof window !== 'undefined') {
      return `${window.location.origin}/oauth-authorize.html?${paramsStr}`;
    }

    return `${API_ENDPOINT}/oauth/authorize?${paramsStr}`;
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
  }): Promise<{ code: string; state?: string }> {
    const scope = params.scope || ['openid', 'profile'];
    const state = params.state || sessionStorage.getItem('pn_oauth_state') || undefined;
    const nonce = params.nonce || sessionStorage.getItem('pn_oauth_nonce') || undefined;

    const response = await fetch(`${API_ENDPOINT}/oauth/authorize/authenticate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
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
  static async exchangeCodeForToken(code: string, redirectUri?: string): Promise<OAuthTokenResponse> {
    // Use provided redirect_uri or default to REDIRECT_URI
    // Must match the redirect_uri used in the authorization request exactly
    // Normalize to ensure exact match (remove trailing slashes, ensure consistent encoding)
    const finalRedirectUri = (redirectUri || REDIRECT_URI).replace(/\/$/, ''); // Remove trailing slash
    
    console.log('🔐 [Token Exchange] Using redirect_uri:', finalRedirectUri);
    console.log('🔐 [Token Exchange] Code (first 20 chars):', code.substring(0, 20));
    
    const response = await fetch(`${API_ENDPOINT}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code,
        client_id: CLIENT_ID,
        redirect_uri: finalRedirectUri,
        grant_type: 'authorization_code'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      let error;
      try {
        error = JSON.parse(errorText);
      } catch {
        error = { error: 'Token exchange failed', error_description: errorText };
      }
      console.error('🔐 [Token Exchange] Error response:', error);
      console.error('🔐 [Token Exchange] Status:', response.status);
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

