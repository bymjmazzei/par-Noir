/**
 * Shared L5 portal OAuth session helpers — one place for code exchange / refresh / state match.
 */

import { oauthStatesMatch } from './pnOAuthPopup';

export { oauthStatesMatch };

export interface PortalTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

export interface PortalOAuthSessionKeys {
  access: string;
  refresh: string;
  processedCode: string;
  oauthCtx?: string;
  popupState?: string;
  resumeInflight?: string;
}

export async function exchangePortalAuthorizationCode(opts: {
  apiEndpoint: string;
  clientId: string;
  code: string;
  redirectUri: string;
  codeVerifier?: string;
  grantedDataPoints?: string[];
}): Promise<PortalTokenResponse> {
  const body: Record<string, unknown> = {
    grant_type: 'authorization_code',
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: opts.clientId
  };
  if (opts.codeVerifier) body.code_verifier = opts.codeVerifier;
  if (opts.grantedDataPoints && opts.grantedDataPoints.length > 0) {
    body.granted_data_points = opts.grantedDataPoints;
  }
  const res = await fetch(`${opts.apiEndpoint.replace(/\/$/, '')}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error_description?: string }).error_description ||
        (err as { error?: string }).error ||
        'Token exchange failed'
    );
  }
  return (await res.json()) as PortalTokenResponse;
}

export async function refreshPortalAccessToken(opts: {
  apiEndpoint: string;
  clientId: string;
  refreshToken: string;
}): Promise<PortalTokenResponse | null> {
  const res = await fetch(`${opts.apiEndpoint.replace(/\/$/, '')}/oauth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refresh_token: opts.refreshToken.trim(),
      client_id: opts.clientId
    })
  });
  if (!res.ok) return null;
  const data = (await res.json()) as PortalTokenResponse;
  if (!data.access_token) return null;
  return data;
}

export async function fetchPortalUserInfo(opts: {
  apiEndpoint: string;
  accessToken: string;
}): Promise<Record<string, unknown>> {
  const res = await fetch(`${opts.apiEndpoint.replace(/\/$/, '')}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error_description?: string }).error_description ||
        (err as { error?: string }).error ||
        'Userinfo failed'
    );
  }
  return (await res.json()) as Record<string, unknown>;
}

export async function revokePortalToken(opts: {
  apiEndpoint: string;
  token: string;
  tokenTypeHint?: 'access_token' | 'refresh_token';
}): Promise<void> {
  await fetch(`${opts.apiEndpoint.replace(/\/$/, '')}/oauth/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: opts.token,
      token_type_hint: opts.tokenTypeHint || 'refresh_token'
    })
  });
}

export function markPortalCodeProcessed(storageKey: string, code: string): void {
  try {
    sessionStorage.setItem(storageKey, code);
  } catch {
    /* ignore */
  }
}

export function isPortalCodeProcessed(storageKey: string, code: string): boolean {
  try {
    return sessionStorage.getItem(storageKey) === code;
  } catch {
    return false;
  }
}

export function assertPortalOAuthState(
  incoming: string | undefined,
  expected: string | undefined
): void {
  if (!incoming || !expected || !oauthStatesMatch(incoming, expected)) {
    throw new Error('OAuth state mismatch');
  }
}
