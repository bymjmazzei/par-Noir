/**
 * Poll Electron Unlock loopback for OAuth completion (prefer-app desktop path).
 * Chrome allows https → http://127.0.0.1 as a trustworthy localhost exception.
 */

import {
  UNLOCK_DESKTOP_BROKER_ORIGIN,
  UNLOCK_DESKTOP_BROKER_PENDING_PATH,
} from './consentUnlock/constants';
import { PN_OAUTH_MESSAGE_TYPE } from './pnOAuthPopup';

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

export function unlockDesktopBrokerPendingUrl(state: string): string {
  const u = new URL(UNLOCK_DESKTOP_BROKER_PENDING_PATH, UNLOCK_DESKTOP_BROKER_ORIGIN);
  if (state) u.searchParams.set('state', state);
  return u.toString();
}

/**
 * One poll. Returns payload when Unlock has completed for this state; null if not ready.
 */
export async function pollUnlockDesktopBrokerOnce(
  expectedState: string
): Promise<DesktopBrokerPendingResult | null> {
  try {
    const res = await fetch(unlockDesktopBrokerPendingUrl(expectedState), {
      method: 'GET',
      cache: 'no-store',
      mode: 'cors',
    });
    if (res.status === 204 || res.status === 404) return null;
    if (!res.ok) return null;
    const data = (await res.json()) as DesktopBrokerPendingResult;
    if (!data || data.type !== PN_OAUTH_MESSAGE_TYPE) return null;
    if (expectedState && data.state && data.state !== expectedState) return null;
    if (!data.code && !data.error) return null;
    return data;
  } catch {
    // Unlock app not running / loopback down — not an error while waiting.
    return null;
  }
}
