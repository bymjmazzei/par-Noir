import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { MemoryBlobStore } from '../blob/MemoryBlobStore.js';
import { portableTablePath, TABLE_PATHS } from '../pnLayout.js';
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

/** Table file written by native SQLite (as better-sqlite3 on the API did), gzipped. */
const NATIVE_SQLITE_TABLE_GZ =
  'H4sICNw/82oCA3BuLWxlZ2FjeS5kYgDt2k1v0zAYwHGnSTeG1oUdSk/VTC4MaWxLkXbYLpQph4nyVjqJCYnIJEaq6JJudTcQ4rCvBVe+xbhzQXwGnJaObgJx4cDQ/6fHTvzkxZZvjvP0SatrtHyVH+4rI++Ia8Jx5u9KKYTwbCmLn0o/chOO+DNPrGYfKv5X4S2cCv+5/3Hh1G8IAAAAAAD+nl13tlatOicVo1729GF+PCiKt92Omp1Idpr3WpEsMnLZ1vFr/VZ2omcd+bi986DZ3pP3o70VmSqjxumHj2zZbbVu3fRmaltVR3SzVL8ZHPTs8jlWQ5OP2nHxwjgs6vILZ7ZWrzsn/qj/uJ/F+9qoybF0bhyTrFz+9TiOVG+oLwxkrTRT267/biBn/YWTM9fOyZWLk1QpFvL+Z2EDAAAAAABcQtcdd+nGsJ8qo9Omaaw3Nm6vhzam77k6Wv9/ETYAAAAAAMDlNu8uzZ19CZi+MN7//yRsAAAAAACAf9iq4y7GSfguSPIs04np5tlOGmwGSRisBAOjzHBgWypJdN+u/4P308+O9/+/CRsAAAAAAOC/UHYX55Jz//9/B1Okle0AUAAA';

describe('SqliteBlobTableAdapter on sql.js', () => {
  it('reads and updates a table file written by native SQLite', async () => {
    const blob = new MemoryBlobStore();
    const connections = { id: 'connections', keyColumn: 'connectionId', path: TABLE_PATHS.connections };
    const key = `par-noir-pn-test/${portableTablePath(connections.path)}`;
    await blob.put(key, new Uint8Array(gunzipSync(Buffer.from(NATIVE_SQLITE_TABLE_GZ, 'base64'))));

    const table = await new SqliteBlobTableAdapter(blob, 'par-noir-pn-test/').openTable(connections);
    expect(await table.getByKey('c1')).toEqual({ connectionId: 'c1', status: 'accepted' });

    await table.append({ connectionId: 'c2', status: 'pending_sent' });
    const reopened = await new SqliteBlobTableAdapter(blob, 'par-noir-pn-test/').openTable(connections);
    expect((await reopened.scan()).map((r) => r.connectionId)).toEqual(['c1', 'c2']);
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
