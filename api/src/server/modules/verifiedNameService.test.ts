/**
 * @jest-environment node
 */

const queries: Array<{ sql: string; params: unknown[] }> = [];
let verifiedRow: { legal_name_hmac: string | null } | null = null;

jest.mock('../utils/database', () => ({
  getDatabasePool: () => ({
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (sql.includes('FROM feeds')) {
        return { rows: params[1] === 'pn-owner' ? [{ feed_id: params[0] }] : [] };
      }
      if (sql.includes('SELECT legal_name_hmac FROM verified_identities')) {
        return { rows: verifiedRow ? [verifiedRow] : [] };
      }
      return { rows: [] };
    })
  })
}));

import { VerificationIntegrationService } from './verificationIntegrationService';
import { VerifiedNameService, legalNameHmac } from './verifiedNameService';

beforeEach(() => {
  queries.length = 0;
  verifiedRow = null;
});

describe('legal name HMAC', () => {
  it('ignores case and spacing', () => {
    expect(legalNameHmac('  Jane   DOE ')).toBe(legalNameHmac('jane doe'));
    expect(legalNameHmac('Jane Doe')).not.toBe(legalNameHmac('Jane Roe'));
  });

  it('stores only the HMAC on verification sync', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await VerificationIntegrationService.syncVerificationStatus('pn-owner', 'v-1', '2026-11-09T00:00:00Z', 'Jane Doe');
    const insert = queries.find((q) => q.sql.includes('INSERT INTO verified_identities'))!;
    expect(insert.params).toContain(legalNameHmac('Jane Doe'));
    expect(JSON.stringify(queries)).not.toMatch(/jane doe/i);
  });
});

describe('feed verified display name', () => {
  it('sets the label when it matches the verified legal name', async () => {
    verifiedRow = { legal_name_hmac: legalNameHmac('Jane Doe') };
    await expect(VerifiedNameService.setFeedVerifiedName('pn-owner', 'feed-1', 'jane  doe')).resolves.toBe('jane doe');
    const update = queries.find((q) => q.sql.includes('UPDATE feeds SET verified_display_name = $2'))!;
    expect(update.params).toEqual(['feed-1', 'jane doe']);
  });

  it('rejects a name that does not match', async () => {
    verifiedRow = { legal_name_hmac: legalNameHmac('Jane Doe') };
    await expect(VerifiedNameService.setFeedVerifiedName('pn-owner', 'feed-1', 'Taylor Swift')).rejects.toMatchObject({
      code: 'NAME_MISMATCH'
    });
    expect(queries.some((q) => q.sql.includes('UPDATE feeds'))).toBe(false);
  });

  it('requires a verified owner with a stored legal name', async () => {
    await expect(VerifiedNameService.setFeedVerifiedName('pn-owner', 'feed-1', 'Jane Doe')).rejects.toMatchObject({
      code: 'NOT_VERIFIED'
    });
  });

  it('requires owning the feed', async () => {
    verifiedRow = { legal_name_hmac: legalNameHmac('Jane Doe') };
    await expect(VerifiedNameService.setFeedVerifiedName('pn-other', 'feed-1', 'Jane Doe')).rejects.toMatchObject({
      code: 'FEED_NOT_OWNED'
    });
  });
});
