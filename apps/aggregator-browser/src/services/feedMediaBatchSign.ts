/**
 * Batch-sign warm posters then fill session media cache (cold first-screen win).
 */
import { API_ENDPOINT } from '../config/api';
import { PNOAuthService } from './pnOAuthService';
import { feedMediaSessionCache } from './feedMediaSessionCache';
import { isAllowedFeedMediaSignedUrl, FeedMediaNetworkError } from './feedPreviewPlayback';

const BATCH_CAP = 12;

type BatchSignOk = {
  fileId: string;
  variant: string;
  url: string;
  expiresInSec?: number;
};
type BatchSignErr = { fileId: string; error: string; status?: number };

function anonHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let anon = sessionStorage.getItem('pn_anon_id');
  if (!anon) {
    anon = crypto.randomUUID();
    sessionStorage.setItem('pn_anon_id', anon);
  }
  headers['X-PN-Anon-Id'] = anon;
  return headers;
}

/**
 * Sign up to 12 posters in one API call and cache blob object URLs.
 * Skips ids already in session cache. Returns count warmed.
 */
export async function batchSignAndCachePosters(fileIds: string[]): Promise<number> {
  const unique = [...new Set(fileIds.filter(Boolean))].slice(0, BATCH_CAP);
  const need = unique.filter((id) => !feedMediaSessionCache.getObjectUrl(id, 'poster'));
  if (need.length === 0) return 0;

  const headers = anonHeaders();
  try {
    const token = await PNOAuthService.getValidAccessToken(false);
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    /* anonymous ok */
  }

  let res: Response;
  try {
    res = await fetch(`${API_ENDPOINT}/api/aggregator/feed-media/batch-sign`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: need.map((fileId) => ({ fileId, variant: 'poster' })),
      }),
    });
  } catch (err) {
    throw new FeedMediaNetworkError(
      err instanceof Error ? err.message : 'batch_sign_fetch_failed'
    );
  }
  if (!res.ok) {
    throw new Error(`batch_sign_${res.status}`);
  }
  const body = (await res.json()) as { results?: Array<BatchSignOk | BatchSignErr> };
  const results = Array.isArray(body.results) ? body.results : [];

  let warmed = 0;
  await Promise.all(
    results.map(async (row) => {
      if (!row || typeof row !== 'object' || !('url' in row) || typeof row.url !== 'string') {
        return;
      }
      if (!isAllowedFeedMediaSignedUrl(row.url)) return;
      if (feedMediaSessionCache.getObjectUrl(row.fileId, 'poster')) return;
      try {
        const media = await fetch(row.url);
        if (!media.ok) return;
        const blob = await media.blob();
        const objectUrl = URL.createObjectURL(blob);
        feedMediaSessionCache.set(row.fileId, 'poster', objectUrl);
        warmed += 1;
      } catch {
        /* leave cold; single public-media will retry */
      }
    })
  );
  return warmed;
}
