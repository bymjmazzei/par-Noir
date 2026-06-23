import { portableSnapshotPath } from '../pnLayout.js';
import type { BlobStore } from '../blob/BlobStore.js';
import { BlobPreconditionError } from '../blob/MemoryBlobStore.js';
import type { ScanOptions, TableRow, TableSchema } from '../types.js';
import type { TableHandle, UserOwnedTableStore } from './TableStore.js';
import { TableConcurrencyError } from './tableErrors.js';

interface SnapshotFile {
  updatedAt?: string;
  rows: TableRow[];
}

class SnapshotTableHandle implements TableHandle {
  private cached: SnapshotFile | null = null;
  private loadedEtag: string | undefined;
  private blobKey: string;

  constructor(
    readonly schema: TableSchema,
    private readonly blobStore: BlobStore,
    rootPrefix: string
  ) {
    this.blobKey = `${rootPrefix}${portableSnapshotPath(schema.path)}`;
  }

  private async load(): Promise<SnapshotFile> {
    if (this.cached) return this.cached;
    const raw = await this.blobStore.get(this.blobKey);
    const head = await this.blobStore.head(this.blobKey);
    this.loadedEtag = head?.etag;
    if (!raw || raw.length === 0) {
      this.cached = { rows: [] };
      return this.cached;
    }
    this.cached = JSON.parse(Buffer.from(raw).toString('utf8')) as SnapshotFile;
    return this.cached;
  }

  private async persist(): Promise<void> {
    if (!this.cached) return;
    const body = Buffer.from(JSON.stringify(this.cached), 'utf8');
    try {
      const result = await this.blobStore.put(this.blobKey, body, {
        ifMatch: this.loadedEtag,
        contentType: 'application/json'
      });
      this.loadedEtag = result.etag;
    } catch (err) {
      if (err instanceof BlobPreconditionError) {
        throw new TableConcurrencyError(this.schema.id);
      }
      throw err;
    }
  }

  private rowKey(row: TableRow): string {
    return String(row[this.schema.keyColumn] ?? '');
  }

  async append(row: TableRow): Promise<void> {
    const key = this.rowKey(row);
    if (!key) throw new Error(`Row missing key column ${this.schema.keyColumn}`);
    const snap = await this.load();
    const idx = snap.rows.findIndex((r) => this.rowKey(r) === key);
    if (idx >= 0) {
      snap.rows[idx] = { ...snap.rows[idx], ...row };
    } else {
      snap.rows.push(row);
    }
    snap.updatedAt = new Date().toISOString();
    await this.persist();
  }

  async getByKey(key: string): Promise<TableRow | null> {
    const snap = await this.load();
    return snap.rows.find((r) => this.rowKey(r) === key) ?? null;
  }

  async update(key: string, patch: Partial<TableRow>): Promise<void> {
    const existing = await this.getByKey(key);
    if (!existing) throw new Error(`Row not found: ${key}`);
    await this.append({ ...existing, ...patch, [this.schema.keyColumn]: key });
  }

  async delete(key: string): Promise<void> {
    const snap = await this.load();
    snap.rows = snap.rows.filter((r) => this.rowKey(r) !== key);
    snap.updatedAt = new Date().toISOString();
    await this.persist();
  }

  async scan(options?: ScanOptions): Promise<TableRow[]> {
    const snap = await this.load();
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? snap.rows.length;
    return snap.rows.slice(offset, offset + limit);
  }

  async replaceAll(rows: TableRow[], meta?: { updatedAt?: string }): Promise<void> {
    this.cached = {
      rows: [...rows],
      updatedAt: meta?.updatedAt ?? new Date().toISOString()
    };
    await this.persist();
  }
}

/**
 * Full JSON snapshot per table — suitable for small, infrequently updated datasets.
 */
export class SnapshotJsonTableAdapter implements UserOwnedTableStore {
  readonly backend = 'snapshot_json' as const;

  constructor(
    private readonly blobStore: BlobStore,
    private readonly rootPrefix: string
  ) {}

  async openTable(schema: TableSchema): Promise<TableHandle> {
    return new SnapshotTableHandle(schema, this.blobStore, this.rootPrefix);
  }

  async ensureTable(schema: TableSchema): Promise<void> {
    const key = `${this.rootPrefix}${portableSnapshotPath(schema.path)}`;
    const existing = await this.blobStore.head(key);
    if (existing) return;
    const body = Buffer.from(JSON.stringify({ rows: [], updatedAt: new Date().toISOString() }), 'utf8');
    await this.blobStore.put(key, body, { contentType: 'application/json' });
  }
}
