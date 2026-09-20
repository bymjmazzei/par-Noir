import { DEFAULT_UNLOCK_ORIGIN } from './constants';

export interface ConsentUnlockParams {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  nonce: string;
  popup: boolean;
  identityHandoffRequired: boolean;
  /** API host for challenge/authenticate (not the unlock UI origin). */
  apiEndpoint: string;
}

function readParam(search: URLSearchParams, key: string): string {
  return search.get(key) || '';
}

/**
 * Parse OAuth unlock query from unlock.parnoir.com (or API 302 target).
 */
export function parseConsentUnlockParams(
  search: string | URLSearchParams,
  defaults?: { apiEndpoint?: string; redirectUriFallbackOrigin?: string }
): ConsentUnlockParams {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const apiEndpoint = (
    readParam(params, 'api_endpoint') ||
    defaults?.apiEndpoint ||
    'https://api.parnoir.com'
  ).replace(/\/$/, '');
  const origin = defaults?.redirectUriFallbackOrigin || (typeof window !== 'undefined' ? window.location.origin : '');
  return {
    clientId: readParam(params, 'client_id') || 'browser-app',
    redirectUri:
      readParam(params, 'redirect_uri') ||
      (origin ? `${origin}/oauth-callback.html` : ''),
    scope: readParam(params, 'scope') || 'openid profile',
    state: readParam(params, 'state') || '',
    nonce: readParam(params, 'nonce') || '',
    popup: params.get('popup') === 'true',
    identityHandoffRequired: params.get('identity_handoff') === 'required',
    apiEndpoint,
  };
}

export function resolveUnlockOrigin(explicit?: string | null): string {
  if (explicit && explicit.trim()) return explicit.replace(/\/$/, '');
  try {
    const env =
      typeof import.meta !== 'undefined'
        ? (import.meta as ImportMeta & { env?: Record<string, string> }).env
        : undefined;
    if (env?.VITE_UNLOCK_ORIGIN) return String(env.VITE_UNLOCK_ORIGIN).replace(/\/$/, '');
  } catch {
    /* ignore */
  }
  return DEFAULT_UNLOCK_ORIGIN;
}

/** True when url host is the unlock broker (web or claimed Universal Link). */
export function isUnlockBrokerHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'unlock.parnoir.com' || h === 'localhost' || h === '127.0.0.1';
}
