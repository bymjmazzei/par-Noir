/**
 * Creator fund rolling period close — G/E/R from DB only (no Stripe API).
 * Policy: CREATOR_FUND_AND_SUBSCRIPTION_ECONOMICS.md (waterfall, 90/10 on fund slice).
 *
 * Window boundaries are **contiguous UTC** slices (`CREATOR_FUND_PERIOD_DAYS`, default 30).
 * Policy text references America/New_York for payouts and ops cadence — aligning period cutovers
 * to Eastern is a later refinement (allocator cron can switch to TZ-aware boundaries).
 *
 * Bounty allocation: **90/10** uses **engagement actor** verification (`verified_identities` on `user_did`).
 * Weights are like/comment/share/save counts per (file, actor). **Library music** (`music_registry_post_uses`
 * + active track): **75%** of that weight to the post owner, **25%** to the track’s `owner_pn_identifier`.
 *
 * Optional `CREATOR_FUND_PERIOD_ATTESTATION_SECRET`: HMAC-SHA256(chain_hash) on the closed row.
 * Optional `CREATOR_FUND_PERIOD_KMS_KEY_VERSION`: GCP KMS resource name; asymmetricSign over SHA-256(chain_hash).
 */

import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { getDatabasePool } from '../utils/database';

const DEFAULT_WINDOW_DAYS = 30;

function periodDays(): number {
  const raw = process.env.CREATOR_FUND_PERIOD_DAYS?.trim();
  if (!raw) return DEFAULT_WINDOW_DAYS;
  const n = parseInt(raw, 10);
  return !Number.isNaN(n) && n > 0 && n <= 366 ? n : DEFAULT_WINDOW_DAYS;
}

export interface ClosedFundPeriodRow {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  closedAt: string | null;
  gCents: number;
  eCents: number;
  rCents: number;
  platform25Cents: number;
  fund75Cents: number;
  bountyVerifiedCents: number;
  bountyUnverifiedCents: number;
  chainHash: string | null;
  /** Present when CREATOR_FUND_PERIOD_ATTESTATION_SECRET is set at close time. */
  periodAttestationHmac: string | null;
  /** Base64 signature when CREATOR_FUND_PERIOD_KMS_KEY_VERSION is set at close time. */
  periodAttestationKmsSignature: string | null;
  periodAttestationKmsKeyVersion: string | null;
}

function rowToDto(r: Record<string, unknown>): ClosedFundPeriodRow {
  return {
    id: String(r.id),
    periodStart: new Date(r.period_start as string).toISOString(),
    periodEnd: new Date(r.period_end as string).toISOString(),
    status: String(r.status),
    closedAt: r.closed_at ? new Date(r.closed_at as string).toISOString() : null,
    gCents: Number(r.g_cents ?? 0),
    eCents: Number(r.e_cents ?? 0),
    rCents: Number(r.r_cents ?? 0),
    platform25Cents: Number(r.platform_25_cents ?? 0),
    fund75Cents: Number(r.fund_75_cents ?? 0),
    bountyVerifiedCents: Number(r.bounty_verified_cents ?? 0),
    bountyUnverifiedCents: Number(r.bounty_unverified_cents ?? 0),
    chainHash: r.chain_hash != null ? String(r.chain_hash) : null,
    periodAttestationHmac:
      r.period_attestation_hmac != null ? String(r.period_attestation_hmac) : null,
    periodAttestationKmsSignature:
      r.period_attestation_kms_signature != null ? String(r.period_attestation_kms_signature) : null,
    periodAttestationKmsKeyVersion:
      r.period_attestation_kms_key_version != null ? String(r.period_attestation_kms_key_version) : null
  };
}

function sha256Hex(parts: string[]): string {
  const h = crypto.createHash('sha256');
  for (const p of parts) h.update(p, 'utf8');
  return h.digest('hex');
}

function periodAttestationHmac(chainHashHex: string): string | null {
  const secret = process.env.CREATOR_FUND_PERIOD_ATTESTATION_SECRET?.trim();
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update(chainHashHex, 'utf8').digest('hex');
}

