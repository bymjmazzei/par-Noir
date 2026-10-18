/**
 * Creator fund — monetization maintenance (Stripe) + internal balance + eligibility.
 * Policy: docs/business/CREATOR_FUND_AND_SUBSCRIPTION_ECONOMICS.md
 */

import Stripe from 'stripe';
import type { Pool } from 'pg';
import { getDatabasePool } from '../utils/database';
import { EngagementService } from './engagementService';
import { CreatorFundPeriodService, type ClosedFundPeriodRow } from './creatorFundPeriodService';
import { isCreatorFundPayoutCadenceDayET } from './creatorFundPayoutCadence';

type DbQueryable = Pick<Pool, 'query'>;

const MIN_CREATOR_PAYOUT_CENTS = 1000;

async function stripeChargeNetCents(
  stripe: Stripe,
  chargeId: string | null | undefined
): Promise<{ netCents: number; grossCents: number; feeCents: number }> {
  if (!chargeId || typeof chargeId !== 'string') {
    return { netCents: 0, grossCents: 0, feeCents: 0 };
  }
  const ch = await stripe.charges.retrieve(chargeId, { expand: ['balance_transaction'] });
  const grossCents = ch.amount ?? 0;
  let feeCents = 0;
  const bt = ch.balance_transaction;
  if (bt && typeof bt !== 'string') {
    feeCents = bt.fee ?? 0;
  }
  return { netCents: Math.max(0, grossCents - feeCents), grossCents, feeCents };
}

async function stripeNetFromCheckoutSession(
  stripe: Stripe,
  session: Stripe.Checkout.Session
): Promise<{ netCents: number; grossCents: number; feeCents: number }> {
  const grossCents = session.amount_total ?? 0;
  const pi = session.payment_intent;
  let chargeId: string | null = null;
  if (typeof pi === 'string') {
    const intent = await stripe.paymentIntents.retrieve(pi);
    chargeId =
      typeof intent.latest_charge === 'string' ? intent.latest_charge : intent.latest_charge?.id ?? null;
  } else if (pi && typeof pi === 'object') {
    chargeId =
      typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id ?? null;
  }
  if (!chargeId) {
    return { netCents: grossCents, grossCents, feeCents: 0 };
  }
  return stripeChargeNetCents(stripe, chargeId);
}

function payoutHoldDays(): number {
  const raw = process.env.CREATOR_FUND_PAYOUT_HOLD_DAYS?.trim();
  if (raw) {
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n >= 0 && n <= 3650) return n;
  }
  return 45;
}

async function creatorPayoutLedgerSnapshot(
  db: DbQueryable,
  pn: string
): Promise<{
  payableEarnedCents: number;
  inHoldEarnedCents: number;
  paidOutCents: number;
  processingReservedCents: number;
  renewalDebitsCents: number;
}> {
  const days = payoutHoldDays();
  const past = await db.query(
    `SELECT COALESCE(SUM(a.allocation_cents), 0)::bigint AS s
     FROM creator_fund_period_creator_allocations a
     INNER JOIN creator_fund_periods p ON p.id = a.period_id
     WHERE a.recipient_identity_id = $1
       AND p.status = 'closed'
       AND p.closed_at IS NOT NULL
       AND p.closed_at + ($2::int * INTERVAL '1 day') <= NOW()`,
    [pn, days]
  );
  const hold = await db.query(
    `SELECT COALESCE(SUM(a.allocation_cents), 0)::bigint AS s
     FROM creator_fund_period_creator_allocations a
     INNER JOIN creator_fund_periods p ON p.id = a.period_id
     WHERE a.recipient_identity_id = $1
       AND p.status = 'closed'
       AND p.closed_at IS NOT NULL
       AND p.closed_at + ($2::int * INTERVAL '1 day') > NOW()`,
    [pn, days]
  );
  const paid = await db.query(
    `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS s
     FROM creator_fund_payout_requests
     WHERE pn_identifier = $1 AND status = 'paid'`,
    [pn]
  );
  const processing = await db.query(
    `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS s
     FROM creator_fund_payout_requests
     WHERE pn_identifier = $1 AND status IN ('processing', 'queued')`,
    [pn]
  );
  const renewalDebits = await db.query(
    `SELECT COALESCE(SUM(-delta_cents), 0)::bigint AS s
     FROM creator_fund_ledger_entries
     WHERE pn_identifier = $1 AND delta_cents < 0
       AND reason IN ('maintenance_renewal_balance', 'maintenance_renewal_balance_partial')`,
    [pn]
  );
  return {
    payableEarnedCents: Number(past.rows[0]?.s ?? 0),
    inHoldEarnedCents: Number(hold.rows[0]?.s ?? 0),
    paidOutCents: Number(paid.rows[0]?.s ?? 0),
    processingReservedCents: Number(processing.rows[0]?.s ?? 0),
    renewalDebitsCents: Number(renewalDebits.rows[0]?.s ?? 0)
  };
}

