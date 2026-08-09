/**
 * Opaque social mailbox — rebuildable throughway only (no cloud provider tokens).
 * Durable rows keyed by opaque route_key (not clear pn identifiers).
 * Sender durability lives in user-owned outbox, not here.
 */

import { createHash, randomUUID } from 'crypto';
import { getDatabasePool } from '../utils/database';

/**
 * The rail was scoped to DMs. Connections, follows, and group sends are also
 * private peer deliveries, so they ride the same rail rather than growing a
 * second one. Adding a type here means adding it to the three other closed
 * enums too (mailboxRoutes JOB_TYPES, OutboxKind, materializeMailboxJob), or
 * a job enqueues and then never applies.
 */
export type SocialMailboxJobType =
  | 'message_append'
  | 'message_attachment'
  | 'notification_row'
  | 'connection_request'
  | 'connection_accept'
  | 'connection_reject'
  | 'connection_delete'
  | 'follower_add'
  | 'follower_remove'
  | 'group_message_append'
  | 'group_inbox_update'
  | 'message_request';

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
  'userPnIdentifier',
  'peerPnIdentifier',
  'ownerPnIdentifier',
  'memberPnIdentifier'
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

function routePepper(): string {
  return (
    process.env.MAILBOX_ROUTE_PEPPER ||
    process.env.DEVICE_TOKEN_PEPPER ||
    'parnoir-mailbox-dev-pepper'
  );
}

/**
 * Legacy fallback when peers have not exchanged a route key yet.
 * Uses deployment pepper so DB dump alone is not a clear pn graph.
 */
export function legacyRouteKeyForIdentity(identityId: string): string {
  return createHash('sha256')
    .update(`parnoir-mailbox-legacy-v1:${routePepper()}:${identityId}`, 'utf8')
    .digest('hex');
}

/**
 * Owner of a route, at rest. Domain-separated from legacyRouteKeyForIdentity so
 * an owner hash is never itself a usable route key. Peppered so a DB dump is
 * still not a clear pn graph — the privacy goal the opaque route was built for.
 */
export function mailboxOwnerHash(identityId: string): string {
  return createHash('sha256')
    .update(`parnoir-mailbox-owner-v1:${routePepper()}:${identityId}`, 'utf8')
    .digest('hex');
}

/**
 * Claim a minted route for an owner. First claim wins: a route key is 32 random
 * bytes, so only its minter can register it before it is handed to peers.
 * Returns false when the route is already bound to somebody else.
 */
export async function registerMailboxRoute(
  routeKey: string,
  identityId: string
): Promise<boolean> {
  const key = String(routeKey || '').trim();
  if (!isMailboxRouteKey(key)) {
    throw new Error('routeKey required (opaque mailbox route)');
  }
  const ownerHash = mailboxOwnerHash(identityId);
  const db = getDatabasePool();
  const result = await db.query(
    `INSERT INTO mailbox_route_binding (route_key, owner_hash)
     VALUES ($1, $2)
     ON CONFLICT (route_key) DO NOTHING
     RETURNING route_key`,
    [key, ownerHash]
  );
  if (result.rowCount && result.rowCount > 0) return true;
  return (await getMailboxRouteOwnerHash(key)) === ownerHash;
}

export async function getMailboxRouteOwnerHash(routeKey: string): Promise<string | null> {
  const db = getDatabasePool();
  const result = await db.query(
    `SELECT owner_hash FROM mailbox_route_binding WHERE route_key = $1`,
    [String(routeKey || '').trim()]
  );
  return result.rows[0] ? String(result.rows[0].owner_hash) : null;
}

/**
 * A route the caller is entitled to drain. Their own legacy route always
 * qualifies; a minted route only qualifies once bound to them.
 */
export async function ownsMailboxRoute(
  routeKey: string,
  identityId: string
): Promise<boolean> {
  const key = String(routeKey || '').trim();
  if (!key) return false;
  if (key === legacyRouteKeyForIdentity(identityId)) return true;
  const ownerHash = await getMailboxRouteOwnerHash(key);
  return ownerHash !== null && ownerHash === mailboxOwnerHash(identityId);
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

/**
 * Without a stable key a job re-enqueues on every reconcile. messageId only
 * exists on DM traffic, so social jobs carry a deterministic requestId
 * (the connectionId, follow pair, or group message id).
 */
function idempotencyMid(payload: Record<string, unknown>): string {
  return (
    (typeof payload.messageId === 'string' && payload.messageId) ||
    (typeof payload.commentId === 'string' && payload.commentId) ||
    (typeof payload.requestId === 'string' && payload.requestId) ||
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
         OR payload->>'requestId' = $3
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
  requestId?: string;
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
         OR ($5::text IS NOT NULL AND payload->>'requestId' = $5)
       )
     ORDER BY created_at DESC
     LIMIT 1`,
    [
      params.routeKey.trim(),
      params.jobType,
      params.messageId ?? null,
      params.commentId ?? null,
      params.requestId ?? null
    ]
  );
  if (!result.rows[0]) return null;
  return mapRow(result.rows[0]);
}

/**
 * jobTypes narrows to what the caller's device is actually allowed to see, so a
 * device granted only messaging never receives social jobs it cannot apply.
 */
export async function listPendingMailboxJobs(
  routeKey: string,
  limit = 100,
  jobTypes?: readonly SocialMailboxJobType[]
): Promise<SocialMailboxJob[]> {
  if (jobTypes && jobTypes.length === 0) return [];
  const db = getDatabasePool();
  const result = await db.query(
    `SELECT id, route_key, job_type, payload, created_at, expires_at, acked_at
     FROM social_mailbox
     WHERE route_key = $1
       AND acked_at IS NULL
       AND expires_at > NOW()
       AND ($3::text[] IS NULL OR job_type = ANY($3::text[]))
     ORDER BY created_at ASC
     LIMIT $2`,
    [routeKey.trim(), Math.min(Math.max(limit, 1), 500), jobTypes ? [...jobTypes] : null]
  );
  return result.rows.map(mapRow);
}

export async function ackMailboxJobs(
  routeKey: string,
  jobIds: string[],
  jobTypes?: readonly SocialMailboxJobType[]
): Promise<number> {
  if (!jobIds.length) return 0;
  if (jobTypes && jobTypes.length === 0) return 0;
  const db = getDatabasePool();
  const result = await db.query(
    `UPDATE social_mailbox
     SET acked_at = NOW()
     WHERE route_key = $1
       AND id = ANY($2::uuid[])
       AND acked_at IS NULL
       AND ($3::text[] IS NULL OR job_type = ANY($3::text[]))
     RETURNING id`,
    [routeKey.trim(), jobIds, jobTypes ? [...jobTypes] : null]
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
