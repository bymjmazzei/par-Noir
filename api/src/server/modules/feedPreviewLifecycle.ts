/**
 * Evict idle SD/HD objects from R2; retain posters and metadata.
 */
import {
  FEED_R2_SD_HD_IDLE_EVICT_DAYS,
  isFeedPreviewObjectRef,
  type FeedPreviewObjectRef,
} from '@par-noir/aggregator-domain';
import { safeLogger } from '../../utils/logger';
import { feedR2Delete, getFeedR2, readFeedR2ConfigFromEnv } from './feedPreviewR2';

function idleDays(): number {
  const cfg = readFeedR2ConfigFromEnv();
  return cfg?.idleEvictDays ?? FEED_R2_SD_HD_IDLE_EVICT_DAYS;
}

function isIdle(ref: FeedPreviewObjectRef, now: number, maxIdleMs: number): boolean {
  if (ref.r2Warm === false || !ref.r2Key) return false;
  const ts = ref.lastPlayedAt ? Date.parse(ref.lastPlayedAt) : NaN;
  if (!Number.isFinite(ts)) {
    // Never played: use absence of lastPlayedAt as idle if warm — skip eviction without timestamp
    // to avoid deleting brand-new uploads; require lastPlayedAt older than idle window only.
    return false;
  }
  return now - ts > maxIdleMs;
}

export async function evictIdleFeedPreviews(limit = 100): Promise<{ scanned: number; evicted: number }> {
  if (!getFeedR2()) {
    return { scanned: 0, evicted: 0 };
  }
  const { getDatabasePool } = await import('../utils/database');
  const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
  const db = getDatabasePool();
  const maxIdleMs = idleDays() * 24 * 3600 * 1000;
  const now = Date.now();
  let scanned = 0;
  let evicted = 0;

  const result = await db.query(
    `SELECT file_id, metadata FROM aggregator_media
     WHERE metadata->>'isPublic' = 'true'
       AND (metadata->'feedPreviewSd' IS NOT NULL OR metadata->'feedPreviewHd' IS NOT NULL)
     LIMIT $1`,
    [limit]
  );

  const agg = AggregatorMetadataServiceDB.getInstance();
  for (const row of result.rows) {
    scanned += 1;
    const fileId = String(row.file_id);
    const meta = row.metadata as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    let changed = false;

    for (const field of ['feedPreviewSd', 'feedPreviewHd'] as const) {
      const ref = meta[field];
      if (!isFeedPreviewObjectRef(ref) || !ref.r2Key) continue;
      if (!isIdle(ref, now, maxIdleMs)) continue;
      try {
        await feedR2Delete(ref.r2Key);
        patch[field] = {
          ...ref,
          r2Key: undefined,
          r2Warm: false,
        };
        changed = true;
        evicted += 1;
      } catch (err: unknown) {
        safeLogger.warn('[feed-evict] delete failed', {
          message: err instanceof Error ? err.message : 'unknown',
        });
      }
    }

    if (changed) {
      await agg.updateMetadata(fileId, patch as any).catch((err: unknown) => {
        safeLogger.warn('[feed-evict] metadata patch failed', {
          message: err instanceof Error ? err.message : 'unknown',
        });
      });
    }
  }

  safeLogger.info('[feed-evict] complete', { scanned, evicted });
  return { scanned, evicted };
}

/** Register optional admin/cron trigger. */
export function registerFeedPreviewLifecycleRoutes(app: {
  post: (path: string, ...handlers: any[]) => void;
}): void {
  app.post('/api/aggregator/feed-media/evict-idle', async (_req: any, res: any) => {
    const secret = process.env.FEED_EVICT_CRON_SECRET?.trim();
    if (secret) {
      const hdr = String(_req.headers['x-feed-evict-secret'] || '');
      if (hdr !== secret) {
        return res.status(401).json({ error: 'unauthorized' });
      }
    } else if (process.env.NODE_ENV === 'production') {
      return res.status(503).json({ error: 'evict_secret_required' });
    }
    const out = await evictIdleFeedPreviews(200);
    return res.json(out);
  });
}
