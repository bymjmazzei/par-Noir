/**
 * Owner-present poll spreadsheet writes. Auth is the forwarded cloud token only.
 */

import { google, type sheets_v4 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
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

function sheetsClient(auth: OAuth2Client): sheets_v4.Sheets {
  return google.sheets({ version: 'v4', auth });
}

export async function createPollSpreadsheet(opts: {
  auth: OAuth2Client;
  parentFolderId: string;
  title: string;
  structure: PollStructure;
}): Promise<string> {
  const sheets = sheetsClient(opts.auth);
  const drive = google.drive({ version: 'v3', auth: opts.auth });
  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: opts.title },
      sheets: [
        { properties: { title: POLL_DATA_SHEET } },
        { properties: { title: POLL_STRUCTURE_SHEET } }
      ]
    }
  });
  const spreadsheetId = created.data.spreadsheetId;
  if (!spreadsheetId) throw new Error('poll_sheet_create_failed');
  const info = await drive.files.get({ fileId: spreadsheetId, fields: 'parents' });
  const parents = (info.data.parents || []).filter(Boolean).join(',');
  await drive.files.update({
    fileId: spreadsheetId,
    addParents: opts.parentFolderId,
    removeParents: parents || undefined,
    fields: 'id, parents'
  });
  await writePollStructure(opts.auth, spreadsheetId, opts.structure);
  return spreadsheetId;
}

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

export async function writePollStructure(
  auth: OAuth2Client,
  spreadsheetId: string,
  structure: PollStructure
): Promise<void> {
  const sheets = sheetsClient(auth);
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${POLL_STRUCTURE_SHEET}!A:C`
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${POLL_STRUCTURE_SHEET}!A1:C1`,
    valueInputOption: 'RAW',
    requestBody: { values: [[...POLL_STRUCTURE_HEADERS]] }
  });
  const rows = structureToSheetRows(structure);
  if (rows.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${POLL_STRUCTURE_SHEET}!A2:C${rows.length + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: rows }
    });
  }
  await rewriteVoteHeader(auth, spreadsheetId, structure);
}

async function rewriteVoteHeader(
  auth: OAuth2Client,
  spreadsheetId: string,
  structure: PollStructure
): Promise<void> {
  const sheets = sheetsClient(auth);
  const headers = voteDataHeaders(structure.options);
  let values: Array<Array<string | number | boolean | null>> = [];
  try {
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${POLL_DATA_SHEET}!A:Z`
    });
    values = (existing.data.values || []) as Array<Array<string | number | boolean | null>>;
  } catch {
    return;
  }
  const oldHeaders = (values[0] || []).map((cell) => String(cell ?? ''));
  const body = values.slice(1).map((row) => row.map((cell) => String(cell ?? '')));
  const rows = oldHeaders[0] === 'user' ? remapVoteRows(oldHeaders, body, headers) : [];
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${POLL_DATA_SHEET}!A:Z`
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${POLL_DATA_SHEET}!A1:${columnName(headers.length)}${Math.max(1, rows.length + 1)}`,
    valueInputOption: 'RAW',
    requestBody: { values: [headers, ...rows] }
  });
}

export async function readPollStructure(
  auth: OAuth2Client,
  spreadsheetId: string
): Promise<PollStructure> {
  const sheets = sheetsClient(auth);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${POLL_STRUCTURE_SHEET}!A2:C`
  });
  return sheetRowsToStructure(response.data.values || []);
}

/** One row per person. A second vote from the same person replaces that row. */
export async function appendPollVote(
  auth: OAuth2Client,
  spreadsheetId: string,
  vote: { user: string; optionId: string }
): Promise<{ appended: boolean; closed: boolean }> {
  const structure = await readPollStructure(auth, spreadsheetId);
  if (pollIsClosed(structure.closesAt)) return { appended: false, closed: true };
  const sheets = sheetsClient(auth);
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${POLL_DATA_SHEET}!A2:Z`
  });
  const rows = (existing.data.values || []).map((row) => row.map((cell) => String(cell ?? '')));
  const next = upsertUserRow(
    rows,
    voteMatrixRow({ user: vote.user, options: structure.options, optionId: vote.optionId })
  );
  const headers = voteDataHeaders(structure.options);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${POLL_DATA_SHEET}!A1:${columnName(headers.length)}${next.length + 1}`,
    valueInputOption: 'RAW',
    requestBody: { values: [headers, ...next] }
  });
  return { appended: true, closed: false };
}

export async function writeWidgetActionTab(input: {
  auth: OAuth2Client;
  spreadsheetId: string;
  trigger: WidgetWriteTrigger;
  user: string;
  createdAt: string;
  present?: boolean;
  headers: string[];
  cells?: string[];
}): Promise<void> {
  const sheets = sheetsClient(input.auth);
  const preview = applyWidgetSheetRows({
    trigger: input.trigger,
    user: input.user,
    createdAt: input.createdAt,
    present: input.present,
    headers: input.headers,
    cells: input.cells,
    existing: []
  });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: input.spreadsheetId });
  const titles = new Set((meta.data.sheets || []).map((sheet) => sheet.properties?.title));
  if (!titles.has(preview.tab)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: input.spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: preview.tab } } }] }
    });
  }
  const current = await sheets.spreadsheets.values
    .get({
      spreadsheetId: input.spreadsheetId,
      range: `${preview.tab}!A2:Z`
    })
    .catch(() => null);
  const existing = (current?.data.values || []).map((row) => row.map((cell) => String(cell ?? '')));
  const written = applyWidgetSheetRows({
    trigger: input.trigger,
    user: input.user,
    createdAt: input.createdAt,
    present: input.present,
    headers: input.headers,
    cells: input.cells,
    existing
  });
  await sheets.spreadsheets.values.clear({
    spreadsheetId: input.spreadsheetId,
    range: `${written.tab}!A:Z`
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: input.spreadsheetId,
    range: `${written.tab}!A1:${columnName(written.headers.length)}${Math.max(1, written.rows.length + 1)}`,
    valueInputOption: 'RAW',
    requestBody: { values: [written.headers, ...written.rows] }
  });
}
