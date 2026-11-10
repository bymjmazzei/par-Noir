/**
 * @jest-environment node
 */
type Payout = { id: string; pn_identifier: string; amount_cents: number; status: string; stripe_transfer_id?: string };

const mockState = {
  payouts: [] as Payout[],
  revenue: [] as Array<{ pn: string; type: string; amount: number; eventId: string; meta: Record<string, unknown> }>,
  priorRefundCents: 0,
  reversedTransferIds: [] as string[]
};

const mockQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (s.startsWith('SELECT id, pn_identifier, amount_cents, status FROM creator_fund_payout_requests')) {
    return { rows: mockState.payouts.filter((p) => p.status === 'queued' || p.status === 'processing').map((p) => ({ ...p })) };
  }
  if (s.includes('FROM creator_fund_connect_accounts')) {
    return { rows: [{ stripe_account_id: 'acct_dest', payouts_enabled: true }] };
  }
  if (s.startsWith("UPDATE creator_fund_payout_requests SET status = 'processing'")) {
    const p = mockState.payouts.find((x) => x.id === params[0]);
    if (!p || !['queued', 'processing'].includes(p.status)) return { rows: [] };
    p.status = 'processing';
    return { rows: [{ id: p.id }] };
  }
  if (s.startsWith("UPDATE creator_fund_payout_requests SET status = 'failed'")) {
    const p = mockState.payouts.find((x) => x.id === params[0]);
    if (p?.status === 'processing') p.status = 'failed';
    return { rows: [] };
  }
  if (s.startsWith("UPDATE creator_fund_payout_requests SET status = 'paid'")) {
    const p = mockState.payouts.find((x) => x.id === params[0]);
    if (p?.status === 'processing') {
      p.status = 'paid';
      p.stripe_transfer_id = String(params[1]);
    }
    return { rows: [] };
  }
  if (s.startsWith("UPDATE creator_fund_payout_requests SET status = 'reversed'")) {
    mockState.reversedTransferIds.push(String(params[0]));
    return { rows: [] };
  }
  if (s.includes('FROM monetization_subscriptions WHERE stripe_customer_id')) {
    return { rows: params[0] === 'cus_known' ? [{ pn_identifier: 'pn-payer' }] : [] };
  }
  if (s.includes("WHERE event_type = 'refund' AND metadata->>'charge_id'")) {
    return { rows: [{ s: mockState.priorRefundCents }] };
  }
  if (s.startsWith('INSERT INTO creator_fund_revenue_events')) {
    const fixedType = /VALUES \(\$1, 'stripe', 'refund'/.test(s);
    if (fixedType) {
      mockState.revenue.push({
        pn: String(params[0]),
        type: 'refund',
        amount: Number(params[1]),
        eventId: String(params[3]),
        meta: JSON.parse(String(params[4]))
      });
    } else {
      mockState.revenue.push({
        pn: String(params[0]),
        type: String(params[1]),
        amount: Number(params[2]),
        eventId: String(params[4]),
        meta: JSON.parse(String(params[5]))
      });
    }
    return { rows: [] };
  }
  throw new Error(`unexpected SQL: ${s.slice(0, 90)}`);
});

jest.mock('../utils/database', () => ({ getDatabasePool: () => ({ query: mockQuery }) }));
jest.mock('./engagementService', () => ({ EngagementService: {} }));

const mockStripe = {
  transfers: { create: jest.fn(), list: jest.fn() },
  charges: { retrieve: jest.fn() }
};
jest.mock('stripe', () => ({ __esModule: true, default: jest.fn(() => mockStripe) }));

import type Stripe from 'stripe';
import { MonetizationService, monetizationReadiness } from './monetizationService';

function stripeError(type: string, message: string): Error {
  return Object.assign(new Error(message), { type });
}

function event(type: string, object: Record<string, unknown>, id = `evt_${type}`): Stripe.Event {
  return { id, type, data: { object } } as unknown as Stripe.Event;
}

