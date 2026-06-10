import { describe, expect, it } from 'vitest';
import type { TableSchema } from '@par-noir/user-owned-storage';
import { transferTable } from './tableTransfer.js';
import { indexEntryToRow, rowToIndexEntry } from './indexRows.js';

const schema: TableSchema = {
  id: 'test',
  keyColumn: 'fileId',
  path: '_metadata/test-index'
};

describe('transferTable', () => {
  it('copies rows from source to destination', async () => {
    const sourceRows = [{ fileId: 'f1', name: 'a' }];
    const dest: { rows: Record<string, unknown>[] } = { rows: [] };
    const report = await transferTable(
      'job-1',
      schema.path,
      schema,
      { scan: async () => sourceRows, replaceAll: async () => {} },
      {
        scan: async () => [],
        replaceAll: async (_s, rows) => {
          dest.rows = rows as Record<string, unknown>[];
        }
      }
    );
    expect(report.totals.migrated).toBe(1);
    expect(dest.rows).toHaveLength(1);
  });
});

describe('indexRows', () => {
  it('round-trips index entry JSON', () => {
    const entry = {
      fileId: 'abc',
      visibility: 'public',
      uploadedAt: '2026-01-01T00:00:00.000Z',
      backend: 'aws_s3'
    };
    const row = indexEntryToRow(entry);
    const back = rowToIndexEntry(row);
    expect(back.fileId).toBe('abc');
    expect(back.backend).toBe('aws_s3');
  });
});
