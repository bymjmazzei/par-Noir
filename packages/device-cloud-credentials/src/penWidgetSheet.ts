/**
 * Poll and widget-action spreadsheets on the owner's device (Google Sheets API).
 */

import {
  POLL_DATA_SHEET,
  POLL_STRUCTURE_HEADERS,
  POLL_STRUCTURE_SHEET,
  applyWidgetSheetRows,
  pollIsClosed,
  remapVoteRows,
  sheetRowsToStructure,
  structureToSheetRows,
  voteDataHeaders,
  voteMatrixRow,
  upsertUserRow,
  type PollStructure,
  type WidgetWriteTrigger
} from '@par-noir/pen-protocol';
import { readSheetValues, writeSheetValues } from './deviceSheet.js';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE = 'https://www.googleapis.com/drive/v3';

function columnName(count: number): string {
  let n = Math.max(1, count);
  let name = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function headers(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
}

export async function createPollSpreadsheetOnDevice(
  accessToken: string,
  input: { title: string; structure: PollStructure; parentFolderId?: string },
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const createRes = await fetchImpl(SHEETS, {
    method: 'POST',
    headers: headers(accessToken),
    body: JSON.stringify({
      properties: { title: input.title },
      sheets: [
        { properties: { title: POLL_DATA_SHEET } },
        { properties: { title: POLL_STRUCTURE_SHEET } }
      ]
    })
  });
  if (!createRes.ok) throw new Error(`poll_sheet_create_failed_${createRes.status}`);
  const created = (await createRes.json()) as { spreadsheetId?: string };
  const spreadsheetId = created.spreadsheetId?.trim();
  if (!spreadsheetId) throw new Error('poll_sheet_create_failed');
  if (input.parentFolderId) {
    const infoRes = await fetchImpl(`${DRIVE}/files/${spreadsheetId}?fields=parents`, {
      headers: headers(accessToken)
    });
    const info = (await infoRes.json()) as { parents?: string[] };
    const parents = (info.parents || []).join(',');
    await fetchImpl(
      `${DRIVE}/files/${spreadsheetId}?addParents=${encodeURIComponent(input.parentFolderId)}&removeParents=${encodeURIComponent(parents)}&fields=id`,
      { method: 'PATCH', headers: headers(accessToken) }
    );
  }
  await writePollStructureOnDevice(accessToken, spreadsheetId, input.structure, fetchImpl);
  return spreadsheetId;
}

export async function writePollStructureOnDevice(
  accessToken: string,
  spreadsheetId: string,
  structure: PollStructure,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  await fetchImpl(
    `${SHEETS}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${POLL_STRUCTURE_SHEET}!A:C`)}:clear`,
    { method: 'POST', headers: headers(accessToken) }
  );
  await writeSheetValues(
    accessToken,
    spreadsheetId,
    `${POLL_STRUCTURE_SHEET}!A1:C1`,
    [[...POLL_STRUCTURE_HEADERS]],
    fetchImpl
  );
  const rows = structureToSheetRows(structure);
  if (rows.length) {
    await writeSheetValues(
      accessToken,
      spreadsheetId,
      `${POLL_STRUCTURE_SHEET}!A2:C${rows.length + 1}`,
      rows,
      fetchImpl
    );
  }
  await rewriteVoteHeaderOnDevice(accessToken, spreadsheetId, structure, fetchImpl);
}

async function rewriteVoteHeaderOnDevice(
  accessToken: string,
  spreadsheetId: string,
  structure: PollStructure,
  fetchImpl: typeof fetch
): Promise<void> {
  const headersList = voteDataHeaders(structure.options);
  const values = await readSheetValues(accessToken, spreadsheetId, `${POLL_DATA_SHEET}!A:Z`, fetchImpl);
  const oldHeaders = (values[0] || []).map((cell) => String(cell ?? ''));
  const body = values.slice(1).map((row) => row.map((cell) => String(cell ?? '')));
  const rows = oldHeaders[0] === 'user' ? remapVoteRows(oldHeaders, body, headersList) : [];
  await fetchImpl(
    `${SHEETS}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${POLL_DATA_SHEET}!A:Z`)}:clear`,
    { method: 'POST', headers: headers(accessToken) }
  );
  await writeSheetValues(
    accessToken,
    spreadsheetId,
    `${POLL_DATA_SHEET}!A1:${columnName(headersList.length)}${Math.max(1, rows.length + 1)}`,
    [headersList, ...rows],
    fetchImpl
  );
}

