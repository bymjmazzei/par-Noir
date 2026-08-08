import { API_ENDPOINT } from '../config/api';
import { deviceProofHeaders } from './deviceProofContext';
import { resolveLocalGoogleAccessTokenAsync } from './deviceApiService';
import { resolveOwnerApiToken } from './ownerApiToken';

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
 * Resolve X-PN-Cloud-Access-Token for owner Drive calls.
 * Returns missing=true when a pn is known but no access token could be minted.
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

  let tok = await resolveLocalGoogleAccessTokenAsync(pn);
  if (!tok) {
    try {
      const {
        waitForCloudHydrateMaterial,
        ensureCloudAccessToken,
        getCloudAccessTokenFromSession
      } = await import('@par-noir/device-cloud-credentials');
      await waitForCloudHydrateMaterial(pn);
      tok =
        (await ensureCloudAccessToken({
          authToken,
          pnIdentifier: pn,
          apiEndpoint: API_ENDPOINT
        })) || getCloudAccessTokenFromSession(pn);
      if (!tok) {
        await waitForCloudHydrateMaterial(pn, 3_000);
        tok = getCloudAccessTokenFromSession(pn);
      }
    } catch {
      /* best-effort */
    }
  }
  if (!tok) {
    tok = await resolveLocalGoogleAccessTokenAsync(pn);
  }
  if (!tok) return { headers: {}, missing: true };
  return { headers: { [PN_CLOUD_ACCESS_TOKEN_HEADER]: tok }, missing: false };
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
