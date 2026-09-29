/**
 * Google Sheets reads and writes from the device.
 * The access token is sent to Google. These helpers never call the par Noir API
 * and never create a spreadsheet.
 */

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

function googleHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

export async function readSheetValues(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  fetchImpl: typeof fetch = fetch
): Promise<string[][]> {
  const url = `${SHEETS}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
  const res = await fetchImpl(url, { headers: googleHeaders(accessToken) });
  if (res.status === 400 || res.status === 404) return [];
  if (!res.ok) {
    throw new Error(`Google sheet read failed (${res.status})`);
  }
  const body = (await res.json()) as { values?: string[][] };
  return body.values || [];
}

export async function writeSheetValues(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  values: string[][],
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const url = `${SHEETS}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const res = await fetchImpl(url, {
    method: 'PUT',
    headers: googleHeaders(accessToken),
    body: JSON.stringify({ values }),
  });
  if (!res.ok) {
    throw new Error(`Google sheet write failed (${res.status})`);
  }
}

export async function appendSheetValues(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  values: string[][],
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const url = `${SHEETS}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: googleHeaders(accessToken),
    body: JSON.stringify({ values }),
  });
  if (!res.ok) {
    throw new Error(`Google sheet append failed (${res.status})`);
  }
}
