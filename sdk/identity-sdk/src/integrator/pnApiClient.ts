/**
 * Shared HTTP helpers for par Noir L5 integrator API clients.
 */

import type { IntegratorApiContext } from './types';

export const SCOPE_OPENID = 'openid';
export const SCOPE_PROFILE = 'profile';
export const SCOPE_CLOUD_APP = 'cloud:app';

/** Suggested OAuth scopes for a typical L5 app with Drive silo. */
export const PN_INTEGRATOR_SCOPES = [
  SCOPE_OPENID,
  SCOPE_PROFILE,
  SCOPE_CLOUD_APP
] as const;

export interface PnApiErrorBody {
  error?: string;
  error_description?: string;
  message?: string;
}

export class PnApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'PnApiError';
  }
}

export function normalizeApiEndpoint(endpoint?: string): string {
  return (endpoint || 'https://api.parnoir.com').replace(/\/$/, '');
}

export async function parseJsonResponse<T>(res: Response): Promise<T> {
  return res.json().catch(() => ({} as T));
}

export async function throwIfNotOk(res: Response, data: unknown): Promise<void> {
  if (res.ok) return;
  const body = (data && typeof data === 'object' ? data : {}) as PnApiErrorBody;
  const msg =
    body.error_description ||
    body.message ||
    body.error ||
    res.statusText ||
    `Request failed (${res.status})`;
  throw new PnApiError(msg, res.status, body.error);
}

export function authHeaders(accessToken: string, extra?: Record<string, string>): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    ...extra
  };
}

export function integratorAuthHeaders(
  ctx: IntegratorApiContext | string,
  extra?: Record<string, string>
): HeadersInit {
  const accessToken = typeof ctx === 'string' ? ctx : ctx.accessToken;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    ...extra
  };
  if (typeof ctx !== 'string' && ctx.cloudAccessToken) {
    headers['X-PN-Cloud-Access-Token'] = ctx.cloudAccessToken;
  }
  return headers;
}

export function apiKeyHeaders(apiKey: string, extra?: Record<string, string>): HeadersInit {
  return {
    'X-Api-Key': apiKey,
    ...extra
  };
}

export function buildQuery(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}
