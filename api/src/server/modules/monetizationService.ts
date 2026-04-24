/**
 * Creator fund — monetization maintenance (Stripe) + internal balance + eligibility.
 * Policy: docs/business/CREATOR_FUND_AND_SUBSCRIPTION_ECONOMICS.md
 */

import Stripe from 'stripe';
import { getDatabasePool } from '../utils/database';
import { EngagementService } from './engagementService';
import { CreatorFundPeriodService, type ClosedFundPeriodRow } from './creatorFundPeriodService';

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
  balanceCents: number;
  renewalPriceCents: number | null;
  eligibleForFundAccrual: boolean;
  stripeConfigured: boolean;
  stripeCustomerId: string | null;
  connectOnboarded: boolean;
  /** UX copy only — not a legal guarantee */
  payoutCadenceNote: string;
  /** Last closed fund windows (G/E/R from DB; no Stripe). */
  recentClosedPeriods: ClosedFundPeriodRow[];
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

    const balRes = await pool.query(
      `SELECT balance_cents FROM creator_fund_balances WHERE pn_identifier = $1`,
      [pn]
    );
    const balanceCents = balRes.rows[0] ? Number(balRes.rows[0].balance_cents) || 0 : 0;

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

    return {
      verified,
      maintenanceActive,
      currentPeriodEnd: row?.current_period_end ? new Date(row.current_period_end).toISOString() : null,
      balanceCents,
      renewalPriceCents,
      eligibleForFundAccrual,
      stripeConfigured: isStripeMonetizationConfigured(),
      stripeCustomerId: row?.stripe_customer_id ?? null,
      connectOnboarded,
      payoutCadenceNote:
        'Payouts are payee-initiated on typical schedule 1st and 15th Eastern; 45-day hold, $10 minimum, US-only Connect v1 — see creator fund policy.',
      recentClosedPeriods
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
   * Balance-first maintenance renewal (ledger debit only; counts toward G per policy).
   */
  static async renewFromBalance(pnIdentifier: string): Promise<{
    renewed: boolean;
    balanceAfter: number;
    needsPayment: boolean;
    shortfallCents?: number;
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
      await client.query(
        `INSERT INTO creator_fund_balances (pn_identifier, balance_cents) VALUES ($1, 0)
         ON CONFLICT (pn_identifier) DO NOTHING`,
        [pn]
      );
      const balRow = await client.query(
        `SELECT balance_cents FROM creator_fund_balances WHERE pn_identifier = $1 FOR UPDATE`,
        [pn]
      );
      const balance = balRow.rows[0] ? Number(balRow.rows[0].balance_cents) || 0 : 0;
      if (balance < renewalCents) {
        await client.query('ROLLBACK');
        return {
          renewed: false,
          balanceAfter: balance,
          needsPayment: true,
          shortfallCents: renewalCents - balance
        };
      }
      const newBalance = balance - renewalCents;
      await client.query(
        `INSERT INTO creator_fund_balances (pn_identifier, balance_cents, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (pn_identifier) DO UPDATE SET balance_cents = $2, updated_at = NOW()`,
        [pn, newBalance]
      );

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
    } catch (e) {
      await client.query('ROLLBACK');
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
        const amount = inv.amount_paid ?? 0;
        if (amount <= 0) break;
        let pn = (inv.metadata?.pn_identifier || '').trim();
        if (!pn && inv.subscription) {
          const subId = typeof inv.subscription === 'string' ? inv.subscription : inv.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          pn = (sub.metadata?.pn_identifier || '').trim();
        }
        if (!pn) break;
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
            JSON.stringify({ invoice_id: inv.id, subscription: inv.subscription })
          ]
        );
        if (ins.rows.length === 0) {
          return;
        }
        break;
      }
      default:
        break;
    }
  }
}