describe('creator-fund payouts (idempotent transfers)', () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    mockState.payouts = [];
    mockStripe.transfers.create.mockReset();
    mockStripe.transfers.list.mockReset();
    jest.spyOn(MonetizationService, 'syncConnectStatus').mockResolvedValue(undefined as never);
  });

  it('sends a queued payout with a per-row idempotency key and transfer group', async () => {
    mockState.payouts = [{ id: 'p1', pn_identifier: 'pn-a', amount_cents: 2500, status: 'queued' }];
    mockStripe.transfers.create.mockResolvedValue({ id: 'tr_1' });

    const out = await MonetizationService.runQueuedCreatorFundPayouts({ force: true });

    expect(out).toEqual({ processed: 1, errors: [] });
    expect(mockStripe.transfers.list).not.toHaveBeenCalled();
    expect(mockStripe.transfers.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 2500, destination: 'acct_dest', transfer_group: 'cf_payout_p1' }),
      { idempotencyKey: 'cf_payout_p1' }
    );
    expect(mockState.payouts[0]).toMatchObject({ status: 'paid', stripe_transfer_id: 'tr_1' });
  });

  it('a network error leaves the row processing; the retry finds the transfer instead of paying twice', async () => {
    mockState.payouts = [{ id: 'p2', pn_identifier: 'pn-a', amount_cents: 1500, status: 'queued' }];
    mockStripe.transfers.create.mockRejectedValueOnce(stripeError('StripeConnectionError', 'socket hang up'));

    const first = await MonetizationService.runQueuedCreatorFundPayouts({ force: true });
    expect(first.processed).toBe(0);
    expect(first.errors).toEqual(['p2:socket hang up']);
    expect(mockState.payouts[0].status).toBe('processing');

    mockStripe.transfers.list.mockResolvedValue({ data: [{ id: 'tr_landed' }] });
    const second = await MonetizationService.runQueuedCreatorFundPayouts({ force: true });

    expect(second).toEqual({ processed: 1, errors: [] });
    expect(mockStripe.transfers.list).toHaveBeenCalledWith({ transfer_group: 'cf_payout_p2', limit: 1 });
    expect(mockStripe.transfers.create).toHaveBeenCalledTimes(1);
    expect(mockState.payouts[0]).toMatchObject({ status: 'paid', stripe_transfer_id: 'tr_landed' });
  });

  it('a definitive Stripe rejection marks the row failed', async () => {
    mockState.payouts = [{ id: 'p3', pn_identifier: 'pn-a', amount_cents: 1500, status: 'queued' }];
    mockStripe.transfers.create.mockRejectedValue(stripeError('StripeInvalidRequestError', 'insufficient funds'));

    const out = await MonetizationService.runQueuedCreatorFundPayouts({ force: true });

    expect(out.processed).toBe(0);
    expect(mockState.payouts[0].status).toBe('failed');
  });
});

describe('Stripe refunds, disputes, reversals reduce G', () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    mockState.revenue = [];
    mockState.priorRefundCents = 0;
    mockState.reversedTransferIds = [];
    mockStripe.charges.retrieve.mockReset();
  });

  it('records only the newly refunded delta as a negative refund event', async () => {
    mockState.priorRefundCents = 300;
    await MonetizationService.handleStripeWebhookEvent(
      event('charge.refunded', { id: 'ch_1', customer: 'cus_known', amount_refunded: 1000, currency: 'usd' })
    );
    expect(mockState.revenue).toEqual([
      {
        pn: 'pn-payer',
        type: 'refund',
        amount: -700,
        eventId: 'evt_charge.refunded',
        meta: { charge_id: 'ch_1', amount_refunded: 1000 }
      }
    ]);
  });

  it('skips a refund already fully recorded or for an unknown customer', async () => {
    mockState.priorRefundCents = 1000;
    await MonetizationService.handleStripeWebhookEvent(
      event('charge.refunded', { id: 'ch_1', customer: 'cus_known', amount_refunded: 1000 })
    );
    await MonetizationService.handleStripeWebhookEvent(
      event('charge.refunded', { id: 'ch_2', customer: 'cus_other', amount_refunded: 500 })
    );
    expect(mockState.revenue).toHaveLength(0);
  });

  it('dispute opened subtracts; dispute won adds back; dispute lost adds nothing', async () => {
    mockStripe.charges.retrieve.mockResolvedValue({ id: 'ch_9', customer: 'cus_known' });
    await MonetizationService.handleStripeWebhookEvent(
      event('charge.dispute.created', { id: 'dp_1', charge: 'ch_9', amount: 1000, currency: 'usd' }, 'evt_d1')
    );
    await MonetizationService.handleStripeWebhookEvent(
      event('charge.dispute.closed', { id: 'dp_1', charge: 'ch_9', amount: 1000, status: 'lost' }, 'evt_d2')
    );
    await MonetizationService.handleStripeWebhookEvent(
      event('charge.dispute.closed', { id: 'dp_2', charge: 'ch_9', amount: 1000, status: 'won' }, 'evt_d3')
    );
    expect(mockState.revenue.map((r) => [r.type, r.amount, r.eventId])).toEqual([
      ['dispute', -1000, 'evt_d1'],
      ['dispute_won', 1000, 'evt_d3']
    ]);
  });

  it('transfer.reversed marks the paid payout reversed', async () => {
    await MonetizationService.handleStripeWebhookEvent(event('transfer.reversed', { id: 'tr_7' }));
    expect(mockState.reversedTransferIds).toEqual(['tr_7']);
  });
});

describe('monetizationReadiness', () => {
  it('reports presence only and lists what is missing', () => {
    const keep = { ...process.env };
    for (const k of Object.keys(process.env)) {
      if (/^(STRIPE_|VERIFF_|CREATOR_FUND_CRON)/.test(k)) delete process.env[k];
    }
    process.env.STRIPE_SECRET_KEY = 'sk_test_secret_value';
    process.env.VERIFF_API_KEY = '  ';
    const out = monetizationReadiness();
    process.env = keep;

    expect(out.ready).toBe(false);
    expect(out.env.STRIPE_SECRET_KEY).toBe(true);
    expect(out.env.VERIFF_API_KEY).toBe(false);
    expect(out.missing).toContain('VERIFF_SHARED_SECRET');
    expect(out.missing).not.toContain('VERIFICATION_DEDUPE_SECRET');
    expect(JSON.stringify(out)).not.toContain('sk_test_secret_value');
  });
});
