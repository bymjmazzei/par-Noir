/**
 * Strip API-only feed preview fields before any client-facing index JSON.
 */
import {
  isFeedPreviewObjectRef,
  requirePublicImageFeedPreviews,
  requirePublicVideoFeedPreviews,
  type FeedPreviewObjectRef,
  type FeedPreviewRefs,
} from '@par-noir/aggregator-domain';

/** Strip ownerPublicUrl before any client-facing JSON. */
export function redactFeedPreviewForClient(
  ref: FeedPreviewObjectRef | null | undefined
): FeedPreviewObjectRef | null {
  if (!ref) return null;
  const { ownerPublicUrl: _drop, ...rest } = ref as FeedPreviewObjectRef & {
    ownerPublicUrl?: string;
  };
  return rest;
}

export function redactFeedPreviewFieldsInMetadata<T extends Record<string, unknown>>(
  metadata: T
): T {
  const out = { ...metadata } as T & FeedPreviewRefs;
  for (const key of ['feedPoster', 'feedPreviewSd', 'feedPreviewHd'] as const) {
    const v = out[key];
    if (v == null) continue;
    if (isFeedPreviewObjectRef(v)) {
      (out as any)[key] = redactFeedPreviewForClient(v);
    }
  }
  return out;
}

export function redactCentralIndexEntryForClient<T extends { metadata?: Record<string, unknown> }>(
  entry: T
): T {
  if (!entry?.metadata || typeof entry.metadata !== 'object') return entry;
  return {
    ...entry,
    metadata: redactFeedPreviewFieldsInMetadata(entry.metadata as Record<string, unknown>),
  };
}

/** Visual public media that must carry CDN feed preview refs. */
export function publicMediaPreviewKind(meta: {
  fileType?: string;
  name?: string;
  title?: string;
  mimeType?: string;
}): 'image' | 'video' | null {
  const ft = String(meta.fileType || '').toLowerCase();
  const mime = String(meta.mimeType || '').toLowerCase();
  const name = String(meta.name || meta.title || '').toLowerCase();
  if (ft === 'video' || mime.startsWith('video/')) return 'video';
  if (
    ft === 'image' ||
    ft === 'thought-thumbnail' ||
    ft === 'thought-collection' ||
    mime.startsWith('image/') ||
    name.startsWith('thumb_') ||
    /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(name)
  ) {
    return 'image';
  }
  return null;
}

/**
 * When isPublic and visual media, require feed preview refs.
 * Returns error code or null if OK / not applicable.
 */
export function validatePublicFeedPreviewRefs(meta: {
  isPublic?: boolean | string;
  fileType?: string;
  name?: string;
  title?: string;
  mimeType?: string;
  feedPoster?: unknown;
  feedPreviewSd?: unknown;
  feedPreviewHd?: unknown;
}): { ok: true } | { ok: false; error: string } {
  if (meta.isPublic !== true && meta.isPublic !== 'true') {
    return { ok: true };
  }
  const kind = publicMediaPreviewKind(meta);
  if (!kind) return { ok: true };
  const refs: FeedPreviewRefs = {
    feedPoster: isFeedPreviewObjectRef(meta.feedPoster)
      ? (meta.feedPoster as FeedPreviewObjectRef)
      : undefined,
    feedPreviewSd: isFeedPreviewObjectRef(meta.feedPreviewSd)
      ? (meta.feedPreviewSd as FeedPreviewObjectRef)
      : undefined,
    feedPreviewHd: isFeedPreviewObjectRef(meta.feedPreviewHd)
      ? (meta.feedPreviewHd as FeedPreviewObjectRef)
      : undefined,
  };
  if (kind === 'video') {
    return requirePublicVideoFeedPreviews(refs);
  }
  return requirePublicImageFeedPreviews(refs);
}
