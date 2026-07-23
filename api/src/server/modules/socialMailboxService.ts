/**
 * Opaque social mailbox — rebuildable throughway only (no cloud provider tokens).
 * Durable rows keyed by opaque route_key (not clear pn identifiers).
 * Sender durability lives in user-owned outbox, not here.
 */

import { createHash, randomUUID } from 'crypto';
import { getDatabasePool } from '../utils/database';

export type SocialMailboxJobType =
  | 'message_append'
  | 'message_attachment'
  | 'notification_row';

export interface SocialMailboxJob {
  id: string;
  routeKey: string;
  jobType: SocialMailboxJobType;
  payload: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
  ackedAt: string | null;
}

const DEFAULT_TTL_DAYS = parseInt(process.env.SOCIAL_MAILBOX_TTL_DAYS || '30', 10) || 30;

/** Fields that must not persist in durable throughway payload (clear graph). */
const STRIP_PAYLOAD_KEYS = new Set([
  'fromPnIdentifier',
  'toPnIdentifier',
  'actorPnIdentifier',
  'fileOwnerDid',
  'ownerPn',
  'recipientIdentityId',
  'userPnIdentifier'
]);

/**
 * Device cloud custody is the product path. Opt out only with DEVICE_CLOUD_CUSTODY=0|false|no.
 */
export function isDeviceCloudCustodyEnabled(): boolean {
  const v = (process.env.DEVICE_CLOUD_CUSTODY || '1').toLowerCase();
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return true;
}

export function isMailboxRouteKey(value: unknown): boolean {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value.trim());
}

/**
 * Legacy fallback when peers have not exchanged a route key yet.
 * Uses deployment pepper so DB dump alone is not a clear pn graph.
 */
export function legacyRouteKeyForIdentity(identityId: string): string {
  const pepper =
    process.env.MAILBOX_ROUTE_PEPPER ||
    process.env.DEVICE_TOKEN_PEPPER ||
    'parnoir-mailbox-dev-pepper';
  return createHash('sha256')
    .update(`parnoir-mailbox-legacy-v1:${pepper}:${identityId}`, 'utf8')
    .digest('hex');
}

export function sanitizeMailboxPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (STRIP_PAYLOAD_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

function idempotencyMid(payload: Record<string, unknown>): string {
  return (
    (typeof payload.messageId === 'string' && payload.messageId) ||
    (typeof payload.commentId === 'string' && payload.commentId) ||
    randomUUID()
  );
}

/**
 * Idempotent enqueue: same (routeKey, jobType, messageId|…) returns existing pending row.
 */
export async function enqueueSocialMailboxJob(params: {
  routeKey: string;
  jobType: SocialMailboxJobType;
  payload: Record<string, unknown>;
  ttlDays?: number;
}): Promise<SocialMailboxJob & { created: boolean }> {
  const routeKey = String(params.routeKey || '').trim();
  if (!isMailboxRouteKey(routeKey) && routeKey.length < 32) {
    throw new Error('routeKey required (opaque mailbox route)');
  }
  const db = getDatabasePool();
  const ttl = params.ttlDays ?? DEFAULT_TTL_DAYS;
  const payload = sanitizeMailboxPayload(params.payload);
  const mid = idempotencyMid(payload);

  const existing = await db.query(
    `SELECT id, route_key, job_type, payload, created_at, expires_at, acked_at
     FROM social_mailbox
     WHERE route_key = $1
       AND job_type = $2
       AND acked_at IS NULL
       AND expires_at > NOW()
       AND (
         payload->>'messageId' = $3
         OR payload->>'commentId' = $3
       )
     ORDER BY created_at DESC
     LIMIT 1`,
    [routeKey, params.jobType, mid]
  );
  if (existing.rows[0]) {
    return { ...mapRow(existing.rows[0]), created: false };
  }

  const id = randomUUID();
  const result = await db.query(
    `INSERT INTO social_mailbox (id, route_key, job_type, payload, expires_at)
     VALUES ($1, $2, $3, $4::jsonb, NOW() + ($5::text || ' days')::interval)
     RETURNING id, route_key, job_type, payload, created_at, expires_at, acked_at`,
    [id, routeKey, params.jobType, JSON.stringify(payload), String(ttl)]
  );
  return { ...mapRow(result.rows[0]), created: true };
}

export async function lookupMailboxJob(params: {
  routeKey: string;
  jobType: SocialMailboxJobType;
  messageId?: string;
  commentId?: string;
}): Promise<SocialMailboxJob | null> {
  const db = getDatabasePool();
  const result = await db.query(
    `SELECT id, route_key, job_type, payload, created_at, expires_at, acked_at
     FROM social_mailbox
     WHERE route_key = $1
       AND job_type = $2
       AND expires_at > NOW()
       AND (
         ($3::text IS NOT NULL AND payload->>'messageId' = $3)
         OR ($4::text IS NOT NULL AND payload->>'commentId' = $4)
       )
     ORDER BY created_at DESC
     LIMIT 1`,
    [
      params.routeKey.trim(),
      params.jobType,
      params.messageId ?? null,
      params.commentId ?? null
    ]
  );
  if (!result.rows[0]) return null;
  return mapRow(result.rows[0]);
}

export async function listPendingMailboxJobs(
  routeKey: string,
  limit = 100
): Promise<SocialMailboxJob[]> {
  const db = getDatabasePool();
  const result = await db.query(
    `SELECT id, route_key, job_type, payload, created_at, expires_at, acked_at
     FROM social_mailbox
     WHERE route_key = $1
       AND acked_at IS NULL
       AND expires_at > NOW()
     ORDER BY created_at ASC
     LIMIT $2`,
    [routeKey.trim(), Math.min(Math.max(limit, 1), 500)]
  );
  return result.rows.map(mapRow);
}

export async function ackMailboxJobs(routeKey: string, jobIds: string[]): Promise<number> {
  if (!jobIds.length) return 0;
  const db = getDatabasePool();
  const result = await db.query(
    `UPDATE social_mailbox
     SET acked_at = NOW()
     WHERE route_key = $1
       AND id = ANY($2::uuid[])
       AND acked_at IS NULL
     RETURNING id`,
    [routeKey.trim(), jobIds]
  );
  return result.rowCount ?? 0;
}

export async function purgeExpiredMailboxJobs(): Promise<number> {
  const db = getDatabasePool();
  const result = await db.query(
    `DELETE FROM social_mailbox
     WHERE expires_at < NOW()
        OR (acked_at IS NOT NULL AND acked_at < NOW() - INTERVAL '7 days')
     RETURNING id`
  );
  return result.rowCount ?? 0;
}

function mapRow(row: Record<string, unknown>): SocialMailboxJob {
  const routeKey =
    (row.route_key != null && String(row.route_key)) ||
    (row.recipient_identity_id != null
      ? legacyRouteKeyForIdentity(String(row.recipient_identity_id))
      : '');
  return {
    id: String(row.id),
    routeKey,
    jobType: row.job_type as SocialMailboxJobType,
    payload:
      typeof row.payload === 'string'
        ? (JSON.parse(row.payload) as Record<string, unknown>)
        : ((row.payload as Record<string, unknown>) ?? {}),
    createdAt: new Date(row.created_at as string | Date).toISOString(),
    expiresAt: new Date(row.expires_at as string | Date).toISOString(),
    ackedAt: row.acked_at
      ? new Date(row.acked_at as string | Date).toISOString()
      : null
  };
}
