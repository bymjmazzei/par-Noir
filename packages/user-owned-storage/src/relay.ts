/**
 * HTTP contract between the device and a storage relay the user hosts
 * (apps/pn-storage-relay). The relay holds the FTPS/SFTP login; the device
 * holds only the relay URL and bearer token, sealed in its cloud vault.
 *
 * Keys are relative to the relay's RELAY_PREFIX; the relay refuses any key
 * that could escape it.
 */

export const RELAY_PROTOCOL_VERSION = 1;

export const RELAY_PATHS = {
  health: '/v1/health',
  /** GET, HEAD, PUT, DELETE with `?key=` */
  blob: '/v1/blob',
  /** GET with `?prefix=` */
  list: '/v1/list',
} as const;

export type RelayBackendKind = 'ftps' | 'sftp';

export interface RelayHealth {
  ok: true;
  protocol: typeof RELAY_PROTOCOL_VERSION;
  backend: RelayBackendKind;
  prefix: string;
}

export interface RelayListEntry {
  key: string;
  size: number;
  lastModified?: string;
}

export interface RelayListResponse {
  entries: RelayListEntry[];
}

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

export interface RelayErrorBody {
  error: RelayErrorCode;
  message: string;
}

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

/** Headers the relay must expose to browsers for conditional writes. */
export const RELAY_EXPOSED_HEADERS = ['ETag', 'Last-Modified', 'Content-Length'] as const;

/** Relative, slash-separated, no empty / `.` / `..` segments, no backslashes or control characters. */
export function isRelayKeySafe(key: string): boolean {
  if (!key || key.startsWith('/') || key.includes('\\')) return false;
  if (/[\u0000-\u001f]/.test(key)) return false;
  const parts = key.replace(/\/$/, '').split('/');
  return parts.every((p) => p !== '' && p !== '.' && p !== '..');
}

export function isRelayErrorBody(value: unknown): value is RelayErrorBody {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as RelayErrorBody).error === 'string' &&
    (value as RelayErrorBody).error in RELAY_ERROR_STATUS
  );
}
