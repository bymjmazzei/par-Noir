/**
 * @jest-environment node
 */
const mockState = {
  gParams: [] as unknown[],
  periodInsert: [] as unknown[],
  allocations: [] as Array<{ recipient: string; bucket: string; cents: number }>,
  weightSql: '',
  weightParams: [] as unknown[]
};

const mockClientQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [] };
  if (s.startsWith('SELECT period_end FROM creator_fund_periods')) return { rows: [] };
  if (s.startsWith("SELECT 1 FROM creator_fund_periods WHERE status = 'closed' AND period_start")) return { rows: [] };
  if (s.includes('FROM creator_fund_revenue_events')) {
    mockState.gParams = params;
    return { rows: [{ g: '10000' }] };
  }
  if (s.includes('FROM creator_fund_opex_events')) return { rows: [{ e: '2000' }] };
  if (s.startsWith('SELECT chain_hash FROM creator_fund_periods')) return { rows: [] };
  if (s.startsWith('INSERT INTO creator_fund_periods')) {
    mockState.periodInsert = params;
    return {
      rows: [
        {
          id: '00000000-0000-0000-0000-000000000001',
          period_start: params[0],
          period_end: params[1],
          g_cents: params[3],
          e_cents: params[4],
          r_cents: params[5],
          platform_25_cents: params[6],
          fund_75_cents: params[7],
          bounty_verified_cents: params[8],
          bounty_unverified_cents: params[9]
        }
      ]
    };
  }
  if (s.includes('FROM verified_identities WHERE is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW())')) {
    return { rows: [{ pn: 'pn-owner' }, { pn: 'pn-commenter' }] };
  }
  if (s.startsWith('WITH base AS')) {
    mockState.weightSql = s;
    mockState.weightParams = params;
    return {
      rows: [
        { file_id: 'f1', cnt: 2, dual_monetizable: true, orphan_library: false, owner_pn: 'pn-owner', post_metadata: null },
        { file_id: 'f2', cnt: 1, dual_monetizable: true, orphan_library: false, owner_pn: 'pn-commenter', post_metadata: null }
      ]
    };
  }
  if (s.startsWith('SELECT file_id, user_did AS author_pn FROM engagement')) {
    return { rows: [{ file_id: 'f1', author_pn: 'pn-commenter' }] };
  }
  if (s.startsWith('INSERT INTO creator_fund_period_creator_allocations')) {
    mockState.allocations.push({ recipient: String(params[1]), bucket: String(params[2]), cents: Number(params[4]) });
    return { rows: [] };
  }
  throw new Error(`unexpected SQL: ${s.slice(0, 90)}`);
});

jest.mock('../utils/database', () => ({
  getDatabasePool: () => ({ connect: async () => ({ query: mockClientQuery, release: jest.fn() }) })
}));

import { CreatorFundPeriodService, pairWeightCap } from './creatorFundPeriodService';

describe('creator fund period close', () => {
  beforeEach(() => {
    process.env.CREATOR_FUND_PERIOD_TZ = 'UTC';
    delete process.env.CREATOR_FUND_PERIOD_KMS_KEY_VERSION;
    delete process.env.CREATOR_FUND_PAIR_WEIGHT_CAP;
    mockState.allocations = [];
  });

  it('caps each engager-owner pair at CREATOR_FUND_PAIR_WEIGHT_CAP (default 5)', async () => {
    expect(pairWeightCap()).toBe(5);
    process.env.CREATOR_FUND_PAIR_WEIGHT_CAP = 'nope';
    expect(pairWeightCap()).toBe(5);
    process.env.CREATOR_FUND_PAIR_WEIGHT_CAP = '2.5';
    expect(pairWeightCap()).toBe(2.5);

    await CreatorFundPeriodService.closeIfDue();
    expect(mockState.weightParams[2]).toBe(2.5);
    expect(mockState.weightSql).toContain('PARTITION BY actor_id, pair_owner');
    expect(mockState.weightSql).toContain('LEAST(1.0, $3::double precision / NULLIF(pair_total, 0))');
  });

  it('nets refunds into G, splits 25/75, and allocates the whole fund to verified buckets', async () => {
    const out = await CreatorFundPeriodService.closeIfDue();

    expect(out.closed).toBe(true);
    expect(mockState.gParams[2]).toEqual(expect.arrayContaining(['invoice.paid', 'refund', 'dispute', 'dispute_won']));
    expect(out.period).toMatchObject({
      gCents: 10000,
      eCents: 2000,
      rCents: 8000,
      platform25Cents: 2000,
      fund75Cents: 6000,
      bountyVerifiedCents: 6000,
      bountyUnverifiedCents: 0
    });

    expect(mockState.allocations.length).toBeGreaterThan(0);
    expect(mockState.allocations.reduce((a, r) => a + r.cents, 0)).toBe(6000);
    for (const a of mockState.allocations) {
      expect(a.bucket).toMatch(/verified$/);
      expect(a.bucket).not.toMatch(/unverified/);
    }
    const recipients = new Set(mockState.allocations.map((a) => a.recipient));
    expect(recipients).toEqual(new Set(['pn-owner', 'pn-commenter']));
  });
});
