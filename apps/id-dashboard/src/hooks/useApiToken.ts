/**
 * par Noir API token for owned-assets and other API routes.
 * The dashboard's local session token is not a valid OAuth JWT.
 * This hook manages a par Noir OAuth token obtained via the OAuth popup flow.
 */

import { useState, useCallback } from 'react';
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

export function useApiToken() {
  const [apiToken, setApiToken] = useState<string | null>(() => getStoredToken()?.accessToken ?? null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const clearApiToken = useCallback(() => {
    setStoredToken(null);
    setApiToken(null);
    setConnectError(null);
  }, []);

  const connectApi = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      setIsConnecting(true);
      setConnectError(null);
      const redirectUri = `${window.location.origin}/pn-oauth-callback.html`;
      const state = `state-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const nonce = `nonce-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem('pn_oauth_state', state);
      const params = new URLSearchParams({
        client_id: PN_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid profile',
        state,
        nonce,
        popup: 'true',
      });
      const authUrl = `${window.location.origin}/oauth-authorize.html?${params.toString()}`;
      const popup = window.open(authUrl, 'pn_oauth', 'width=500,height=700,left=200,top=100,resizable=yes,scrollbars=yes');
      if (!popup) {
        setConnectError('Popup blocked. Please allow popups for this site.');
        setIsConnecting(false);
        resolve(null);
        return;
      }

      let resolved = false;
      const cleanup = () => {
        window.removeEventListener('message', listener);
        clearInterval(interval);
        setIsConnecting(false);
      };
      const doResolve = (value: string | null) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(value);
      };

      const listener = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        const data = event.data;
        if (data?.type !== 'oauth_callback') return;
        if (data.error) {
          setConnectError(data.error === 'access_denied' ? 'Authorization denied' : data.error);
          doResolve(null);
          return;
        }
        const code = data.code;
        if (!code) {
          setConnectError('No authorization code received');
          doResolve(null);
          return;
        }
        if (data.state !== state) {
          setConnectError('Invalid state');
          doResolve(null);
          return;
        }
        exchangeCode(code, redirectUri)
          .then((token) => {
            if (token) {
              const expiresAt = Date.now() + 60 * 60 * 1000;
              setStoredToken({ accessToken: token, expiresAt });
              setApiToken(token);
            }
            doResolve(token);
          })
          .catch((err) => {
            setConnectError(err instanceof Error ? err.message : 'Token exchange failed');
            doResolve(null);
          });
      };
      window.addEventListener('message', listener);
      const interval = setInterval(() => {
        if (popup.closed) {
          if (!resolved) setConnectError('Popup closed');
          doResolve(null);
        }
      }, 500);
    });
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
