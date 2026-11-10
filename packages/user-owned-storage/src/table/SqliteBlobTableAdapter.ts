import type { Database } from 'sql.js';
import { portableTablePath } from '../pnLayout.js';
import type { BlobStore } from '../blob/BlobStore.js';
import { BlobPreconditionError } from '../blob/MemoryBlobStore.js';
import type { ScanOptions, TableRow, TableSchema } from '../types.js';
import type { TableHandle, UserOwnedTableStore } from './TableStore.js';
import { TableConcurrencyError } from './tableErrors.js';
import { loadSqlJs } from './sqlJs.js';

const META_TABLE = '_pn_meta';
const DATA_TABLE = 'rows';

async function openDb(bytes: Uint8Array | null): Promise<Database> {
  const SQL = await loadSqlJs();
  const db = bytes && bytes.length > 0 ? new SQL.Database(bytes) : new SQL.Database();
  db.run(`
    CREATE TABLE IF NOT EXISTS ${META_TABLE} (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ${DATA_TABLE} (
      row_key TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );
  `);
  return db;
}

function selectData(db: Database, sql: string, params: (string | number)[]): string[] {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const out: string[] = [];
    while (stmt.step()) out.push(String(stmt.get()[0]));
    return out;
  } finally {
    stmt.free();
  }
}

class SqliteTableHandle implements TableHandle {
  private db: Database | null = null;
  private blobKey: string;
  private loadedEtag: string | undefined;

  constructor(
    readonly schema: TableSchema,
    private readonly blobStore: BlobStore,
    rootPrefix: string
  ) {
    this.blobKey = `${rootPrefix}${portableTablePath(schema.path)}`;
  }

  private async load(): Promise<Database> {
    if (this.db) return this.db;
    const raw = await this.blobStore.get(this.blobKey);
    const head = raw ? await this.blobStore.head(this.blobKey) : null;
    this.loadedEtag = head?.etag;
    this.db = await openDb(raw);
    return this.db;
  }

  private async persist(): Promise<void> {
    if (!this.db) return;
    try {
      const result = await this.blobStore.put(this.blobKey, this.db.export(), {
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
    db.run(`INSERT OR REPLACE INTO ${DATA_TABLE} (row_key, data) VALUES (?, ?)`, [key, JSON.stringify(row)]);
    await this.persist();
  }

  async getByKey(key: string): Promise<TableRow | null> {
    const db = await this.load();
    const [data] = selectData(db, `SELECT data FROM ${DATA_TABLE} WHERE row_key = ?`, [key]);
    return data ? (JSON.parse(data) as TableRow) : null;
  }

  async update(key: string, patch: Partial<TableRow>): Promise<void> {
    const existing = await this.getByKey(key);
    if (!existing) throw new Error(`Row not found: ${key}`);
    await this.append({ ...existing, ...patch, [this.schema.keyColumn]: key });
  }

  async delete(key: string): Promise<void> {
    const db = await this.load();
    db.run(`DELETE FROM ${DATA_TABLE} WHERE row_key = ?`, [key]);
    await this.persist();
  }

  async scan(options?: ScanOptions): Promise<TableRow[]> {
    const db = await this.load();
    const rows = selectData(db, `SELECT data FROM ${DATA_TABLE} ORDER BY row_key LIMIT ? OFFSET ?`, [
      options?.limit ?? 10_000,
      options?.offset ?? 0
    ]);
    return rows.map((data) => JSON.parse(data) as TableRow);
  }

  async replaceAll(rows: TableRow[], meta?: { updatedAt?: string }): Promise<void> {
    const db = await this.load();
    db.run('BEGIN');
    try {
      db.run(`DELETE FROM ${DATA_TABLE}`);
      for (const row of rows) {
        const key = String(row[this.schema.keyColumn] ?? '');
        if (!key) continue;
        db.run(`INSERT OR REPLACE INTO ${DATA_TABLE} (row_key, data) VALUES (?, ?)`, [key, JSON.stringify(row)]);
      }
      if (meta?.updatedAt) {
        db.run(`INSERT OR REPLACE INTO ${META_TABLE} (key, value) VALUES (?, ?)`, ['updatedAt', meta.updatedAt]);
      }
      db.run('COMMIT');
    } catch (err) {
      db.run('ROLLBACK');
      throw err;
    }
    await this.persist();
  }
}

/**
 * SQLite database files stored as blobs (S3, Dropbox, OneDrive, Azure, relay).
 * Runs on sql.js so the owner's device can open the same files.
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
    if (await this.blobStore.head(key)) return;
    const db = await openDb(null);
    const data = db.export();
    db.close();
    await this.blobStore.put(key, data, { contentType: 'application/x-sqlite3' });
  }
}
