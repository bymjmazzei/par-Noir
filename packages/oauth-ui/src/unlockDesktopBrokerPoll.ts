/**
 * Poll API for Unlock prefer-app completion (cross-browser).
 * Replaces 127.0.0.1 loopback, which public HTTPS pages cannot reach (Private Network Access).
 */

import { PN_OAUTH_MESSAGE_TYPE } from './pnOAuthPopup';
import { OAUTH_BROKER_PENDING_PATH } from './consentUnlock/constants';

export type DesktopBrokerPendingResult = {
  type: typeof PN_OAUTH_MESSAGE_TYPE;
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
  granted_data_points?: string;
  consent_shown?: string;
  timestamp?: number;
  messagingHandoff?: unknown;
};

export function unlockDesktopBrokerPendingUrl(
  apiEndpoint: string,
  state: string,
  clientId: string
): string {
  const base = apiEndpoint.replace(/\/$/, '');
  const u = new URL(`${base}${OAUTH_BROKER_PENDING_PATH}`);
  u.searchParams.set('state', state);
  u.searchParams.set('client_id', clientId);
  return u.toString();
}

/**
 * One poll. Returns payload when Unlock has completed for this state; null if not ready.
 */
export async function pollUnlockDesktopBrokerOnce(
  expectedState: string,
  opts: { apiEndpoint: string; clientId: string }
): Promise<DesktopBrokerPendingResult | null> {
  const apiEndpoint = String(opts.apiEndpoint || '').replace(/\/$/, '');
  const clientId = String(opts.clientId || '');
  if (!apiEndpoint || !clientId || !expectedState) return null;
  try {
    const res = await fetch(unlockDesktopBrokerPendingUrl(apiEndpoint, expectedState, clientId), {
      method: 'GET',
      cache: 'no-store',
      mode: 'cors',
      credentials: 'omit',
    });
    if (res.status === 204 || res.status === 404) return null;
    if (!res.ok) return null;
    const data = (await res.json()) as DesktopBrokerPendingResult;
    if (!data || data.type !== PN_OAUTH_MESSAGE_TYPE) return null;
    if (expectedState && data.state && data.state !== expectedState) return null;
    if (!data.code && !data.error) return null;
    return data;
  } catch {
    return null;
  }
}

/** Parse api_endpoint + client_id from a consent / unlock launch URL. */
export function brokerPollContextFromConsentUrl(
  url: string
): { apiEndpoint: string; clientId: string } | null {
  try {
    const u = new URL(url);
    const apiEndpoint = (u.searchParams.get('api_endpoint') || '').replace(/\/$/, '');
    const clientId = u.searchParams.get('client_id') || '';
    if (!apiEndpoint || !clientId) return null;
    return { apiEndpoint, clientId };
  } catch {
    return null;
  }
}
