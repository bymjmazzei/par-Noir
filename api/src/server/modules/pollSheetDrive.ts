/**
 * Owner-present poll spreadsheet writes. Auth is the forwarded cloud token only.
 */

import { google, type sheets_v4 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import {
  POLL_DATA_HEADERS,
  POLL_DATA_SHEET,
  POLL_STRUCTURE_HEADERS,
  POLL_STRUCTURE_SHEET,
  pollIsClosed,
  sheetRowsToStructure,
  structureToSheetRows,
  type PollStructure
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
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${POLL_DATA_SHEET}!A1:C1`,
    valueInputOption: 'RAW',
    requestBody: { values: [[...POLL_DATA_HEADERS]] }
  });
  await writePollStructure(opts.auth, spreadsheetId, opts.structure);
  return spreadsheetId;
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
  if (!rows.length) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${POLL_STRUCTURE_SHEET}!A2:C${rows.length + 1}`,
    valueInputOption: 'RAW',
    requestBody: { values: rows }
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

/** Append one vote. The same vote_id is a no-op. A closed poll refuses. */
export async function appendPollVote(
  auth: OAuth2Client,
  spreadsheetId: string,
  vote: { voteId: string; optionId: string; createdAt: string }
): Promise<{ appended: boolean; closed: boolean }> {
  const structure = await readPollStructure(auth, spreadsheetId);
  if (pollIsClosed(structure.closesAt)) return { appended: false, closed: true };
  const sheets = sheetsClient(auth);
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${POLL_DATA_SHEET}!A2:A`
  });
  const ids = (existing.data.values || []).map((row) => String(row[0] || ''));
  if (ids.includes(vote.voteId)) return { appended: false, closed: false };
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${POLL_DATA_SHEET}!A:C`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[vote.voteId, vote.optionId, vote.createdAt]] }
  });
  return { appended: true, closed: false };
}
