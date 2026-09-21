/**
 * Durable prefer-app waiter for Cap cold-start.
 * startPnOAuthPopup poll lives in JS memory; if Messages is killed while Unlock
 * runs, resume from localStorage when the app returns (oauth/resume / foreground).
 */

import { pushPnOAuthDebug } from './pnOAuthDebug';
import {
  brokerPollContextFromConsentUrl,
  pollUnlockDesktopBrokerOnce,
  type DesktopBrokerPendingResult,
} from './unlockDesktopBrokerPoll';

export const PN_PREFER_APP_BROKER_WAIT_KEY = 'pn_prefer_app_broker_wait_v1';

/** Prefer-app wait TTL — slightly under API broker pending (2 min). */
export const PREFER_APP_BROKER_WAIT_TTL_MS = 110_000;

export type PreferAppBrokerWait = {
  v: 1;
  state: string;
  clientId: string;
  apiEndpoint: string;
  startedAt: number;
};

export function stashPreferAppBrokerWait(wait: Omit<PreferAppBrokerWait, 'v' | 'startedAt'>): void {
  if (typeof localStorage === 'undefined') return;
  const payload: PreferAppBrokerWait = {
    v: 1,
    state: wait.state,
    clientId: wait.clientId,
    apiEndpoint: wait.apiEndpoint.replace(/\/$/, ''),
    startedAt: Date.now(),
  };
  if (!payload.state || !payload.clientId || !payload.apiEndpoint) return;
  try {
    localStorage.setItem(PN_PREFER_APP_BROKER_WAIT_KEY, JSON.stringify(payload));
    pushPnOAuthDebug('prefer_app_wait_stashed', {
      stateLen: payload.state.length,
      clientId: payload.clientId,
    });
  } catch {
    /* ignore */
  }
}

export function clearPreferAppBrokerWait(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(PN_PREFER_APP_BROKER_WAIT_KEY);
  } catch {
    /* ignore */
  }
}

export function readPreferAppBrokerWait(): PreferAppBrokerWait | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PN_PREFER_APP_BROKER_WAIT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PreferAppBrokerWait;
    if (!parsed || parsed.v !== 1) {
      clearPreferAppBrokerWait();
      return null;
    }
    if (!parsed.state || !parsed.clientId || !parsed.apiEndpoint) {
      clearPreferAppBrokerWait();
      return null;
    }
    if (Date.now() - parsed.startedAt > PREFER_APP_BROKER_WAIT_TTL_MS) {
      clearPreferAppBrokerWait();
      return null;
    }
    return parsed;
  } catch {
    clearPreferAppBrokerWait();
    return null;
  }
}

export function stashPreferAppBrokerWaitFromConsentUrl(consentUrl: string): void {
  const ctx = brokerPollContextFromConsentUrl(consentUrl);
  if (!ctx) return;
  try {
    const u = new URL(consentUrl);
    const state = u.searchParams.get('state') || '';
    if (!state) return;
    stashPreferAppBrokerWait({
      state,
      clientId: ctx.clientId,
      apiEndpoint: ctx.apiEndpoint,
    });
  } catch {
    /* ignore */
  }
}

/**
 * One-shot: if a durable prefer-app wait is pending, poll broker-pending once.
 * Returns payload when Unlock already completed; null if not ready / no wait.
 */
export async function pollStashedPreferAppBrokerOnce(): Promise<DesktopBrokerPendingResult | null> {
  const wait = readPreferAppBrokerWait();
  if (!wait) return null;
  const data = await pollUnlockDesktopBrokerOnce(wait.state, {
    apiEndpoint: wait.apiEndpoint,
    clientId: wait.clientId,
  });
  if (!data) return null;
  clearPreferAppBrokerWait();
  pushPnOAuthDebug('prefer_app_wait_resumed', {
    hasCode: Boolean(data.code),
    hasError: Boolean(data.error),
    hasMessagingHandoff: Boolean(data.messagingHandoff),
  });
  return data;
}
