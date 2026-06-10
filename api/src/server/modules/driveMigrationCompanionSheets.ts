/**
 * Migrate companion metadata Google Sheets ({fileId}.metadata) in content-class folders.
 */

import { MetadataEncryption } from '../utils/metadataEncryption';
import type { GoogleDriveToken } from './googleOAuth2Helper';
import { replaceInCell } from './driveMigrationSheetsService';

const CONTENT_CLASS_FOLDERS = new Set(['media', 'thoughts', 'collections']);

async function listChildFolders(
  token: GoogleDriveToken,
  parentId: string
): Promise<Array<{ id: string; name: string }>> {
  const q = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=200`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!res.ok) return [];
  const data = (await res.json()) as { files?: Array<{ id: string; name: string }> };
  return data.files || [];
}

async function listSpreadsheetsInFolder(
  token: GoogleDriveToken,
  folderId: string
): Promise<Array<{ id: string; name: string }>> {
  const q = `'${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=200`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!res.ok) return [];
  const data = (await res.json()) as { files?: Array<{ id: string; name: string }> };
  return data.files || [];
}

async function migrateCompanionMetadataTab(
  sheets: ReturnType<typeof import('googleapis').google.sheets>,
  spreadsheetId: string,
  pred: string,
  succ: string,
  predDid?: string,
  succDid?: string
): Promise<boolean> {
  const metadataResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Metadata!A1:R2',
  });
  const rows = metadataResponse.data.values;
  if (!rows || rows.length < 2) return false;

  const headers = rows[0] as string[];
  const data = [...(rows[1] as string[])];
  let changed = false;

  const ownerDidIdx = headers.indexOf('ownerDid');
  const ownerIdIdx = headers.indexOf('ownerIdentifier');
  if (ownerDidIdx >= 0 && data[ownerDidIdx]) {
    const decrypted = MetadataEncryption.decryptField(String(data[ownerDidIdx]));
    const next = replaceInCell(decrypted, pred, succ, predDid, succDid);
    if (next !== decrypted) {
      data[ownerDidIdx] = MetadataEncryption.encryptField(next);
      changed = true;
    }
  }
  if (ownerIdIdx >= 0 && data[ownerIdIdx]) {
    const decrypted = MetadataEncryption.decryptField(String(data[ownerIdIdx]));
    const next = replaceInCell(decrypted, pred, succ, predDid, succDid);
    if (next !== decrypted) {
      data[ownerIdIdx] = MetadataEncryption.encryptField(next);
      changed = true;
    }
  }

  if (changed) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Metadata!A2',
      valueInputOption: 'RAW',
      requestBody: { values: [data] },
    });
  }
  return changed;
}

async function patchEngagementTabs(
  sheets: ReturnType<typeof import('googleapis').google.sheets>,
  spreadsheetId: string,
  pred: string,
  succ: string,
  predDid?: string,
  succDid?: string
): Promise<number> {
  const tabNames = ['Likes', 'Comments', 'Shares', 'Saves', 'Views'];
  let updated = 0;
  for (const title of tabNames) {
    const range = `'${title}'!A:ZZ`;
    let rows: string[][] = [];
    try {
      const data = await sheets.spreadsheets.values.get({ spreadsheetId, range });
      rows = (data.data.values as string[][]) || [];
    } catch {
      continue;
    }
    if (rows.length < 2) continue;
    let changed = false;
    const newRows = rows.map((row, rowIdx) =>
      row.map((cell) => {
        if (rowIdx === 0) return cell;
        const next = replaceInCell(String(cell ?? ''), pred, succ, predDid, succDid);
        if (next !== cell) changed = true;
        return next;
      })
    );
    if (changed) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: { values: newRows },
      });
      updated++;
    }
  }
  return updated;
}

export async function migrateCompanionMetadataSheetsPn(
  token: GoogleDriveToken,
  metadataFolderId: string,
  predecessorPn: string,
  successorPn: string,
  accountId?: string,
  predecessorDid?: string,
  successorDid?: string
): Promise<{ companionSheetsUpdated: number }> {
  const pred = predecessorPn.startsWith('pn-') ? predecessorPn : `pn-${predecessorPn}`;
  const succ = successorPn.startsWith('pn-') ? successorPn : `pn-${successorPn}`;

  const { google } = await import('googleapis');
  const { GoogleOAuth2Helper } = await import('./googleOAuth2Helper');
  const auth = GoogleOAuth2Helper.createClient(token, pred, accountId);
  const sheets = google.sheets({ version: 'v4', auth });

  let companionSheetsUpdated = 0;
  const classFolders = await listChildFolders(token, metadataFolderId);

  for (const folder of classFolders) {
    if (!CONTENT_CLASS_FOLDERS.has(folder.name)) continue;
    const spreadsheets = await listSpreadsheetsInFolder(token, folder.id);
    for (const sheet of spreadsheets) {
      if (!sheet.name.endsWith('.metadata')) continue;
      try {
        const metaChanged = await migrateCompanionMetadataTab(
          sheets,
          sheet.id,
          pred,
          succ,
          predecessorDid,
          successorDid
        );
        const engagementChanged = await patchEngagementTabs(
          sheets,
          sheet.id,
          pred,
          succ,
          predecessorDid,
          successorDid
        );
        if (metaChanged || engagementChanged > 0) companionSheetsUpdated++;
      } catch (e) {
        console.error('[migration] companion sheet:', sheet.name, e);
      }
    }
  }

  return { companionSheetsUpdated };
}
