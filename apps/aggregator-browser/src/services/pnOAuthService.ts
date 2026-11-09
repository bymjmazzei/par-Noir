/**
 * pN OAuth Client Service
 * Handles OAuth 2.0 authorization code flow for browser app
 *
 * SECURITY: Key 1 and Key 2 are NEVER sent to the server.
 * Unlock proof is an ML-DSA-65 signature over a server challenge.
 */

import {
  buildOAuthConsentUrl,
  createPnSession,
  getOrCreateBrowserId,
  pushPnOAuthDebug,
  writeSharedLastActive,
} from '@par-noir/oauth-ui';
import { API_ENDPOINT } from '../config/api';
import { PN_CLIENT_ID, getPnOAuthScopes } from '../config/oauthClient';
import { browseOAuthRedirectUri } from './browseOAuthRedirect';
import { clearFeedMediaSessionCache } from './feedMediaSessionCache';
import { resetFeedFirstPaintGate } from './feedFirstPaintGate';

function getClientId(): string {
  return PN_CLIENT_ID;
}
const REDIRECT_URI =
  typeof window !== 'undefined' ? browseOAuthRedirectUri() : '';

export interface OAuthTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  idle_timeout_s?: number;
}

export interface OAuthUserInfo {
  sub: string;
  did: string;
  // Key 1 is NOT returned - it's a secret
  nickname?: string; // Optional nickname if available
  pn_identifier?: string; // pN identifier from database (e.g., "83c1db813607")
  public_key?: string; // Public key from OAuth for file decryption
}

/** Feed token metadata only; Key 1 and Key 2 are never sent to or stored on the client. */
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
  // Key 1 is NOT stored - it's a secret
  nickname?: string; // Optional nickname if available
  pnIdentifier?: string; // pN identifier from database (e.g., "83c1db813607")
  feedTokens?: FeedToken[]; // Safe metadata for context switching; no credentials
  /** Idle lock seconds from the token response; 0 = trusted device. */
  idleTimeoutS?: number;
  unlockedAt?: number;
  lastActiveAt?: number;
}

type BrowseSessionExtra = Pick<AuthSession, 'did' | 'publicKey' | 'nickname' | 'feedTokens'>;

/** Browse / messaging instance of the shared pN session (refresh, idle lock, lock-all, reload home). */
export const browseSession = createPnSession<BrowseSessionExtra>({
  clientId: PN_CLIENT_ID,
  apiEndpoint: API_ENDPOINT,
  storageKey: 'pn_oauth_session',
});

