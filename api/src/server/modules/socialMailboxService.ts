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
  | 'message_request'
  | 'pen.section_promote'
  | 'pen.comment'
  | 'pen.suggestion'
  | 'pen.draft_upsert'
  | 'pen.publish'
  | 'pen.doc_bootstrap'
  | 'pen.doc_delete'
  | 'pen.doc_meta'
  | 'pen.font_upsert'
  | 'pen.poll_vote'
  | 'pen.widget_action'
  | 'pen.doc_invite_claim';

export interface SocialMailboxJob {
  id: string;
  routeKey: string;
  jobType: SocialMailboxJobType;
  payload: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
  ackedAt: string | null;
}

const DEFAULT_TTL_HOURS = parseInt(process.env.SOCIAL_MAILBOX_TTL_HOURS || '48', 10) || 48;

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

/**
 * Fail closed: no soft default and no DEVICE_TOKEN_PEPPER substitute.
 * A missing pepper would make owner hashes (and any future peppered material)
 * globally reproducible from source.
 */
function routePepper(): string {
  const pepper = process.env.MAILBOX_ROUTE_PEPPER?.trim();
  if (!pepper) {
    throw new Error('MAILBOX_ROUTE_PEPPER must be set');
  }
  return pepper;
}

/**
 * Owner of a route, at rest. Peppered so a DB dump is still not a clear pn
 * graph — the privacy goal the opaque route was built for. Never usable as a
 * route key itself (domain-separated prefix).
 */
export function mailboxOwnerHash(identityId: string): string {
  return createHash('sha256')
    .update(`parnoir-mailbox-owner-v1:${routePepper()}:${identityId}`, 'utf8')
    .digest('hex');
}

export type RegisterMailboxRouteResult =
  | { ok: true; routeKey: string; adopted: boolean }
  | { ok: false; reason: 'route_already_claimed' };

/**
 * Claim a minted route for an owner. One inbox route per owner: if this owner
 * already has a binding, return that key (dashboard/browser converge). If the
 * offered key is bound to someone else, reject.
 */
export async function registerMailboxRoute(
  routeKey: string,
  identityId: string
): Promise<RegisterMailboxRouteResult> {
  const key = String(routeKey || '').trim();
  if (!isMailboxRouteKey(key)) {
    throw new Error('routeKey required (opaque mailbox route)');
  }
  const ownerHash = mailboxOwnerHash(identityId);
  const existing = await getMailboxRouteKeyForOwner(identityId);
  if (existing) {
    await rememberMailboxRecipientKey(identityId);
    return { ok: true, routeKey: existing, adopted: existing !== key };
  }

  const db = getDatabasePool();
  try {
    const result = await db.query(
      `INSERT INTO mailbox_route_binding (route_key, owner_hash)
       VALUES ($1, $2)
       ON CONFLICT (route_key) DO NOTHING
       RETURNING route_key`,
      [key, ownerHash]
    );
    if (result.rowCount && result.rowCount > 0) {
      await rememberMailboxRecipientKey(identityId);
      return { ok: true, routeKey: key, adopted: false };
    }
  } catch (err: unknown) {
    // Unique owner_hash race: another claim landed first — adopt it.
    const adopted = await getMailboxRouteKeyForOwner(identityId);
    if (adopted) {
      return { ok: true, routeKey: adopted, adopted: true };
    }
    throw err;
  }

  const ownerOfKey = await getMailboxRouteOwnerHash(key);
  if (ownerOfKey === ownerHash) {
    await rememberMailboxRecipientKey(identityId);
    return { ok: true, routeKey: key, adopted: false };
  }
  return { ok: false, reason: 'route_already_claimed' };
}

/** Copy the owner's published ML-KEM key onto the route binding so senders can seal. */
export async function rememberMailboxRecipientKey(identityId: string): Promise<void> {
  const db = getDatabasePool();
  const key = await db.query(
    `SELECT ml_kem_public_key FROM user_profiles WHERE pn_identifier = $1`,
    [identityId]
  );
  const publicKey = key.rows[0]?.ml_kem_public_key;
  if (typeof publicKey !== 'string' || !publicKey) return;
  await db.query(
    `UPDATE mailbox_route_binding SET ml_kem_public_key = $2 WHERE owner_hash = $1`,
    [mailboxOwnerHash(identityId), publicKey]
  );
}