function allocateProportional(
  poolCents: number,
  recipients: Array<{ id: string; weight: number }>
): Map<string, number> {
  const out = new Map<string, number>();
  const pool = Math.floor(Number(poolCents));
  if (pool <= 0 || recipients.length === 0) return out;
  const total = recipients.reduce((a, r) => a + r.weight, 0);
  if (!Number.isFinite(total) || total <= 0) return out;
  const sorted = [...recipients].sort((a, b) => a.id.localeCompare(b.id));
  let allocated = 0;
  const shares = sorted.map((r) => ({
    id: r.id,
    share: Math.floor((pool * r.weight) / total)
  }));
  for (const s of shares) {
    out.set(s.id, s.share);
    allocated += s.share;
  }
  let rem = pool - allocated;
  let i = 0;
  while (rem > 0) {
    const id = sorted[i % sorted.length].id;
    out.set(id, (out.get(id) || 0) + 1);
    rem--;
    i++;
  }
  return out;
}

function addWeight(m: Map<string, number>, key: string, w: number): void {
  if (!Number.isFinite(w) || w <= 0) return;
  m.set(key, (m.get(key) || 0) + w);
}

/**
 * Distributes bounty pools: actor-verified vs actor-unverified; per event 75/25 when a post uses an active registry track.
 */
async function allocateCreatorBountyShares(
  client: PoolClient,
  periodId: string,
  periodStartIso: string,
  periodEndIso: string,
  bountyVerifiedCents: number,
  bountyUnverifiedCents: number
): Promise<void> {
  const aggRes = await client.query(
    `WITH per_actor_file AS (
       SELECT e.file_id, e.user_did AS actor_id, COUNT(*)::bigint AS cnt
       FROM engagement e
       WHERE e.created_at >= $1::timestamptz AND e.created_at < $2::timestamptz
         AND e.type IN ('like', 'comment', 'share', 'save')
       GROUP BY e.file_id, e.user_did
     ),
     with_owner AS (
       SELECT p.*, COALESCE(m.pn_identifier, t.pn_identifier, c.pn_identifier) AS owner_pn
       FROM per_actor_file p
       LEFT JOIN aggregator_media m ON m.file_id = p.file_id
       LEFT JOIN aggregator_thoughts t ON t.file_id = p.file_id
       LEFT JOIN aggregator_collections c ON c.file_id = p.file_id
     ),
     with_track AS (
       SELECT w.*, pu.registry_track_id, tr.owner_pn_identifier AS track_owner_pn, tr.status AS track_status
       FROM with_owner w
       LEFT JOIN music_registry_post_uses pu ON pu.post_file_id = w.file_id
       LEFT JOIN music_registry_tracks tr ON tr.id = pu.registry_track_id
     )
     SELECT wt.file_id, wt.actor_id, wt.cnt, wt.owner_pn, wt.registry_track_id, wt.track_owner_pn, wt.track_status,
       (wt.registry_track_id IS NOT NULL AND wt.track_status = 'active' AND wt.track_owner_pn IS NOT NULL
         AND LENGTH(TRIM(wt.track_owner_pn)) > 0) AS uses_library_music,
       EXISTS (
         SELECT 1 FROM verified_identities vi
         WHERE vi.identity_id = wt.actor_id AND vi.is_active = TRUE
       ) AS actor_verified
     FROM with_track wt
     WHERE wt.owner_pn IS NOT NULL AND LENGTH(TRIM(wt.owner_pn)) > 0`,
    [periodStartIso, periodEndIso]
  );

  const verifiedWeights = new Map<string, number>();
  const unverifiedWeights = new Map<string, number>();

  for (const row of aggRes.rows) {
    const ownerPn = String(row.owner_pn ?? '').trim();
    const cnt = Number(row.cnt ?? 0);
    if (!ownerPn || !Number.isFinite(cnt) || cnt <= 0) continue;
    const usesMusic = Boolean(row.uses_library_music);
    const actorVerified = Boolean(row.actor_verified);
    const trackOwnerPn = String(row.track_owner_pn ?? '').trim();
    const creatorMult = usesMusic ? 75 : 100;
    const musicMult = usesMusic && trackOwnerPn ? 25 : 0;
    const cW = cnt * creatorMult;
    const mW = cnt * musicMult;
    const target = actorVerified ? verifiedWeights : unverifiedWeights;
    addWeight(target, `c:${ownerPn}`, cW);
    if (mW > 0) {
      addWeight(target, `m:${trackOwnerPn}`, mW);
    }
  }

  const toRecipients = (m: Map<string, number>) =>
    [...m.entries()].map(([id, weight]) => ({ id, weight }));

  const vMap = allocateProportional(bountyVerifiedCents, toRecipients(verifiedWeights));
  const uMap = allocateProportional(bountyUnverifiedCents, toRecipients(unverifiedWeights));

  for (const [key, cents] of vMap) {
    if (cents <= 0) continue;
    const isMusic = key.startsWith('m:');
    const recipientId = key.slice(2);
    const bucket = isMusic ? 'music_verified' : 'verified';
    const w = verifiedWeights.get(key) ?? 0;
    await client.query(
      `INSERT INTO creator_fund_period_creator_allocations (
         period_id, recipient_identity_id, bucket, engagement_units, allocation_cents
       ) VALUES ($1::uuid, $2, $3::varchar, $4, $5)`,
      [periodId, recipientId, bucket, w, cents]
    );
  }
  for (const [key, cents] of uMap) {
    if (cents <= 0) continue;
    const isMusic = key.startsWith('m:');
    const recipientId = key.slice(2);
    const bucket = isMusic ? 'music_unverified' : 'unverified';
    const w = unverifiedWeights.get(key) ?? 0;
    await client.query(
      `INSERT INTO creator_fund_period_creator_allocations (
         period_id, recipient_identity_id, bucket, engagement_units, allocation_cents
       ) VALUES ($1::uuid, $2, $3::varchar, $4, $5)`,
      [periodId, recipientId, bucket, w, cents]
    );
  }
}

