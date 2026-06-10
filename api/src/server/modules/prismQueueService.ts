/**
 * Prism Queue Service
 * Manages the Prism review queue: add flagged content, fetch pending items, record votes
 * Used by DMCA bot (flag path) and user report flow
 * Supports skip vote: 3 skips or tie (1-1) escalate to higher-rep Rays.
 */

import { getDatabasePool } from '../utils/database';

const PRISM_ESCALATED_MIN_REPUTATION = parseInt(process.env.PRISM_ESCALATED_MIN_REPUTATION || '75', 10);

export type FlagSource = 'bot' | 'user_report';

export type RayVote = 'approve' | 'deny' | 'skip';

export interface PrismQueueItem {
  id: string;
  file_id: string;
  owner_pn_identifier: string;
  flag_source: FlagSource;
  reporter_pn_identifier: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  min_required_reputation?: number | null;
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
  const queueItemId = result.rows[0]?.id ?? '';
  try {
    const { recordPrismEntry } = await import('./prismLedgerService');
    const ledgerPn = reporterPnIdentifier || ownerPnIdentifier;
    await recordPrismEntry(ledgerPn, {
      user_pn_identifier: ledgerPn,
      activity_type: 'flagged',
      target_file_id: fileId,
      target_owner_pn_identifier: ownerPnIdentifier,
      metadata: JSON.stringify({ flagSource, queueItemId })
    });
  } catch (ledgerErr) {
    console.warn('[Prism] Flag ledger write failed:', ledgerErr);
  }
  return queueItemId;
}

/**
 * Get pending queue items for Ray review (oldest first)
 */
export async function getPendingQueueItems(limit = 20): Promise<PrismQueueItem[]> {
  const db = getDatabasePool();
  const result = await db.query(
    `SELECT id, file_id, owner_pn_identifier, flag_source, reporter_pn_identifier, status, created_at, updated_at, min_required_reputation
     FROM prism_review_queue
     WHERE status = 'pending'
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

/**
 * Get pending queue items visible to a given Ray (reputation-filtered).
 * Normal items: any Ray. Escalated items: only Rays with reputation >= min_required_reputation.
 */
export async function getPendingQueueItemsForRay(
  rayPnIdentifier: string,
  limit = 20
): Promise<PrismQueueItem[]> {
  const { getReputationScore } = await import('./prismReputationService');
  const reputation = await getReputationScore(rayPnIdentifier);
  const callerScore = reputation.score;

  const db = getDatabasePool();
  const result = await db.query(
    `SELECT id, file_id, owner_pn_identifier, flag_source, reporter_pn_identifier, status, created_at, updated_at, min_required_reputation
     FROM prism_review_queue
     WHERE status = 'pending'
       AND (min_required_reputation IS NULL OR min_required_reputation <= $1)
     ORDER BY created_at ASC
     LIMIT $2`,
    [callerScore, limit]
  );
  return result.rows;
}

/**
 * Get single queue item by id
 */
export async function getQueueItemById(id: string): Promise<PrismQueueItem | null> {
  const db = getDatabasePool();
  const result = await db.query(
    `SELECT id, file_id, owner_pn_identifier, flag_source, reporter_pn_identifier, status, created_at, updated_at, min_required_reputation
     FROM prism_review_queue
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

/**
 * Check if a file was already approved by Prism (Rays). Used to allow retry after human approval.
 */
export async function isFileApprovedByPrism(fileId: string): Promise<boolean> {
  const db = getDatabasePool();
  const result = await db.query(
    `SELECT 1 FROM prism_review_queue WHERE file_id = $1 AND status = 'approved' LIMIT 1`,
    [fileId]
  );
  return (result.rows.length ?? 0) > 0;
}

/**
 * Submit a Ray vote and check for consensus
 * In bootstrap mode, admin approve/deny immediately resolves. Admin skip = no-op (escalation still applies).
 * Vote types: approve, deny, skip. Skip is reputation-neutral; 3 skips escalate to higher-tier Rays.
 */
export async function submitVote(
  queueItemId: string,
  rayPnIdentifier: string,
  vote: RayVote
): Promise<{ resolved: boolean; status?: string }> {
  const db = getDatabasePool();
  await db.query(
    `INSERT INTO prism_votes (queue_item_id, ray_pn_identifier, vote)
     VALUES ($1, $2, $3)
     ON CONFLICT (queue_item_id, ray_pn_identifier) DO UPDATE SET vote = $3`,
    [queueItemId, rayPnIdentifier, vote]
  );

  if (vote === 'skip') {
    await checkEscalation(queueItemId);
    return { resolved: false };
  }

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
 * Set min_required_reputation for escalation (3 skips or tiebreaker)
 */
async function setQueueItemMinReputation(queueItemId: string, minRep: number): Promise<void> {
  const db = getDatabasePool();
  await db.query(
    `UPDATE prism_review_queue SET min_required_reputation = $1, updated_at = NOW() WHERE id = $2`,
    [minRep, queueItemId]
  );
}

/**
 * Check if 3 skips or tie (1 approve, 1 deny) → escalate by setting min_required_reputation
 */
async function checkEscalation(queueItemId: string): Promise<void> {
  const votes = await getVotesForQueueItem(queueItemId);
  const approveCount = votes.filter((v) => v.vote === 'approve').length;
  const denyCount = votes.filter((v) => v.vote === 'deny').length;
  const skipCount = votes.filter((v) => v.vote === 'skip').length;

  const db = getDatabasePool();
  const row = await db.query(
    `SELECT min_required_reputation FROM prism_review_queue WHERE id = $1`,
    [queueItemId]
  );
  const currentMinRep = (row.rows[0] as { min_required_reputation?: number | null })?.min_required_reputation;

  if (currentMinRep != null) return; // Already escalated

  if (skipCount >= 3) {
    await setQueueItemMinReputation(queueItemId, PRISM_ESCALATED_MIN_REPUTATION);
    return;
  }
  if (approveCount === 1 && denyCount === 1) {
    await setQueueItemMinReputation(queueItemId, PRISM_ESCALATED_MIN_REPUTATION);
  }
}

/**
 * Check consensus: 2+ matching votes = resolve. In bootstrap mode, 1 admin vote = resolve.
 * Tie (1 approve, 1 deny) escalates to higher-tier Rays.
 */
async function checkConsensusAndResolve(
  queueItemId: string,
  voterPn: string,
  vote: 'approve' | 'deny'
): Promise<{ resolved: boolean; status?: string }> {
  const { isPrismAdmin, isBootstrapMode } = await import('./prismAdminService');

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

  if (approveCount === 1 && denyCount === 1) {
    await checkEscalation(queueItemId); // Tiebreaker escalation
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
