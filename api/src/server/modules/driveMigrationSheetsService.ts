/**
 * Batch pn/did replacement across _metadata Google Sheets during identity migration.
 */

import type { GoogleDriveToken } from './googleOAuth2Helper';

function normalizePn(pn: string): string {
  const t = pn.trim();
  return t.startsWith('pn-') ? t : `pn-${t}`;
}

export function replaceInCell(value: string, pred: string, succ: string, predDid?: string, succDid?: string): string {
  if (!value) return value;
  let out = value;
  if (out.includes(pred)) out = out.split(pred).join(succ);
  const predShort = pred.replace(/^pn-/, '');
  const succShort = succ.replace(/^pn-/, '');
  if (predShort && out.includes(predShort)) out = out.split(predShort).join(succShort);
  if (predDid && succDid && out.includes(predDid)) out = out.split(predDid).join(succDid);
  return out;
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

async function replacePnInSpreadsheet(
  token: GoogleDriveToken,
  spreadsheetId: string,
  pred: string,
  succ: string,
  accountId?: string,
  predDid?: string,
  succDid?: string
): Promise<number> {
  const { google } = await import('googleapis');
  const { GoogleOAuth2Helper } = await import('./googleOAuth2Helper');
  const auth = GoogleOAuth2Helper.createClient(token, pred, accountId);
  const sheets = google.sheets({ version: 'v4', auth });

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  let updated = 0;

  for (const sheet of meta.data.sheets || []) {
    const title = sheet.properties?.title;
    if (!title) continue;
    const range = `'${title}'!A:ZZ`;
    let rows: string[][] = [];
    try {
      const data = await sheets.spreadsheets.values.get({ spreadsheetId, range });
      rows = (data.data.values as string[][]) || [];
    } catch {
      continue;
    }
    let changed = false;
    const newRows = rows.map((row) =>
      row.map((cell) => {
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

/** Spreadsheets in _metadata/ root that must not receive pn string replace (handled elsewhere). */
const METADATA_SHEET_DENYLIST = new Set<string>();

function shouldMigrateMetadataSpreadsheet(name: string): boolean {
  if (METADATA_SHEET_DENYLIST.has(name)) return false;
  if (name.endsWith('.metadata')) return false;
  return true;
}

function shouldMigrateMessagesSpreadsheet(name: string): boolean {
  if (name === 'Inbox') return true;
  return name.startsWith('conversation-');
}

export async function migrateMetadataSheetsPn(
  token: GoogleDriveToken,
  metadataFolderId: string,
  messagesFolderId: string | null,
  predecessorPn: string,
  successorPn: string,
  accountId?: string,
  predecessorDid?: string,
  successorDid?: string
): Promise<{ sheetsUpdated: number; conversationSheetsUpdated: number }> {
  const pred = normalizePn(predecessorPn);
  const succ = normalizePn(successorPn);
  let sheetsUpdated = 0;

  const metaFiles = await listSpreadsheetsInFolder(token, metadataFolderId);
  for (const f of metaFiles) {
    if (!shouldMigrateMetadataSpreadsheet(f.name)) continue;
    sheetsUpdated += await replacePnInSpreadsheet(token, f.id, pred, succ, accountId, predecessorDid, successorDid);
  }

  let conversationSheetsUpdated = 0;
  if (messagesFolderId) {
    const convFiles = await listSpreadsheetsInFolder(token, messagesFolderId);
    for (const f of convFiles) {
      if (!shouldMigrateMessagesSpreadsheet(f.name)) continue;
      conversationSheetsUpdated += await replacePnInSpreadsheet(token, f.id, pred, succ, accountId, predecessorDid, successorDid);
    }
  }

  return { sheetsUpdated, conversationSheetsUpdated };
}
