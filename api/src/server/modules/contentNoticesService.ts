/**
 * Content Notices Service
 * In-app notices for content owners: pending_review (bot-flagged) or taken_down (index removal).
 * par Noir does not host content; "takedown" means removal from our index and third-party indexes only.
 */

import { getDatabasePool } from '../utils/database';

export type ContentNoticeType = 'pending_review' | 'taken_down' | 'restored';
export type ContentNoticeSource = 'bot' | 'prism_denied' | 'dmca_notice' | 'counter_notice';

export interface ContentNotice {
  id: string;
  owner_pn_identifier: string;
  file_id: string;
  type: ContentNoticeType;
  reason: string | null;
  source: ContentNoticeSource;
  created_at: string;
}

const TAKEN_DOWN_REASON =
  'This content has been removed from the par Noir index and from third-party indexes due to a copyright determination. We do not host your files—we only index them. Your file remains in your Google Drive; we cannot and do not delete it.';

/**
 * Add a content notice for the owner (in-app).
 */
export async function addContentNotice(params: {
  ownerPnIdentifier: string;
  fileId: string;
  type: ContentNoticeType;
  reason?: string | null;
  source: ContentNoticeSource;
}): Promise<string> {
  const db = getDatabasePool();
  const { ownerPnIdentifier, fileId, type, source } = params;
  const reason =
    params.reason ??
    (type === 'taken_down' ? TAKEN_DOWN_REASON : null);
  const result = await db.query(
    `INSERT INTO content_notices (owner_pn_identifier, file_id, type, reason, source)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [ownerPnIdentifier, fileId, type, reason, source]
  );
  return result.rows[0]?.id ?? '';
}

/**
 * Get content notices for an owner (newest first).
 */
export async function getContentNoticesForOwner(
  ownerPnIdentifier: string,
  limit = 50,
  offset = 0
): Promise<ContentNotice[]> {
  const db = getDatabasePool();
  const result = await db.query(
    `SELECT id, owner_pn_identifier, file_id, type, reason, source, created_at
     FROM content_notices
     WHERE owner_pn_identifier = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [ownerPnIdentifier, limit, offset]
  );
  return result.rows;
}
