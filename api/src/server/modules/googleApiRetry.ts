/**
 * Retry transient Google API failures (503 unavailable, 429 rate limit, 500).
 */

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableGoogleError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (/service is currently unavailable/i.test(msg)) return true;
  if (/rate limit/i.test(msg)) return true;
  const status =
    (err as { code?: number; status?: number })?.code ??
    (err as { response?: { status?: number } })?.response?.status;
  return typeof status === 'number' && RETRYABLE_STATUSES.has(status);
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
        throw err;
      }
      const delayMs = Math.min(30_000, 1000 * 2 ** (attempt - 1));
      console.warn(
        `[GoogleRetry] ${label} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms:`,
        err instanceof Error ? err.message : err
      );
      await sleep(delayMs);
    }
  }
  throw lastErr;
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
    return res;
  });
}
