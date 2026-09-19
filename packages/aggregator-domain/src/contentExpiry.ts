/**
 * Normalize content expiry fields for public metadata index submissions.
 */

export interface ContentExpiryInput {
  expiresAt?: string | null;
  ttlSeconds?: number | null;
  persistOnDiscover?: boolean | null;
}

export interface NormalizedContentExpiry {
  expiresAt: string | null;
  persistOnDiscover: boolean;
}

export class ContentExpiryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ContentExpiryError';
    this.code = code;
  }
}

/**
 * Resolve expiresAt / ttlSeconds / persistOnDiscover.
 * - omit both expiresAt and ttlSeconds → never expires (expiresAt null)
 * - ttlSeconds → expiresAt = now + ttl
 * - expiresAt must be strictly in the future when set
 * - persistOnDiscover defaults false
 */
export function normalizeContentExpiry(
  input: ContentExpiryInput,
  now: Date = new Date()
): NormalizedContentExpiry {
  const persistOnDiscover = input.persistOnDiscover === true;
  const nowMs = now.getTime();

  const hasTtl =
    input.ttlSeconds !== undefined && input.ttlSeconds !== null && Number.isFinite(Number(input.ttlSeconds));
  const rawExpires =
    input.expiresAt === undefined || input.expiresAt === null || String(input.expiresAt).trim() === ''
      ? null
      : String(input.expiresAt).trim();

  if (hasTtl) {
    const ttl = Number(input.ttlSeconds);
    if (!Number.isFinite(ttl) || ttl <= 0) {
      throw new ContentExpiryError('invalid_ttl', 'ttlSeconds must be a positive number');
    }
    const expiresAt = new Date(nowMs + ttl * 1000).toISOString();
    return { expiresAt, persistOnDiscover };
  }

  if (rawExpires === null) {
    return { expiresAt: null, persistOnDiscover };
  }

  const parsed = Date.parse(rawExpires);
  if (!Number.isFinite(parsed)) {
    throw new ContentExpiryError('invalid_expires_at', 'expiresAt must be a valid ISO timestamp');
  }
  if (parsed <= nowMs) {
    throw new ContentExpiryError('expires_at_in_past', 'expiresAt must be in the future');
  }

  return { expiresAt: new Date(parsed).toISOString(), persistOnDiscover };
}

/** True when expiresAt is set and strictly before now. */
export function isContentExpired(
  expiresAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!expiresAt || !String(expiresAt).trim()) return false;
  const parsed = Date.parse(String(expiresAt));
  if (!Number.isFinite(parsed)) return false;
  return parsed < now.getTime();
}

/** Community / indexerId GET: hide when expired. */
export function shouldHideFromIndexerFeed(
  expiresAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  return isContentExpired(expiresAt, now);
}

/**
 * Discover (no indexerId): hide when expired unless persistOnDiscover.
 */
export function shouldHideFromDiscoverFeed(
  expiresAt: string | null | undefined,
  persistOnDiscover: boolean | null | undefined,
  now: Date = new Date()
): boolean {
  if (!isContentExpired(expiresAt, now)) return false;
  return persistOnDiscover !== true;
}

/**
 * Lazy durable flip: expired + still public + not persistOnDiscover → set isPublic false.
 */
export function shouldFlipExpiredToPrivate(
  isPublic: boolean | null | undefined,
  expiresAt: string | null | undefined,
  persistOnDiscover: boolean | null | undefined,
  now: Date = new Date()
): boolean {
  if (isPublic !== true) return false;
  if (persistOnDiscover === true) return false;
  return isContentExpired(expiresAt, now);
}
