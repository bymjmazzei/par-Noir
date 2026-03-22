/**
 * par Noir API token for owned-assets and other API routes.
 * The dashboard's local session token is not a valid OAuth JWT.
 * This hook manages a par Noir OAuth token obtained via the same popup flow as the browser.
 */

import { useState, useCallback } from 'react';
import { buildOAuthConsentUrl, startPnOAuthPopup } from '@par-noir/oauth-ui';
import { API_ENDPOINT } from '../config/api';

const PN_CLIENT_ID = import.meta.env.VITE_PN_CLIENT_ID || 'browser-app';
const STORAGE_KEY = 'pn_api_token';

interface StoredToken {
  accessToken: string;
  expiresAt: number;
}

function getStoredToken(): StoredToken | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredToken;
    if (parsed.expiresAt < Date.now() + 60_000) return null; // Expire 1 min early
    return parsed;
  } catch {
    return null;
  }
}

function setStoredToken(t: StoredToken | null): void {
  if (t) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(t));
  else sessionStorage.removeItem(STORAGE_KEY);
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function useApiToken() {
  const [apiToken, setApiToken] = useState<string | null>(() => getStoredToken()?.accessToken ?? null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const clearApiToken = useCallback(() => {
    setStoredToken(null);
    setApiToken(null);
    setConnectError(null);
  }, []);

  const connectApi = useCallback(async (): Promise<string | null> => {
    setIsConnecting(true);
    setConnectError(null);

    const redirectUri = `${window.location.origin}/oauth-callback.html`;
    const state = randomHex(16);
    const nonce = randomHex(16);
    sessionStorage.setItem('pn_oauth_state', state);

    const url = buildOAuthConsentUrl({
      clientId: PN_CLIENT_ID,
      apiEndpoint: API_ENDPOINT,
      redirectUri,
      scope: ['openid', 'profile'],
      state,
      nonce,
      forPopup: true,
    });

    let apiOrigin = '';
    try {
      apiOrigin = new URL((API_ENDPOINT || 'https://api.parnoir.com').replace(/\/$/, '')).origin;
    } catch {
      /* ignore */
    }

    try {
      const result = await startPnOAuthPopup({
        url,
        expectedState: state,
        timeoutMs: 300_000,
        allowedMessageOrigins: apiOrigin ? [apiOrigin] : undefined,
      });

      if (result.error) {
        setConnectError(
          result.error === 'access_denied' ? 'Authorization denied' : result.error_description || result.error
        );
        return null;
      }
      if (!result.code) {
        setConnectError('No authorization code received');
        return null;
      }
      if (result.state !== state) {
        setConnectError('Invalid state');
        return null;
      }

      const token = await exchangeCode(result.code, redirectUri);
      if (token) {
        const expiresAt = Date.now() + 60 * 60 * 1000;
        setStoredToken({ accessToken: token, expiresAt });
        setApiToken(token);
      }
      return token;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'POPUP_BLOCKED') {
        setConnectError('Popup blocked. Please allow popups for this site.');
      } else if (msg === 'POPUP_CLOSED') {
        setConnectError('Popup closed');
      } else if (msg === 'POPUP_TIMEOUT') {
        setConnectError('Connection timed out');
      } else {
        setConnectError(msg);
      }
      return null;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  return { apiToken, connectApi, clearApiToken, isConnecting, connectError };
}

async function exchangeCode(code: string, redirectUri: string): Promise<string> {
  const res = await fetch(`${API_ENDPOINT}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      client_id: PN_CLIENT_ID,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error_description?: string }).error_description || 'Token exchange failed');
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}
