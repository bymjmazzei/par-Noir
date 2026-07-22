import { describe, it, expect } from 'vitest';
import { MemoryBlobStore } from '../blob/MemoryBlobStore.js';
import { SqliteBlobTableAdapter } from './SqliteBlobTableAdapter.js';
import { SegmentedSqliteTableAdapter } from './SegmentedSqliteTableAdapter.js';
import type { TableSchema } from '../types.js';

const SCHEMA: TableSchema = {
  id: 'activity-ledger',
  keyColumn: 'activity_id',
  path: '_metadata/activity_ledger'
};

describe('SqliteBlobTableAdapter contract', () => {
  it('append getByKey scan roundtrip', async () => {
    const store = new MemoryBlobStore('memory');
    const tables = new SqliteBlobTableAdapter(store, 'pn-test/');
    const table = await tables.openTable(SCHEMA);
    await table.append({ activity_id: 'a1', note: 'hello' });
    const row = await table.getByKey('a1');
    expect(row?.note).toBe('hello');
    const all = await table.scan();
    expect(all).toHaveLength(1);
  });
});

describe('SegmentedSqliteTableAdapter', () => {
  it('writes activity ledger to day segment', async () => {
    const store = new MemoryBlobStore('memory');
    const tables = new SegmentedSqliteTableAdapter(
      store,
      'pn-test/',
      new Set(['activity-ledger']),
      7
    );
    const table = await tables.openTable(SCHEMA);
    await table.append({ activity_id: 'a2', note: 'seg' });
    const found = await table.getByKey('a2');
    expect(found?.note).toBe('seg');
    const day = new Date().toISOString().slice(0, 10);
    const keys = await store.list('pn-test/');
    expect(keys.some((k) => k.key.includes(day))).toBe(true);
  });
});
