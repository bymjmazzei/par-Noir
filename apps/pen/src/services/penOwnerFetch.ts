/**
 * Owner API fetch for Pen. Bearer only. Provider tokens stay on the device.
 * Mirrors aggregator-browser ownerApiFetch (apps must not import each other).
 */

import { omitCloudAccessHeader } from '@par-noir/device-cloud-credentials';
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

async function request(opts: {
  method: string;
  pathOrUrl: string;
  body?: unknown;
  init?: OwnerFetchInit;
  drive: boolean;
}): Promise<Response> {
  const { extraHeaders, pnIdentifier: _pn, authToken, ...rest } = opts.init ?? {};
  const session = loadPenSession();
  const token = authToken || session?.accessToken || '';

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  Object.assign(headers, omitCloudAccessHeader(extraHeaders));

  let body = opts.body;
  const jsonBody = isJsonBody(body);
  if (
    jsonBody &&
    opts.method !== 'GET' &&
    opts.pathOrUrl.includes('apply-inbound') &&
    body &&
    typeof body === 'object' &&
    !('deviceCloudResult' in (body as object))
  ) {
    const { appendDeviceCloudRow, getCloudAccessTokenFromSession, layoutSheetId } = await import(
      '@par-noir/device-cloud-credentials'
    );
    const pn =
      opts.init?.pnIdentifier ||
      (body as { userPnIdentifier?: string }).userPnIdentifier ||
      session?.pnIdentifier;
    const cloudToken = pn ? getCloudAccessTokenFromSession(pn) : null;
    const spreadsheetId = pn ? layoutSheetId(pn, 'pen_doc') : null;
    if (cloudToken && spreadsheetId) {
      body = {
        ...(body as Record<string, unknown>),
        deviceCloudResult: await appendDeviceCloudRow(cloudToken, {
          ...(body as Record<string, unknown>),
          spreadsheetId,
        }),
      };
    }
  }
  if (!jsonBody) delete headers['Content-Type'];

  return fetch(toUrl(opts.pathOrUrl), {
    ...rest,
    method: opts.method,
    headers,
    body:
      body == null
        ? undefined
        : jsonBody
          ? JSON.stringify(body)
          : (body as BodyInit)
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
