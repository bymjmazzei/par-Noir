import type { ScanOptions, TableRow, TableSchema } from '../types.js';
import type { DelegateTableHooks, TableHandle, UserOwnedTableStore } from './TableStore.js';

class DelegateTableHandle implements TableHandle {
  constructor(
    readonly schema: TableSchema,
    private readonly hooks: DelegateTableHooks
  ) {}

  append(row: TableRow): Promise<void> {
    return this.hooks.append(this.schema, row);
  }

  getByKey(key: string): Promise<TableRow | null> {
    return this.hooks.getByKey(this.schema, key);
  }

  update(key: string, patch: Partial<TableRow>): Promise<void> {
    return this.hooks.update(this.schema, key, patch);
  }

  delete(key: string): Promise<void> {
    return this.hooks.delete(this.schema, key);
  }

  scan(options?: ScanOptions): Promise<TableRow[]> {
    return this.hooks.scan(this.schema, options);
  }

  replaceAll(rows: TableRow[], meta?: { updatedAt?: string }): Promise<void> {
    return this.hooks.replaceAll(this.schema, rows, meta);
  }
}

/**
 * Wraps external table implementations (e.g. Google Sheets services in the API).
 */
export class DelegateTableAdapter implements UserOwnedTableStore {
  readonly backend = 'delegate' as const;

  constructor(private readonly hooks: DelegateTableHooks) {}

  async openTable(schema: TableSchema): Promise<TableHandle> {
    return new DelegateTableHandle(schema, this.hooks);
  }
}
