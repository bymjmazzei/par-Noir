/**
 * @jest-environment node
 */

const queries: Array<{ sql: string; params: unknown[] }> = [];
let flagActive = true;

jest.mock('../utils/database', () => ({
  getDatabasePool: () => ({
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (sql.includes('FROM feeds')) {
        return { rows: params[1] === 'pn-owner' ? [{ feed_id: params[0] }] : [] };
      }
      if (sql.includes('SELECT 1 FROM verified_identities')) {
        return { rows: flagActive ? [{ '?column?': 1 }] : [] };
      }
      return { rows: [] };
    })
  })
}));
jest.mock('../utils/cache', () => ({ getCacheClient: () => null }));
jest.mock('./identitySuccessionService', () => ({
  isPnRevokedForNetwork: () => false,
  isDidRevokedForNetwork: () => false,
  isSuccessorOf: () => false
}));

import { VerificationCredentialService } from './verificationCredentialService';
import { VerifiedNameService } from './verifiedNameService';

let credential = '';

beforeAll(async () => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  ({ credential } = await VerificationCredentialService.issue('pn-owner', {
    givenName: 'Jane',
    familyName: 'Doe',
    birthdate: '1990-01-01'
  }));
});

beforeEach(() => {
  queries.length = 0;
  flagActive = true;
});

describe('feed verified display name', () => {
  it('sets the label when it matches the name in the credential', async () => {
    await expect(
      VerifiedNameService.setFeedVerifiedName('pn-owner', 'feed-1', 'jane  doe', credential)
    ).resolves.toBe('jane doe');
    const update = queries.find((q) => q.sql.includes('UPDATE feeds SET verified_display_name = $2'))!;
    expect(update.params).toEqual(['feed-1', 'jane doe']);
  });

  it('rejects a name that does not match', async () => {
    await expect(
      VerifiedNameService.setFeedVerifiedName('pn-owner', 'feed-1', 'Taylor Swift', credential)
    ).rejects.toMatchObject({ code: 'NAME_MISMATCH' });
    expect(queries.some((q) => q.sql.includes('UPDATE feeds'))).toBe(false);
  });

  it('requires a credential and a live verified flag', async () => {
    await expect(
      VerifiedNameService.setFeedVerifiedName('pn-owner', 'feed-1', 'Jane Doe', undefined)
    ).rejects.toMatchObject({ code: 'NOT_VERIFIED' });
    flagActive = false;
    await expect(
      VerifiedNameService.setFeedVerifiedName('pn-owner', 'feed-1', 'Jane Doe', credential)
    ).rejects.toMatchObject({ code: 'NOT_VERIFIED' });
  });

  it('rejects another pN’s credential', async () => {
    const other = await VerificationCredentialService.issue('pn-other', { givenName: 'Jane', familyName: 'Doe' });
    await expect(
      VerifiedNameService.setFeedVerifiedName('pn-owner', 'feed-1', 'Jane Doe', other.credential)
    ).rejects.toMatchObject({ code: 'NOT_VERIFIED' });
  });

  it('requires owning the feed', async () => {
    await expect(
      VerifiedNameService.setFeedVerifiedName('pn-other', 'feed-1', 'Jane Doe', credential)
    ).rejects.toMatchObject({ code: 'FEED_NOT_OWNED' });
  });

  it('stores no legal name or credential server-side', () => {
    expect(JSON.stringify(queries)).not.toMatch(/eyJ/);
  });
});
