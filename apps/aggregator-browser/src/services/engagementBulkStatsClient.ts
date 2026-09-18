import { API_ENDPOINT } from '../config/api';
import { PNOAuthService } from './pnOAuthService';

const bulkStatsInflight = new Map<string, Promise<BulkEngagementStatsResult>>();

export interface BulkEngagementStatsResult {
  stats: Record<string, { shares?: number; likes?: number; comments?: number }>;
  likedFiles: string[];
}

export function bulkStatsRequestKey(pnIdentifier: string | undefined, fileIds: string[]): string {
  const pn =
    pnIdentifier && !pnIdentifier.startsWith('did:key:')
      ? pnIdentifier.startsWith('pn-')
        ? pnIdentifier.slice(3)
        : pnIdentifier
      : 'anon';
  return `${pn}:${[...fileIds].sort().join(',')}`;
}

/** Test-only. */
export function resetBulkStatsInflightForTests(): void {
  bulkStatsInflight.clear();
}

export async function fetchBulkEngagementStats(
  fileIds: string[],
  userPnIdentifier?: string
): Promise<BulkEngagementStatsResult> {
  if (fileIds.length === 0) {
    return { stats: {}, likedFiles: [] };
  }

  const requestKey = bulkStatsRequestKey(userPnIdentifier, fileIds);
  const existing = bulkStatsInflight.get(requestKey);
  if (existing) return existing;

  const work = (async (): Promise<BulkEngagementStatsResult> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      const token = await PNOAuthService.getValidAccessToken(false);
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch {
      /* anonymous ok — public stats */
    }

    const response = await fetch(`${API_ENDPOINT}/api/engagement/bulk-stats`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ fileIds, userPnIdentifier })
    });

    if (response.status === 429 || !response.ok) {
      return { stats: {}, likedFiles: [] };
    }

    const result = await response.json();
    return {
      stats: result.stats || {},
      likedFiles: Array.isArray(result.likedFiles) ? result.likedFiles : []
    };
  })().finally(() => {
    bulkStatsInflight.delete(requestKey);
  });

  bulkStatsInflight.set(requestKey, work);
  return work;
}
