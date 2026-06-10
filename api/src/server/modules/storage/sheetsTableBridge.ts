import type { DelegateTableHooks, ScanOptions, TableRow, TableSchema } from '@par-noir/user-owned-storage';
import { TABLE_PATHS } from '@par-noir/user-owned-storage';
import type { GoogleDriveToken } from '../googleOAuth2Helper';
import type { ThirdPartyPermission } from '../thirdPartyPermissionsService';

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
  throw new Error(`Sheets append not implemented for ${schema.id}`);
}

async function routeGetByKey(
  getDriveContext: () => Promise<DriveTableContext>,
  schema: TableSchema,
  key: string
): Promise<TableRow | null> {
  const ctx = await getDriveContext();
  if (schema.path === TABLE_PATHS.thirdPartyPermissions) {
    const { ThirdPartyPermissionsSheetsService } = await import('../thirdPartyPermissionsSheetsService');
    const sheetId = await ThirdPartyPermissionsSheetsService.getThirdPartyPermissionsSheet(
      ctx.token,
      ctx.metadataFolderId,
      ctx.pnIdentifier,
      ctx.accountId
    );
    const all = await ThirdPartyPermissionsSheetsService.getPermissions(
      ctx.token,
      sheetId,
      ctx.pnIdentifier,
      ctx.accountId
    );
    const perm = all[key];
    return perm ? (perm as unknown as TableRow) : null;
  }
  throw new Error(`Sheets getByKey not implemented for ${schema.id}`);
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
  throw new Error(`Sheets delete not implemented for ${schema.id}`);
}

async function routeScan(
  getDriveContext: () => Promise<DriveTableContext>,
  schema: TableSchema,
  _options?: ScanOptions
): Promise<TableRow[]> {
  const ctx = await getDriveContext();
  if (schema.path === TABLE_PATHS.thirdPartyPermissions) {
    const { ThirdPartyPermissionsSheetsService } = await import('../thirdPartyPermissionsSheetsService');
    const sheetId = await ThirdPartyPermissionsSheetsService.getThirdPartyPermissionsSheet(
      ctx.token,
      ctx.metadataFolderId,
      ctx.pnIdentifier,
      ctx.accountId
    );
    const all = await ThirdPartyPermissionsSheetsService.getPermissions(
      ctx.token,
      sheetId,
      ctx.pnIdentifier,
      ctx.accountId
    );
    return Object.values(all) as unknown as TableRow[];
  }
  throw new Error(`Sheets scan not implemented for ${schema.id}`);
}

async function routeReplaceAll(
  _getDriveContext: () => Promise<DriveTableContext>,
  schema: TableSchema,
  _rows: TableRow[],
  _meta?: { updatedAt?: string }
): Promise<void> {
  throw new Error(`Sheets replaceAll not implemented for ${schema.id}`);
}
