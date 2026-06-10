import type { DelegateTableHooks, ScanOptions, TableRow, TableSchema } from '@par-noir/user-owned-storage';
import { TABLE_PATHS } from '@par-noir/user-owned-storage';
import type { GoogleDriveToken } from '../googleOAuth2Helper';
import type { ThirdPartyPermission } from '../thirdPartyPermissionsService';
import { replaceAllGoogleTableRows, scanGoogleTableRows } from './googleSheetsTableOps';

export type DriveTableContext = {
  token: GoogleDriveToken;
  metadataFolderId: string;
  pnIdentifier: string;
  accountId?: string;
};

export function createGoogleSheetsTableHooks(
  getDriveContext: () => Promise<DriveTableContext>
): DelegateTableHooks {
  return {
    append: (schema, row) => routeAppend(getDriveContext, schema, row),
    getByKey: (schema, key) => routeGetByKey(getDriveContext, schema, key),
    update: async (schema, key, patch) => {
      const ctx = await getDriveContext();
      const existing = await routeGetByKey(() => Promise.resolve(ctx), schema, key);
      if (!existing) throw new Error('Row not found');
      await routeAppend(() => Promise.resolve(ctx), schema, { ...existing, ...patch });
    },
    delete: (schema, key) => routeDelete(getDriveContext, schema, key),
    scan: (schema, options) => routeScan(getDriveContext, schema, options),
    replaceAll: (schema, rows, meta) => routeReplaceAll(getDriveContext, schema, rows, meta)
  };
}

async function routeAppend(
  getDriveContext: () => Promise<DriveTableContext>,
  schema: TableSchema,
  row: TableRow
): Promise<void> {
  const ctx = await getDriveContext();
  if (schema.path === TABLE_PATHS.thirdPartyPermissions) {
    const { ThirdPartyPermissionsSheetsService } = await import('../thirdPartyPermissionsSheetsService');
    const sheetId = await ThirdPartyPermissionsSheetsService.getThirdPartyPermissionsSheet(
      ctx.token,
      ctx.metadataFolderId,
      ctx.pnIdentifier,
      ctx.accountId
    );
    await ThirdPartyPermissionsSheetsService.addPermission(
      ctx.token,
      sheetId,
      row as unknown as ThirdPartyPermission,
      ctx.pnIdentifier,
      ctx.accountId
    );
    return;
  }
  const existing = await scanGoogleTableRows(ctx, schema);
  const keyCol = schema.keyColumn;
  const key = String(row[keyCol] ?? '');
  const filtered = existing.filter((r) => String(r[keyCol] ?? '') !== key);
  await replaceAllGoogleTableRows(ctx, schema, [...filtered, row]);
}

async function routeGetByKey(
  getDriveContext: () => Promise<DriveTableContext>,
  schema: TableSchema,
  key: string
): Promise<TableRow | null> {
  const ctx = await getDriveContext();
  const rows = await scanGoogleTableRows(ctx, schema);
  return rows.find((r) => String(r[schema.keyColumn] ?? '') === key) ?? null;
}

async function routeDelete(
  getDriveContext: () => Promise<DriveTableContext>,
  schema: TableSchema,
  key: string
): Promise<void> {
  const ctx = await getDriveContext();
  if (schema.path === TABLE_PATHS.thirdPartyPermissions) {
    const { ThirdPartyPermissionsSheetsService } = await import('../thirdPartyPermissionsSheetsService');
    const sheetId = await ThirdPartyPermissionsSheetsService.getThirdPartyPermissionsSheet(
      ctx.token,
      ctx.metadataFolderId,
      ctx.pnIdentifier,
      ctx.accountId
    );
    await ThirdPartyPermissionsSheetsService.revokePermission(
      ctx.token,
      sheetId,
      key,
      ctx.pnIdentifier,
      ctx.accountId
    );
    return;
  }
  const rows = await scanGoogleTableRows(ctx, schema);
  const filtered = rows.filter((r) => String(r[schema.keyColumn] ?? '') !== key);
  await replaceAllGoogleTableRows(ctx, schema, filtered);
}

async function routeScan(
  getDriveContext: () => Promise<DriveTableContext>,
  schema: TableSchema,
  _options?: ScanOptions
): Promise<TableRow[]> {
  const ctx = await getDriveContext();
  return scanGoogleTableRows(ctx, schema);
}

async function routeReplaceAll(
  getDriveContext: () => Promise<DriveTableContext>,
  schema: TableSchema,
  rows: TableRow[],
  meta?: { updatedAt?: string }
): Promise<void> {
  const ctx = await getDriveContext();
  await replaceAllGoogleTableRows(ctx, schema, rows, meta);
}
