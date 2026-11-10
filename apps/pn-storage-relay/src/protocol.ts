/**
 * Wire protocol. Mirrors packages/user-owned-storage/src/relay.ts, which the
 * device uses; contract.test.ts fails if the two drift. Kept as a copy so this
 * app builds on its own from its directory.
 */

export const RELAY_PROTOCOL_VERSION = 1;

export const RELAY_PATHS = {
  health: '/v1/health',
  blob: '/v1/blob',
  list: '/v1/list',
} as const;

export type RelayBackendKind = 'ftps' | 'sftp';

export type RelayErrorCode =
  | 'unauthorized'
  | 'origin_not_allowed'
  | 'bad_key'
  | 'not_found'
  | 'precondition_failed'
  | 'too_large'
  | 'backend_login_failed'
  | 'backend_permission_denied'
  | 'backend_unreachable'
  | 'backend_error';

export const RELAY_ERROR_STATUS: Record<RelayErrorCode, number> = {
  unauthorized: 401,
  origin_not_allowed: 403,
  bad_key: 400,
  not_found: 404,
  precondition_failed: 412,
  too_large: 413,
  backend_login_failed: 502,
  backend_permission_denied: 502,
  backend_unreachable: 504,
  backend_error: 502,
};

export const RELAY_EXPOSED_HEADERS = ['ETag', 'Last-Modified', 'Content-Length'] as const;

export function isRelayKeySafe(key: string): boolean {
  if (!key || key.startsWith('/') || key.includes('\\')) return false;
  if (/[\u0000-\u001f]/.test(key)) return false;
  const parts = key.replace(/\/$/, '').split('/');
  return parts.every((p) => p !== '' && p !== '.' && p !== '..');
}
