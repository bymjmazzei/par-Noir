/**
 * DMCA Counter-Notices
 * Content owners submit counter-notice; we store, forward to claimant, and restore after window.
 */

import { getDatabasePool } from '../utils/database';

const RESTORE_AFTER_DAYS = 14; // 10-14 business days simplified as 14 calendar days

export interface CreateCounterNoticeInput {
  contentNoticeId?: string | null;
  dmcaTakedownRequestId?: string | null;
  statement: string;
  signature: string;
}

export interface CounterNoticeRow {
  id: string;
  content_notice_id: string | null;
  dmca_takedown_request_id: string | null;
  owner_pn_identifier: string;
  file_id: string;
  statement: string;
  signature: string;
  status: string;
  forwarded_at: string | null;
  restore_after: string | null;
  restored_at: string | null;
  created_at: string;
}

/**
 * Resolve file_id and owner from content_notice or dmca_takedown_requests.
 * Returns null if not found or not a taken_down notice.
 */
export async function resolveCounterNoticeTarget(
  contentNoticeId: string | null,
  dmcaTakedownRequestId: string | null
): Promise<{ fileId: string; ownerPnIdentifier: string } | null> {
  const db = getDatabasePool();
  if (contentNoticeId) {
    const r = await db.query(
      `SELECT file_id, owner_pn_identifier FROM content_notices WHERE id = $1 AND type = 'taken_down'`,
      [contentNoticeId]
    );
    if (r.rows.length > 0) {
      const row = r.rows[0] as { file_id: string; owner_pn_identifier: string };
      return { fileId: row.file_id, ownerPnIdentifier: row.owner_pn_identifier };
    }
  }
  if (dmcaTakedownRequestId) {
    // We don't store owner in dmca_takedown_requests; we'd need to resolve via processed file_id.
    // For now only content_notice_id path is fully supported for counter-notice (owner known).
    const r = await db.query(
      `SELECT infringing_content_ref FROM dmca_takedown_requests WHERE id = $1 AND status = 'accepted'`,
      [dmcaTakedownRequestId]
    );
    if (r.rows.length > 0) {
      const ref = (r.rows[0] as { infringing_content_ref: string }).infringing_content_ref;
      // If ref is a file_id we still need owner - get from aggregator metadata.
      const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
      const service = AggregatorMetadataServiceDB.getInstance();
      const entry = await service.getFileMetadata(ref);
      if (entry?.pnIdentifier) {
        return { fileId: ref, ownerPnIdentifier: entry.pnIdentifier };
      }
    }
  }
  return null;
}

/**
 * Create counter-notice. Validates that requester is the content owner.
 */
export async function createCounterNotice(
  ownerPnIdentifier: string,
  input: CreateCounterNoticeInput
): Promise<{ id: string; restoreAfter: string } | { error: string }> {
  const target = await resolveCounterNoticeTarget(input.contentNoticeId ?? null, input.dmcaTakedownRequestId ?? null);
  if (!target) {
    return { error: 'Invalid or expired reference; content notice or takedown request not found.' };
  }
  if (target.ownerPnIdentifier !== ownerPnIdentifier) {
    return { error: 'Only the content owner may submit a counter-notice.' };
  }
  const db = getDatabasePool();
  const restoreAfter = new Date();
  restoreAfter.setDate(restoreAfter.getDate() + RESTORE_AFTER_DAYS);
  const result = await db.query(
    `INSERT INTO dmca_counter_notices (
      content_notice_id, dmca_takedown_request_id, owner_pn_identifier, file_id,
      statement, signature, status, restore_after
    ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
    RETURNING id, restore_after`,
    [
      input.contentNoticeId || null,
      input.dmcaTakedownRequestId || null,
      target.ownerPnIdentifier,
      target.fileId,
      input.statement,
      input.signature,
      restoreAfter.toISOString(),
    ]
  );
  const row = result.rows[0] as { id: string; restore_after: Date };
  return { id: row.id, restoreAfter: row.restore_after?.toISOString() ?? restoreAfter.toISOString() };
}

/**
 * List counter-notices eligible for restore (forwarded, restore_after passed, not yet restored).
 */
export async function getCounterNoticesEligibleForRestore(): Promise<CounterNoticeRow[]> {
  const db = getDatabasePool();
  const result = await db.query(
    `SELECT id, content_notice_id, dmca_takedown_request_id, owner_pn_identifier, file_id, statement, signature, status, forwarded_at, restore_after, restored_at, created_at
     FROM dmca_counter_notices
     WHERE status = 'forwarded' AND restore_after <= NOW() AND restored_at IS NULL`
  );
  return result.rows as CounterNoticeRow[];
}

/**
 * Mark counter-notice as forwarded (manual step).
 */
export async function markCounterNoticeForwarded(id: string): Promise<boolean> {
  const db = getDatabasePool();
  await db.query(
    `UPDATE dmca_counter_notices SET status = 'forwarded', forwarded_at = NOW() WHERE id = $1`,
    [id]
  );
  return true;
}

/**
 * Mark counter-notice as restored after restoreContent was called.
 */
export async function markCounterNoticeRestored(id: string): Promise<void> {
  const db = getDatabasePool();
  await db.query(
    `UPDATE dmca_counter_notices SET status = 'restored', restored_at = NOW() WHERE id = $1`,
    [id]
  );
}
