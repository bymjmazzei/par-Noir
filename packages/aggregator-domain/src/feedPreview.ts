/**
 * Feed preview CDN refs, encode budgets, and verified publish slider tiers.
 */

export type FeedPreviewVariant = 'poster' | 'sd' | 'hd';

/** Opaque R2 object + optional owner-cloud canonical (pull-through source). */
export interface FeedPreviewObjectRef {
  /** R2 object key (warm CDN). Empty/missing when cold for sd/hd. */
  r2Key?: string;
  /**
   * Owner-cloud object id for canonical plaintext preview (not exposed as Drive URL to clients).
   * Used by API pull-through only.
   */
  ownerObjectId?: string;
  /** Backend for owner canonical (e.g. google_drive). */
  ownerBackend?: string;
  /**
   * Blind-proxyable public URL for owner canonical — API-only; strip before client index if needed.
   * Prefer server-side lookup from metadata store over shipping this to browsers.
   */
  ownerPublicUrl?: string;
  contentType: string;
  byteSize: number;
  width?: number;
  height?: number;
  durationMs?: number;
  /** ISO time of last successful SD/HD play (warmth). */
  lastPlayedAt?: string;
  /** False when SD/HD evicted from R2; poster should remain warm. */
  r2Warm?: boolean;
}

export interface FeedPreviewRefs {
  feedPoster?: FeedPreviewObjectRef;
  feedPreviewSd?: FeedPreviewObjectRef;
  feedPreviewHd?: FeedPreviewObjectRef;
}

export const FEED_PREVIEW_POSTER_MAX_BYTES = 204_800;
export const FEED_PREVIEW_SD_SOFT_BYTES = 2_621_440; // 2.5 MiB
export const FEED_PREVIEW_SD_MAX_BYTES = 4_194_304; // 4 MiB
export const FEED_PREVIEW_HD_SOFT_BYTES = 6_291_456; // 6 MiB
export const FEED_PREVIEW_HD_MAX_BYTES = 10_485_760; // 10 MiB
export const FEED_PREVIEW_SD_MAX_HEIGHT = 720;
export const FEED_PREVIEW_HD_MAX_HEIGHT_DEFAULT = 720;
export const FEED_PREVIEW_HD_MAX_HEIGHT_INDIE = 1080;

export const FEED_FREE_DAILY_VIEW_STARTS = 80;
export const FEED_FREE_DAILY_MB = 250;
export const FEED_R2_SD_HD_IDLE_EVICT_DAYS = 30;

export type PublishTierId =
  | 'free'
  | 'floor'
  | 'average_creator'
  | 'creator_plus'
  | 'heavy'
  | 'indie'
  | 'indie_plus'
  | 'scale';

export interface PublishTierNotch {
  id: PublishTierId;
  /** Display / Stripe retail USD per month */
  retailUsd: number;
  /** Max single-post duration (seconds) */
  maxDurationSec: number;
  maxHeight: number;
  /** Monthly preview ingest allowance (bytes) */
  uploadBytesPerMonth: number;
  /** Allow HD preview object at publish */
  allowHd: boolean;
}

/** Discrete slider snaps — no orphan prices between $9 and $20. */
export const PUBLISH_TIER_NOTCHES: readonly PublishTierNotch[] = [
  {
    id: 'free',
    retailUsd: 0,
    maxDurationSec: 60,
    maxHeight: 720,
    uploadBytesPerMonth: Math.floor(0.5 * 1024 * 1024 * 1024),
    allowHd: false,
  },
  {
    id: 'floor',
    retailUsd: 9,
    maxDurationSec: 60,
    maxHeight: 720,
    uploadBytesPerMonth: 1 * 1024 * 1024 * 1024,
    allowHd: true,
  },
  {
    id: 'average_creator',
    retailUsd: 20,
    maxDurationSec: 3 * 60,
    maxHeight: 720,
    uploadBytesPerMonth: 5 * 1024 * 1024 * 1024,
    allowHd: true,
  },
  {
    id: 'creator_plus',
    retailUsd: 39,
    maxDurationSec: 10 * 60,
    maxHeight: 720,
    uploadBytesPerMonth: 50 * 1024 * 1024 * 1024,
    allowHd: true,
  },
  {
    id: 'heavy',
    retailUsd: 55,
    maxDurationSec: 10 * 60,
    maxHeight: 720,
    uploadBytesPerMonth: 100 * 1024 * 1024 * 1024,
    allowHd: true,
  },
  {
    id: 'indie',
    retailUsd: 149,
    maxDurationSec: 30 * 60,
    maxHeight: 1080,
    uploadBytesPerMonth: 200 * 1024 * 1024 * 1024,
    allowHd: true,
  },
  {
    id: 'indie_plus',
    retailUsd: 219,
    maxDurationSec: 30 * 60,
    maxHeight: 1080,
    uploadBytesPerMonth: 500 * 1024 * 1024 * 1024,
    allowHd: true,
  },
  {
    id: 'scale',
    retailUsd: 599,
    maxDurationSec: 30 * 60,
    maxHeight: 1080,
    uploadBytesPerMonth: 2000 * 1024 * 1024 * 1024,
    allowHd: true,
  },
] as const;