export async function readPollStructureOnDevice(
  accessToken: string,
  spreadsheetId: string,
  fetchImpl: typeof fetch = fetch
): Promise<PollStructure> {
  const values = await readSheetValues(
    accessToken,
    spreadsheetId,
    `${POLL_STRUCTURE_SHEET}!A2:C`,
    fetchImpl
  );
  return sheetRowsToStructure(values);
}

export async function appendPollVoteOnDevice(
  accessToken: string,
  spreadsheetId: string,
  vote: { user: string; optionId: string; writeIn?: string },
  fetchImpl: typeof fetch = fetch
): Promise<{ appended: boolean; closed: boolean }> {
  const structure = await readPollStructureOnDevice(accessToken, spreadsheetId, fetchImpl);
  if (pollIsClosed(structure.closesAt)) return { appended: false, closed: true };
  const existing = await readSheetValues(accessToken, spreadsheetId, `${POLL_DATA_SHEET}!A2:Z`, fetchImpl);
  const rows = existing.map((row) => row.map((cell) => String(cell ?? '')));
  const next = upsertUserRow(
    rows,
    voteMatrixRow({
      user: vote.user,
      options: structure.options,
      optionId: vote.optionId,
      writeIn: vote.writeIn
    })
  );
  const headerRow = voteDataHeaders(structure.options);
  await writeSheetValues(
    accessToken,
    spreadsheetId,
    `${POLL_DATA_SHEET}!A1:${columnName(headerRow.length)}${next.length + 1}`,
    [headerRow, ...next],
    fetchImpl
  );
  return { appended: true, closed: false };
}

export async function writeWidgetActionTabOnDevice(
  accessToken: string,
  input: {
    spreadsheetId: string;
    trigger: WidgetWriteTrigger;
    user: string;
    createdAt: string;
    present?: boolean;
    headers: string[];
    cells?: string[];
  },
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const preview = applyWidgetSheetRows({
    trigger: input.trigger,
    user: input.user,
    createdAt: input.createdAt,
    present: input.present,
    headers: input.headers,
    cells: input.cells,
    existing: []
  });
  const metaRes = await fetchImpl(`${SHEETS}/${encodeURIComponent(input.spreadsheetId)}`, {
    headers: headers(accessToken)
  });
  if (!metaRes.ok) throw new Error(`widget_sheet_meta_failed_${metaRes.status}`);
  const meta = (await metaRes.json()) as { sheets?: Array<{ properties?: { title?: string } }> };
  const titles = new Set((meta.sheets || []).map((sheet) => sheet.properties?.title).filter(Boolean));
  if (!titles.has(preview.tab)) {
    await fetchImpl(`${SHEETS}/${encodeURIComponent(input.spreadsheetId)}:batchUpdate`, {
      method: 'POST',
      headers: headers(accessToken),
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: preview.tab } } }] })
    });
  }
  const current = await readSheetValues(accessToken, input.spreadsheetId, `${preview.tab}!A2:Z`, fetchImpl);
  const written = applyWidgetSheetRows({
    trigger: input.trigger,
    user: input.user,
    createdAt: input.createdAt,
    present: input.present,
    headers: input.headers,
    cells: input.cells,
    existing: current
  });
  await fetchImpl(
    `${SHEETS}/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(`${written.tab}!A:Z`)}:clear`,
    { method: 'POST', headers: headers(accessToken) }
  );
  await writeSheetValues(
    accessToken,
    input.spreadsheetId,
    `${written.tab}!A1:${columnName(written.headers.length)}${Math.max(1, written.rows.length + 1)}`,
    [written.headers, ...written.rows],
    fetchImpl
  );
}
