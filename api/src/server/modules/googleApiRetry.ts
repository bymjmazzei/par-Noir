/**
 * Retry transient Google API failures (503 unavailable, 429 rate limit, 500).
 */

import type { GoogleDriveToken } from './googleOAuth2Helper';
import { DriveIndexError } from './pnDriveIndex';

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

/** Bounded concurrency for independent metadata/index sheet ensures during Drive init. */
export const DRIVE_INIT_SHEET_CONCURRENCY = 4;

/**
 * Map items with a concurrency cap. Preserves result order.
 * Rejects on first failure and stops starting new work (in-flight may still finish).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const concurrency = Math.max(1, Math.min(limit, items.length));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  let failed = false;
  let firstError: unknown;

  async function worker(): Promise<void> {
    while (true) {
      if (failed) return;
      const i = nextIndex++;
      if (i >= items.length) return;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        if (!failed) {
          failed = true;
          firstError = err;
        }
        return;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  if (failed) throw firstError;
  return results;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isGoogleSheetsPerMinuteQuota(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (/Read requests per minute per user/i.test(msg)) return true;
  if (/Write requests per minute per user/i.test(msg)) return true;
  const status =
    (err as { code?: number; response?: { status?: number } })?.code ??
    (err as { response?: { status?: number } })?.response?.status;
  return status === 429;
}

export function isRetryableGoogleError(err: unknown): boolean {
  // Per-minute Sheets quota needs ~60s to recover; immediate retries amplify pressure.
  if (isGoogleSheetsPerMinuteQuota(err)) return false;
  const msg = err instanceof Error ? err.message : String(err);
  if (/service is currently unavailable/i.test(msg)) return true;
  if (/layout incomplete after init/i.test(msg)) return true;
  const code = (err as { code?: string })?.code;
  if (code === 'DRIVE_LAYOUT_INCOMPLETE') return true;
  const status =
    (err as { code?: number; status?: number })?.code ??
    (err as { response?: { status?: number } })?.response?.status;
  return typeof status === 'number' && RETRYABLE_STATUSES.has(status);
}

/**
 * Recognise a credential rejection thrown by the googleapis client.
 *
 * That client throws rather than returning a Response, so the raw-fetch check
 * below never sees these. Both spellings have to agree or Sheets-backed paths
 * keep reporting an expired token as a server fault.
 */
export function isGoogleCredentialRejectionError(err: unknown): boolean {
  const status =
    (err as { status?: number })?.status ??
    (err as { code?: unknown })?.code ??
    (err as { response?: { status?: number } })?.response?.status;
  const message = err instanceof Error ? err.message : String(err);
  if (status === 401) return true;
  if (status === 403) return isGoogleCredentialRejection(403, message);
  return /invalid_grant|invalid credentials|Invalid Credentials/i.test(message);
}

/** Convert a credential rejection to DriveIndexError; pass anything else through. */
export function translateGoogleCredentialError(err: unknown): unknown {
  if (err instanceof DriveIndexError) return err;
  if (!isGoogleCredentialRejectionError(err)) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new DriveIndexError(
    `Google rejected the Drive access token: ${message.slice(0, 120)}`,
    'CLOUD_TOKEN_EXPIRED'
  );
}

export async function withGoogleRetry<T>(
  label: string,
  fn: () => Promise<T>,
  maxAttempts = 5
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      if (!isRetryableGoogleError(err) || attempt === maxAttempts) {
        throw translateGoogleCredentialError(err);
      }
      const delayMs = Math.min(30_000, 1000 * 2 ** (attempt - 1));
      console.warn(
        `[GoogleRetry] ${label} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms:`,
        err instanceof Error ? err.message : err
      );
      await sleep(delayMs);
    }
  }
  throw translateGoogleCredentialError(lastErr);
}

/**
 * True when Google refused the credential itself rather than the request.
 *
 * A 403 is only a credential problem for the auth-flavoured reasons; quota and
 * permission 403s are different failures and must not be reported as an expired
 * token.
 */
