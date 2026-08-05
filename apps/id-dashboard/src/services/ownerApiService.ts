import { API_ENDPOINT } from '../config/api';
import { deviceProofHeaders } from './deviceProofContext';
import { resolveLocalGoogleAccessToken } from './deviceApiService';

const PN_CLOUD_ACCESS_TOKEN_HEADER = 'X-PN-Cloud-Access-Token';

function authHeaders(authToken: string, extra?: Record<string, string>) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`,
    ...extra,
  };
}

function cloudTokenHeaders(pnIdentifier?: string): Record<string, string> {
  if (!pnIdentifier) return {};
  const tok = resolveLocalGoogleAccessToken(pnIdentifier);
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
  const cloud = cloudTokenHeaders(pnIdentifier);
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
  const cloud = cloudTokenHeaders(pnIdentifier);
  return fetch(`${API_ENDPOINT}${path}`, {
    ...rest,
    method: 'GET',
    headers: authHeaders(authToken, { ...proof, ...cloud, ...extraHeaders }),
  });
}