export class CreatorFundPeriodService {
  static async listRecentClosed(limit: number): Promise<ClosedFundPeriodRow[]> {
    const pool = getDatabasePool();
    const lim = Math.min(Math.max(limit, 1), 48);
    const res = await pool.query(
      `SELECT * FROM creator_fund_periods
       WHERE status = 'closed' AND g_cents IS NOT NULL
       ORDER BY period_end DESC
       LIMIT $1`,
      [lim]
    );
    return res.rows.map(rowToDto);
  }

  /**
   * Close the next due window if `now >= period_end` (fixed-width contiguous windows in UTC).
   * Idempotent: skips if no window is due yet.
   */
  static async closeIfDue(): Promise<{
    closed: boolean;
    skipped?: string;
    period?: ClosedFundPeriodRow;
  }> {
    const pool = getDatabasePool();
    const days = periodDays();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const lastRes = await client.query(
        `SELECT period_end FROM creator_fund_periods
         WHERE status = 'closed' AND g_cents IS NOT NULL
         ORDER BY period_end DESC
         LIMIT 1
         FOR UPDATE`
      );
      let periodStart: Date;
      if (lastRes.rows.length === 0) {
        periodStart = new Date(Date.now() - days * 86400000);
      } else {
        periodStart = new Date(lastRes.rows[0].period_end as string);
      }
      const periodEnd = new Date(periodStart.getTime() + days * 86400000);
      if (Date.now() < periodEnd.getTime()) {
        await client.query('ROLLBACK');
        return {
          closed: false,
          skipped: `next_window_not_ready; period_end=${periodEnd.toISOString()}`
        };
      }

      const dup = await client.query(
        `SELECT 1 FROM creator_fund_periods WHERE status = 'closed' AND period_start = $1 AND period_end = $2`,
        [periodStart.toISOString(), periodEnd.toISOString()]
      );
      if (dup.rows.length > 0) {
        await client.query('ROLLBACK');
        return { closed: false, skipped: 'already_closed' };
      }

      const gRes = await client.query(
        `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS g
         FROM creator_fund_revenue_events
         WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz`,
        [periodStart.toISOString(), periodEnd.toISOString()]
      );
      const gCents = Number(gRes.rows[0]?.g ?? 0);

      const eRes = await client.query(
        `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS e
         FROM creator_fund_opex_events
         WHERE effective_at >= $1::timestamptz AND effective_at < $2::timestamptz`,
        [periodStart.toISOString(), periodEnd.toISOString()]
      );
      const eCents = Number(eRes.rows[0]?.e ?? 0);

      const rCents = Math.max(0, gCents - eCents);
      const platform25Cents = Math.floor((rCents * 25) / 100);
      const fund75Cents = rCents - platform25Cents;
      const bountyVerifiedCents = Math.floor((fund75Cents * 90) / 100);
      const bountyUnverifiedCents = fund75Cents - bountyVerifiedCents;

      const prevHashRes = await client.query(
        `SELECT chain_hash FROM creator_fund_periods
         WHERE status = 'closed' AND chain_hash IS NOT NULL
         ORDER BY period_end DESC LIMIT 1`
      );
      const chainPrev = prevHashRes.rows[0]?.chain_hash
        ? String(prevHashRes.rows[0].chain_hash)
        : '';
      const canonical = JSON.stringify({
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        gCents,
        eCents,
        rCents,
        platform25Cents,
        fund75Cents,
        bountyVerifiedCents,
        bountyUnverifiedCents
      });
      const chainHash = sha256Hex([chainPrev, canonical]);
      const attestationHmac = periodAttestationHmac(chainHash);
      let kmsSig: string | null = null;
      let kmsKeyVer: string | null = null;
      const fundKms = process.env.CREATOR_FUND_PERIOD_KMS_KEY_VERSION?.trim();
      if (fundKms) {
        const digest = crypto.createHash('sha256').update(chainHash, 'utf8').digest('base64');
        const { gcpKmsAsymmetricSignSha256Digest } = await import('../utils/gcpKmsAsymmetricSign');
        kmsSig = await gcpKmsAsymmetricSignSha256Digest(fundKms, digest);
        kmsKeyVer = fundKms;
      }

      const ins = await client.query(
        `INSERT INTO creator_fund_periods (
           period_start, period_end, status, closed_at,
           g_cents, e_cents, r_cents, platform_25_cents, fund_75_cents,
           bounty_verified_cents, bounty_unverified_cents,
           chain_prev_hash, chain_hash, period_attestation_hmac,
           period_attestation_kms_signature, period_attestation_kms_key_version
         ) VALUES ($1, $2, 'closed', NOW(), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          periodStart.toISOString(),
          periodEnd.toISOString(),
          gCents,
          eCents,
          rCents,
          platform25Cents,
          fund75Cents,
          bountyVerifiedCents,
          bountyUnverifiedCents,
          chainPrev || null,
          chainHash,
          attestationHmac,
          kmsSig,
          kmsKeyVer
        ]
      );

      const periodId = String(ins.rows[0].id);
      await allocateCreatorBountyShares(
        client,
        periodId,
        periodStart.toISOString(),
        periodEnd.toISOString(),
        bountyVerifiedCents,
        bountyUnverifiedCents
      );

      await client.query('COMMIT');
      return { closed: true, period: rowToDto(ins.rows[0]) };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async recordOpex(input: {
    amountCents: number;
    category: string;
    note?: string;
    effectiveAt?: Date;
  }): Promise<{ id: string }> {
    const amt = Math.floor(Number(input.amountCents));
    if (!Number.isFinite(amt) || amt < 0) {
      throw new Error('invalid_amount');
    }
    const cat = String(input.category || '').trim().slice(0, 80);
    if (!cat) throw new Error('category_required');
    const pool = getDatabasePool();
    const eff = input.effectiveAt ?? new Date();
    const res = await pool.query(
      `INSERT INTO creator_fund_opex_events (amount_cents, category, note, effective_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [amt, cat, input.note?.trim() || null, eff.toISOString()]
    );
    return { id: String(res.rows[0].id) };
  }
}
