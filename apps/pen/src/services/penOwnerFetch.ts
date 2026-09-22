/**
 * Owner API fetch for Pen — mints X-PN-Cloud-Access-Token and fails closed.
 * Mirrors aggregator-browser ownerApiFetch (apps must not import each other).
 */

import {
  ownerCloudHeadersAsync,
  PN_CLOUD_ACCESS_TOKEN_HEADER
} from '@par-noir/device-cloud-credentials';
import { API_ENDPOINT } from '../config/api';
import { loadPenSession, savePenSession } from './penSession';

export type OwnerFetchInit = Omit<RequestInit, 'method' | 'headers' | 'body'> & {
  extraHeaders?: Record<string, string>;
  pnIdentifier?: string;
  authToken?: string;
};

function toUrl(pathOrUrl: string): string {
  return /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : `${API_ENDPOINT}${pathOrUrl}`;
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

function isJsonBody(body: unknown): boolean {
  if (body == null) return false;
  return !(
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    body instanceof URLSearchParams ||
    typeof body === 'string'
  );
}

async function driveHeaders(
  authToken: string,
  pnIdentifier?: string
): Promise<{ headers: Record<string, string>; missing: boolean }> {
  const headers = await ownerCloudHeadersAsync({
    authToken,
    pnIdentifier,
    apiEndpoint: API_ENDPOINT
  });
  if (!authToken) delete headers.Authorization;
  const missing = Boolean(pnIdentifier) && !headers[PN_CLOUD_ACCESS_TOKEN_HEADER];
  return { headers, missing };
}

async function request(opts: {
  method: string;
  pathOrUrl: string;
  body?: unknown;
  init?: OwnerFetchInit;
  drive: boolean;
}): Promise<Response> {
  const { extraHeaders, pnIdentifier, authToken, ...rest } = opts.init ?? {};
  const session = loadPenSession();
  const pn = pnIdentifier || session?.pnIdentifier || undefined;
  const token = authToken || session?.accessToken || '';

  let headers: Record<string, string>;
  if (opts.drive) {
    const resolved = await driveHeaders(token, pn);
    if (resolved.missing && !hasForwardedCloudToken(extraHeaders)) {
      return cloudTokenRequiredResponse();
    }
    headers = { 'Content-Type': 'application/json', ...resolved.headers };
  } else {
    headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  Object.assign(headers, extraHeaders);

  const jsonBody = isJsonBody(opts.body);
  if (!jsonBody) delete headers['Content-Type'];

  return fetch(toUrl(opts.pathOrUrl), {
    ...rest,
    method: opts.method,
    headers,
    body:
      opts.body == null
        ? undefined
        : jsonBody
          ? JSON.stringify(opts.body)
          : (opts.body as BodyInit)
  });
}

export async function ownerFetch(
  method: string,
  pathOrUrl: string,
  body?: unknown,
  init?: OwnerFetchInit
): Promise<Response> {
  return request({ method, pathOrUrl, body, init, drive: true });
}

export async function ownerGet(pathOrUrl: string, init?: OwnerFetchInit): Promise<Response> {
  return request({ method: 'GET', pathOrUrl, init, drive: true });
}

export async function apiFetch(
  method: string,
  pathOrUrl: string,
  body?: unknown,
  init?: OwnerFetchInit
): Promise<Response> {
  return request({ method, pathOrUrl, body, init, drive: false });
}

export async function apiGet(pathOrUrl: string, init?: OwnerFetchInit): Promise<Response> {
  return request({ method: 'GET', pathOrUrl, init, drive: false });
}

/** Refresh helper if bearer 401 — updates stored session when caller has new token. */
export function updateSessionAccessToken(accessToken: string): void {
  const s = loadPenSession();
  if (!s) return;
  savePenSession({ ...s, accessToken });
}
