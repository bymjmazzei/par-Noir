/**
 * Prism Auth Service
 * Token exchange for prism-app OAuth; refresh, idle lock, lock-all and reload
 * come from the shared pN session.
 */

import { createPnSession, getOrCreateBrowserId, type PnSessionRecord } from '@par-noir/oauth-ui';
import { API_ENDPOINT } from '../config/api';
import { getPrismRedirectUri, PRISM_CLIENT_ID } from '../utils/oauth';

const CLIENT_ID = PRISM_CLIENT_ID;

export type PrismSession = PnSessionRecord<{ did: string }>;

export const prismSession = createPnSession<{ did: string }>({
  clientId: CLIENT_ID,
  apiEndpoint: API_ENDPOINT,
  storageKey: 'prism_session',
});

export async function exchangeCodeForToken(
  code: string,
  opts?: { grantedDataPoints?: string; consentShown?: boolean }
): Promise<PrismSession> {
  const response = await fetch(`${API_ENDPOINT}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      client_id: CLIENT_ID,
      redirect_uri: getPrismRedirectUri(),
      grant_type: 'authorization_code',
      browser_id: getOrCreateBrowserId(),
      ...(typeof opts?.grantedDataPoints === 'string'
        ? { granted_data_points: opts.grantedDataPoints }
        : {}),
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Token exchange failed' }));
    throw new Error(err.error_description || err.error || 'Token exchange failed');
  }

  if (opts?.consentShown && typeof opts?.grantedDataPoints === 'string') {
    const { setPendingGrant } = await import('@par-noir/oauth-ui');
    setPendingGrant(CLIENT_ID, opts.grantedDataPoints.split(',').filter(Boolean));
  }

  const data = await response.json();
  const userRes = await fetch(`${API_ENDPOINT}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  const user = userRes.ok ? await userRes.json() : {};
  const did = user.sub || user.did || '';
  return prismSession.begin(data, { did, pnIdentifier: user.pn_identifier || did });
}

/** Biometric vault restore: idle and lock-elsewhere clocks restart now, not from the snapshot. */
export function restorePrismSession(snapshot: PrismSession): void {
  const t = Date.now();
  prismSession.save({ ...snapshot, unlockedAt: t, lastActiveAt: t });
}
