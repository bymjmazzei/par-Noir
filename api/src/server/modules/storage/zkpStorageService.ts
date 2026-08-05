/**
 * ZKP owner storage: portable table or Google Sheets via pnDriveIndex (no name search).
 */

import { getOwnerStorageContext } from './ownerStorageContext';

export interface ZkpStorageBundle {
  pnIdentifier: string;
  accountId?: string;
  isPortable: boolean;
  spreadsheetId?: string;
  token?: { access_token: string };
}

export async function loadZkpBundle(
  pn: string,
  opts?: { accessToken?: string }
): Promise<ZkpStorageBundle | null> {
  const ctx = await getOwnerStorageContext(pn, opts);
  if (!ctx) return null;

  if (ctx.kind === 'portable') {
    return {
      pnIdentifier: ctx.pnIdentifier,
      accountId: ctx.accountId,
      isPortable: true,
    };
  }

  const { loadPnDriveIndex, getSheetIdFromIndex, PN_DRIVE_SHEET_KEYS } = await import('../pnDriveIndex');
  const index = await loadPnDriveIndex(ctx.pnIdentifier);
  if (!index) return null;

  let spreadsheetId: string;
  try {
    spreadsheetId = getSheetIdFromIndex(index, PN_DRIVE_SHEET_KEYS.ZKP_DATA_POINTS);
  } catch {
    return null;
  }

  return {
    pnIdentifier: ctx.pnIdentifier,
    accountId: ctx.accountId,
    isPortable: false,
    spreadsheetId,
    token: opts?.accessToken
      ? { access_token: opts.accessToken }
      : ctx.token,
  };
}
