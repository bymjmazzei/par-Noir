/**
 * Creator fund rolling period close — G/E/R from DB only (no Stripe API).
 * Policy: CREATOR_FUND_AND_SUBSCRIPTION_ECONOMICS.md (waterfall, 90/10 on fund slice).
 *
 * Window boundaries are **contiguous UTC** slices (`CREATOR_FUND_PERIOD_DAYS`, default 30).
 * Policy text references America/New_York for payouts and ops cadence — aligning period cutovers
 * to Eastern is a later refinement (allocator cron can switch to TZ-aware boundaries).
 *
 * After close: bounty pools split to **content owners** (aggregator pn_identifier) weighted by
 * like/comment/share/save engagement on their public files in the window (verified_identities for bucket).
 * Optional `CREATOR_FUND_PERIOD_ATTESTATION_SECRET`: stores HMAC-SHA256(chain_hash) on the closed row.
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
      r.period_attestation_hmac != null ? String(r.period_attestation_hmac) : null
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

/**
 * Distributes bounty verified / unverified pools to creators (content owners) by engagement weight.
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
    `WITH per_file AS (
       SELECT e.file_id, COUNT(*)::bigint AS cnt
       FROM engagement e
       WHERE e.created_at >= $1::timestamptz AND e.created_at < $2::timestamptz
         AND e.type IN ('like', 'comment', 'share', 'save')
       GROUP BY e.file_id
     ),
     owners AS (
       SELECT pf.file_id, pf.cnt, COALESCE(m.pn_identifier, t.pn_identifier, c.pn_identifier) AS owner_pn
       FROM per_file pf
       LEFT JOIN aggregator_media m ON m.file_id = pf.file_id
       LEFT JOIN aggregator_thoughts t ON t.file_id = pf.file_id
       LEFT JOIN aggregator_collections c ON c.file_id = pf.file_id
     )
     SELECT o.owner_pn AS recipient_identity_id,
            SUM(o.cnt)::bigint AS units,
            BOOL_OR(vi.identity_id IS NOT NULL) AS is_verified
     FROM owners o
     LEFT JOIN verified_identities vi ON vi.identity_id = o.owner_pn AND vi.is_active = TRUE
     WHERE o.owner_pn IS NOT NULL AND LENGTH(TRIM(o.owner_pn)) > 0
     GROUP BY o.owner_pn`,
    [periodStartIso, periodEndIso]
  );

  const verifiedRecipients: Array<{ id: string; weight: number }> = [];
  const unverifiedRecipients: Array<{ id: string; weight: number }> = [];
  for (const row of aggRes.rows) {
    const id = String(row.recipient_identity_id).trim();
    const units = Number(row.units ?? 0);
    if (!id || !Number.isFinite(units) || units <= 0) continue;
    if (row.is_verified === true) {
      verifiedRecipients.push({ id, weight: units });
    } else {
      unverifiedRecipients.push({ id, weight: units });
    }
  }

  const vMap = allocateProportional(bountyVerifiedCents, verifiedRecipients);
  const uMap = allocateProportional(bountyUnverifiedCents, unverifiedRecipients);

  const weightByIdVerified = new Map(verifiedRecipients.map((r) => [r.id, r.weight]));
  const weightByIdUnverified = new Map(unverifiedRecipients.map((r) => [r.id, r.weight]));

  for (const [recipientId, cents] of vMap) {
    if (cents <= 0) continue;
    const w = weightByIdVerified.get(recipientId) ?? 0;
    await client.query(
      `INSERT INTO creator_fund_period_creator_allocations (
         period_id, recipient_identity_id, bucket, engagement_units, allocation_cents
       ) VALUES ($1::uuid, $2, 'verified', $3, $4)`,
      [periodId, recipientId, w, cents]
    );
  }
  for (const [recipientId, cents] of uMap) {
    if (cents <= 0) continue;
    const w = weightByIdUnverified.get(recipientId) ?? 0;
    await client.query(
      `INSERT INTO creator_fund_period_creator_allocations (
         period_id, recipient_identity_id, bucket, engagement_units, allocation_cents
       ) VALUES ($1::uuid, $2, 'unverified', $3, $4)`,
      [periodId, recipientId, w, cents]
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

      const ins = await client.query(
        `INSERT INTO creator_fund_periods (
           period_start, period_end, status, closed_at,
           g_cents, e_cents, r_cents, platform_25_cents, fund_75_cents,
           bounty_verified_cents, bounty_unverified_cents,
           chain_prev_hash, chain_hash, period_attestation_hmac
         ) VALUES ($1, $2, 'closed', NOW(), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
          attestationHmac
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
