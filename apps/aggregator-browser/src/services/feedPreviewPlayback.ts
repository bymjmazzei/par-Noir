/**
 * Public feed playback via CDN public-media route (signed R2 redirect).
 * No public-content decrypt / Drive peer fetch — CDN only.
 */
import { API_ENDPOINT } from '../config/api';
import type { FeedPreviewVariant } from '@par-noir/aggregator-domain';
import { PNOAuthService } from './pnOAuthService';

export function publicMediaUrl(
  fileId: string,
  variant: FeedPreviewVariant = 'sd'
): string {
  return `${API_ENDPOINT}/api/aggregator/public-media/${encodeURIComponent(fileId)}?variant=${variant}`;
}

export async function fetchPublicMediaBlob(
  fileId: string,
  variant: FeedPreviewVariant = 'sd'
): Promise<Blob> {
  const headers: Record<string, string> = {};
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
    redirect: 'follow',
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
