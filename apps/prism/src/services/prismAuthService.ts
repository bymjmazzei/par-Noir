/**
 * Prism Auth Service
 * Token exchange and session management for prism-app OAuth
 */

import { API_ENDPOINT } from '../config/api';
import { secureStorageAdapter } from '../utils/secureStorageAdapter';
import { getPrismRedirectUri, PRISM_CLIENT_ID } from '../utils/oauth';

const CLIENT_ID = PRISM_CLIENT_ID;
const SESSION_KEY = 'prism_session';

/** Serialize refresh so two parallel getSession() calls cannot reuse the same refresh_token (fatal when rotation is on). */
let refreshInFlight: Promise<PrismSession | null> | null = null;

export interface PrismSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  did: string;
  pnIdentifier?: string;
}

function getRedirectUri(): string {
  return getPrismRedirectUri();
}

export async function exchangeCodeForToken(code: string): Promise<PrismSession> {
  const response = await fetch(`${API_ENDPOINT}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      client_id: CLIENT_ID,
      redirect_uri: getRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Token exchange failed' }));
    throw new Error(err.error_description || err.error || 'Token exchange failed');
  }

  const data = await response.json();
  const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;

  const userRes = await fetch(`${API_ENDPOINT}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  const user = userRes.ok ? await userRes.json() : {};

  const session: PrismSession = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    did: user.sub || user.did || '',
    pnIdentifier: user.pn_identifier,
  };

  await saveSession(session);
  return session;
}

export async function saveSession(session: PrismSession): Promise<void> {
  try {
    await secureStorageAdapter.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (e) {
    console.warn('[Prism Auth] Failed to save session:', e);
  }
}

/**
 * Refresh par Noir OAuth tokens; persists new refresh_token when API rotates (rotation-safe).
 */
export async function refreshParNoirSession(refreshToken: string): Promise<PrismSession | null> {
  const response = await fetch(`${API_ENDPOINT}/oauth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }),
  });
  if (!response.ok) {
    // 400 invalid_grant: stale or already-rotated token (common with rotation + parallel refresh). Clear so user can sign in again.
    if (response.status === 400) {
      await clearSession();
    }
    return null;
  }
  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) {
    await clearSession();
    return null;
  }
  const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
  const userRes = await fetch(`${API_ENDPOINT}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  const user = userRes.ok ? await userRes.json() : {};
  const session: PrismSession = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt,
    did: user.sub || user.did || '',
    pnIdentifier: user.pn_identifier,
  };
  if (!session.did && userRes.ok === false) {
    // Keep prior DID if userinfo fails transiently (token is still valid).
    try {
      const raw = await secureStorageAdapter.getItem(SESSION_KEY);
      if (raw) {
        const prev = JSON.parse(raw) as PrismSession;
        if (prev.did) session.did = prev.did;
        if (prev.pnIdentifier) session.pnIdentifier = prev.pnIdentifier;
      }
    } catch {
      /* ignore */
    }
  }
  await saveSession(session);
  return session;
}

export async function getSession(): Promise<PrismSession | null> {
  try {
    await secureStorageAdapter.migrateFromLocalStorage(SESSION_KEY);
    const raw = await secureStorageAdapter.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as PrismSession;
    const bufferMs = 60000;
    if (s.expiresAt && s.expiresAt > Date.now() + bufferMs) return s;
    if (s.refreshToken) {
      if (!refreshInFlight) {
        refreshInFlight = refreshParNoirSession(s.refreshToken).finally(() => {
          refreshInFlight = null;
        });
      }
      const refreshed = await refreshInFlight;
      if (refreshed) return refreshed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await secureStorageAdapter.removeItem(SESSION_KEY);
}