export async function getRecipientMlKemPublicKey(routeKey: string): Promise<string | null> {
  const db = getDatabasePool();
  const result = await db.query(
    `SELECT ml_kem_public_key FROM mailbox_route_binding WHERE route_key = $1`,
    [String(routeKey || '').trim()]
  );
  const value = result.rows[0]?.ml_kem_public_key;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export async function getMailboxRouteOwnerHash(routeKey: string): Promise<string | null> {
  const db = getDatabasePool();
  const result = await db.query(
    `SELECT owner_hash FROM mailbox_route_binding WHERE route_key = $1`,
    [String(routeKey || '').trim()]
  );
  return result.rows[0] ? String(result.rows[0].owner_hash) : null;
}

/** Reverse lookup: which opaque inbox route this identity has claimed. */
export async function getMailboxRouteKeyForOwner(
  identityId: string
): Promise<string | null> {
  const ownerHash = mailboxOwnerHash(identityId);
  const db = getDatabasePool();
  const result = await db.query(
    `SELECT route_key FROM mailbox_route_binding WHERE owner_hash = $1`,
    [ownerHash]
  );
  return result.rows[0] ? String(result.rows[0].route_key) : null;
}

/**
 * A route the caller is entitled to drain. Possession of a route key proves
 * nothing — only a binding to this identity's owner_hash does.
 */
export async function ownsMailboxRoute(
  routeKey: string,
  identityId: string
): Promise<boolean> {
  const key = String(routeKey || '').trim();
  if (!key) return false;
  const ownerHash = await getMailboxRouteOwnerHash(key);
  return ownerHash !== null && ownerHash === mailboxOwnerHash(identityId);
}

export function mailboxIdempotencyKey(
  routeKey: string,
  jobType: string,
  callerKey: string
): string {
  return createHash('sha256')
    .update(`${routeKey}\0${jobType}\0${callerKey}`, 'utf8')
    .digest('hex');
}

/** Durable row body: the sealed envelope only. Clear fields are rejected. */
export function sealedMailboxPayload(payload: Record<string, unknown>): {
  envelope: { kemCiphertext: string; ciphertext: string };
  envelopeContext: string;
} {
  const keys = Object.keys(payload);
  if (keys.some((key) => key !== 'envelope' && key !== 'envelopeContext')) {
    throw new Error('mailbox payload must be a sealed envelope');
  }
  const envelope = payload.envelope;
  const envelopeContext = payload.envelopeContext;
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw new Error('sealed envelope required');
  }
  const body = envelope as Record<string, unknown>;
  if (typeof body.kemCiphertext !== 'string' || typeof body.ciphertext !== 'string') {
    throw new Error('sealed envelope required');
  }
  if (typeof envelopeContext !== 'string' || !envelopeContext.trim()) {
    throw new Error('envelopeContext required');
  }
  return {
    envelope: { kemCiphertext: body.kemCiphertext, ciphertext: body.ciphertext },
    envelopeContext: envelopeContext.trim(),
  };
}

export function sanitizeMailboxPayload(
  payload: Record<string, unknown>,
  opts?: { recipientPn?: string }
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (STRIP_PAYLOAD_KEYS.has(k)) continue;
    if (k === 'threadId' && typeof v === 'string' && v.includes('pn-')) continue;
    if (k === 'requestId' && typeof v === 'string' && v.includes('pn-')) continue;
    if (k === 'mediaEnvelopesByPn') {
      const envelope = recipientMediaEnvelope(v, opts?.recipientPn);
      if (envelope) out.mediaEnvelope = envelope;
      continue;
    }
    if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? sanitizeMailboxPayload(item as Record<string, unknown>, opts)
          : item
      );
      continue;
    }
    if (v && typeof v === 'object') {
      out[k] = sanitizeMailboxPayload(v as Record<string, unknown>, opts);
      continue;
    }
    out[k] = v;
  }
  return out;
}

/** One recipient ciphertext. The pn-keyed map is never stored. */
function recipientMediaEnvelope(value: unknown, recipientPn?: string): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>);
  if (recipientPn) {
    const hit = entries.find(([key, env]) => key === recipientPn && typeof env === 'string');
    if (hit && typeof hit[1] === 'string') return hit[1];
  }
  const strings = entries
    .map(([, env]) => env)
    .filter((env): env is string => typeof env === 'string');
  return strings.length === 1 ? strings[0] : undefined;
}

/**
 * Idempotency id that does not carry a clear pn. Callers that used to embed a
 * pn identifier hash the parts instead.
 */
export function mailboxRequestId(parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\0'), 'utf8').digest('hex');
}

/**
 * Idempotent enqueue: same (routeKey, jobType, messageId|…) returns existing pending row.
 */
