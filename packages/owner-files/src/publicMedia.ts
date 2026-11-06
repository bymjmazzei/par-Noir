/**
 * Feed CDN (`/api/aggregator/public-media/:fileId`) helpers shared by browse and dashboard.
 */
import type { FeedPreviewVariant } from '@par-noir/aggregator-domain';

export const PEN_APP_ORIGIN = 'https://pen.parnoir.com';

export function publicMediaPath(fileId: string, variant: FeedPreviewVariant): string {
  return `/api/aggregator/public-media/${encodeURIComponent(fileId)}?variant=${variant}`;
}

/** Signed URLs from the API must point at our R2 / feed-media hosts. */
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

export function hasFeedPreview(metadata: Record<string, unknown> | null | undefined): boolean {
  return Boolean(metadata?.feedPoster || metadata?.feedPreviewSd);
}

export function penDocUrl(penDocId: string, origin: string = PEN_APP_ORIGIN): string {
  return `${origin.replace(/\/$/, '')}/d/${encodeURIComponent(penDocId)}`;
}
