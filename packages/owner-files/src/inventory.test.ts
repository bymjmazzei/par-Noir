import { describe, expect, it, vi } from 'vitest';
import { buildOwnerInventory } from './inventory';
import { loadOwnerInventory } from './load';
import type { OwnerAccount } from './model';
import type { OwnerFilesTransport } from './transport';

const account: OwnerAccount = {
  accountKey: 'google_drive::acct',
  provider: 'google_drive',
  accountId: 'acct',
  label: 'me@example.com'
};

const penPost = {
  fileId: 'pen-env-1',
  metadata: {
    name: 'my-post.json',
    title: 'My Post',
    isPublic: true,
    penDocId: 'doc-1',
    publicContentRef: { objectId: 'pen-env-1' },
    feedPoster: { r2Key: 'k', contentType: 'image/jpeg', byteSize: 10 }
  }
};

describe('buildOwnerInventory', () => {
  it('adds a Pen catalog row under the full account key', () => {
    const inv = buildOwnerInventory({
      accounts: [account],
      sources: { [account.accountKey]: { listings: [] } },
      catalog: [penPost]
    });
    expect(inv.rows).toHaveLength(1);
    expect(inv.rows[0]).toMatchObject({
      key: 'google_drive::acct:pen-env-1',
      accountKey: 'google_drive::acct',
      kind: 'pen-post',
      origin: 'catalog',
      penDocId: 'doc-1',
      metadataIndexFileId: 'pen-env-1',
      displayName: 'My Post',
      visibility: 'public',
      encrypted: false
    });
    expect(inv.rowsByAccount['google_drive::acct']).toHaveLength(1);
  });

  it('merges catalog metadata into the matching Drive row instead of duplicating it', () => {
    const inv = buildOwnerInventory({
      accounts: [account],
      sources: {
        [account.accountKey]: {
          listings: [
            { id: 'm', name: 'a.png.encrypted' },
            { id: 't', name: 'thumb_a.png.encrypted' }
          ]
        }
      },
      catalog: [{ fileId: 't', metadata: { isPublic: true, feedPoster: { r2Key: 'x' } } }]
    });
    expect(inv.rows).toHaveLength(1);
    expect(inv.rows[0]).toMatchObject({ id: 't', origin: 'drive', visibility: 'public', indexed: true });
    expect(inv.metadataById.t).toMatchObject({ isPublic: true });
  });

  it('skips collection parts from the catalog', () => {
    const inv = buildOwnerInventory({
      accounts: [account],
      sources: {},
      catalog: [{ fileId: 'part', metadata: { isPartOfCollection: true } }]
    });
    expect(inv.rows).toEqual([]);
  });

  it('assigns catalog rows to the account named by metadata.backend', () => {
    const other: OwnerAccount = { ...account, accountKey: 'google_drive::other', accountId: 'other' };
    const inv = buildOwnerInventory({
      accounts: [account, other],
      sources: {},
      catalog: [{ fileId: 'x', metadata: { backend: 'google_drive::other', name: 'x.pdf' } }]
    });
    expect(inv.rowsByAccount['google_drive::other']?.map((r) => r.id)).toEqual(['x']);
  });
});

function transport(overrides: Partial<OwnerFilesTransport> = {}): OwnerFilesTransport {
  return {
    listDriveFiles: vi.fn().mockResolvedValue([
      { id: 'g1', name: 'doc.encrypted', mimeType: 'application/octet-stream', size: 5 },
      { id: 'drive-1', name: 'extra.pdf.encrypted', mimeType: 'application/octet-stream', size: 10 }
    ]),
    fetchOwnerIndex: vi.fn().mockResolvedValue([
      { fileId: 'f1', googleDriveFileId: 'g1', fileName: 'doc.encrypted', originalName: 'doc.pdf', visibility: 'private' },
      { fileId: 'orphan-thought', googleDriveFileId: 'gone-blob', fileName: 'thought-1.thought', visibility: 'private' }
    ]),
    fetchOwnerCatalog: vi.fn().mockResolvedValue([]),
    downloadFile: vi.fn(),
    resolvePublicMediaUrl: vi.fn(),
    decryptPackage: vi.fn(),
    ...overrides
  };
}

describe('loadOwnerInventory (index + Drive verify)', () => {
  it('index-only load does not scan Drive', async () => {
    const t = transport();
    const inv = await loadOwnerInventory(t, { accounts: [account] });
    expect(t.listDriveFiles).not.toHaveBeenCalled();
    expect(inv.rows.map((r) => r.driveFileId)).toEqual(['g1', 'gone-blob']);
  });

  it('verify scans Drive and merges unindexed files', async () => {
    const t = transport();
    const inv = await loadOwnerInventory(t, { accounts: [account], verifyWithDrive: true });
    expect(t.listDriveFiles).toHaveBeenCalledTimes(1);
    expect(inv.rows.some((r) => r.driveFileId === 'drive-1')).toBe(true);
    expect(inv.rows.filter((r) => r.driveFileId === 'g1')).toHaveLength(1);
  });

  it('keeps index orphans (reconcile owns cleanup)', async () => {
    const inv = await loadOwnerInventory(transport(), { accounts: [account], verifyWithDrive: true });
    expect(inv.rows.some((r) => r.id === 'orphan-thought')).toBe(true);
  });

  it('scans Drive when there is no owner index', async () => {
    const t = transport({ fetchOwnerIndex: vi.fn().mockResolvedValue(null) });
    const inv = await loadOwnerInventory(t, { accounts: [account] });
    expect(t.listDriveFiles).toHaveBeenCalledTimes(1);
    expect(inv.rows.map((r) => r.id).sort()).toEqual(['drive-1', 'g1']);
  });

  it('reports a scan failure without an index as an account error', async () => {
    const onAccountError = vi.fn();
    const t = transport({
      fetchOwnerIndex: undefined,
      listDriveFiles: vi.fn().mockRejectedValue(new Error('auth expired'))
    });
    const inv = await loadOwnerInventory(t, { accounts: [account], onAccountError });
    expect(inv.errors[account.accountKey]).toBe('auth expired');
    expect(onAccountError).toHaveBeenCalledTimes(1);
  });

  it('still lists catalog rows when the catalog is the only source', async () => {
    const t = transport({
      fetchOwnerIndex: undefined,
      listDriveFiles: vi.fn().mockResolvedValue([]),
      fetchOwnerCatalog: vi.fn().mockResolvedValue([penPost])
    });
    const inv = await loadOwnerInventory(t, { accounts: [account] });
    expect(inv.rows.map((r) => r.kind)).toEqual(['pen-post']);
  });
});
