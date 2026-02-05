/**
 * Prism Queue Service
 * Manages the Prism review queue: add flagged content, fetch pending items, record votes
 * Used by DMCA bot (flag path) and user report flow
 */

import { getDatabasePool } from '../utils/database';

export type FlagSource = 'bot' | 'user_report';

export interface PrismQueueItem {
  id: string;
  file_id: string;
  owner_pn_identifier: string;
  flag_source: FlagSource;
  reporter_pn_identifier: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface AddToQueueParams {
  fileId: string;
  ownerPnIdentifier: string;
  flagSource: FlagSource;
  reporterPnIdentifier?: string | null;
}

/**
 * Add item to Prism review queue
 */
export async function addToPrismQueue(params: AddToQueueParams): Promise<string> {
  const db = getDatabasePool();
  const { fileId, ownerPnIdentifier, flagSource, reporterPnIdentifier } = params;
  const result = await db.query(
    `INSERT INTO prism_review_queue (file_id, owner_pn_identifier, flag_source, reporter_pn_identifier, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING id`,
    [fileId, ownerPnIdentifier, flagSource, reporterPnIdentifier ?? null]
  );
  return result.rows[0]?.id ?? '';
}

/**
 * Get pending queue items for Ray review (oldest first)
 */
export async function getPendingQueueItems(limit = 20): Promise<PrismQueueItem[]> {
  const db = getDatabasePool();
  const result = await db.query(
    `SELECT id, file_id, owner_pn_identifier, flag_source, reporter_pn_identifier, status, created_at, updated_at
     FROM prism_review_queue
     WHERE status = 'pending'
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

/**
 * Get single queue item by id
 */
export async function getQueueItemById(id: string): Promise<PrismQueueItem | null> {
  const db = getDatabasePool();
  const result = await db.query(
    `SELECT id, file_id, owner_pn_identifier, flag_source, reporter_pn_identifier, status, created_at, updated_at
     FROM prism_review_queue
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

/**
 * Submit a Ray vote and check for consensus
 * In bootstrap mode, admin vote immediately resolves
 */
export async function submitVote(
  queueItemId: string,
  rayPnIdentifier: string,
  vote: 'approve' | 'deny'
): Promise<{ resolved: boolean; status?: string }> {
  const db = getDatabasePool();
  await db.query(
    `INSERT INTO prism_votes (queue_item_id, ray_pn_identifier, vote)
     VALUES ($1, $2, $3)
     ON CONFLICT (queue_item_id, ray_pn_identifier) DO UPDATE SET vote = $3`,
    [queueItemId, rayPnIdentifier, vote]
  );
  return checkConsensusAndResolve(queueItemId, rayPnIdentifier, vote);
}

/**
 * Get votes for a queue item
 */
export async function getVotesForQueueItem(queueItemId: string): Promise<Array<{ ray_pn_identifier: string; vote: string }>> {
  const db = getDatabasePool();
  const result = await db.query(
    `SELECT ray_pn_identifier, vote FROM prism_votes WHERE queue_item_id = $1`,
    [queueItemId]
  );
  return result.rows;
}

/**
 * Update queue item status
 */
export async function updateQueueItemStatus(queueItemId: string, status: 'approved' | 'denied'): Promise<void> {
  const db = getDatabasePool();
  await db.query(
    `UPDATE prism_review_queue SET status = $1, updated_at = NOW() WHERE id = $2`,
    [status, queueItemId]
  );
}

/**
 * Check consensus: 2+ matching votes = resolve. In bootstrap mode, 1 admin vote = resolve.
 */
async function checkConsensusAndResolve(
  queueItemId: string,
  voterPn: string,
  vote: 'approve' | 'deny'
): Promise<{ resolved: boolean; status?: string }> {
  const { isPrismAdmin, isBootstrapMode } = await import('./prismAdminService');
  const db = getDatabasePool();

  if (isBootstrapMode() && isPrismAdmin(voterPn)) {
    const status = vote === 'approve' ? 'approved' : 'denied';
    await updateQueueItemStatus(queueItemId, status);
    return { resolved: true, status };
  }

  const votes = await getVotesForQueueItem(queueItemId);
  const approveCount = votes.filter((v) => v.vote === 'approve').length;
  const denyCount = votes.filter((v) => v.vote === 'deny').length;

  if (approveCount >= 2) {
    await updateQueueItemStatus(queueItemId, 'approved');
    return { resolved: true, status: 'approved' };
  }
  if (denyCount >= 2) {
    await updateQueueItemStatus(queueItemId, 'denied');
    return { resolved: true, status: 'denied' };
  }
  return { resolved: false };
}

/**
 * Get queue stats (pending, approved, denied counts)
 */
export async function getQueueStats(): Promise<{ pending: number; approved: number; denied: number }> {
  const db = getDatabasePool();
  const result = await db.query(
    `SELECT status, COUNT(*)::int as cnt FROM prism_review_queue GROUP BY status`
  );
  const counts = { pending: 0, approved: 0, denied: 0 };
  for (const row of result.rows) {
    counts[row.status as keyof typeof counts] = row.cnt ?? 0;
  }
  return counts;
}

/**
 * Seed demo flagged content from existing aggregator files (admin only).
 * Adds up to `limit` public files to the queue that are not already queued.
 */
export async function seedDemoQueueItems(limit = 5): Promise<{ added: number; fileIds: string[] }> {
  const db = getDatabasePool();

  const existing = await db.query(
    `SELECT file_id FROM prism_review_queue`
  );
  const alreadyQueued = new Set((existing.rows as { file_id: string }[]).map((r) => r.file_id));

  const candidates: { file_id: string; pn_identifier: string }[] = [];

  const tables = ['aggregator_media', 'aggregator_thoughts', 'aggregator_collections'] as const;
  for (const table of tables) {
    const r = await db.query(
      `SELECT file_id, pn_identifier FROM ` + table + `
       WHERE pn_identifier IS NOT NULL AND (metadata->>'isPublic')::text = 'true'
       ORDER BY created_at DESC LIMIT 20`,
      []
    );
    for (const row of (r.rows as { file_id: string; pn_identifier: string }[])) {
      if (!alreadyQueued.has(row.file_id)) {
        candidates.push(row);
        alreadyQueued.add(row.file_id);
      }
    }
  }

  const toAdd = candidates.slice(0, limit);
  const fileIds: string[] = [];

  for (const { file_id, pn_identifier } of toAdd) {
    await addToPrismQueue({
      fileId: file_id,
      ownerPnIdentifier: pn_identifier,
      flagSource: 'bot',
      reporterPnIdentifier: null,
    });
    fileIds.push(file_id);
  }

  return { added: fileIds.length, fileIds };
}
