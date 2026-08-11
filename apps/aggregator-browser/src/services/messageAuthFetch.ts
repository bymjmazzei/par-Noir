/**
 * Message API fetch with OAuth bearer + device proof + cloud access token when a local key exists.
 */

import { PNOAuthService } from './pnOAuthService';
import { API_ENDPOINT } from '../config/api';
import { buildLocalDeviceProofHeaders } from '@par-noir/device-client';
import { ownerApiHeadersAsync, waitForOwnerCloudAccess } from './ownerApiHeaders';

export async function messageAuthHeaders(
  method: string,
  path: string,
  body?: unknown
): Promise<HeadersInit | null> {
  const accessToken = await PNOAuthService.getValidAccessToken();
  if (!accessToken) {
    return null;
  }
  const session = PNOAuthService.loadSession();
  // Base: bearer + X-PN-Cloud-Access-Token from vault hydrate (+ refresh)
  const headers: Record<string, string> = {
    ...(await ownerApiHeadersAsync(accessToken, session?.pnIdentifier))
  };
  if (!headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  headers.Authorization = `Bearer ${accessToken}`;
  const pn = session?.pnIdentifier;
  if (pn) {
    const proof = await buildLocalDeviceProofHeaders(pn, method, path, body);
    Object.assign(headers, proof);
  }
  return headers;
}

export async function messageFetch(
  path: string,
  init?: RequestInit & { bodyObject?: unknown }
): Promise<Response> {
  const method = init?.method || 'GET';
  const body = init?.bodyObject;
  const session = PNOAuthService.loadSession();
  // Drive-backed messaging needs vault hydrate under device custody
  if (session?.pnIdentifier) {
    await waitForOwnerCloudAccess(session.pnIdentifier);
  }
  const headers = await messageAuthHeaders(method, path, body);
  if (!headers) {
    // Auth death already notified via getValidAccessToken; do not hit the API.
    return new Response(JSON.stringify({ error: 'unauthorized', reason: 'session_dead' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return fetch(`${API_ENDPOINT}${path}`, {
    ...init,
    method,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
    body: body != null ? JSON.stringify(body) : init?.body,
  });
}