const DEFAULT_IDLE_TIMEOUT_S = 3600;

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

    const redirectUri = browseOAuthRedirectUri();

    return buildOAuthConsentUrl({
      clientId: getClientId(),
      apiEndpoint: API_ENDPOINT,
      redirectUri,
      scope: [...scope],
      state,
      nonce,
      forPopup: usePopup,
      identityHandoffRequired: params?.identityHandoffRequired,
      unlockOrigin:
        (typeof import.meta !== 'undefined' &&
          (import.meta as ImportMeta & { env?: { VITE_UNLOCK_ORIGIN?: string } }).env
            ?.VITE_UNLOCK_ORIGIN) ||
        undefined,
    });
  }

  /**
   * Exchange authorization code for access token (in-flight dedupe per code + redirect URI).
   */
  private static tokenExchangeInflight = new Map<string, Promise<OAuthTokenResponse>>();

  static async exchangeCodeForToken(
    code: string,
    redirectUri?: string,
    grantedDataPoints?: string[]
  ): Promise<OAuthTokenResponse> {
    const finalRedirectUri = (redirectUri || REDIRECT_URI).replace(/\/$/, '');
    const exchangeKey = `${code}:${finalRedirectUri}`;

    const inflight = PNOAuthService.tokenExchangeInflight.get(exchangeKey);
    if (inflight) return inflight;

    const work = (async (): Promise<OAuthTokenResponse> => {
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
          granted_data_points: grantedDataPoints,
          browser_id: getOrCreateBrowserId()
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
    })().finally(() => {
      PNOAuthService.tokenExchangeInflight.delete(exchangeKey);
    });

    PNOAuthService.tokenExchangeInflight.set(exchangeKey, work);
    return work;
  }

  /**
   * Get user info using access token (60s TTL + in-flight dedupe per token).
   */
  private static userInfoCache = new Map<string, { at: number; value: OAuthUserInfo }>();
  private static userInfoInflight = new Map<string, Promise<OAuthUserInfo>>();
  private static readonly USERINFO_TTL_MS = 60_000;

  static invalidateUserInfoCache(): void {
    PNOAuthService.userInfoCache.clear();
    PNOAuthService.userInfoInflight.clear();
  }

  static async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    const cached = PNOAuthService.userInfoCache.get(accessToken);
    if (cached && Date.now() - cached.at < PNOAuthService.USERINFO_TTL_MS) {
      return cached.value;
    }
    const inflight = PNOAuthService.userInfoInflight.get(accessToken);
    if (inflight) return inflight;

    const work = (async (): Promise<OAuthUserInfo> => {
      const response = await fetch(`${API_ENDPOINT}/oauth/userinfo`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to get user info' }));
        throw new Error(error.error_description || error.error || 'Failed to get user info');
      }

      const value = (await response.json()) as OAuthUserInfo;
      PNOAuthService.userInfoCache.set(accessToken, { at: Date.now(), value });
      return value;
    })().finally(() => {
      PNOAuthService.userInfoInflight.delete(accessToken);
    });

    PNOAuthService.userInfoInflight.set(accessToken, work);
    return work;
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
   * Start a fresh unlock (code exchange or device-vault restore): idle and
   * lock-elsewhere clocks start now, never from a restored snapshot.
   */
  static beginSession(session: AuthSession): void {
    const t = Date.now();
    browseSession.save({
      ...session,
      pnIdentifier: session.pnIdentifier || session.did,
      idleTimeoutS: session.idleTimeoutS ?? DEFAULT_IDLE_TIMEOUT_S,
      unlockedAt: t,
      lastActiveAt: t,
    });
    writeSharedLastActive(t);
  }

  /**
   * Update non-token fields on the current session (public key, pN identifier, feed tokens).
   * Token fields always stay as stored: callers often spread a snapshot taken before a
   * refresh, and writing back a rotated-out refresh token would trip reuse detection.
   */
  static saveSession(session: AuthSession): void {
    const current = browseSession.load();
    if (!current) return;
    browseSession.save({
      ...current,
      ...session,
      accessToken: current.accessToken,
      refreshToken: current.refreshToken,
      expiresAt: current.expiresAt,
      idleTimeoutS: current.idleTimeoutS,
      unlockedAt: current.unlockedAt,
      lastActiveAt: current.lastActiveAt,
      pnIdentifier: session.pnIdentifier || current.pnIdentifier || session.did,
    });
  }

  static loadSession(): AuthSession | null {
    return browseSession.load();
  }

  /** Drop the stored session without reload (failed or abandoned unlock). Locks go through browseSession.lock. */
  static clearSession(): void {
    browseSession.clear();
    clearFeedMediaSessionCache();
    void import('./sessionVaultNative')
      .then((m) => m.clearBrowserSessionVault())
      .catch(() => undefined);
    resetFeedFirstPaintGate();
  }

  /** Usable now or refreshable; idle / revoked sessions lock and reload instead. */
  static isSessionValid(session: AuthSession): boolean {
    return session.expiresAt > Date.now() || !!session.refreshToken;
  }

  /** @param forceRefresh - after a 401, rotate even if the token has not expired */
  static async getValidAccessToken(forceRefresh: boolean = false): Promise<string | null> {
    return browseSession.getAccessToken({ forceRefresh });
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

