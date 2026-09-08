/**
 * Gate: owner inventory reconcile purges Sheets + Postgres when Drive blob is missing.
 * Falsification: without purgeInventory being invoked on missing probe, ghosts remain.
 */

import { reconcileOwnerInventory } from './ownerInventoryReconcile';

const purgeMock = jest.fn();

jest.mock('./purgeInventoryForFileIds', () => ({
  purgeInventoryForFileIds: (...args: unknown[]) => purgeMock(...args),
}));

describe('ownerInventoryReconcile gate', () => {
  beforeEach(() => {
    purgeMock.mockReset();
    purgeMock.mockResolvedValue({
      sheetsAttempted: 1,
      sheetsErrors: 0,
      postgresRemoved: 1,
      postgresErrors: 0,
    });
  });

  it('does not purge when blob still exists', async () => {
    const result = await reconcileOwnerInventory({
      token: { access_token: 'tok' },
      pnIdentifier: 'pn-test',
      metadataFolderId: 'meta-1',
      files: [
        {
          fileId: 'thought-alive',
          googleDriveFileId: 'blob-alive',
        },
      ],
      probeBlob: async () => 'ok',
    });

    expect(result.checked).toBe(1);
    expect(result.removed).toBe(0);
    expect(purgeMock).not.toHaveBeenCalled();
  });

  it('purges owner/public/Postgres inventory when Drive blob is missing', async () => {
    const result = await reconcileOwnerInventory({
      token: { access_token: 'tok' },
      pnIdentifier: 'pn-test',
      metadataFolderId: 'meta-1',
      accountId: 'acct-1',
      files: [
        {
          fileId: 'thought-ghost',
          googleDriveFileId: 'blob-gone',
          mainFileId: 'main-gone',
        },
        {
          fileId: 'media-ok',
          googleDriveFileId: 'blob-ok',
        },
      ],
      probeBlob: async (blobId) => (blobId === 'blob-gone' ? 'missing' : 'ok'),
    });

    expect(result.checked).toBe(2);
    expect(result.removed).toBe(1);
    expect(result.removedFileIds).toEqual(['thought-ghost']);
    expect(purgeMock).toHaveBeenCalledTimes(1);
    expect(purgeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pnIdentifier: 'pn-test',
        metadataFolderId: 'meta-1',
        accountId: 'acct-1',
        removePostgres: true,
        fileIds: expect.arrayContaining(['blob-gone', 'thought-ghost', 'main-gone']),
      })
    );
  });

  it('counts probe errors without purging', async () => {
    const result = await reconcileOwnerInventory({
      token: { access_token: 'tok' },
      pnIdentifier: 'pn-test',
      metadataFolderId: 'meta-1',
      files: [{ fileId: 'f1', googleDriveFileId: 'b1' }],
      probeBlob: async () => 'error',
    });

    expect(result.checked).toBe(1);
    expect(result.removed).toBe(0);
    expect(result.errors).toBe(1);
    expect(purgeMock).not.toHaveBeenCalled();
  });

  it('skips entries with no blob id (warn path, no purge)', async () => {
    const result = await reconcileOwnerInventory({
      token: { access_token: 'tok' },
      pnIdentifier: 'pn-test',
      metadataFolderId: 'meta-1',
      files: [{ fileId: 'incomplete-row' }],
      probeBlob: async () => 'missing',
    });

    expect(result.checked).toBe(0);
    expect(result.removed).toBe(0);
    expect(purgeMock).not.toHaveBeenCalled();
  });
});
