/**
 * Optional audit log for succession, OAuth admin actions, API keys, etc.
 */

import { getDatabasePool } from '../utils/database';
import { securityLogger } from '../../utils/logger';

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

export async function appendSecurityAuditEvent(params: {
  eventType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  actorHint?: string;
  subjectPnIdentifier?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await appendAuditEvent({
    eventType: params.eventType,
    actorHint: params.actorHint,
    subjectPnIdentifier: params.subjectPnIdentifier,
    metadata: {
      severity: params.severity,
      ...(params.metadata || {}),
    },
  });
  securityLogger.securityEvent({
    type: params.eventType,
    severity: params.severity,
    message: params.eventType,
    userId: params.subjectPnIdentifier,
    details: params.metadata,
  });
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

export interface AuditEventRow {
  event_type: string;
  created_at: Date;
  metadata: Record<string, unknown>;
}

/** Recent audit rows for a subject (e.g. data point proposals from developer console). */
export async function listAuditEventsBySubject(params: {
  subjectPnIdentifier: string;
  eventType: string;
  limit?: number;
}): Promise<AuditEventRow[]> {
  try {
    const db = getDatabasePool();
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const r = await db.query(
      `SELECT event_type, created_at, metadata
       FROM audit_events
       WHERE subject_pn_identifier = $1 AND event_type = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [params.subjectPnIdentifier.slice(0, 255), params.eventType.slice(0, 64), limit]
    );
    return r.rows.map((row: { event_type: string; created_at: Date; metadata: unknown }) => ({
      event_type: row.event_type,
      created_at: row.created_at,
      metadata: (typeof row.metadata === 'object' && row.metadata !== null
        ? row.metadata
        : {}) as Record<string, unknown>
    }));
  } catch (err) {
    console.warn('[audit] listAuditEventsBySubject failed:', (err as Error).message);
    return [];
  }
}
