import type { ScanOptions, TableRow, TableSchema } from '../types.js';

export interface TableHandle {
  readonly schema: TableSchema;

  append(row: TableRow): Promise<void>;

  getByKey(key: string): Promise<TableRow | null>;

  update(key: string, patch: Partial<TableRow>): Promise<void>;

  delete(key: string): Promise<void>;

  scan(options?: ScanOptions): Promise<TableRow[]>;

  replaceAll(rows: TableRow[], meta?: { updatedAt?: string }): Promise<void>;
}

/** Opens logical tables on a user-owned storage backend */
export interface UserOwnedTableStore {
  readonly backend: 'sheets' | 'sqlite_blob' | 'snapshot_json' | 'delegate';

  openTable(schema: TableSchema): Promise<TableHandle>;
}

/** Delegate hooks for provider-specific table backends (e.g. Google Sheets in API layer) */
export interface DelegateTableHooks {
  append(schema: TableSchema, row: TableRow): Promise<void>;
  getByKey(schema: TableSchema, key: string): Promise<TableRow | null>;
  update(schema: TableSchema, key: string, patch: Partial<TableRow>): Promise<void>;
  delete(schema: TableSchema, key: string): Promise<void>;
  scan(schema: TableSchema, options?: ScanOptions): Promise<TableRow[]>;
  replaceAll(schema: TableSchema, rows: TableRow[], meta?: { updatedAt?: string }): Promise<void>;
}
