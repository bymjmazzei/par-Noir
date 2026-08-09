/**
 * Owner API fetch for the aggregator browser.
 *
 * Drive-backed calls must go through ownerFetch / ownerGet. They mint a Google
 * access token when the vault copy has aged out, and they fail closed: when a pn
 * is known but no token can be produced, the request is never sent and a 409
 * cloud_token_required is returned locally.
 *
 * Building headers by hand is what caused Drive calls to go out with no
 * X-PN-Cloud-Access-Token at all once the vault token passed its hour, so
 * headers are not exposed here. Non-Drive endpoints use apiFetch / apiGet.
 */

import { API_ENDPOINT } from '../config/api';
import { PNOAuthService } from './pnOAuthService';
import { ownerApiHeadersAsync } from './ownerApiHeaders';
import { PN_CLOUD_ACCESS_TOKEN_HEADER } from '@par-noir/device-cloud-credentials';

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

function bearerOnlyHeaders(authToken: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  return headers;
}

async function driveHeaders(
  authToken: string,
  pnIdentifier?: string
): Promise<{ headers: Record<string, string>; missing: boolean }> {
  const headers = await ownerApiHeadersAsync(authToken, pnIdentifier);
  // A pn with no mintable token is the fail-closed case. No pn means there is
  // nothing to mint against and the call is not owner-scoped.
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
  const session = PNOAuthService.loadSession();
  const pn = pnIdentifier || session?.pnIdentifier || undefined;

  const send = async (token: string): Promise<Response | null> => {
    let headers: Record<string, string>;
    if (opts.drive) {
      const resolved = await driveHeaders(token, pn);
      if (resolved.missing && !hasForwardedCloudToken(extraHeaders)) return null;
      headers = { 'Content-Type': 'application/json', ...resolved.headers };
    } else {
      headers = bearerOnlyHeaders(token);
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
  };

  const first = await send(authToken || session?.accessToken || '');
  if (first === null) return cloudTokenRequiredResponse();
  if (first.status !== 401) return first;

  // The pN OAuth bearer expired. Refresh once and re-issue rather than making
  // every call site hand-roll this.
  const refreshed = await PNOAuthService.getValidAccessToken(true);
  if (!refreshed) return first;
  const second = await send(refreshed);
  return second === null ? cloudTokenRequiredResponse() : second;
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