/** Earnings past hold minus maintenance debits, payouts, and in-flight transfers. */
export function creatorFundAvailableCents(snap: {
  payableEarnedCents: number;
  paidOutCents: number;
  processingReservedCents: number;
  renewalDebitsCents: number;
}): number {
  return Math.max(
    0,
    snap.payableEarnedCents -
      snap.renewalDebitsCents -
      snap.paidOutCents -
      snap.processingReservedCents
  );
}

function getStripe(): Stripe | null {
  const k = process.env.STRIPE_SECRET_KEY?.trim();
  if (!k) return null;
  return new Stripe(k, { typescript: true });
}

export function isStripeMonetizationConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_MONETIZATION_PRICE_ID?.trim());
}

function renewalPriceCentsFromEnv(): number {
  const raw = process.env.STRIPE_MONETIZATION_RENEWAL_CENTS?.trim();
  if (raw) {
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return 0;
}

async function getRenewalUnitAmountCents(stripe: Stripe): Promise<number> {
  const fromEnv = renewalPriceCentsFromEnv();
  if (fromEnv > 0) return fromEnv;
  const priceId = process.env.STRIPE_MONETIZATION_PRICE_ID?.trim();
  if (!priceId) return 0;
  const price = await stripe.prices.retrieve(priceId);
  return price.unit_amount ?? 0;
}

export interface MonetizationStatusDto {
  verified: boolean;
  maintenanceActive: boolean;
  currentPeriodEnd: string | null;
  renewalPriceCents: number | null;
  eligibleForFundAccrual: boolean;
  stripeConfigured: boolean;
  stripeCustomerId: string | null;
  connectOnboarded: boolean;
  /** UX copy only — not a legal guarantee */
  payoutCadenceNote: string;
  /** Last closed fund windows (G/E/R from DB; no Stripe). */
  recentClosedPeriods: ClosedFundPeriodRow[];
  /** Bounty allocations past payout hold, minus paid and in-flight processing. */
  creatorFundPayoutAvailableCents: number;
  /** Allocated bounty still inside the post-close hold window. */
  creatorFundPayoutInHoldCents: number;
  /** Sum of completed Connect transfers for this identity. */
  creatorFundPaidOutCents: number;
}

export class MonetizationService {
  static async getStatus(pnIdentifier: string): Promise<MonetizationStatusDto> {
    const pn = pnIdentifier.trim();
    const verified = await EngagementService.isIdentityVerifiedForMonetization(pn);
    const pool = getDatabasePool();

    const subRes = await pool.query(
      `SELECT stripe_customer_id, stripe_subscription_id, status, current_period_end
       FROM monetization_subscriptions WHERE pn_identifier = $1`,
      [pn]
    );
    const row = subRes.rows[0] as
      | {
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          status: string;
          current_period_end: Date | null;
        }
      | undefined;

    const connectRes = await pool.query(
      `SELECT payouts_enabled FROM creator_fund_connect_accounts WHERE pn_identifier = $1`,
      [pn]
    );
    const connectOnboarded =
      connectRes.rows.length > 0 && Boolean(connectRes.rows[0].payouts_enabled);

    const maintenanceActive =
      row?.status === 'active' &&
      row?.current_period_end != null &&
      new Date(row.current_period_end).getTime() > Date.now();

    let renewalPriceCents: number | null = null;
    const stripe = getStripe();
    if (stripe) {
      try {
        renewalPriceCents = await getRenewalUnitAmountCents(stripe);
      } catch {
        renewalPriceCents = renewalPriceCentsFromEnv() || null;
      }
    } else {
      renewalPriceCents = renewalPriceCentsFromEnv() || null;
    }

    const eligibleForFundAccrual = verified && maintenanceActive;

    const recentClosedPeriods = await CreatorFundPeriodService.listRecentClosed(4);

    let ledgerSnap = {
      payableEarnedCents: 0,
      inHoldEarnedCents: 0,
      paidOutCents: 0,
      processingReservedCents: 0,
      renewalDebitsCents: 0
    };
    try {
      ledgerSnap = await creatorPayoutLedgerSnapshot(pool, pn);
    } catch {
      /* tables may be absent until migration on older deployments */
    }
    const creatorFundPayoutAvailableCents = creatorFundAvailableCents(ledgerSnap);

    return {
      verified,
      maintenanceActive,
      currentPeriodEnd: row?.current_period_end ? new Date(row.current_period_end).toISOString() : null,
      renewalPriceCents,
      eligibleForFundAccrual,
      stripeConfigured: isStripeMonetizationConfigured(),
      stripeCustomerId: row?.stripe_customer_id ?? null,
      connectOnboarded,
      payoutCadenceNote:
        'Payouts are payee-initiated on typical schedule 1st and 15th Eastern; 45-day hold, $10 minimum, US-only Connect v1 — see creator fund policy.',
      recentClosedPeriods,
      creatorFundPayoutAvailableCents,
      creatorFundPayoutInHoldCents: ledgerSnap.inHoldEarnedCents,
      creatorFundPaidOutCents: ledgerSnap.paidOutCents
    };
  }

  static async createCheckoutSession(pnIdentifier: string, returnBaseUrl: string): Promise<{ url: string }> {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('stripe_not_configured');
    }
    const priceId = process.env.STRIPE_MONETIZATION_PRICE_ID?.trim();
    if (!priceId) {
      throw new Error('stripe_price_not_configured');
    }
    const pn = pnIdentifier.trim();
    const pool = getDatabasePool();

    let customerId: string | undefined;
    const existing = await pool.query(
      `SELECT stripe_customer_id FROM monetization_subscriptions WHERE pn_identifier = $1`,
      [pn]
    );
    if (existing.rows[0]?.stripe_customer_id) {
      customerId = existing.rows[0].stripe_customer_id as string;
    } else {
      const customer = await stripe.customers.create({
        metadata: { pn_identifier: pn }
      });
      customerId = customer.id;
      await pool.query(
        `INSERT INTO monetization_subscriptions (pn_identifier, stripe_customer_id, status, updated_at)
         VALUES ($1, $2, 'incomplete', NOW())
         ON CONFLICT (pn_identifier) DO UPDATE SET stripe_customer_id = COALESCE(monetization_subscriptions.stripe_customer_id, EXCLUDED.stripe_customer_id), updated_at = NOW()`,
        [pn, customerId]
      );
    }

    const successUrl = `${returnBaseUrl.replace(/\/$/, '')}/?monetization=success`;
    const cancelUrl = `${returnBaseUrl.replace(/\/$/, '')}/?monetization=cancel`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { pn_identifier: pn },
      subscription_data: {
        metadata: { pn_identifier: pn }
      }
    });
    if (!session.url) {
      throw new Error('checkout_no_url');
    }
    return { url: session.url };
  }

  static async createBillingPortalSession(pnIdentifier: string, returnBaseUrl: string): Promise<{ url: string }> {
    const stripe = getStripe();
    if (!stripe) throw new Error('stripe_not_configured');
    const pn = pnIdentifier.trim();
    const pool = getDatabasePool();
    const r = await pool.query(
      `SELECT stripe_customer_id FROM monetization_subscriptions WHERE pn_identifier = $1`,
      [pn]
    );
    const customerId = r.rows[0]?.stripe_customer_id as string | undefined;
    if (!customerId) {
      throw new Error('no_stripe_customer');
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${returnBaseUrl.replace(/\/$/, '')}/?monetization=portal_return`
    });
    return { url: session.url };
  }

  /**
   * Balance-first maintenance renewal (ledger debit; shortfall via one-time Checkout on platform Stripe).
   */
  static async renewFromBalance(
    pnIdentifier: string,
    returnBaseUrl?: string
  ): Promise<{
    renewed: boolean;
    balanceAfter: number;
    needsPayment: boolean;
    shortfallCents?: number;
    checkoutUrl?: string;
  }> {
    const stripe = getStripe();
    if (!stripe) throw new Error('stripe_not_configured');
    const pn = pnIdentifier.trim();
    const renewalCents = await getRenewalUnitAmountCents(stripe);
    if (renewalCents <= 0) {
      throw new Error('renewal_price_unknown');
    }

    const pool = getDatabasePool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('cf_payout:' || $1::text))`, [pn]);
      const snap = await creatorPayoutLedgerSnapshot(client, pn);
      const available = creatorFundAvailableCents(snap);

      if (available <= 0) {
        await client.query('ROLLBACK');
        return {
          renewed: false,
          balanceAfter: 0,
          needsPayment: true,
          shortfallCents: renewalCents
        };
      }

      if (available >= renewalCents) {
        const newBalance = available - renewalCents;

        const sub = await client.query(
          `SELECT current_period_end FROM monetization_subscriptions WHERE pn_identifier = $1 FOR UPDATE`,
          [pn]
        );
        const prevEnd = sub.rows[0]?.current_period_end
          ? new Date(sub.rows[0].current_period_end as string)
          : new Date();
        const base = Math.max(Date.now(), prevEnd.getTime());
        const nextEnd = new Date(base);
        nextEnd.setUTCMonth(nextEnd.getUTCMonth() + 1);

        await client.query(
          `INSERT INTO monetization_subscriptions (pn_identifier, status, current_period_end, updated_at)
           VALUES ($1, 'active', $2, NOW())
           ON CONFLICT (pn_identifier) DO UPDATE SET
             status = 'active',
             current_period_end = EXCLUDED.current_period_end,
             updated_at = NOW()`,
          [pn, nextEnd.toISOString()]
        );

        await client.query(
          `INSERT INTO creator_fund_ledger_entries (pn_identifier, delta_cents, balance_after_cents, reason, ref_type)
           VALUES ($1, $2, $3, 'maintenance_renewal_balance', 'maintenance')`,
          [pn, -renewalCents, newBalance]
        );

        await client.query(
          `INSERT INTO creator_fund_revenue_events (pn_identifier, source, event_type, amount_cents, currency, metadata)
           VALUES ($1, 'ledger_balance', 'maintenance_renewal', $2, 'USD', $3::jsonb)`,
          [pn, renewalCents, JSON.stringify({ channel: 'balance_first' })]
        );

        await client.query('COMMIT');
        return { renewed: true, balanceAfter: newBalance, needsPayment: false };
      }

      const shortfallCents = renewalCents - available;
      const newBalance = 0;
      await client.query(
        `INSERT INTO creator_fund_ledger_entries (pn_identifier, delta_cents, balance_after_cents, reason, ref_type)
         VALUES ($1, $2, $3, 'maintenance_renewal_balance_partial', 'maintenance')`,
        [pn, -available, newBalance]
      );
      await client.query(
        `INSERT INTO creator_fund_revenue_events (pn_identifier, source, event_type, amount_cents, currency, metadata)
         VALUES ($1, 'ledger_balance', 'maintenance_renewal_partial', $2, 'USD', $3::jsonb)`,
        [pn, available, JSON.stringify({ channel: 'balance_first_partial', shortfallCents })]
      );
      await client.query('COMMIT');

      const baseUrl = (returnBaseUrl || '').replace(/\/$/, '');
      if (!baseUrl) {
        return {
          renewed: false,
          balanceAfter: newBalance,
          needsPayment: true,
          shortfallCents
        };
      }

      let customerId: string | undefined;
      const existing = await pool.query(
        `SELECT stripe_customer_id FROM monetization_subscriptions WHERE pn_identifier = $1`,
        [pn]
      );
      if (existing.rows[0]?.stripe_customer_id) {
        customerId = existing.rows[0].stripe_customer_id as string;
      } else {
        const customer = await stripe.customers.create({ metadata: { pn_identifier: pn } });
        customerId = customer.id;
        await pool.query(
          `INSERT INTO monetization_subscriptions (pn_identifier, stripe_customer_id, status, updated_at)
           VALUES ($1, $2, 'incomplete', NOW())
           ON CONFLICT (pn_identifier) DO UPDATE SET
             stripe_customer_id = COALESCE(monetization_subscriptions.stripe_customer_id, EXCLUDED.stripe_customer_id),
             updated_at = NOW()`,
          [pn, customerId]
        );
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer: customerId,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: shortfallCents,
              product_data: {
                name: 'Monetization maintenance (shortfall)'
              }
            }
          }
        ],
        success_url: `${baseUrl}/?monetization=shortfall_success`,
        cancel_url: `${baseUrl}/?monetization=shortfall_cancel`,
        metadata: {
          pn_identifier: pn,
          kind: 'maintenance_shortfall',
          shortfall_cents: String(shortfallCents)
        }
      });

      return {
        renewed: false,
        balanceAfter: newBalance,
        needsPayment: true,
        shortfallCents,
        checkoutUrl: session.url || undefined
      };
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      client.release();
    }
  }

  static async createConnectAccountLink(
    pnIdentifier: string,
    returnBaseUrl: string
  ): Promise<{ url: string; alreadyOnboarded: boolean }> {
    const stripe = getStripe();
    if (!stripe) throw new Error('stripe_not_configured');
    const pn = pnIdentifier.trim();
    const pool = getDatabasePool();

    const ex = await pool.query(
      `SELECT stripe_account_id, payouts_enabled FROM creator_fund_connect_accounts WHERE pn_identifier = $1`,
      [pn]
    );
    let accountId = ex.rows[0]?.stripe_account_id as string | undefined;
    if (ex.rows[0]?.payouts_enabled) {
      return { url: '', alreadyOnboarded: true };
    }
    if (!accountId) {
      const acct = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        capabilities: { transfers: { requested: true } },
        metadata: { pn_identifier: pn }
      });
      accountId = acct.id;
      await pool.query(
        `INSERT INTO creator_fund_connect_accounts (pn_identifier, stripe_account_id, payouts_enabled, details_submitted, updated_at)
         VALUES ($1, $2, false, false, NOW())
         ON CONFLICT (pn_identifier) DO UPDATE SET stripe_account_id = EXCLUDED.stripe_account_id, updated_at = NOW()`,
        [pn, accountId]
      );
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${returnBaseUrl.replace(/\/$/, '')}/?monetization=connect_refresh`,
      return_url: `${returnBaseUrl.replace(/\/$/, '')}/?monetization=connect_return`,
      type: 'account_onboarding'
    });
    return { url: link.url, alreadyOnboarded: false };
  }

  static async syncConnectStatus(pnIdentifier: string): Promise<void> {
    const stripe = getStripe();
    if (!stripe) return;
    const pn = pnIdentifier.trim();
    const pool = getDatabasePool();
    const r = await pool.query(
      `SELECT stripe_account_id FROM creator_fund_connect_accounts WHERE pn_identifier = $1`,
      [pn]
    );
    const id = r.rows[0]?.stripe_account_id as string | undefined;
    if (!id) return;
    const acct = await stripe.accounts.retrieve(id);
    await pool.query(
      `UPDATE creator_fund_connect_accounts SET
         payouts_enabled = $2,
         details_submitted = $3,
         updated_at = NOW()
       WHERE pn_identifier = $1`,
      [pn, Boolean(acct.payouts_enabled), Boolean(acct.details_submitted)]
    );
  }

  /**
   * Stripe Connect transfer to the user’s connected account (creator-fund bounty balance).
   * Uses a single DB transaction including the Stripe call and `pg_advisory_xact_lock` per identity.
   */
  static async requestCreatorFundPayout(
    pnIdentifier: string,
    amountCents: number
  ): Promise<{ payoutRequestId: string; amountCents: number; status: 'queued' }> {
    const stripe = getStripe();
    if (!stripe) throw new Error('stripe_not_configured');
    const pn = pnIdentifier.trim();
    const amt = Math.floor(Number(amountCents));
    if (!Number.isFinite(amt) || amt < MIN_CREATOR_PAYOUT_CENTS) {
      throw new Error('payout_amount_invalid');
    }

    await this.syncConnectStatus(pn);
    const pool = getDatabasePool();
    const destRes = await pool.query(
      `SELECT stripe_account_id, payouts_enabled FROM creator_fund_connect_accounts WHERE pn_identifier = $1`,
      [pn]
    );
    if (!destRes.rows[0]?.stripe_account_id || !destRes.rows[0]?.payouts_enabled) {
      throw new Error('connect_payouts_not_ready');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('cf_payout:' || $1::text))`, [pn]);
      const snap = await creatorPayoutLedgerSnapshot(client, pn);
      const available = creatorFundAvailableCents(snap);
      if (amt > available) {
        await client.query('ROLLBACK');
        throw new Error('payout_exceeds_available');
      }

      const insertRes = await client.query(
        `INSERT INTO creator_fund_payout_requests (pn_identifier, amount_cents, status)
         VALUES ($1, $2, 'queued')
         RETURNING id`,
        [pn, amt]
      );
      const payoutRowId = String(insertRes.rows[0].id);

      await client.query('COMMIT');
      return { payoutRequestId: payoutRowId, amountCents: amt, status: 'queued' };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** Cron: execute queued Connect transfers on 1st/15th Eastern (or `force` for ops). */
  static async runQueuedCreatorFundPayouts(opts?: {
    force?: boolean;
  }): Promise<{ processed: number; skipped?: string; errors: string[] }> {
    const stripe = getStripe();
    if (!stripe) throw new Error('stripe_not_configured');
    if (!opts?.force && !isCreatorFundPayoutCadenceDayET()) {
      return { processed: 0, skipped: 'not_payout_cadence_day', errors: [] };
    }
    const pool = getDatabasePool();
    const queued = await pool.query(
      `SELECT id, pn_identifier, amount_cents
       FROM creator_fund_payout_requests
       WHERE status = 'queued'
       ORDER BY created_at ASC
       LIMIT 200`
    );
    let processed = 0;
    const errors: string[] = [];
    for (const row of queued.rows) {
      const payoutRowId = String(row.id);
      const pn = String(row.pn_identifier).trim();
      const amt = Number(row.amount_cents);
      try {
        await this.syncConnectStatus(pn);
        const destRes = await pool.query(
          `SELECT stripe_account_id, payouts_enabled FROM creator_fund_connect_accounts WHERE pn_identifier = $1`,
          [pn]
        );
        const destination = destRes.rows[0]?.stripe_account_id as string | undefined;
        if (!destination || !destRes.rows[0]?.payouts_enabled) {
          errors.push(`${payoutRowId}:connect_not_ready`);
          continue;
        }
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(`SELECT pg_advisory_xact_lock(hashtext('cf_payout:' || $1::text))`, [pn]);
          const locked = await client.query(
            `SELECT id, amount_cents FROM creator_fund_payout_requests
             WHERE id = $1::uuid AND status = 'queued' FOR UPDATE`,
            [payoutRowId]
          );
          if (locked.rows.length === 0) {
            await client.query('ROLLBACK');
            continue;
          }
          await client.query(
            `UPDATE creator_fund_payout_requests SET status = 'processing', updated_at = NOW()
             WHERE id = $1::uuid`,
            [payoutRowId]
          );
          const transfer = await stripe.transfers.create({
            amount: amt,
            currency: 'usd',
            destination,
            metadata: { payout_request_id: payoutRowId, purpose: 'creator_fund_bounty' }
          });
          await client.query(
            `UPDATE creator_fund_payout_requests SET
               status = 'paid',
               stripe_transfer_id = $2,
               updated_at = NOW()
             WHERE id = $1::uuid`,
            [payoutRowId, transfer.id]
          );
          await client.query('COMMIT');
          processed += 1;
        } catch (e) {
          await client.query('ROLLBACK');
          await pool.query(
            `UPDATE creator_fund_payout_requests SET status = 'failed', updated_at = NOW() WHERE id = $1::uuid`,
            [payoutRowId]
          );
          errors.push(`${payoutRowId}:${e instanceof Error ? e.message : 'transfer_failed'}`);
        } finally {
          client.release();
        }
      } catch (e) {
        errors.push(`${payoutRowId}:${e instanceof Error ? e.message : 'outer_failed'}`);
      }
    }
    return { processed, errors };
  }

  /**
   * Unconditional paid license — direct charge on seller's Connect account (seller MoR).
   */
  static async createLicenseCheckoutSession(input: {
    buyerPn: string;
    assetId: string;
    scope: 'personal' | 'commercial';
    returnBaseUrl: string;
  }): Promise<{ url: string }> {
    const stripe = getStripe();
    if (!stripe) throw new Error('stripe_not_configured');
    const buyer = input.buyerPn.trim();
    const assetId = input.assetId.trim();
    const scope = input.scope === 'commercial' ? 'commercial' : 'personal';
    if (!buyer || !assetId) {
      throw new Error('license_checkout_invalid');
    }
    const { resolvePaidLicenseOffer } = await import('./licenseGrantService');
    const { sellerPn, priceCents } = await resolvePaidLicenseOffer(assetId, scope);
    const seller = sellerPn.trim();
    if (!seller || priceCents <= 0) {
      throw new Error('license_checkout_invalid');
    }
    await this.syncConnectStatus(seller);
    const pool = getDatabasePool();
    const conn = await pool.query(
      `SELECT stripe_account_id, payouts_enabled FROM creator_fund_connect_accounts WHERE pn_identifier = $1`,
      [seller]
    );
    if (!conn.rows[0]?.stripe_account_id || !conn.rows[0]?.payouts_enabled) {
      throw new Error('connect_payouts_not_ready');
    }
    const stripeAccount = conn.rows[0].stripe_account_id as string;
    const base = input.returnBaseUrl.replace(/\/$/, '');
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: priceCents,
              product_data: {
                name: `License (${input.scope})`,
                metadata: { asset_id: assetId }
              }
            }
          }
        ],
        success_url: `${base}/?license=success&asset=${encodeURIComponent(assetId)}`,
        cancel_url: `${base}/?license=cancel`,
        metadata: {
          kind: 'license_purchase',
          asset_id: assetId,
          scope,
          price_cents: String(priceCents),
          seller_pn: seller,
          buyer_pn: buyer,
          pn_identifier: buyer
        }
      },
      { stripeAccount }
    );
    if (!session.url) throw new Error('checkout_no_url');
    return { url: session.url };
  }

  static constructConnectWebhookEvent(rawBody: Buffer, signature: string | undefined): Stripe.Event {
    const stripe = getStripe();
    const wh = process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim();
    if (!stripe || !wh) {
      throw new Error('stripe_connect_webhook_not_configured');
    }
    if (!signature) {
      throw new Error('missing_signature');
    }
    return stripe.webhooks.constructEvent(rawBody, signature, wh);
  }

  static async handleStripeConnectWebhookEvent(event: Stripe.Event): Promise<void> {
    if (event.type !== 'checkout.session.completed') return;
    const session = event.data.object as Stripe.Checkout.Session;
    const kind = (session.metadata?.kind || '').trim();
    if (kind !== 'license_purchase') return;
    const buyer = (session.metadata?.buyer_pn || '').trim();
    const seller = (session.metadata?.seller_pn || '').trim();
    const assetId = (session.metadata?.asset_id || '').trim();
    const scope = session.metadata?.scope === 'commercial' ? 'commercial' : 'personal';
    const priceCents = Math.floor(Number(session.metadata?.price_cents || session.amount_total || 0));
    const paymentRef =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || session.id;
    if (!buyer || !seller || !assetId || priceCents <= 0) return;
    const { insertLicenseGrant } = await import('./licenseGrantService');
    await insertLicenseGrant({
      assetId,
      sellerPn: seller,
      buyerPn: buyer,
      scope,
      priceCents,
      stripePaymentRef: paymentRef
    });
  }

  static constructWebhookEvent(rawBody: Buffer, signature: string | undefined): Stripe.Event {
    const stripe = getStripe();
    const wh = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!stripe || !wh) {
      throw new Error('stripe_webhook_not_configured');
    }
    if (!signature) {
      throw new Error('missing_signature');
    }
    return stripe.webhooks.constructEvent(rawBody, signature, wh);
  }

  static async handleStripeWebhookEvent(event: Stripe.Event): Promise<void> {
    const stripe = getStripe();
    if (!stripe) return;
    const pool = getDatabasePool();

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const pn = (session.metadata?.pn_identifier || '').trim();
        const kind = (session.metadata?.kind || '').trim();

        if (session.mode === 'payment' && kind === 'maintenance_shortfall' && pn) {
          const { netCents, grossCents, feeCents } = await stripeNetFromCheckoutSession(stripe, session);
          const shortfall = netCents > 0 ? netCents : Math.floor(Number(session.amount_total || 0));
          if (shortfall > 0) {
            await pool.query(
              `INSERT INTO creator_fund_revenue_events (pn_identifier, source, event_type, amount_cents, currency, stripe_event_id, metadata)
               VALUES ($1, 'stripe', 'maintenance_shortfall', $2, 'USD', $3, $4::jsonb)
               ON CONFLICT (stripe_event_id) DO NOTHING`,
              [
                pn,
                shortfall,
                event.id,
                JSON.stringify({
                  checkout_session_id: session.id,
                  channel: 'shortfall',
                  gross_cents: grossCents,
                  stripe_fee_cents: feeCents
                })
              ]
            );
            const sub = await pool.query(
              `SELECT current_period_end FROM monetization_subscriptions WHERE pn_identifier = $1`,
              [pn]
            );
            const prevEnd = sub.rows[0]?.current_period_end
              ? new Date(sub.rows[0].current_period_end as string)
              : new Date();
            const base = Math.max(Date.now(), prevEnd.getTime());
            const nextEnd = new Date(base);
            nextEnd.setUTCMonth(nextEnd.getUTCMonth() + 1);
            await pool.query(
              `INSERT INTO monetization_subscriptions (pn_identifier, status, current_period_end, updated_at)
               VALUES ($1, 'active', $2, NOW())
               ON CONFLICT (pn_identifier) DO UPDATE SET
                 status = 'active',
                 current_period_end = EXCLUDED.current_period_end,
                 updated_at = NOW()`,
              [pn, nextEnd.toISOString()]
            );
          }
          break;
        }

        if (session.mode === 'payment' && kind === 'license_purchase') {
          break;
        }

        if (!pn || session.mode !== 'subscription') break;
        const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
        const custId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
        if (!subId) break;
        const sub = await stripe.subscriptions.retrieve(subId);
        const periodEnd = new Date((sub as Stripe.Subscription).current_period_end * 1000);
        await pool.query(
          `INSERT INTO monetization_subscriptions (pn_identifier, stripe_customer_id, stripe_subscription_id, status, current_period_end, updated_at)
           VALUES ($1, $2, $3, 'active', $4, NOW())
           ON CONFLICT (pn_identifier) DO UPDATE SET
             stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, monetization_subscriptions.stripe_customer_id),
             stripe_subscription_id = EXCLUDED.stripe_subscription_id,
             status = 'active',
             current_period_end = EXCLUDED.current_period_end,
             updated_at = NOW()`,
          [pn, custId || null, subId, periodEnd.toISOString()]
        );
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const pn = (sub.metadata?.pn_identifier || '').trim();
        if (!pn) break;
        const active = sub.status === 'active' || sub.status === 'trialing';
        const periodEnd = new Date(sub.current_period_end * 1000);
        await pool.query(
          `UPDATE monetization_subscriptions SET
             stripe_subscription_id = $2,
             status = $3,
             current_period_end = CASE WHEN $4::boolean THEN $5::timestamptz ELSE current_period_end END,
             updated_at = NOW()
           WHERE pn_identifier = $1`,
          [pn, sub.id, active ? 'active' : sub.status, active, periodEnd.toISOString()]
        );
        break;
      }
      case 'invoice.paid': {
        const inv = event.data.object as Stripe.Invoice;
        const gross = inv.amount_paid ?? 0;
        if (gross <= 0) break;
        let pn = (inv.metadata?.pn_identifier || '').trim();
        if (!pn && inv.subscription) {
          const subId = typeof inv.subscription === 'string' ? inv.subscription : inv.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          pn = (sub.metadata?.pn_identifier || '').trim();
        }
        if (!pn) break;
        const chargeId =
          typeof inv.charge === 'string' ? inv.charge : inv.charge?.id ?? null;
        const { netCents, grossCents, feeCents } = await stripeChargeNetCents(stripe, chargeId);
        const amount = netCents > 0 ? netCents : gross;
        const ins = await pool.query(
          `INSERT INTO creator_fund_revenue_events (pn_identifier, source, event_type, amount_cents, currency, stripe_event_id, metadata)
           VALUES ($1, 'stripe', $2, $3, $4, $5, $6::jsonb)
           ON CONFLICT (stripe_event_id) DO NOTHING
           RETURNING id`,
          [
            pn,
            'invoice.paid',
            amount,
            (inv.currency || 'usd').toUpperCase(),
            event.id,
            JSON.stringify({
              invoice_id: inv.id,
              subscription: inv.subscription,
              gross_cents: grossCents || gross,
              stripe_fee_cents: feeCents
            })
          ]
        );
        if (ins.rows.length === 0) {
          return;
        }
        break;
      }
      default: {
        const evType = event.type as string;
        if (evType === 'transfer.failed' || evType === 'transfer.reversed') {
          const tr = event.data.object as Stripe.Transfer;
          const tid = tr.id;
          if (tid) {
            const st = evType === 'transfer.reversed' ? 'reversed' : 'failed';
            await pool.query(
              `UPDATE creator_fund_payout_requests SET status = $2::varchar, updated_at = NOW()
               WHERE stripe_transfer_id = $1 AND status = 'paid'`,
              [tid, st]
            );
          }
        }
        break;
      }
    }
  }
}
