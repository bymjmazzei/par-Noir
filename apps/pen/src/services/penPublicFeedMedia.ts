/**
 * Minimal CDN public-media resolve for Pen templates feed.
 * Does not import aggregator-browser; no full metering/cache port.
 */

import type { FeedPreviewVariant } from '@par-noir/aggregator-domain';
import { API_ENDPOINT } from '../config/api';

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

function anonId(): string {
  let anon = sessionStorage.getItem('pn_anon_id');
  if (!anon) {
    anon = crypto.randomUUID();
    sessionStorage.setItem('pn_anon_id', anon);
  }
  return anon;
}

/**
 * Resolve a playable/display URL for a public feed variant (signed R2 GET).
 * Returns the signed https URL directly (no blob cache) for simplicity.
 */
export async function resolvePublicMediaSignedUrl(
  fileId: string,
  variant: FeedPreviewVariant = 'sd',
  accessToken?: string | null
): Promise<string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-PN-Anon-Id': anonId()
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(publicMediaUrl(fileId, variant), {
    headers,
    redirect: 'error'
  });
  if (!res.ok) throw new Error(`public_media_${res.status}`);
  const body = (await res.json()) as { url?: unknown };
  const url = typeof body.url === 'string' ? body.url : '';
  if (!url || !isAllowedFeedMediaSignedUrl(url)) {
    throw new Error('public_media_bad_url');
  }
  return url;
}
