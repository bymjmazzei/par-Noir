/**
 * DMCA Takedown Requests
 * Store and list takedown notices from claimants. Processing is manual or via admin tool.
 */

import { getDatabasePool } from '../utils/database';

export interface DmcaTakedownRequestInput {
  claimant_name: string;
  claimant_email: string;
  copyrighted_work_description: string;
  infringing_content_ref: string;
  good_faith_statement: string;
  signature: string;
}

export interface DmcaTakedownRequestRow {
  id: string;
  claimant_name: string;
  claimant_email: string;
  copyrighted_work_description: string;
  infringing_content_ref: string;
  good_faith_statement: string;
  signature: string;
  status: string;
  processed_at: string | null;
  processed_by: string | null;
  created_at: string;
}

export async function createTakedownRequest(input: DmcaTakedownRequestInput): Promise<string> {
  const db = getDatabasePool();
  const result = await db.query(
    `INSERT INTO dmca_takedown_requests (
      claimant_name, claimant_email, copyrighted_work_description,
      infringing_content_ref, good_faith_statement, signature, status
    ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
    RETURNING id`,
    [
      input.claimant_name,
      input.claimant_email,
      input.copyrighted_work_description,
      input.infringing_content_ref,
      input.good_faith_statement,
      input.signature,
    ]
  );
  return result.rows[0]?.id ?? '';
}

/**
 * Get a takedown request by id.
 */
export async function getById(id: string): Promise<DmcaTakedownRequestRow | null> {
  const db = getDatabasePool();
  const r = await db.query(
    `SELECT id, claimant_name, claimant_email, copyrighted_work_description,
            infringing_content_ref, good_faith_statement, signature, status,
            processed_at, processed_by, created_at
     FROM dmca_takedown_requests WHERE id = $1`,
    [id]
  );
  if (r.rows.length === 0) return null;
  return r.rows[0] as DmcaTakedownRequestRow;
}

/**
 * Mark a takedown request as processed (accepted and executed). Only when status is 'pending'.
 */
export async function markProcessed(id: string, processedBy: string): Promise<boolean> {
  const db = getDatabasePool();
  const result = await db.query(
    `UPDATE dmca_takedown_requests
     SET status = 'accepted', processed_at = NOW(), processed_by = $2
     WHERE id = $1 AND status = 'pending'
     RETURNING id`,
    [id, processedBy]
  );
  return result.rowCount !== null && result.rowCount > 0;
}

/**
 * Resolve infringing_content_ref to a file_id (for executeTakedown).
 * Claimants may send a URL (e.g. https://parnoir.com/resource/FILE_ID) or a raw file id.
 */
export function resolveInfringingRefToFileId(infringing_content_ref: string): string {
  const ref = String(infringing_content_ref || '').trim();
  if (!ref) return '';
  const resourceSegment = '/resource/';
  const idx = ref.indexOf(resourceSegment);
  if (idx !== -1) {
    const after = ref.slice(idx + resourceSegment.length);
    const end = after.indexOf('?');
    return end === -1 ? after : after.slice(0, end);
  }
  return ref;
}
