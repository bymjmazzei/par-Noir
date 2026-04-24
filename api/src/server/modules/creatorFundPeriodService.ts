/**
 * Creator fund rolling period close — G/E/R from DB only (no Stripe API).
 * Policy: CREATOR_FUND_AND_SUBSCRIPTION_ECONOMICS.md (waterfall, 90/10 on fund slice).
 *
 * Window boundaries: `CREATOR_FUND_PERIOD_DAYS` (default 30). Set `CREATOR_FUND_PERIOD_TZ=UTC`
 * for legacy contiguous UTC windows; otherwise an IANA zone (default **America/New_York**):
 * first window ends at local midnight “today”, starts `N` local calendar days earlier; later
 * windows tile from the prior `period_end` using `make_interval(days => N)`.
 *
 * Bounty: period dollars split **90/10** into two pools once (`bounty_verified_cents` / `bounty_unverified_cents`).
 * Weights from engagement (like/comment/share/save) use **`is_verified` at insert** into verified vs unverified maps;
 * only rows with **`actor_fund_monetizable` and `content_owner_fund_monetizable`** (witness-time verified + maintenance).
 * **Library music** (`music_registry_post_uses` + active track): **75%** / **25%** on those counts per pool.
 *
 * Optional `CREATOR_FUND_PERIOD_ATTESTATION_SECRET`: HMAC-SHA256(chain_hash) on the closed row.
 * Optional `CREATOR_FUND_PERIOD_KMS_KEY_VERSION`: GCP KMS resource name; asymmetricSign over SHA-256(chain_hash).
 */

import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { getDatabasePool } from '../utils/database';
import { musicPoolWeightsForRow } from './musicRegistrySplits';

const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_FUND_PERIOD_TZ = 'America/New_York';

function periodDays(): number {
  const raw = process.env.CREATOR_FUND_PERIOD_DAYS?.trim();
  if (!raw) return DEFAULT_WINDOW_DAYS;
  const n = parseInt(raw, 10);
  return !Number.isNaN(n) && n > 0 && n <= 366 ? n : DEFAULT_WINDOW_DAYS;
}

/** `UTC` → legacy JS 86400 ms steps; else IANA zone (parameterized in SQL). */
function fundPeriodZone(): 'UTC' | string {
  const raw = process.env.CREATOR_FUND_PERIOD_TZ?.trim();
  if (raw && raw.toUpperCase() === 'UTC') return 'UTC';
  const z = raw || DEFAULT_FUND_PERIOD_TZ;
  if (!/^[A-Za-z0-9_/+-]+$/.test(z)) {
    console.warn('[creator-fund] invalid CREATOR_FUND_PERIOD_TZ; using America/New_York');
    return DEFAULT_FUND_PERIOD_TZ;
  }
  return z;
}

async function computeFundPeriodWindow(
  client: PoolClient,
  lastPeriodEnd: Date | null,
  days: number,
  zone: 'UTC' | string
): Promise<{ periodStart: Date; periodEnd: Date }> {
  if (zone === 'UTC') {
    let periodStart: Date;
    if (!lastPeriodEnd) {
      periodStart = new Date(Date.now() - days * 86400000);
    } else {
      periodStart = lastPeriodEnd;
    }
    const periodEnd = new Date(periodStart.getTime() + days * 86400000);
    return { periodStart, periodEnd };
  }

  if (!lastPeriodEnd) {
    const r = await client.query(
      `SELECT
         (
           (date_trunc('day', now() AT TIME ZONE $1::text) AT TIME ZONE $1::text)::timestamptz
           - make_interval(days => $2::int)
         ) AS period_start,
         (
           (date_trunc('day', now() AT TIME ZONE $1::text) AT TIME ZONE $1::text)::timestamptz
         ) AS period_end`,
      [zone, days]
    );
    return {
      periodStart: new Date(r.rows[0].period_start as string),
      periodEnd: new Date(r.rows[0].period_end as string)
    };
  }

  const r = await client.query(
    `SELECT
       $1::timestamptz AS period_start,
       ($1::timestamptz + make_interval(days => $2::int)) AS period_end`,
    [lastPeriodEnd.toISOString(), days]
  );
  return {
    periodStart: new Date(r.rows[0].period_start as string),
    periodEnd: new Date(r.rows[0].period_end as string)
  };
}

