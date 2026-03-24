/**
 * par Noir API token for owned-assets and other API routes.
 * The dashboard's local session token is not a valid OAuth JWT.
 * This hook manages a par Noir OAuth token obtained via the same popup flow as the browser.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  acquireApiTokenInline,
  clearStoredToken,
  consumeOAuthResumeFromUrl,
  exchangeCodeForToken,
  getStoredToken,
  setStoredToken,
  type InlineOAuthAcquireInput
} from '../services/parNoirOAuthInline';

export function useApiToken() {
  const [apiToken, setApiToken] = useState<string | null>(() => getStoredToken()?.accessToken ?? null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

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
          const token = await exchangeCodeForToken(resume.code, redirectUri);
          if (token) {
            const expiresAt = Date.now() + 60 * 60 * 1000;
            setStoredToken({ accessToken: token, expiresAt });
            setApiToken(token);
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
    clearStoredToken();
    setApiToken(null);
    setConnectError(null);
  }, []);

  const connectApi = useCallback(async (): Promise<string | null> => {
    setConnectError('Manual connect is no longer required. API token is acquired after unlock.');
    return null;
  }, []);

  const ensureApiTokenAfterUnlock = useCallback(
    async (input: InlineOAuthAcquireInput): Promise<string | null> => {
      const existing = getStoredToken();
      if (existing?.accessToken) {
        setApiToken(existing.accessToken);
        return existing.accessToken;
      }

      setIsConnecting(true);
      setConnectError(null);
      try {
        const token = await acquireApiTokenInline(input);
        const expiresAt = Date.now() + 60 * 60 * 1000;
        setStoredToken({ accessToken: token, expiresAt });
        setApiToken(token);
        return token;
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

  return { apiToken, connectApi, clearApiToken, isConnecting, connectError, ensureApiTokenAfterUnlock };
}
