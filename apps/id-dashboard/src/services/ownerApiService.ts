import { API_ENDPOINT } from '../config/api';
import { deviceProofHeaders } from './deviceProofContext';

function authHeaders(authToken: string, extra?: Record<string, string>) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`,
    ...extra,
  };
}

export type OwnerFetchInit = Omit<RequestInit, 'method' | 'headers' | 'body'> & {
  /** Merged into request headers after device proof (e.g. X-PN-Cloud-Access-Token). */
  extraHeaders?: Record<string, string>;
};

/** Owner API fetch with device proof headers when a local device key is registered. */
export async function ownerFetch(
  authToken: string,
  method: string,
  path: string,
  body?: unknown,
  init?: OwnerFetchInit
): Promise<Response> {
  const { extraHeaders, ...rest } = init ?? {};
  const proof = await deviceProofHeaders(method, path, body);
  return fetch(`${API_ENDPOINT}${path}`, {
    ...rest,
    method,
    headers: authHeaders(authToken, { ...proof, ...extraHeaders }),
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

/** GET owner route (still sends device proof for capability evaluation). */
export async function ownerGet(
  authToken: string,
  path: string,
  init?: OwnerFetchInit
): Promise<Response> {
  const { extraHeaders, ...rest } = init ?? {};
  const proof = await deviceProofHeaders('GET', path);
  return fetch(`${API_ENDPOINT}${path}`, {
    ...rest,
    method: 'GET',
    headers: authHeaders(authToken, { ...proof, ...extraHeaders }),
  });
}