export const FEED_PREVIEW_GB_OVERAGE_USD = 0.25;

export function getPublishTier(id: PublishTierId | string | undefined | null): PublishTierNotch {
  const found = PUBLISH_TIER_NOTCHES.find((n) => n.id === id);
  return found ?? PUBLISH_TIER_NOTCHES[0]!;
}

export function maxBytesForVariant(variant: FeedPreviewVariant): number {
  if (variant === 'poster') return FEED_PREVIEW_POSTER_MAX_BYTES;
  if (variant === 'hd') return FEED_PREVIEW_HD_MAX_BYTES;
  return FEED_PREVIEW_SD_MAX_BYTES;
}

export function softBytesForVariant(variant: FeedPreviewVariant): number {
  if (variant === 'poster') return FEED_PREVIEW_POSTER_MAX_BYTES;
  if (variant === 'hd') return FEED_PREVIEW_HD_SOFT_BYTES;
  return FEED_PREVIEW_SD_SOFT_BYTES;
}

export function isFeedPreviewObjectRef(value: unknown): value is FeedPreviewObjectRef {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.contentType === 'string' &&
    v.contentType.length > 0 &&
    typeof v.byteSize === 'number' &&
    Number.isFinite(v.byteSize) &&
    v.byteSize >= 0
  );
}

export function validateFeedPreviewByteSize(
  variant: FeedPreviewVariant,
  byteSize: number
): { ok: true } | { ok: false; error: string } {
  const max = maxBytesForVariant(variant);
  if (!Number.isFinite(byteSize) || byteSize < 0) {
    return { ok: false, error: 'invalid_byte_size' };
  }
  if (byteSize > max) {
    return { ok: false, error: `exceeds_${variant}_max_bytes` };
  }
  return { ok: true };
}

/**
 * Soft degrade: when monthly GB is exhausted, treat publisher as free ceilings for new encodes.
 */
export function effectivePublishTier(params: {
  planId: PublishTierId | string;
  gbUsedBytes: number;
  softDegrade?: boolean;
}): PublishTierNotch {
  const plan = getPublishTier(params.planId);
  if (plan.id === 'free') return plan;
  const over = params.gbUsedBytes >= plan.uploadBytesPerMonth;
  if (over && params.softDegrade !== false) {
    return {
      ...getPublishTier('free'),
      id: plan.id,
      retailUsd: plan.retailUsd,
    };
  }
  return plan;
}

export type PublicVideoPreviewRequirement =
  | { ok: true }
  | { ok: false; error: string };

/** Public video requires poster + SD under byte caps; canonical owner ref for SD required for cold pull-through. */
export function requirePublicVideoFeedPreviews(
  refs: FeedPreviewRefs | null | undefined,
  opts?: { requireOwnerCanonical?: boolean }
): PublicVideoPreviewRequirement {
  if (!refs?.feedPoster || !isFeedPreviewObjectRef(refs.feedPoster)) {
    return { ok: false, error: 'feed_poster_required' };
  }
  if (!refs.feedPreviewSd || !isFeedPreviewObjectRef(refs.feedPreviewSd)) {
    return { ok: false, error: 'feed_preview_sd_required' };
  }
  const posterSz = validateFeedPreviewByteSize('poster', refs.feedPoster.byteSize);
  if (!posterSz.ok) return posterSz;
  const sdSz = validateFeedPreviewByteSize('sd', refs.feedPreviewSd.byteSize);
  if (!sdSz.ok) return sdSz;
  if (refs.feedPreviewHd) {
    if (!isFeedPreviewObjectRef(refs.feedPreviewHd)) {
      return { ok: false, error: 'feed_preview_hd_invalid' };
    }
    const hdSz = validateFeedPreviewByteSize('hd', refs.feedPreviewHd.byteSize);
    if (!hdSz.ok) return hdSz;
  }
  if (opts?.requireOwnerCanonical !== false) {
    if (!refs.feedPreviewSd.ownerObjectId) {
      return { ok: false, error: 'feed_preview_sd_canonical_required' };
    }
  }
  return { ok: true };
}

/** Image / thought: poster only. */
export function requirePublicImageFeedPreviews(
  refs: FeedPreviewRefs | null | undefined
): PublicVideoPreviewRequirement {
  if (!refs?.feedPoster || !isFeedPreviewObjectRef(refs.feedPoster)) {
    return { ok: false, error: 'feed_poster_required' };
  }
  return validateFeedPreviewByteSize('poster', refs.feedPoster.byteSize);
}

export function r2ObjectKey(fileId: string, variant: FeedPreviewVariant, suffix?: string): string {
  const safe = fileId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  const s = suffix ? `-${suffix}` : '';
  return `feed/${safe}/${variant}${s}`;
}
