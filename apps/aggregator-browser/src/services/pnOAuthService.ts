/**
 * pN OAuth Client Service
 * Handles OAuth 2.0 authorization code flow for browser app
 *
 * SECURITY: pN name and passcode are NEVER sent to the server.
 * Unlock proof is an ML-DSA-65 signature over a server challenge.
 */

import { pushPnOAuthDebug } from '@par-noir/oauth-ui';
import { buildBrowserAppOAuthUnlockUrl } from '@par-noir/oauth-ui';
import {
  base64ToBytes,
  deriveCanonicalPnIdentifier,
  signOauthUnlockProof,
} from '@par-noir/pqc-crypto';
import { API_ENDPOINT } from '../config/api';
import { PN_CLIENT_ID, getPnOAuthScopes } from '../config/oauthClient';

function getClientId(): string {
  return PN_CLIENT_ID;
}
const REDIRECT_URI = typeof window !== 'undefined'
  ? `${window.location.origin}/oauth-callback.html`
  : '';

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
    identityHandoffRequired?: boolean;
  }): string {
    const scope = params?.scope || getPnOAuthScopes();
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

    return buildBrowserAppOAuthUnlockUrl({
      clientId: getClientId(),
      appOrigin: typeof window !== 'undefined' ? window.location.origin : '',
      apiEndpoint: API_ENDPOINT,
      redirectUri,
      scope: [...scope],
      state,
      nonce,
      forPopup: usePopup,
      identityHandoffRequired: params?.identityHandoffRequired,
    });
  }

  /**
   * Authenticate with a local three-factor unlock: challenge → ML-DSA proof → code.
   * Passcode/pn name stay on device; only the signature is sent.
   */
  static async authenticate(params: {
    publicKey: string;
    mlDsaSecretKeyB64: string;
    scope?: string[];
    state?: string;
    nonce?: string;
  }): Promise<{ code: string; state?: string }> {
    const scope = params.scope || getPnOAuthScopes();
    const scopeStr = scope.join(' ');
    const state = params.state || sessionStorage.getItem('pn_oauth_state') || undefined;
    const nonce = params.nonce || sessionStorage.getItem('pn_oauth_nonce') || undefined;
    const clientId = getClientId();
    const redirectUri = REDIRECT_URI;

    try {
      await deriveCanonicalPnIdentifier(params.publicKey);
      pushPnOAuthDebug('oauth_derive_pn_id_ok', { ok: true });
    } catch (error) {
      pushPnOAuthDebug('oauth_derive_pn_id_fail', {
        name: error instanceof Error ? error.name : 'unknown',
      });
    }

    const challengeResponse = await fetch(`${API_ENDPOINT}/oauth/authorize/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        redirect_uri: redirectUri,
      }),
    });
    if (!challengeResponse.ok) {
      const error = await challengeResponse.json().catch(() => ({ error: 'Challenge failed' }));
      throw new Error(error.error_description || error.error || 'OAuth unlock challenge failed');
    }
    const challengeBody = (await challengeResponse.json()) as {
      challenge_id?: string;
      challenge?: string;
    };
    if (!challengeBody.challenge_id || !challengeBody.challenge) {
      throw new Error('OAuth unlock challenge response incomplete');
    }

    const signature = signOauthUnlockProof(
      {
        challenge: challengeBody.challenge,
        clientId,
        redirectUri,
        scope: scopeStr,
        state,
        nonce,
        publicKey: params.publicKey,
      },
      base64ToBytes(params.mlDsaSecretKeyB64)
    );

    const response = await fetch(`${API_ENDPOINT}/oauth/authorize/authenticate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: scopeStr,
        state,
        nonce,
        challenge_id: challengeBody.challenge_id,
        public_key: params.publicKey,
        signature,
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
  static async exchangeCodeForToken(
    code: string,
    redirectUri?: string,
    grantedDataPoints?: string[]
  ): Promise<OAuthTokenResponse> {
    // Use provided redirect_uri or default to REDIRECT_URI
    // Must match the redirect_uri used in the authorization request exactly
    // Normalize to ensure exact match (remove trailing slashes, ensure consistent encoding)
    const finalRedirectUri = (redirectUri || REDIRECT_URI).replace(/\/$/, ''); // Remove trailing slash

    pushPnOAuthDebug('exchange_token_attempt', {
      redirectUriLen: finalRedirectUri.length,
      grantedCount: grantedDataPoints?.length ?? 0,
    });

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
        // Per-data-point consent choices; omitted when consent was skipped
        granted_data_points: grantedDataPoints
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
      pushPnOAuthDebug('exchange_token_http_error', {
        status: response.status,
        errKey:
          typeof error?.error === 'string' ? String(error.error).slice(0, 80) : 'unknown',
      });
      throw new Error(error.error_description || error.error || 'Token exchange failed');
    }

    pushPnOAuthDebug('exchange_token_ok', { status: response.status });
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
   * Complete OAuth flow: authenticate and get tokens.
   * Requires ML-DSA secret from a local three-factor unlock (never sent to the server).
   */
  static async completeAuthFlow(params: {
    publicKey: string;
    mlDsaSecretKeyB64: string;
    /** Optional local stash for messaging; never sent to authenticate. */
    encryptedIdentity?: {
      encryptedData: string;
      iv: string;
      salt: string;
      mlKemPublicKey?: string;
    };
  }): Promise<AuthSession> {
    // Step 1: Authenticate and get authorization code
    const { code } = await this.authenticate({
      publicKey: params.publicKey,
      mlDsaSecretKeyB64: params.mlDsaSecretKeyB64,
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

    const encryptedForMessaging = params.encryptedIdentity;
    if (
      encryptedForMessaging?.encryptedData &&
      encryptedForMessaging?.iv &&
      encryptedForMessaging?.salt
    ) {
      import('./dmIdentitySession').then(({ storeEncryptedIdentityForMessaging }) => {
        storeEncryptedIdentityForMessaging({
          encryptedData: encryptedForMessaging.encryptedData,
          iv: encryptedForMessaging.iv,
          salt: encryptedForMessaging.salt,
          publicKey: params.publicKey,
          mlKemPublicKey: encryptedForMessaging.mlKemPublicKey
        });
      });
    }

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
   * Save session to sessionStorage (reduced persistence surface).
   */
  static saveSession(session: AuthSession): void {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('pn_oauth_session', JSON.stringify(session));
    }
  }

  /**
   * Load session from sessionStorage
   */
  static loadSession(): AuthSession | null {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      const stored = sessionStorage.getItem('pn_oauth_session');
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
      sessionStorage.removeItem('pn_oauth_session');
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

