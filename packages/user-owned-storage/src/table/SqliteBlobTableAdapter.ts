import Database from 'better-sqlite3';
import { portableTablePath } from '../pnLayout.js';
import type { BlobStore } from '../blob/BlobStore.js';
import { BlobPreconditionError } from '../blob/MemoryBlobStore.js';
import type { ScanOptions, TableRow, TableSchema } from '../types.js';
import type { TableHandle, UserOwnedTableStore } from './TableStore.js';

const META_TABLE = '_pn_meta';
const DATA_TABLE = 'rows';

function openDb(bytes: Uint8Array | null): Database.Database {
  if (bytes && bytes.length > 0) {
    return new Database(Buffer.from(bytes));
  }
  const db = new Database(':memory:');
  initSchema(db);
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${META_TABLE} (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ${DATA_TABLE} (
      row_key TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );
  `);
}

function exportDb(db: Database.Database): Uint8Array {
  const buffer = db.serialize() as Buffer;
  return new Uint8Array(buffer);
}

class SqliteTableHandle implements TableHandle {
  private db: Database.Database | null = null;
  private blobKey: string;
  private loadedEtag: string | undefined;

  constructor(
    readonly schema: TableSchema,
    private readonly blobStore: BlobStore,
    rootPrefix: string
  ) {
    this.blobKey = `${rootPrefix}${portableTablePath(schema.path)}`;
  }

  private async load(): Promise<Database.Database> {
    if (this.db) return this.db;
    const raw = await this.blobStore.get(this.blobKey);
    const head = await this.blobStore.head(this.blobKey);
    this.loadedEtag = head?.etag;
    this.db = openDb(raw);
    initSchema(this.db);
    return this.db;
  }

  private async persist(): Promise<void> {
    if (!this.db) return;
    const data = exportDb(this.db);
    try {
      const result = await this.blobStore.put(this.blobKey, data, {
        ifMatch: this.loadedEtag,
        contentType: 'application/x-sqlite3'
      });
      this.loadedEtag = result.etag;
    } catch (err) {
      if (err instanceof BlobPreconditionError) {
        throw new TableConcurrencyError(this.schema.id);
      }
      throw err;
    }
  }

  async append(row: TableRow): Promise<void> {
    const key = String(row[this.schema.keyColumn] ?? '');
    if (!key) throw new Error(`Row missing key column ${this.schema.keyColumn}`);
    const db = await this.load();
    db.prepare(
      `INSERT OR REPLACE INTO ${DATA_TABLE} (row_key, data) VALUES (?, ?)`
    ).run(key, JSON.stringify(row));
    await this.persist();
  }

  async getByKey(key: string): Promise<TableRow | null> {
    const db = await this.load();
    const row = db
      .prepare(`SELECT data FROM ${DATA_TABLE} WHERE row_key = ?`)
      .get(key) as { data: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.data) as TableRow;
  }

  async update(key: string, patch: Partial<TableRow>): Promise<void> {
    const existing = await this.getByKey(key);
    if (!existing) throw new Error(`Row not found: ${key}`);
    await this.append({ ...existing, ...patch, [this.schema.keyColumn]: key });
  }

  async delete(key: string): Promise<void> {
    const db = await this.load();
    db.prepare(`DELETE FROM ${DATA_TABLE} WHERE row_key = ?`).run(key);
    await this.persist();
  }

  async scan(options?: ScanOptions): Promise<TableRow[]> {
    const db = await this.load();
    const limit = options?.limit ?? 10_000;
    const offset = options?.offset ?? 0;
    const rows = db
      .prepare(`SELECT data FROM ${DATA_TABLE} ORDER BY row_key LIMIT ? OFFSET ?`)
      .all(limit, offset) as Array<{ data: string }>;
    return rows.map((r) => JSON.parse(r.data) as TableRow);
  }

  async replaceAll(rows: TableRow[], meta?: { updatedAt?: string }): Promise<void> {
    const db = await this.load();
    const del = db.prepare(`DELETE FROM ${DATA_TABLE}`);
    const ins = db.prepare(
      `INSERT INTO ${DATA_TABLE} (row_key, data) VALUES (?, ?)`
    );
    const setMeta = db.prepare(
      `INSERT OR REPLACE INTO ${META_TABLE} (key, value) VALUES (?, ?)`
    );
    const tx = db.transaction(() => {
      del.run();
      for (const row of rows) {
        const key = String(row[this.schema.keyColumn] ?? '');
        if (!key) continue;
        ins.run(key, JSON.stringify(row));
      }
      if (meta?.updatedAt) {
        setMeta.run('updatedAt', meta.updatedAt);
      }
    });
    tx();
    await this.persist();
  }
}

export class TableConcurrencyError extends Error {
  constructor(tableId: string) {
    super(`Concurrent write conflict on table ${tableId}`);
    this.name = 'TableConcurrencyError';
  }
}

/**
 * SQLite database files stored as blobs (S3, Dropbox, OneDrive, FTP, etc.).
 */
export class SqliteBlobTableAdapter implements UserOwnedTableStore {
  readonly backend = 'sqlite_blob' as const;

  constructor(
    private readonly blobStore: BlobStore,
    private readonly rootPrefix: string
  ) {}

  async openTable(schema: TableSchema): Promise<TableHandle> {
    return new SqliteTableHandle(schema, this.blobStore, this.rootPrefix);
  }

  /** Create empty table blob at path if missing */
  async ensureTable(schema: TableSchema): Promise<void> {
    const key = `${this.rootPrefix}${portableTablePath(schema.path)}`;
    const existing = await this.blobStore.head(key);
    if (existing) return;
    const db = openDb(null);
    const data = exportDb(db);
    db.close();
    await this.blobStore.put(key, data, { contentType: 'application/x-sqlite3' });
  }
}
