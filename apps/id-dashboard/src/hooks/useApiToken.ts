/**
 * par Noir API token for owned-assets and other API routes.
 * The dashboard's local session token is not a valid OAuth JWT.
 * The token lives in the shared pN session (refresh, idle lock, lock-all).
 */

import { useState, useCallback, useEffect } from 'react';
import type { PortalTokenResponse } from '@par-noir/oauth-ui';
import {
  acquireApiTokenInline,
  beginDashboardSession,
  consumeOAuthResumeFromUrl,
  dashboardSession,
  exchangeCodeForToken,
  getStoredToken,
  type InlineOAuthAcquireInput
} from '../services/parNoirOAuthInline';

export function useApiToken() {
  // Do not hydrate from sessionStorage here — token is pN-scoped and may belong to a different identity.
  const [apiToken, setApiToken] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(
    () =>
      dashboardSession.subscribe((record) => {
        setApiToken(record?.accessToken ?? null);
      }),
    []
  );

  /**
   * Parent-window return path: oauth-callback can resume into /?oauth_resume=1&code=...
   * Consume and exchange code once app is bootstrapped.
   */
  useEffect(() => {
    void (async () => {
      try {
        const resume = await consumeOAuthResumeFromUrl();
        if (!resume) return;
        if (resume.error) {
          setConnectError(resume.errorDescription || resume.error);
          return;
        }
        if (!resume.code) return;
        setIsConnecting(true);
        try {
          const redirectUri = `${window.location.origin}/oauth-callback.html`;
          const tokens = await exchangeCodeForToken(resume.code, redirectUri);
          if (tokens.access_token) {
            // OAuth resume cannot know which pN this token is for — force re-mint on unlock.
            dashboardSession.clear();
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setConnectError(msg);
        } finally {
          setIsConnecting(false);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setConnectError(msg);
      }
    })();
  }, []);

  const clearApiToken = useCallback(() => {
    dashboardSession.clear();
    setConnectError(null);
  }, []);

  const connectApi = useCallback(async (): Promise<string | null> => {
    setConnectError('Manual connect is no longer required. API token is acquired after unlock.');
    return null;
  }, []);

  /** Shell unlock has no Key 2. The exchanged token is the API token for this pN. */
  const adoptShellAccessToken = useCallback(
    (tokens: PortalTokenResponse, publicKey: string): Promise<string> =>
      beginDashboardSession(tokens, publicKey),
    []
  );

  const ensureApiTokenAfterUnlock = useCallback(
    async (input: InlineOAuthAcquireInput): Promise<string | null> => {
      // The OAuth access token embeds a pN identifier; the API rejects (403) any owner route
      // whose URL pN differs from the token's pN. When switching between pNs we MUST re-acquire
      // a token for the active pN instead of reusing a stored token from a different pN.
      const { deriveCanonicalPnIdentifier } = await import('@par-noir/pqc-crypto/oauth-unlock-proof');
      const wantedPn = deriveCanonicalPnIdentifier(input.publicKey);

      const existing = getStoredToken();
      if (existing?.accessToken && existing.pnIdentifier === wantedPn) {
        setApiToken(existing.accessToken);
        return existing.accessToken;
      }

      // Stored token is missing or belongs to a different pN — drop it and mint a new one.
      if (existing && existing.pnIdentifier !== wantedPn) dashboardSession.clear();

      setIsConnecting(true);
      setConnectError(null);
      try {
        const { tokens } = await acquireApiTokenInline(input);
        return await beginDashboardSession(tokens, input.publicKey);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setConnectError(msg);
        return null;
      } finally {
        setIsConnecting(false);
      }
    },
    []
  );

  return {
    apiToken,
    connectApi,
    clearApiToken,
    isConnecting,
    connectError,
    ensureApiTokenAfterUnlock,
    adoptShellAccessToken,
  };
}