export async function enqueueSocialMailboxJob(params: {
  routeKey: string;
  jobType: SocialMailboxJobType;
  /** Clear caller id used only to hash idempotency. Never stored. */
  callerKey: string;
  payload: Record<string, unknown>;
  ttlHours?: number;
}): Promise<SocialMailboxJob & { created: boolean }> {
  const routeKey = String(params.routeKey || '').trim();
  if (!isMailboxRouteKey(routeKey)) {
    throw new Error('routeKey required (opaque mailbox route)');
  }
  const callerKey = String(params.callerKey || '').trim();
  if (!callerKey) throw new Error('callerKey required');
  const payload = sealedMailboxPayload(params.payload);
  const idempotencyKey = mailboxIdempotencyKey(routeKey, params.jobType, callerKey);
  const db = getDatabasePool();
  const ttlHours = params.ttlHours ?? DEFAULT_TTL_HOURS;

  const existing = await db.query(
    `SELECT id, route_key, job_type, payload, created_at, expires_at, acked_at
     FROM social_mailbox
     WHERE route_key = $1
       AND job_type = $2
       AND idempotency_key = $3
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [routeKey, params.jobType, idempotencyKey]
  );
  if (existing.rows[0]) {
    return { ...mapRow(existing.rows[0]), created: false };
  }

  const id = randomUUID();
  const result = await db.query(
    `INSERT INTO social_mailbox (id, route_key, job_type, payload, idempotency_key, expires_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, NOW() + ($6::text || ' hours')::interval)
     RETURNING id, route_key, job_type, payload, created_at, expires_at, acked_at`,
    [id, routeKey, params.jobType, JSON.stringify(payload), idempotencyKey, String(ttlHours)]
  );
  return { ...mapRow(result.rows[0]), created: true };
}

export async function lookupMailboxJob(params: {
  routeKey: string;
  jobType: SocialMailboxJobType;
  callerKey?: string;
  messageId?: string;
  commentId?: string;
  requestId?: string;
  fileId?: string;
}): Promise<SocialMailboxJob | null> {
  const callerKey =
    params.callerKey ||
    params.messageId ||
    params.commentId ||
    params.requestId ||
    params.fileId ||
    '';
  if (!callerKey) return null;
  const db = getDatabasePool();
  const result = await db.query(
    `SELECT id, route_key, job_type, payload, created_at, expires_at, acked_at
     FROM social_mailbox
     WHERE route_key = $1
       AND job_type = $2
       AND idempotency_key = $3
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [params.routeKey.trim(), params.jobType, mailboxIdempotencyKey(params.routeKey.trim(), params.jobType, callerKey)]
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
  // Chat/social before notification_row so stuck notification backlog cannot hide delivery.
  const result = await db.query(
    `SELECT id, route_key, job_type, payload, created_at, expires_at, acked_at
     FROM social_mailbox
     WHERE route_key = $1
       AND acked_at IS NULL
       AND expires_at > NOW()
       AND ($3::text[] IS NULL OR job_type = ANY($3::text[]))
     ORDER BY
       CASE job_type
         WHEN 'message_append' THEN 0
         WHEN 'group_message_append' THEN 0
         WHEN 'pen.section_promote' THEN 0
         WHEN 'pen.comment' THEN 0
         WHEN 'pen.suggestion' THEN 0
         WHEN 'pen.draft_upsert' THEN 0
         WHEN 'pen.publish' THEN 0
         WHEN 'pen.doc_bootstrap' THEN 0
         WHEN 'pen.doc_delete' THEN 0
         WHEN 'pen.font_upsert' THEN 0
         WHEN 'pen.poll_vote' THEN 0
         WHEN 'pen.widget_action' THEN 0
         WHEN 'pen.doc_invite_claim' THEN 0
         WHEN 'group_inbox_update' THEN 0
         WHEN 'message_attachment' THEN 1
         WHEN 'connection_request' THEN 1
         WHEN 'connection_accept' THEN 1
         WHEN 'connection_reject' THEN 1
         WHEN 'connection_delete' THEN 1
         WHEN 'follower_add' THEN 1
         WHEN 'follower_remove' THEN 1
         WHEN 'notification_row' THEN 9
         ELSE 5
       END ASC,
       created_at ASC
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
    `DELETE FROM social_mailbox
     WHERE route_key = $1
       AND id = ANY($2::uuid[])
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
     RETURNING id`
  );
  return result.rowCount ?? 0;
}

/** Drop rows that are not a sealed envelope. Senders rebuild those from their outbox. */
export async function wipeSocialMailbox(): Promise<number> {
  const db = getDatabasePool();
  const result = await db.query(
    `DELETE FROM social_mailbox
     WHERE payload->'envelope'->>'kemCiphertext' IS NULL
        OR payload->'envelope'->>'ciphertext' IS NULL
        OR COALESCE(payload->>'envelopeContext', '') = ''
        OR EXISTS (
          SELECT 1 FROM jsonb_object_keys(payload) AS key
          WHERE key NOT IN ('envelope', 'envelopeContext')
        )
     RETURNING id`
  );
  return result.rowCount ?? 0;
}

function mapRow(row: Record<string, unknown>): SocialMailboxJob {
  const routeKey = row.route_key != null ? String(row.route_key) : '';
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
