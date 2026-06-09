import { API_ENDPOINT } from '../config/api';
import { deviceProofHeaders } from './deviceProofContext';

function authHeaders(authToken: string, extra?: Record<string, string>) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`,
    ...extra,
  };
}

/** Owner API fetch with device proof headers when a local device key is registered. */
export async function ownerFetch(
  authToken: string,
  method: string,
  path: string,
  body?: unknown,
  init?: Omit<RequestInit, 'method' | 'headers' | 'body'>
): Promise<Response> {
  const proof = await deviceProofHeaders(method, path, body);
  return fetch(`${API_ENDPOINT}${path}`, {
    ...init,
    method,
    headers: authHeaders(authToken, proof),
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

/** GET owner route (still sends device proof for capability evaluation). */
export async function ownerGet(
  authToken: string,
  path: string,
  init?: Omit<RequestInit, 'method' | 'headers'>
): Promise<Response> {
  const proof = await deviceProofHeaders('GET', path);
  return fetch(`${API_ENDPOINT}${path}`, {
    ...init,
    method: 'GET',
    headers: authHeaders(authToken, proof),
  });
}
