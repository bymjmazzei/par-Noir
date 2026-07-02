/** Pause messaging polls/refetches after a Sheets quota 503 from the API. */

const BACKOFF_MS = 60_000;
let rateLimitedUntil = 0;

export function setMessagingRateLimited(durationMs = BACKOFF_MS): void {
  rateLimitedUntil = Date.now() + durationMs;
}

export function isMessagingRateLimited(): boolean {
  return Date.now() < rateLimitedUntil;
}

export function clearMessagingRateLimit(): void {
  rateLimitedUntil = 0;
}
