/**
 * Gate: purgeInventoryForFileIds always hits owner + public Sheets and optionally Postgres.
 */

const removeOwner = jest.fn();
const removePublic = jest.fn();
const removeMetadata = jest.fn();

jest.mock('./fileIndexHelpers', () => ({
  removeFromOwnerIndex: (...args: unknown[]) => removeOwner(...args),
  removeFromPublicIndex: (...args: unknown[]) => removePublic(...args),
}));

jest.mock('../aggregatorMetadataServiceDB', () => ({
  AggregatorMetadataServiceDB: {
    getInstance: () => ({
      removeMetadata: (...args: unknown[]) => removeMetadata(...args),
    }),
  },
}));

import { purgeInventoryForFileIds } from './purgeInventoryForFileIds';

describe('purgeInventoryForFileIds gate', () => {
  beforeEach(() => {
    removeOwner.mockReset().mockResolvedValue(undefined);
    removePublic.mockReset().mockResolvedValue(undefined);
    removeMetadata.mockReset().mockResolvedValue(true);
  });

  it('purges Sheets and Postgres for each id', async () => {
    const result = await purgeInventoryForFileIds({
      token: { access_token: 't' },
      pnIdentifier: 'pn-x',
      metadataFolderId: 'meta',
      fileIds: ['a', 'b', 'a'],
      accountId: 'acct',
    });

    expect(removeOwner).toHaveBeenCalledTimes(2);
    expect(removePublic).toHaveBeenCalledTimes(2);
    expect(removeMetadata).toHaveBeenCalledTimes(2);
    expect(result.sheetsAttempted).toBe(2);
    expect(result.postgresRemoved).toBe(2);
    expect(result.sheetsErrors).toBe(0);
  });

  it('can skip Postgres when caller already removed rows', async () => {
    await purgeInventoryForFileIds({
      token: { access_token: 't' },
      pnIdentifier: 'pn-x',
      metadataFolderId: 'meta',
      fileIds: ['a'],
      removePostgres: false,
    });

    expect(removeOwner).toHaveBeenCalled();
    expect(removePublic).toHaveBeenCalled();
    expect(removeMetadata).not.toHaveBeenCalled();
  });
});
