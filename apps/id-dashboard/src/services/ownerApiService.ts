import { API_ENDPOINT } from '../config/api';
import { deviceProofHeaders } from './deviceProofContext';
import { resolveOwnerApiToken } from './ownerApiToken';
import { ownerCloudHeadersAsync } from '@par-noir/device-cloud-credentials';

const PN_CLOUD_ACCESS_TOKEN_HEADER = 'X-PN-Cloud-Access-Token';

/** Last unlocked pN for owner API calls that omit pnIdentifier. */
let ownerApiPnIdentifier: string | null = null;

export function setOwnerApiPnIdentifier(pn: string | null | undefined): void {
  ownerApiPnIdentifier = pn?.trim() || null;
}

export function getOwnerApiPnIdentifier(): string | null {
  return ownerApiPnIdentifier;
}

function authHeaders(authToken: string, extra?: Record<string, string>) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`,
    ...extra,
  };
}

function cloudTokenRequiredResponse(): Response {
  return new Response(
    JSON.stringify({
      error: 'cloud_token_required',
      error_description:
        'Google Drive access token required. Unlock with cloud credentials before Drive-backed calls.'
    }),
    { status: 409, headers: { 'Content-Type': 'application/json' } }
  );
}

function hasForwardedCloudToken(extra?: Record<string, string>): boolean {
  if (!extra) return false;
  const v = extra[PN_CLOUD_ACCESS_TOKEN_HEADER] || extra['x-pn-cloud-access-token'];
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Resolve cloud headers via the single package mint path (ownerCloudHeadersAsync).
 */
async function cloudTokenHeaders(
  authToken: string,
  pnIdentifier?: string
): Promise<{
  headers: Record<string, string>;
  missing: boolean;
}> {
  const pn = pnIdentifier || ownerApiPnIdentifier || undefined;
  if (!pn) return { headers: {}, missing: false };

  try {
    const headers = await ownerCloudHeadersAsync({
      authToken,
      pnIdentifier: pn,
      apiEndpoint: API_ENDPOINT
    });
    const tok = headers[PN_CLOUD_ACCESS_TOKEN_HEADER] || headers['x-pn-cloud-access-token'];
    if (!tok || !String(tok).trim()) {
      return { headers: {}, missing: true };
    }
    // Strip Authorization if present — ownerFetch adds Bearer separately.
    const { Authorization: _a, ...cloudOnly } = headers;
    return { headers: cloudOnly, missing: false };
  } catch {
    return { headers: {}, missing: true };
  }
}

export type OwnerFetchInit = Omit<RequestInit, 'method' | 'headers' | 'body'> & {
  /** Merged into request headers after device proof (e.g. X-PN-Cloud-Access-Token). */
  extraHeaders?: Record<string, string>;
  /** When set, attaches read-only X-PN-Cloud-Access-Token from session (never writes accounts). */
  pnIdentifier?: string;
};

/** Owner API fetch with device proof. Never JWT-only for Drive when pn is known. */
export async function ownerFetch(
  authToken: string,
  method: string,
  path: string,
  body?: unknown,
  init?: OwnerFetchInit
): Promise<Response> {
  const { extraHeaders, pnIdentifier, ...rest } = init ?? {};
  const proof = await deviceProofHeaders(method, path, body);
  const cloud = await cloudTokenHeaders(authToken, pnIdentifier);
  if (cloud.missing && !hasForwardedCloudToken(extraHeaders)) {
    return cloudTokenRequiredResponse();
  }
  return fetch(`${API_ENDPOINT}${path}`, {
    ...rest,
    method,
    headers: authHeaders(authToken, { ...proof, ...cloud.headers, ...extraHeaders }),
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

/** GET owner route (still sends device proof for capability evaluation). */
export async function ownerGet(
  authToken: string,
  path: string,
  init?: OwnerFetchInit
): Promise<Response> {
  const { extraHeaders, pnIdentifier, ...rest } = init ?? {};
  const proof = await deviceProofHeaders('GET', path);
  const cloud = await cloudTokenHeaders(authToken, pnIdentifier);
  if (cloud.missing && !hasForwardedCloudToken(extraHeaders)) {
    return cloudTokenRequiredResponse();
  }
  return fetch(`${API_ENDPOINT}${path}`, {
    ...rest,
    method: 'GET',
    headers: authHeaders(authToken, { ...proof, ...cloud.headers, ...extraHeaders }),
  });
}

/** Convenience: resolve owner JWT + fetch with cloud token. */
export async function ownerFetchForPn(
  pnIdentifier: string,
  method: string,
  path: string,
  body?: unknown,
  init?: Omit<OwnerFetchInit, 'pnIdentifier'>
): Promise<Response> {
  const token = resolveOwnerApiToken(pnIdentifier);
  if (!token) throw new Error('par Noir API session not ready');
  return ownerFetch(token, method, path, body, { ...init, pnIdentifier });
}
