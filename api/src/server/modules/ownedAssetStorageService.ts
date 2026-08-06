/**
 * Load owned-assets Drive spreadsheet context (get-or-create + index patch).
 */

import { getOwnerStorageContext } from './storage/ownerStorageContext';
import {
  loadPnDriveIndex,
  patchPnDriveIndex,
  PN_DRIVE_SHEET_KEYS
} from './pnDriveIndex';
import { OwnedAssetsSheetsService } from './ownedAssetsSheetsService';
import type { GoogleDriveToken } from './googleOAuth2Helper';

export interface OwnedAssetDriveBundle {
  pnIdentifier: string;
  token: GoogleDriveToken;
  accountId: string | undefined;
  spreadsheetId: string;
}

export async function loadOwnedAssetDriveBundle(
  pnIdentifier: string,
  opts?: { accessToken?: string }
): Promise<OwnedAssetDriveBundle> {
  const accessToken = opts?.accessToken?.trim();
  if (!accessToken) {
    throw Object.assign(new Error('cloud_token_required'), { code: 'CLOUD_TOKEN_REQUIRED' });
  }

  const ctx = await getOwnerStorageContext(pnIdentifier, { accessToken });
  if (!ctx || ctx.kind !== 'google_drive') {
    throw Object.assign(new Error('drive_not_initialized'), { code: 'DRIVE_NOT_INITIALIZED' });
  }

  const token: GoogleDriveToken = { access_token: accessToken };
  const accountId = ctx.accountId;
  const index = await loadPnDriveIndex(pnIdentifier);
  let spreadsheetId = index?.sheetIds?.[PN_DRIVE_SHEET_KEYS.OWNED_ASSETS]?.trim() || '';

  if (!spreadsheetId) {
    spreadsheetId = await OwnedAssetsSheetsService.getOrCreateSpreadsheet(
      token,
      ctx.metadataFolderId,
      pnIdentifier,
      accountId
    );
    await patchPnDriveIndex(pnIdentifier, {
      sheetIds: { [PN_DRIVE_SHEET_KEYS.OWNED_ASSETS]: spreadsheetId }
    });
  }

  return {
    pnIdentifier,
    token,
    accountId,
    spreadsheetId
  };
}
