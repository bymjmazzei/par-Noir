/**
 * Optional audit log for succession, OAuth admin actions, API keys, etc.
 */

import { getDatabasePool } from '../utils/database';

const DEFAULT_RETENTION_DAYS = parseInt(process.env.AUDIT_RETENTION_DAYS || '365', 10) || 365;

export async function appendAuditEvent(params: {
  eventType: string;
  actorHint?: string;
  subjectPnIdentifier?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = getDatabasePool();
    await db.query(
      `INSERT INTO audit_events (event_type, actor_hint, subject_pn_identifier, metadata)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [
        params.eventType.slice(0, 64),
        params.actorHint?.slice(0, 255) ?? null,
        params.subjectPnIdentifier?.slice(0, 255) ?? null,
        JSON.stringify(params.metadata ?? {})
      ]
    );
  } catch (err) {
    console.warn('[audit] appendAuditEvent failed (non-fatal):', (err as Error).message);
  }
}

/** Best-effort purge of old rows; safe to run periodically */
export async function pruneAuditEventsOlderThan(days: number = DEFAULT_RETENTION_DAYS): Promise<number> {
  const db = getDatabasePool();
  const r = await db.query(
    `DELETE FROM audit_events WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')`,
    [days]
  );
  return r.rowCount ?? 0;
}
