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

async function cloudTokenHeaders(pnIdentifier?: string): Promise<Record<string, string>> {
  const pn = pnIdentifier || ownerApiPnIdentifier || undefined;
  if (!pn) return {};
  let tok = await resolveLocalGoogleAccessTokenAsync(pn);
  if (!tok) {
    try {
      const { waitForCloudCredentialsReady } = await import('@par-noir/device-cloud-credentials');
      await waitForCloudCredentialsReady(pn);
      tok = await resolveLocalGoogleAccessTokenAsync(pn);
    } catch {
      /* best-effort wait for vault hydrate */
    }
  }
  return tok ? { [PN_CLOUD_ACCESS_TOKEN_HEADER]: tok } : {};
}

export type OwnerFetchInit = Omit<RequestInit, 'method' | 'headers' | 'body'> & {
  /** Merged into request headers after device proof (e.g. X-PN-Cloud-Access-Token). */
  extraHeaders?: Record<string, string>;
  /** When set, attaches read-only X-PN-Cloud-Access-Token from session (never writes accounts). */
  pnIdentifier?: string;
};

/** Owner API fetch with device proof headers when a local device key is registered. */
export async function ownerFetch(
  authToken: string,
  method: string,
  path: string,
  body?: unknown,
  init?: OwnerFetchInit
): Promise<Response> {
  const { extraHeaders, pnIdentifier, ...rest } = init ?? {};
  const proof = await deviceProofHeaders(method, path, body);
  const cloud = await cloudTokenHeaders(pnIdentifier);
  return fetch(`${API_ENDPOINT}${path}`, {
    ...rest,
    method,
    headers: authHeaders(authToken, { ...proof, ...cloud, ...extraHeaders }),
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
  const cloud = await cloudTokenHeaders(pnIdentifier);
  return fetch(`${API_ENDPOINT}${path}`, {
    ...rest,
    method: 'GET',
    headers: authHeaders(authToken, { ...proof, ...cloud, ...extraHeaders }),
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
