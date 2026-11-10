/**
 * @jest-environment node
 *
 * Engagement on your own content never counts toward the creator fund, whichever pN spelling
 * the actor and the content owner use.
 */
process.env.NODE_ENV = 'test';

jest.mock('../utils/database', () => ({
  getDatabasePool: () => ({
    query: jest.fn(async (sql: string) => {
      if (sql.includes('AS owner_pn')) return { rows: [{ owner_pn: 'pn-abc123' }] };
      if (sql.includes('FROM verified_identities')) return { rows: [{ '?column?': 1 }] };
      if (sql.includes('FROM monetization_subscriptions')) {
        return { rows: [{ status: 'active', current_period_end: new Date(Date.now() + 86_400_000) }] };
      }
      return { rows: [] };
    })
  })
}));

import { EngagementService, isSamePn } from './engagementService';

const flags = (actor: string) =>
  (
    EngagementService as unknown as {
      computeFundMonetizableFlags: (a: string, f: string) => Promise<{ actor: boolean; owner: boolean }>;
    }
  ).computeFundMonetizableFlags(actor, 'file-1');

describe('own-content fund exclusion', () => {
  it('isSamePn matches across pn-/did:pn: spellings and never matches empty values', () => {
    expect(isSamePn('pn-ABC123', 'did:pn:abc123')).toBe(true);
    expect(isSamePn(' abc123 ', 'pn-abc123')).toBe(true);
    expect(isSamePn('pn-abc123', 'pn-abc124')).toBe(false);
    expect(isSamePn('', '')).toBe(false);
    expect(isSamePn(null, undefined)).toBe(false);
  });

  it('the owner engaging with their own post is not fund-monetizable; another eligible pN is', async () => {
    await expect(flags('did:pn:abc123')).resolves.toEqual({ actor: false, owner: true });
    await expect(flags('pn-other')).resolves.toEqual({ actor: true, owner: true });
  });
});
