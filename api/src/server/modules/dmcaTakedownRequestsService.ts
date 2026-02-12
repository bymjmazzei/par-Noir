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
