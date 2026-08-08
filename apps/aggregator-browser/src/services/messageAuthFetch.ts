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
): Promise<HeadersInit> {
  const session = PNOAuthService.loadSession();
  // Base: bearer + X-PN-Cloud-Access-Token from vault hydrate (+ refresh)
  const headers: Record<string, string> = {
    ...(await ownerApiHeadersAsync(session?.accessToken, session?.pnIdentifier))
  };
  if (!headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (session?.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`;
  }
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
  return fetch(`${API_ENDPOINT}${path}`, {
    ...init,
    method,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
    body: body != null ? JSON.stringify(body) : init?.body,
  });
}
