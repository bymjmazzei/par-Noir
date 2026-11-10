import { describe, expect, it } from 'vitest';
import { MemoryBlobStore, OWNER_FILE_INDEX_SCHEMA, indexEntryToRow } from '@par-noir/user-owned-storage';
import { SqliteBlobTableAdapter } from '@par-noir/user-owned-storage/sqlite';
import type { DeviceBlobStore } from '../deviceBlobStore.js';
import { deviceFileIndex } from './fileIndex.js';
import type { DeviceSocialContext } from './socialContext.js';

function tablesContext(): DeviceSocialContext {
  const blobs = new MemoryBlobStore();
  return {
    kind: 'tables',
    provider: 'aws_s3',
    tables: new SqliteBlobTableAdapter(blobs, 'par-noir-pn-abc/'),
    blobs: blobs as unknown as DeviceBlobStore,
  };
}

describe('deviceFileIndex on table storage', () => {
  it('reads rows the API wrote and upserts in the same format', async () => {
    const ctx = tablesContext();
    if (ctx.kind !== 'tables') throw new Error('unreachable');
    const table = await ctx.tables.openTable(OWNER_FILE_INDEX_SCHEMA);
    await table.append(
      indexEntryToRow(
        { fileId: 'f1', visibility: 'private', uploadedAt: '2026-01-01', backendFileId: 'blob/f1' },
        { indexKind: 'owner' }
      )
    );

    const owner = deviceFileIndex(ctx, 'owner');
    expect(await owner.list()).toEqual([
      expect.objectContaining({ fileId: 'f1', backendFileId: 'blob/f1', visibility: 'private' }),
    ]);

    await owner.upsert({ fileId: 'f1', visibility: 'public', uploadedAt: '2026-01-01', backendFileId: 'blob/f1' });
    await owner.upsert({ fileId: 'f2', visibility: 'private', uploadedAt: '2026-01-02' });
    const raw = await (await ctx.tables.openTable(OWNER_FILE_INDEX_SCHEMA)).getByKey('f1');
    expect(raw).toEqual(expect.objectContaining({ fileId: 'f1', visibility: 'public', entryData: expect.any(String) }));
    expect((await owner.list()).map((e) => e.fileId)).toEqual(['f1', 'f2']);
  });

  it('removes by fileId or backend file id', async () => {
    const owner = deviceFileIndex(tablesContext(), 'public');
    await owner.upsert({ fileId: 'f1', visibility: 'public', uploadedAt: 'x', backendFileId: 'b1' });
    await owner.upsert({ fileId: 'f2', visibility: 'public', uploadedAt: 'x' });
    expect(await owner.remove(['b1', 'missing'])).toBe(1);
    expect((await owner.list()).map((e) => e.fileId)).toEqual(['f2']);
  });
});
