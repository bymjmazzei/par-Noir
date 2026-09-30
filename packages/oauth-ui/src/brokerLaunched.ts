/**
 * Unlock app claims an OAuth state the moment it receives the deep link.
 * Public pages poll this. They cannot call 127.0.0.1.
 */

import { OAUTH_BROKER_LAUNCHED_PATH } from './consentUnlock/constants';
import { searchFromUnlockUrl } from './consentUnlock/searchFromUnlockUrl';

export type BrokerLaunchContext = {
  apiEndpoint: string;
  clientId: string;
  state: string;
};

export function brokerLaunchContextFromUrl(url: string): BrokerLaunchContext | null {
  const search = searchFromUnlockUrl(url);
  if (!search) return null;
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const state = q.get('state') || '';
  const clientId = q.get('client_id') || '';
  const apiEndpoint = (q.get('api_endpoint') || '').replace(/\/$/, '');
  if (state.length < 8 || !clientId || !apiEndpoint) return null;
  return { apiEndpoint, clientId, state };
}

export async function pollBrokerLaunchedOnce(ctx: BrokerLaunchContext): Promise<boolean> {
  const u = new URL(`${ctx.apiEndpoint}${OAUTH_BROKER_LAUNCHED_PATH}`);
  u.searchParams.set('state', ctx.state);
  u.searchParams.set('client_id', ctx.clientId);
  try {
    const res = await fetch(u.toString(), {
      method: 'GET',
      cache: 'no-store',
      mode: 'cors',
      credentials: 'omit',
    });
    if (res.status === 204 || res.status === 404) return false;
    if (!res.ok) return false;
    const data = (await res.json()) as { launched?: boolean };
    return data?.launched === true;
  } catch {
    return false;
  }
}

export async function postBrokerLaunched(
  apiEndpoint: string,
  body: { state: string; client_id: string }
): Promise<void> {
  const base = apiEndpoint.replace(/\/$/, '');
  const res = await fetch(`${base}${OAUTH_BROKER_LAUNCHED_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    mode: 'cors',
    credentials: 'omit',
  });
  if (!res.ok) {
    throw new Error(`Broker launched failed (${res.status})`);
  }
}
