import { API_ENDPOINT } from '../config/api';
import { deviceProofHeaders } from './deviceProofContext';
import { resolveOwnerApiToken } from './ownerApiToken';
import { fetchDeviceDriveForSession, omitCloudAccessHeader } from '@par-noir/device-cloud-credentials';

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

export type OwnerFetchInit = Omit<RequestInit, 'method' | 'headers' | 'body'> & {
  /** Merged into request headers after device proof. Provider access tokens are dropped. */
  extraHeaders?: Record<string, string>;
  /** Kept for callers. Drive tokens are not forwarded to the API. */
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
  const driveResponse = await fetchDeviceDriveForSession({
    method,
    pathOrUrl: path,
    body,
    pnIdentifier: pnIdentifier || ownerApiPnIdentifier,
  });
  if (driveResponse) return driveResponse;
  const proof = await deviceProofHeaders(method, path, body);
  return fetch(`${API_ENDPOINT}${path}`, {
    ...rest,
    method,
    headers: authHeaders(authToken, { ...proof, ...omitCloudAccessHeader(extraHeaders) }),
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
  const driveResponse = await fetchDeviceDriveForSession({
    method: 'GET',
    pathOrUrl: path,
    pnIdentifier: pnIdentifier || ownerApiPnIdentifier,
  });
  if (driveResponse) return driveResponse;
  const proof = await deviceProofHeaders('GET', path);
  return fetch(`${API_ENDPOINT}${path}`, {
    ...rest,
    method: 'GET',
    headers: authHeaders(authToken, { ...proof, ...omitCloudAccessHeader(extraHeaders) }),
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
