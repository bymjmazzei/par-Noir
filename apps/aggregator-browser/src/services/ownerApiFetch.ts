/**
 * Owner API fetch for the aggregator browser.
 * Requests carry the OAuth bearer only. Provider access tokens stay on the device
 * and are read with the client cloud caller, not forwarded to the API.
 */

import { API_ENDPOINT } from '../config/api';
import { PNOAuthService } from './pnOAuthService';
import { fetchDeviceDriveForSession, omitCloudAccessHeader } from '@par-noir/device-cloud-credentials';

export type OwnerFetchInit = Omit<RequestInit, 'method' | 'headers' | 'body'> & {
  /** Merged last, so a caller-resolved X-PN-Cloud-Access-Token wins. */
  extraHeaders?: Record<string, string>;
  /** Defaults to the unlocked session's pn. */
  pnIdentifier?: string;
  /** Defaults to the unlocked session's OAuth token. */
  authToken?: string;
};

/** Absolute URLs are passed through; call sites build Drive URLs inline. */
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

function bearerOnlyHeaders(authToken: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  return headers;
}

async function request(opts: {
  method: string;
  pathOrUrl: string;
  body?: unknown;
  init?: OwnerFetchInit;
  drive: boolean;
}): Promise<Response> {
  const { extraHeaders, pnIdentifier, authToken, ...rest } = opts.init ?? {};
  const session = PNOAuthService.loadSession();
  if (opts.drive) {
    const driveResponse = await fetchDeviceDriveForSession({
      method: opts.method,
      pathOrUrl: opts.pathOrUrl,
      body: opts.body,
      pnIdentifier: pnIdentifier || session?.pnIdentifier,
    });
    if (driveResponse) return driveResponse;
  }

  const send = async (token: string): Promise<Response> => {
    const headers = bearerOnlyHeaders(token);
    Object.assign(headers, omitCloudAccessHeader(extraHeaders));

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
  };

  const first = await send(authToken || session?.accessToken || '');
  if (first.status !== 401) return first;

  // The pN OAuth bearer expired. Refresh once and re-issue rather than making
  // every call site hand-roll this.
  const refreshed = await PNOAuthService.getValidAccessToken(true);
  if (!refreshed) return first;
  return send(refreshed);
}

/** Drive-backed request. Mints a cloud token, or fails closed with a local 409. */
export async function ownerFetch(
  method: string,
  pathOrUrl: string,
  body?: unknown,
  init?: OwnerFetchInit
): Promise<Response> {
  return request({ method, pathOrUrl, body, init, drive: true });
}

/** Drive-backed GET. */
export async function ownerGet(pathOrUrl: string, init?: OwnerFetchInit): Promise<Response> {
  return request({ method: 'GET', pathOrUrl, init, drive: true });
}

/** Non-Drive request: bearer only, never fails closed on a missing cloud token. */
export async function apiFetch(
  method: string,
  pathOrUrl: string,
  body?: unknown,
  init?: OwnerFetchInit
): Promise<Response> {
  return request({ method, pathOrUrl, body, init, drive: false });
}

/** Non-Drive GET. */
export async function apiGet(pathOrUrl: string, init?: OwnerFetchInit): Promise<Response> {
  return request({ method: 'GET', pathOrUrl, init, drive: false });
}
