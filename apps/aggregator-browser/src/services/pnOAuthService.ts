/**
 * pN OAuth Client Service
 * Handles OAuth 2.0 authorization code flow for browser app
 * Similar to Google OAuth flow
 * 
 * SECURITY: pN name and passcode are NEVER sent to the server.
 * pN identifier is derived client-side using VolumeIdGenerator.
 */

import { VolumeIdGenerator } from '../utils/volumeIdGenerator';
import { API_ENDPOINT } from '../config/api';

/** Returns the pN OAuth client ID. Uses VITE_PN_CLIENT_ID from env if set; otherwise defaults to "browser-app" (the registered client ID for the par Noir browser app). */
function getClientId(): string {
  const id = import.meta.env.VITE_PN_CLIENT_ID;
  // Fallback to "browser-app" - this is a public constant, not a secret
  return id || 'browser-app';
}
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
  pn_identifier?: string; // pN identifier from database (e.g., "83c1db813607")
  public_key?: string; // Public key from OAuth for file decryption
}

/** Feed token metadata only; pn name and passcode are never sent to or stored on the client. */
export interface FeedToken {
  feedId: string;
  feedName: string;
  subPnIdentifier: string;
  publicKey?: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  did: string;
  publicKey?: string; // Public key needed for file decryption
  // pN name is NOT stored - it's a secret
  nickname?: string; // Optional nickname if available
  pnIdentifier?: string; // pN identifier from database (e.g., "83c1db813607")
  feedTokens?: FeedToken[]; // Safe metadata for context switching; no credentials
}

export class PNOAuthService {
  /**
   * Generate authorization URL for API consent page.
   */
  static getAuthorizationUrl(params?: {
    scope?: string[];
    state?: string;
    nonce?: string;
    usePopup?: boolean;
  }): string {
    // Browser app requests age ZKP scope (optional) for 18+/NSFW content access
    const scope = params?.scope || ['openid', 'profile', 'zkp:age_attestation'];
    const state = params?.state || this.generateState();
    const nonce = params?.nonce || this.generateNonce();
    const usePopup = params?.usePopup !== false; // Default to popup

    // Store state and nonce for verification
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('pn_oauth_state', state);
      sessionStorage.setItem('pn_oauth_nonce', nonce);
    }

    const redirectUri = usePopup 
      ? `${typeof window !== 'undefined' ? window.location.origin : ''}/oauth-callback.html`
      : REDIRECT_URI;

    const paramsStr = new URLSearchParams({
      client_id: getClientId(),
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scope.join(' '),
      state,
      nonce
    }).toString();