export function isGoogleCredentialRejection(status: number, body: string): boolean {
  if (status === 401) return true;
  if (status !== 403) return false;
  return /invalid_credentials|authError|invalid authentication|insufficientPermissions/i.test(body);
}

/**
 * Raised when Google rejects the forwarded owner token.
 *
 * Callers map this to 409 cloud_token_required so the device knows to refresh
 * and retry. Letting it fall through as a 500 hid an expired token behind what
 * looked like a server fault.
 */
export function driveCredentialRejected(status: number, body: string): DriveIndexError {
  return new DriveIndexError(
    `Google rejected the Drive access token (${status}): ${body.slice(0, 120)}`,
    'CLOUD_TOKEN_EXPIRED'
  );
}

/**
 * Turn a Google credential rejection into CLOUD_TOKEN_EXPIRED before the caller
 * can mistake it for a generic failure.
 *
 * Use on any Google response reached with a forwarded owner token. The response
 * is cloned, so the caller can still read the body.
 */
export async function throwIfCredentialRejected(res: Response): Promise<void> {
  if (res.status !== 401 && res.status !== 403) return;
  const text = await res.clone().text().catch(() => '');
  if (isGoogleCredentialRejection(res.status, text)) {
    throw driveCredentialRejected(res.status, text);
  }
}

/** fetch wrapper with retry for Drive v3 REST calls used during init. */
export async function fetchGoogleDriveWithRetry(
  url: string,
  init: RequestInit,
  label: string
): Promise<Response> {
  return withGoogleRetry(label, async () => {
    const res = await fetch(url, init);
    if (res.status === 429 || res.status >= 500) {
      const text = await res.text().catch(() => '');
      const err = new Error(`Google Drive ${res.status}: ${text.slice(0, 200)}`);
      (err as { code?: number }).code = res.status;
      throw err;
    }
    if (res.status === 401 || res.status === 403) {
      const text = await res.clone().text().catch(() => '');
      if (isGoogleCredentialRejection(res.status, text)) {
        // Not retryable: a new token has to come from the device.
        throw driveCredentialRejected(res.status, text);
      }
    }
    return res;
  });
}

/** Drive v3 path helper (init-only). */
export async function driveV3FetchWithRetry(
  accessToken: string,
  path: string,
  init: RequestInit | undefined,
  label: string
): Promise<Response> {
  return fetchGoogleDriveWithRetry(
    `https://www.googleapis.com/drive/v3${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    },
    label
  );
}

export async function setPublicPermissionWithRetry(
  accessToken: string,
  fileId: string,
  label: string
): Promise<void> {
  const res = await fetchGoogleDriveWithRetry(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    },
    label
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to set public permission on ${fileId}: ${res.status} ${text.slice(0, 200)}`);
  }
}

export type ContentClassName = 'media' | 'thoughts' | 'collections';

/** Get-or-create index sheet in a folder with per-step retry (init-only). */
export async function ensureIndexSheetInFolder(
  label: string,
  token: GoogleDriveToken,
  folderId: string,
  indexType: 'public' | 'owner',
  userPnIdentifier: string,
  accountId: string | undefined,
  contentClass?: ContentClassName
): Promise<string> {
  const { IndexSheetsService } = await import('./indexSheetsService');
  try {
    return await withGoogleRetry(`${label}:get`, () =>
      IndexSheetsService.getIndexSheet(
        token,
        folderId,
        indexType,
        userPnIdentifier,
        accountId,
        contentClass
      )
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('not found') || msg.toLowerCase().includes('not found')) {
      return withGoogleRetry(`${label}:create`, () =>
        IndexSheetsService.createIndexSheet(
          token,
          folderId,
          indexType,
          userPnIdentifier,
          accountId,
          contentClass
        )
      );
    }
    throw error;
  }
}
