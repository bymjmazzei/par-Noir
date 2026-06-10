import { describe, expect, it } from 'vitest';
import { MemoryBlobStore } from '../blob/MemoryBlobStore.js';
import { TABLE_PATHS } from '../pnLayout.js';
import { SnapshotJsonTableAdapter } from './SnapshotJsonTableAdapter.js';
import { SqliteBlobTableAdapter } from './SqliteBlobTableAdapter.js';

const schema = {
  id: 'test-permissions',
  keyColumn: 'toolId',
  path: TABLE_PATHS.thirdPartyPermissions
};

describe('SqliteBlobTableAdapter', () => {
  it('append, getByKey, update, delete, replaceAll', async () => {
    const blob = new MemoryBlobStore();
    const store = new SqliteBlobTableAdapter(blob, 'par-noir-pn-test/');
    const table = await store.openTable(schema);

    await table.append({ toolId: 'app-1', status: 'active', name: 'A' });
    await table.append({ toolId: 'app-2', status: 'pending', name: 'B' });

    let row = await table.getByKey('app-1');
    expect(row?.status).toBe('active');

    await table.update('app-1', { status: 'revoked' });
    row = await table.getByKey('app-1');
    expect(row?.status).toBe('revoked');

    const scanned = await table.scan();
    expect(scanned).toHaveLength(2);

    await table.replaceAll([{ toolId: 'app-3', status: 'active' }], { updatedAt: '2026-01-01' });
    expect(await table.scan()).toHaveLength(1);

    await table.delete('app-3');
    expect(await table.scan()).toHaveLength(0);
  });
});

describe('SnapshotJsonTableAdapter', () => {
  it('round-trips rows', async () => {
    const blob = new MemoryBlobStore();
    const store = new SnapshotJsonTableAdapter(blob, 'par-noir-pn-test/');
    const table = await store.openTable(schema);

    await table.append({ toolId: 'x', value: 1 });
    await table.append({ toolId: 'y', value: 2 });
    expect((await table.getByKey('x'))?.value).toBe(1);
    await table.delete('x');
    expect(await table.getByKey('x')).toBeNull();
  });
});
