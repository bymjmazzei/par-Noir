import type { TableRow } from '@par-noir/user-owned-storage';
import { resolveStorageContext, openTable } from './storageFacade';
import type { TableSchema } from '@par-noir/user-owned-storage';

export async function portableTableAppend(
  pnIdentifier: string,
  schema: TableSchema,
  row: TableRow,
  accountId?: string
): Promise<void> {
  const ctx = await resolveStorageContext(pnIdentifier, accountId);
  const table = await openTable(ctx, schema);
  await table.append(row);
}

export async function portableTableGetByKey<T = TableRow>(
  pnIdentifier: string,
  schema: TableSchema,
  key: string,
  accountId?: string
): Promise<T | null> {
  const ctx = await resolveStorageContext(pnIdentifier, accountId);
  const table = await openTable(ctx, schema);
  return (await table.getByKey(key)) as T | null;
}

export async function portableTableScan<T = TableRow>(
  pnIdentifier: string,
  schema: TableSchema,
  accountId?: string
): Promise<T[]> {
  const ctx = await resolveStorageContext(pnIdentifier, accountId);
  const table = await openTable(ctx, schema);
  return (await table.scan()) as T[];
}

export async function portableTableDelete(
  pnIdentifier: string,
  schema: TableSchema,
  key: string,
  accountId?: string
): Promise<void> {
  const ctx = await resolveStorageContext(pnIdentifier, accountId);
  const table = await openTable(ctx, schema);
  await table.delete(key);
}

export async function portableTableReplaceAll(
  pnIdentifier: string,
  schema: TableSchema,
  rows: TableRow[],
  accountId?: string,
  meta?: { updatedAt?: string }
): Promise<void> {
  const ctx = await resolveStorageContext(pnIdentifier, accountId);
  const table = await openTable(ctx, schema);
  await table.replaceAll(rows, meta);
}
