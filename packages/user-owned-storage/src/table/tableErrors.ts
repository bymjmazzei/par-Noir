export class TableConcurrencyError extends Error {
  constructor(tableId: string) {
    super(`Concurrent write conflict on table ${tableId}`);
    this.name = 'TableConcurrencyError';
  }
}