export interface ClosedFundPeriodRow {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  closedAt: string | null;
  /** IANA zone when non-UTC windows were used; null for legacy UTC closes. */
  periodTz: string | null;
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
    periodTz: r.period_tz != null ? String(r.period_tz) : null,
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
 * Distributes bounty pools: period dollars are already split 90/10 (verified vs unverified cash pools).
 * Weights: only rows where actor + content owner were fund-eligible at witness time; verified vs unverified
 * bucket uses engagement.is_verified at insert (not verified_identities at close).
 * Library music: 75/25 on each bucket’s counts. Rows pre-migration (fund flags false) contribute no fund weight.
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
    `WITH keyed AS (
       SELECT e.file_id,
              e.user_did AS actor_id,
              COALESCE(e.is_verified, FALSE) AS is_verified,
              COALESCE(m.pn_identifier, t.pn_identifier, c.pn_identifier) AS owner_pn
       FROM engagement e
       LEFT JOIN aggregator_media m ON m.file_id = e.file_id
       LEFT JOIN aggregator_thoughts t ON t.file_id = e.file_id
       LEFT JOIN aggregator_collections c ON c.file_id = e.file_id
       WHERE e.created_at >= $1::timestamptz AND e.created_at < $2::timestamptz
         AND e.type IN ('like', 'comment', 'share', 'save')
         AND e.actor_fund_monetizable IS TRUE
         AND e.content_owner_fund_monetizable IS TRUE
     ),
     per_actor_file AS (
       SELECT file_id,
              actor_id,
              SUM(CASE WHEN is_verified THEN 1 ELSE 0 END)::bigint AS cnt_verified,
              SUM(CASE WHEN NOT is_verified THEN 1 ELSE 0 END)::bigint AS cnt_unverified
       FROM keyed
       WHERE owner_pn IS NOT NULL AND LENGTH(TRIM(owner_pn)) > 0
       GROUP BY file_id, actor_id
     ),
     with_track AS (
       SELECT p.*, pu.registry_track_id, tr.owner_pn_identifier AS track_owner_pn, tr.status AS track_status,
              tr.splits_metadata AS splits_metadata
       FROM per_actor_file p
       LEFT JOIN music_registry_post_uses pu ON pu.post_file_id = p.file_id
       LEFT JOIN music_registry_tracks tr ON tr.id = pu.registry_track_id
     )
     SELECT wt.file_id, wt.actor_id, wt.cnt_verified, wt.cnt_unverified, wt.owner_pn,
       wt.registry_track_id, wt.track_owner_pn, wt.track_status, wt.splits_metadata,
       (wt.registry_track_id IS NOT NULL AND wt.track_status = 'active' AND wt.track_owner_pn IS NOT NULL
         AND LENGTH(TRIM(wt.track_owner_pn)) > 0) AS uses_library_music
     FROM with_track wt`,
    [periodStartIso, periodEndIso]
  );

  const verifiedWeights = new Map<string, number>();
  const unverifiedWeights = new Map<string, number>();

  const addRowWeights = (
    target: Map<string, number>,
    cnt: number,
    ownerPn: string,
    usesMusic: boolean,
    trackOwnerPn: string,
    splitsMeta: unknown
  ): void => {
    if (!Number.isFinite(cnt) || cnt <= 0) return;
    const creatorMult = usesMusic ? 75 : 100;
    const musicMult = usesMusic && trackOwnerPn ? 25 : 0;
    const cW = cnt * creatorMult;
    const mW = cnt * musicMult;
    addWeight(target, `c:${ownerPn}`, cW);
    if (mW > 0) {
      const shares = musicPoolWeightsForRow(splitsMeta, trackOwnerPn, mW);
      for (const { pn, weight } of shares) {
        const p = pn.trim();
        if (p) addWeight(target, `m:${p}`, weight);
      }
    }
  };

  for (const row of aggRes.rows) {
    const ownerPn = String(row.owner_pn ?? '').trim();
    if (!ownerPn) continue;
    const usesMusic = Boolean(row.uses_library_music);
    const trackOwnerPn = String(row.track_owner_pn ?? '').trim();
    const splitsMeta = row.splits_metadata;
    const cv = Number(row.cnt_verified ?? 0);
    const cu = Number(row.cnt_unverified ?? 0);
    addRowWeights(verifiedWeights, cv, ownerPn, usesMusic, trackOwnerPn, splitsMeta);
    addRowWeights(unverifiedWeights, cu, ownerPn, usesMusic, trackOwnerPn, splitsMeta);
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
   * Close the next due window if `now >= period_end`.
   * Idempotent: skips if no window is due yet.
   */
  static async closeIfDue(): Promise<{
    closed: boolean;
    skipped?: string;
    period?: ClosedFundPeriodRow;
  }> {
    const pool = getDatabasePool();
    const days = periodDays();
    const zone = fundPeriodZone();
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
      const lastEnd =
        lastRes.rows.length > 0 ? new Date(lastRes.rows[0].period_end as string) : null;
      const { periodStart, periodEnd } = await computeFundPeriodWindow(client, lastEnd, days, zone);
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

      const periodTzStored = zone === 'UTC' ? null : zone;
      const ins = await client.query(
        `INSERT INTO creator_fund_periods (
           period_start, period_end, status, closed_at, period_tz,
           g_cents, e_cents, r_cents, platform_25_cents, fund_75_cents,
           bounty_verified_cents, bounty_unverified_cents,
           chain_prev_hash, chain_hash, period_attestation_hmac,
           period_attestation_kms_signature, period_attestation_kms_key_version
         ) VALUES ($1, $2, 'closed', NOW(), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING *`,
        [
          periodStart.toISOString(),
          periodEnd.toISOString(),
          periodTzStored,
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

  /** Ops / finance export: closed period + per-recipient allocation rows (no Stripe). */
  static async getClosedPeriodAllocationsExport(periodId: string): Promise<{
    period: ClosedFundPeriodRow;
    allocations: Array<{
      recipientIdentityId: string;
      bucket: string;
      engagementUnits: number;
      allocationCents: number;
    }>;
  } | null> {
    const pool = getDatabasePool();
    const pRes = await pool.query(
      `SELECT * FROM creator_fund_periods
       WHERE id = $1::uuid AND status = 'closed' AND g_cents IS NOT NULL`,
      [periodId]
    );
    if (pRes.rows.length === 0) return null;
    const aRes = await pool.query(
      `SELECT recipient_identity_id, bucket, engagement_units, allocation_cents
       FROM creator_fund_period_creator_allocations
       WHERE period_id = $1::uuid
       ORDER BY recipient_identity_id ASC, bucket ASC`,
      [periodId]
    );
    const allocations = aRes.rows.map((r) => ({
      recipientIdentityId: String(r.recipient_identity_id),
      bucket: String(r.bucket),
      engagementUnits: Number(r.engagement_units ?? 0),
      allocationCents: Number(r.allocation_cents ?? 0)
    }));
    return { period: rowToDto(pRes.rows[0] as Record<string, unknown>), allocations };
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
