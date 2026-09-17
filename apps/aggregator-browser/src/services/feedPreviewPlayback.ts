/**
 * Public feed playback via CDN public-media route (signed R2 URL).
 * Metering headers stay on the API hop only; R2 is fetched without custom headers.
 * Session cache holds blob object URLs so feed switches reuse media without re-sign.
 */
import { API_ENDPOINT } from '../config/api';
import type { FeedPreviewVariant } from '@par-noir/aggregator-domain';
import { PNOAuthService } from './pnOAuthService';
import { feedMediaSessionCache } from './feedMediaSessionCache';

export function publicMediaUrl(
  fileId: string,
  variant: FeedPreviewVariant = 'sd'
): string {
  return `${API_ENDPOINT}/api/aggregator/public-media/${encodeURIComponent(fileId)}?variant=${variant}`;
}

/** Signed feed preview hosts only — never follow arbitrary Location from JSON. */
export function isAllowedFeedMediaSignedUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    return (
      h.endsWith('.r2.cloudflarestorage.com') ||
      h === 'feed-media.parnoir.com' ||
      h.endsWith('.r2.dev')
    );
  } catch {
    return false;
  }
}

async function fetchPublicMediaFromNetwork(
  fileId: string,
  variant: FeedPreviewVariant
): Promise<Blob> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  try {
    const token = await PNOAuthService.getValidAccessToken(false);
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    /* anonymous ok */
  }
  let anon = sessionStorage.getItem('pn_anon_id');
  if (!anon) {
    anon = crypto.randomUUID();
    sessionStorage.setItem('pn_anon_id', anon);
  }
  headers['X-PN-Anon-Id'] = anon;

  const res = await fetch(publicMediaUrl(fileId, variant), {
    headers,
    redirect: 'error',
  });
  if (res.status === 429) {
    const body = await res.json().catch(() => ({}));
    const err = new Error((body as { error?: string }).error || 'daily_view_cap') as Error & {
      code?: string;
    };
    err.code = (body as { error?: string }).error || 'daily_view_cap';
    throw err;
  }
  if (!res.ok) {
    throw new Error(`public_media_${res.status}`);
  }
  const body = (await res.json()) as { url?: unknown };
  const url = typeof body.url === 'string' ? body.url : '';
  if (!url || !isAllowedFeedMediaSignedUrl(url)) {
    throw new Error('public_media_bad_url');
  }

  const media = await fetch(url);
  if (!media.ok) {
    throw new Error(`feed_media_${media.status}`);
  }
  return media.blob();
}

/**
 * Resolve a stable blob: object URL for display. Hits session cache when warm.
 */
export async function resolvePublicMediaObjectUrl(
  fileId: string,
  variant: FeedPreviewVariant = 'sd'
): Promise<string> {
  const hit = feedMediaSessionCache.getObjectUrl(fileId, variant);
  if (hit) return hit;

  const blob = await fetchPublicMediaFromNetwork(fileId, variant);
  const objectUrl = URL.createObjectURL(blob);
  feedMediaSessionCache.set(fileId, variant, objectUrl);
  return objectUrl;
}

export async function fetchPublicMediaBlob(
  fileId: string,
  variant: FeedPreviewVariant = 'sd'
): Promise<Blob> {
  const objectUrl = await resolvePublicMediaObjectUrl(fileId, variant);
  const res = await fetch(objectUrl);
  if (!res.ok) {
    throw new Error(`feed_media_blob_${res.status}`);
  }
  return res.blob();
}

export function hasFeedPreviewPlayback(metadata: {
  feedPoster?: unknown;
  feedPreviewSd?: unknown;
} | null | undefined): boolean {
  return Boolean(metadata?.feedPoster || metadata?.feedPreviewSd);
}

export type FeedPlaybackMetadata = {
  feedPoster?: unknown;
  feedPreviewSd?: unknown;
  feedPreviewHd?: unknown;
  fileType?: string;
  name?: string;
  title?: string;
  isPublic?: boolean | string;
};

/** Resolve variant for display: poster for images/thumbs, sd (or hd) for video. */
export function feedPlaybackVariant(
  metadata: FeedPlaybackMetadata | null | undefined,
  preferred?: FeedPreviewVariant
): FeedPreviewVariant {
  if (preferred === 'poster' || preferred === 'hd' || preferred === 'sd') {
    if (preferred === 'hd' && !metadata?.feedPreviewHd) {
      return metadata?.feedPreviewSd ? 'sd' : 'poster';
    }
    if (preferred === 'sd' && !metadata?.feedPreviewSd) {
      return 'poster';
    }
    return preferred;
  }
  const ft = String(metadata?.fileType || '').toLowerCase();
  const name = String(metadata?.name || metadata?.title || '').toLowerCase();
  const sdCt =
    metadata?.feedPreviewSd && typeof metadata.feedPreviewSd === 'object'
      ? String((metadata.feedPreviewSd as { contentType?: string }).contentType || '')
      : '';
  const isVideo =
    ft === 'video' ||
    /\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i.test(name) ||
    sdCt.startsWith('video/');
  if (isVideo && metadata?.feedPreviewSd) return 'sd';
  return 'poster';
}

/**
 * CDN-only public feed load. Throws feed_preview_required when refs missing.
 */
export async function loadPublicFeedMediaBlob(
  fileId: string,
  metadata: FeedPlaybackMetadata,
  opts?: { variant?: FeedPreviewVariant; titleHint?: string }
): Promise<Blob> {
  if (!hasFeedPreviewPlayback(metadata)) {
    throw new Error('feed_preview_required');
  }
  const variant = feedPlaybackVariant(metadata, opts?.variant);
  return fetchPublicMediaBlob(fileId, variant);
}

export async function resolvePublicFeedObjectUrl(
  fileId: string,
  metadata: FeedPlaybackMetadata,
  opts?: { variant?: FeedPreviewVariant }
): Promise<string> {
  if (!hasFeedPreviewPlayback(metadata)) {
    throw new Error('feed_preview_required');
  }
  const variant = feedPlaybackVariant(metadata, opts?.variant);
  return resolvePublicMediaObjectUrl(fileId, variant);
}