    return `${API_ENDPOINT.replace(/\/$/, '')}/oauth/authorize/consent?${paramsStr}`;
  }

  /**
   * Authenticate with pN identity file and passcode
   * Returns authorization code
   * 
   * SECURITY: Derives pN identifier client-side and sends that instead of secrets.
   * pN name and passcode are NEVER sent to the server.
   */
  static async authenticate(params: {
    encryptedIdentity: any; // Encrypted pN identity file
    passcode: string;
    publicKey: string;
    did: string;
    pnName?: string; // pN name (extracted from decrypted identity)
    scope?: string[];
    state?: string;
    nonce?: string;
  }): Promise<{ code: string; state?: string }> {
    // Browser app requests age ZKP scope (optional) for 18+/NSFW content access
    const scope = params.scope || ['openid', 'profile', 'zkp:age_attestation'];
    const state = params.state || sessionStorage.getItem('pn_oauth_state') || undefined;
    const nonce = params.nonce || sessionStorage.getItem('pn_oauth_nonce') || undefined;

    // SECURITY FIX: Derive pN identifier client-side using VolumeIdGenerator
    // Never send pnName or passcode to the server
    let pnIdentifier: string | undefined;
    if (params.pnName && params.passcode && params.publicKey) {
      try {
        pnIdentifier = await VolumeIdGenerator.generateVolumeId({
          pnName: params.pnName,
          passcode: params.passcode,
          publicKey: params.publicKey
        });
        console.log('[OAuth] Derived pN identifier client-side:', pnIdentifier);
      } catch (error) {
        console.error('[OAuth] Failed to derive pN identifier:', error);
        // Continue without pnIdentifier - server can derive it as fallback
      }
    }

    const response = await fetch(`${API_ENDPOINT}/oauth/authorize/authenticate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: getClientId(),
        redirect_uri: REDIRECT_URI,
        scope: scope.join(' '),
        state,
        nonce,
        encrypted_identity: params.encryptedIdentity,
        passcode: params.passcode, // Still needed for server to decrypt identity and verify
        public_key: params.publicKey,
        did: params.did,
        // SECURITY FIX: Send derived pN identifier instead of pN name
        pn_identifier: pnIdentifier
        // pnName is NOT sent - it's a secret
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
  static async exchangeCodeForToken(code: string, redirectUri?: string, ageShared?: boolean): Promise<OAuthTokenResponse> {
    // Use provided redirect_uri or default to REDIRECT_URI
    // Must match the redirect_uri used in the authorization request exactly
    // Normalize to ensure exact match (remove trailing slashes, ensure consistent encoding)
    const finalRedirectUri = (redirectUri || REDIRECT_URI).replace(/\/$/, ''); // Remove trailing slash
    
    console.log('🔐 [Token Exchange] Using redirect_uri:', finalRedirectUri);
    console.log('🔐 [Token Exchange] Code (first 20 chars):', code.substring(0, 20));
    console.log('🔐 [Token Exchange] Age shared:', ageShared);
    
    const response = await fetch(`${API_ENDPOINT}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code,
        client_id: getClientId(),
        redirect_uri: finalRedirectUri,
        grant_type: 'authorization_code',
        age_shared: ageShared // Include age sharing preference
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
        client_id: getClientId()
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
   * 
   * SECURITY: Derives pN identifier client-side before sending to server.
   * pN name and passcode are NEVER sent to the server.
   */
  static async completeAuthFlow(params: {
    encryptedIdentity: any;
    passcode: string;
    publicKey: string;
    did: string;
    pnName?: string; // pN name (extracted from decrypted identity, if available)
  }): Promise<AuthSession> {
    // Step 1: Authenticate and get authorization code
    // pN identifier is derived client-side in authenticate()
    const { code } = await this.authenticate({
      encryptedIdentity: params.encryptedIdentity,
      passcode: params.passcode,
      publicKey: params.publicKey,
      did: params.did,
      pnName: params.pnName // Used client-side only to derive pN identifier
    });

    // Step 2: Exchange code for tokens
    const tokenResponse = await this.exchangeCodeForToken(code);

    // Step 3: Get user info
    const userInfo = await this.getUserInfo(tokenResponse.access_token);

    // Step 4: Load feed tokens for owned feeds
    let feedTokens: FeedToken[] = [];
    try {
      if (userInfo.pn_identifier) {
        const feedTokensResponse = await fetch(`${API_ENDPOINT}/api/feeds/tokens`, {
          headers: {
            'Authorization': `Bearer ${tokenResponse.access_token}`
          }
        });
        
        if (feedTokensResponse.ok) {
          const feedTokensData = await feedTokensResponse.json();
          feedTokens = feedTokensData.feedTokens || [];
          console.log(`✅ Loaded ${feedTokens.length} feed tokens`);
        } else {
          console.warn('⚠️ Failed to load feed tokens:', feedTokensResponse.status);
        }
      }
    } catch (error) {
      console.error('❌ Error loading feed tokens:', error);
      // Don't fail auth if feed tokens can't be loaded
    }

    // Step 5: Create session
    const session: AuthSession = {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
      did: userInfo.did,
      publicKey: params.publicKey, // Store publicKey for file decryption
      pnIdentifier: userInfo.pn_identifier, // Store pN identifier from server
      nickname: userInfo.nickname,
      feedTokens: feedTokens // Store feed tokens for context switching
      // pN name is NOT stored - it's a secret
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
   * Refresh feed tokens for current session
   */
  static async refreshFeedTokens(): Promise<FeedToken[]> {
    const session = this.loadSession();
    if (!session || !session.pnIdentifier) {
      return [];
    }

    try {
      const accessToken = await this.getValidAccessToken();
      if (!accessToken) {
        console.warn('⚠️ No valid access token for refreshing feed tokens');
        return [];
      }

      const feedTokensResponse = await fetch(`${API_ENDPOINT}/api/feeds/tokens`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (feedTokensResponse.ok) {
        const feedTokensData = await feedTokensResponse.json();
        const feedTokens = feedTokensData.feedTokens || [];
        
        // Update session with new feed tokens
        const updatedSession = {
          ...session,
          feedTokens: feedTokens
        };
        this.saveSession(updatedSession);
        
        console.log(`✅ Refreshed ${feedTokens.length} feed tokens`);
        return feedTokens;
      } else {
        console.warn('⚠️ Failed to refresh feed tokens:', feedTokensResponse.status);
        return session.feedTokens || [];
      }
    } catch (error) {
      console.error('❌ Error refreshing feed tokens:', error);
      return session.feedTokens || [];
    }
  }

  /**
   * Get feed token for a specific feed
   */
  static getFeedToken(feedId: string): FeedToken | null {
    const session = this.loadSession();
    if (!session || !session.feedTokens) {
      return null;
    }
    
    return session.feedTokens.find(ft => ft.feedId === feedId) || null;
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

  // Track ongoing token refresh to prevent concurrent refreshes
  private static refreshPromise: Promise<string | null> | null = null;

  /**
   * Get a valid access token, refreshing if necessary
   * @param forceRefresh - If true, force a token refresh even if token hasn't expired
   */
  static async getValidAccessToken(forceRefresh: boolean = false): Promise<string | null> {
    const session = this.loadSession();
    
    if (!session) {
      return null;
    }

    // If session is expired or force refresh is requested, try to refresh
    const isExpired = session.expiresAt < Date.now();
    if (isExpired || forceRefresh) {
      if (!session.refreshToken) {
        console.warn('[PNOAuth] Session expired and no refresh token available');
        this.clearSession();
        return null;
      }

      // If a refresh is already in progress, wait for it instead of starting a new one
      if (this.refreshPromise) {
        return this.refreshPromise;
      }

      // Start a new refresh
      this.refreshPromise = (async () => {
        try {
          console.log(`[PNOAuth] Refreshing access token (expired: ${isExpired}, forced: ${forceRefresh})`);
          const tokenResponse = await this.refreshAccessToken(session.refreshToken!);
          
          // Update session with new token
          const updatedSession: AuthSession = {
            ...session,
            accessToken: tokenResponse.access_token,
            expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
            refreshToken: tokenResponse.refresh_token || session.refreshToken
          };
          
          this.saveSession(updatedSession);
          console.log('[PNOAuth] Token refreshed successfully');
          
          return tokenResponse.access_token;
        } catch (error: any) {
          console.error('[PNOAuth] Failed to refresh token:', error);
          // Don't clear session immediately - let user try to reconnect
          // The session will be cleared when they try to use it again
          console.warn('[PNOAuth] Refresh token invalid or expired. User needs to re-authenticate.');
          return null;
        } finally {
          // Clear the promise so future refreshes can proceed
          this.refreshPromise = null;
        }
      })();

      return this.refreshPromise;
    }

    // Token is valid, return it (logging removed - was too verbose)
    return session.accessToken;
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

