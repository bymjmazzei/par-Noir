/**
 * Day-segmented table store for append-heavy ledgers.
 * Writes go to today's segment blob; scans merge recent segments.
 */

import type { BlobStore } from '../blob/BlobStore.js';
import type { ScanOptions, TableRow, TableSchema } from '../types.js';
import type { TableHandle, UserOwnedTableStore } from './TableStore.js';
import { SqliteBlobTableAdapter } from './SqliteBlobTableAdapter.js';

function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function segmentSchema(base: TableSchema, day: string): TableSchema {
  return {
    ...base,
    id: `${base.id}:${day}`,
    path: `${base.path}/${day}`
  };
}

class SegmentedTableHandle implements TableHandle {
  constructor(
    readonly schema: TableSchema,
    private readonly inner: UserOwnedTableStore,
    private readonly lookbackDays: number
  ) {}

  private todaySchema(): TableSchema {
    return segmentSchema(this.schema, utcDay());
  }

  async append(row: TableRow): Promise<void> {
    const table = await this.inner.openTable(this.todaySchema());
    await table.append(row);
  }

  async getByKey(key: string): Promise<TableRow | null> {
    for (let i = 0; i < this.lookbackDays; i++) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      const table = await this.inner.openTable(segmentSchema(this.schema, utcDay(d)));
      const row = await table.getByKey(key);
      if (row) return row;
    }
    return null;
  }

  async update(key: string, patch: Partial<TableRow>): Promise<void> {
    for (let i = 0; i < this.lookbackDays; i++) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      const table = await this.inner.openTable(segmentSchema(this.schema, utcDay(d)));
      const existing = await table.getByKey(key);
      if (existing) {
        await table.update(key, patch);
        return;
      }
    }
    throw new Error(`Row not found: ${key}`);
  }

  async delete(key: string): Promise<void> {
    for (let i = 0; i < this.lookbackDays; i++) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      const table = await this.inner.openTable(segmentSchema(this.schema, utcDay(d)));
      const existing = await table.getByKey(key);
      if (existing) {
        await table.delete(key);
        return;
      }
    }
  }

  async scan(options?: ScanOptions): Promise<TableRow[]> {
    const rows: TableRow[] = [];
    for (let i = 0; i < this.lookbackDays; i++) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      const table = await this.inner.openTable(segmentSchema(this.schema, utcDay(d)));
      rows.push(...(await table.scan(options)));
    }
    const limit = options?.limit;
    const offset = options?.offset ?? 0;
    if (limit == null) return rows.slice(offset);
    return rows.slice(offset, offset + limit);
  }

  async replaceAll(rows: TableRow[], meta?: { updatedAt?: string }): Promise<void> {
    const table = await this.inner.openTable(this.todaySchema());
    await table.replaceAll(rows, meta);
  }
}

/**
 * Wraps SqliteBlobTableAdapter so selected schemas write to daily segment files.
 */
export class SegmentedSqliteTableAdapter implements UserOwnedTableStore {
  readonly backend = 'sqlite_blob' as const;
  private readonly inner: SqliteBlobTableAdapter;

  constructor(
    blobStore: BlobStore,
    rootPrefix: string,
    private readonly segmentedSchemaIds: Set<string>,
    private readonly lookbackDays = 90
  ) {
    this.inner = new SqliteBlobTableAdapter(blobStore, rootPrefix);
  }

  async openTable(schema: TableSchema): Promise<TableHandle> {
    if (this.segmentedSchemaIds.has(schema.id)) {
      return new SegmentedTableHandle(schema, this.inner, this.lookbackDays);
    }
    return this.inner.openTable(schema);
  }

  async ensureTable(schema: TableSchema): Promise<void> {
    if (this.segmentedSchemaIds.has(schema.id)) {
      await this.inner.ensureTable(segmentSchema(schema, utcDay()));
      return;
    }
    await this.inner.ensureTable(schema);
  }
}
