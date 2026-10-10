/**
 * Google Sheets scaffolding on the device (token to Google only).
 */

import { findSpreadsheetByName } from './deviceDriveFind.js';
import { writeSheetValues } from './deviceSheet.js';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE = 'https://www.googleapis.com/drive/v3';

export type SheetTabSpec = {
  title: string;
  rowCount?: number;
  columnCount?: number;
};

export type HeaderWrite = {
  range: string;
  values: string[][];
};

export type SpreadsheetSpec = {
  /** Drive list query `name='…'` (may differ from spreadsheet title). */
  driveFileName: string;
  propertiesTitle: string;
  sheets: SheetTabSpec[];
  headers: HeaderWrite[];
};

function googleHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

export async function findSpreadsheetInFolder(
  accessToken: string,
  driveFileName: string,
  parentFolderId: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  return findSpreadsheetByName(accessToken, driveFileName, parentFolderId, fetchImpl);
}

async function moveSpreadsheetToFolder(
  accessToken: string,
  spreadsheetId: string,
  parentFolderId: string,
  fetchImpl: typeof fetch
): Promise<void> {
  const parentsRes = await fetchImpl(
    `${DRIVE}/files/${encodeURIComponent(spreadsheetId)}?fields=parents`,
    { headers: googleHeaders(accessToken) }
  );
  const parents = parentsRes.ok
    ? ((await parentsRes.json()) as { parents?: string[] }).parents || []
    : [];
  const move = new URLSearchParams();
  move.set('addParents', parentFolderId);
  if (parents.length) move.set('removeParents', parents.join(','));
  await fetchImpl(`${DRIVE}/files/${encodeURIComponent(spreadsheetId)}?${move.toString()}`, {
    method: 'PATCH',
    headers: googleHeaders(accessToken),
    body: '{}',
  });
}

export async function createSpreadsheetInFolder(
  accessToken: string,
  parentFolderId: string,
  spec: SpreadsheetSpec,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const created = await fetchImpl(SHEETS, {
    method: 'POST',
    headers: googleHeaders(accessToken),
    body: JSON.stringify({
      properties: { title: spec.propertiesTitle },
      sheets: spec.sheets.map((s) => ({
        properties: {
          title: s.title,
          ...(s.rowCount != null || s.columnCount != null
            ? {
                gridProperties: {
                  ...(s.rowCount != null ? { rowCount: s.rowCount } : {}),
                  ...(s.columnCount != null ? { columnCount: s.columnCount } : {}),
                },
              }
            : {}),
        },
      })),
    }),
  });
  if (!created.ok) {
    throw new Error(`Spreadsheet create failed (${created.status})`);
  }
  const spreadsheet = (await created.json()) as { spreadsheetId?: string };
  const spreadsheetId = spreadsheet.spreadsheetId;
  if (!spreadsheetId) throw new Error('Spreadsheet create returned no id');

  await moveSpreadsheetToFolder(accessToken, spreadsheetId, parentFolderId, fetchImpl);
  await writeSheetHeaders(accessToken, spreadsheetId, spec.headers, fetchImpl);
  return spreadsheetId;
}

export async function writeSheetHeaders(
  accessToken: string,
  spreadsheetId: string,
  headers: HeaderWrite[],
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  for (const h of headers) {
    await writeSheetValues(accessToken, spreadsheetId, h.range, h.values, fetchImpl);
  }
}

export async function ensureSpreadsheetInFolder(
  accessToken: string,
  parentFolderId: string,
  spec: SpreadsheetSpec,
  fetchImpl?: typeof fetch
): Promise<string> {
  const fetcher = fetchImpl || fetch;
  const existing = await findSpreadsheetInFolder(
    accessToken,
    spec.driveFileName,
    parentFolderId,
    fetcher
  );
  if (existing) return existing;
  return createSpreadsheetInFolder(accessToken, parentFolderId, spec, fetcher);
}
