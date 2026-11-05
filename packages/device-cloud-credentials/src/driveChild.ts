/**
 * The one place the device creates Drive folders, files and spreadsheets.
 * Every item is created inside a parent folder; only the pN root (deviceDriveFind)
 * sits outside one. Concurrent ensures for the same parent and name share one
 * create, and lookups take the oldest copy so any leftover duplicates resolve the
 * same way every time.
 */

import { deviceDriveCall } from './deviceDriveCall.js';
import { writeSheetValues } from './deviceSheet.js';

export const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';
export const DRIVE_SHEET_MIME = 'application/vnd.google-apps.spreadsheet';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
/** Drive search can lag a fresh create; reuse resolved ids for this long. */
const RESOLVED_TTL_MS = 60_000;

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
  /** Drive file name, also the spreadsheet title. */
  driveFileName: string;
  sheets: SheetTabSpec[];
  headers: HeaderWrite[];
};

const inflight = new Map<string, Promise<string>>();
const resolved = new Map<string, { id: string; at: number }>();
const serialTails = new Map<string, Promise<unknown>>();

function childKey(kind: string, parentId: string, name: string): string {
  return `${kind}|${parentId}|${name}`;
}

function singleFlight(key: string, run: () => Promise<string>): Promise<string> {
  const hit = resolved.get(key);
  if (hit && Date.now() - hit.at < RESOLVED_TTL_MS) return Promise.resolve(hit.id);
  const pending = inflight.get(key);
  if (pending) return pending;
  const promise = run()
    .then((id) => {
      resolved.set(key, { id, at: Date.now() });
      return id;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}

function requireParent(parentId: string | null | undefined, name: string): string {
  const id = (parentId || '').trim();
  if (!id) throw new Error(`drive_parent_required (${name})`);
  return id;
}

function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function fetchWithRateLimitRetry(
  fetchImpl: typeof fetch,
  url: RequestInfo | URL,
  init?: RequestInit,
  attempts = 5
): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < attempts; i++) {
    last = await fetchImpl(url, init);
    if (last.status !== 429 && last.status !== 503) return last;
    await new Promise((resolve) => setTimeout(resolve, 500 * Math.pow(2, i)));
  }
  return last!;
}

function retrying(fetchImpl: typeof fetch): typeof fetch {
  return ((url: RequestInfo | URL, init?: RequestInit) =>
    fetchWithRateLimitRetry(fetchImpl, url, init)) as typeof fetch;
}

async function listChildren(
  accessToken: string,
  parentId: string,
  name: string,
  mimeType: string | undefined,
  fetchImpl: typeof fetch | undefined
): Promise<Response> {
  const parts = [`name='${escapeQueryValue(name)}'`, `'${parentId}' in parents`, 'trashed=false'];
  if (mimeType) parts.push(`mimeType='${mimeType}'`);
  const q = encodeURIComponent(parts.join(' and '));
  return deviceDriveCall('GET', `/api/drive/files?q=${q}&orderBy=createdTime&pageSize=10`, undefined, {
    accessToken,
    fetchImpl,
  });
}

async function oldestMatch(res: Response, name: string): Promise<string | null> {
  const body = (await res.json()) as { files?: Array<{ id?: string; name?: string }> };
  return (body.files || []).find((f) => f.id && f.name === name)?.id ?? null;
}

/**
 * Oldest child of `parentId` named `name` (optionally of one mime type), or null.
 * With `strict`, a failed list throws instead of reading as "not there".
 */
export async function findDriveChild(
  accessToken: string,
  parentId: string | null | undefined,
  name: string,
  opts: { mimeType?: string; fetchImpl?: typeof fetch; strict?: boolean } = {}
): Promise<string | null> {
  const parent = (parentId || '').trim();
  if (!parent) return null;
  const res = await listChildren(accessToken, parent, name, opts.mimeType, opts.fetchImpl);
  if (!res.ok) {
    if (opts.strict) throw new Error(`Drive list failed (${res.status})`);
    return null;
  }
  return oldestMatch(res, name);
}

/** An ensure never creates blind: a failed list throws. */
function findDriveChildStrict(
  accessToken: string,
  parentId: string,
  name: string,
  mimeType: string | undefined,
  fetchImpl: typeof fetch | undefined
): Promise<string | null> {
  return findDriveChild(accessToken, parentId, name, { mimeType, fetchImpl, strict: true });
}

/** Drop cached ids under a parent (call after deleting or trashing a child). */
export function forgetDriveChild(parentId: string, name: string): void {
  for (const kind of ['folder', 'file', 'sheet']) {
    resolved.delete(childKey(kind, parentId, name));
  }
}

export function ensureDriveChildFolder(
  accessToken: string,
  parentId: string | null | undefined,
  name: string,
  fetchImpl?: typeof fetch
): Promise<string> {
  let parent: string;
  try {
    parent = requireParent(parentId, name);
  } catch (err) {
    return Promise.reject(err);
  }
  return singleFlight(childKey('folder', parent, name), async () => {
    const existing = await findDriveChildStrict(accessToken, parent, name, DRIVE_FOLDER_MIME, fetchImpl);
    if (existing) return existing;
    const res = await deviceDriveCall(
      'POST',
      '/api/drive/folders',
      { folderName: name, parentFolderId: parent },
      { accessToken, fetchImpl }
    );
    if (!res.ok) throw new Error(`Drive folder create failed (${res.status})`);
    const body = (await res.json()) as { folder?: { id?: string } };
    const id = body.folder?.id;
    if (!id) throw new Error('Drive folder create returned no id');
    return id;
  });
}

function textToB64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

/** Create or overwrite `parentId/name` with base64 file bytes. Returns the file id. */
export async function upsertDriveChildFileB64(
  accessToken: string,
  parentId: string | null | undefined,
  name: string,
  fileData: string,
  mimeType: string,
  fetchImpl?: typeof fetch
): Promise<string> {
  const parent = requireParent(parentId, name);
  const key = childKey('file', parent, name);
  return runSerial(key, async () => {
    let created = false;
    const id = await singleFlight(key, async () => {
      const existing = await findDriveChildStrict(accessToken, parent, name, undefined, fetchImpl);
      if (existing) return existing;
      const res = await deviceDriveCall(
        'POST',
        '/api/drive/files',
        { fileData, fileName: name, mimeType, parents: [parent] },
        { accessToken, fetchImpl }
      );
      if (!res.ok) throw new Error(`file_create_failed_${res.status}`);
      const body = (await res.json()) as { file?: { id?: string } };
      if (!body.file?.id) throw new Error('file_create_no_id');
      created = true;
      return body.file.id;
    });
    if (created) return id;
    const res = await deviceDriveCall(
      'PUT',
      `/api/drive/files/${encodeURIComponent(id)}/content`,
      { fileData, mimeType },
      { accessToken, fetchImpl }
    );
    if (!res.ok) throw new Error(`file_update_failed_${res.status}`);
    return id;
  });
}

/** Create or overwrite `parentId/name` with UTF-8 text. Returns the file id. */
export function upsertDriveChildFile(
  accessToken: string,
  parentId: string | null | undefined,
  name: string,
  text: string,
  mimeType = 'application/json',
  fetchImpl?: typeof fetch
): Promise<string> {
  return upsertDriveChildFileB64(accessToken, parentId, name, textToB64(text), mimeType, fetchImpl);
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

function gridProperties(tab: SheetTabSpec): Record<string, number> | undefined {
  if (tab.rowCount == null && tab.columnCount == null) return undefined;
  return {
    ...(tab.rowCount != null ? { rowCount: tab.rowCount } : {}),
    ...(tab.columnCount != null ? { columnCount: tab.columnCount } : {}),
  };
}

/** Create the spreadsheet directly inside `parentId`, then shape its tabs and headers. */
async function createSpreadsheetInParent(
  accessToken: string,
  parentId: string,
  spec: SpreadsheetSpec,
  fetchImpl: typeof fetch
): Promise<string> {
  const fetcher = retrying(fetchImpl);
  const res = await deviceDriveCall(
    'POST',
    '/api/drive/native',
    { fileName: spec.driveFileName, mimeType: DRIVE_SHEET_MIME, parents: [parentId] },
    { accessToken, fetchImpl: fetcher }
  );
  if (!res.ok) throw new Error(`Spreadsheet create failed (${res.status})`);
  const body = (await res.json()) as { file?: { id?: string } };
  const spreadsheetId = body.file?.id;
  if (!spreadsheetId) throw new Error('Spreadsheet create returned no id');

  if (spec.sheets.length > 0) {
    const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
    const metaRes = await fetcher(
      `${SHEETS}/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties(sheetId,title)`,
      { headers }
    );
    if (!metaRes.ok) throw new Error(`Spreadsheet meta failed (${metaRes.status})`);
    const meta = (await metaRes.json()) as { sheets?: Array<{ properties?: { sheetId?: number } }> };
    const firstSheetId = meta.sheets?.[0]?.properties?.sheetId ?? 0;
    const [first, ...rest] = spec.sheets;
    const firstGrid = gridProperties(first!);
    const requests: unknown[] = [
      {
        updateSheetProperties: {
          properties: {
            sheetId: firstSheetId,
            title: first!.title,
            ...(firstGrid ? { gridProperties: firstGrid } : {}),
          },
          fields: firstGrid ? 'title,gridProperties' : 'title',
        },
      },
      ...rest.map((tab) => {
        const grid = gridProperties(tab);
        return { addSheet: { properties: { title: tab.title, ...(grid ? { gridProperties: grid } : {}) } } };
      }),
    ];
    const shaped = await fetcher(`${SHEETS}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ requests }),
    });
    if (!shaped.ok) throw new Error(`Spreadsheet tab setup failed (${shaped.status})`);
  }

  await writeSheetHeaders(accessToken, spreadsheetId, spec.headers, fetcher);
  return spreadsheetId;
}

/** Find `parentId/spec.driveFileName`, or create it in place. One create per parent and name. */
export function ensureDriveChildSpreadsheet(
  accessToken: string,
  parentId: string | null | undefined,
  spec: SpreadsheetSpec,
  fetchImpl?: typeof fetch
): Promise<string> {
  let parent: string;
  try {
    parent = requireParent(parentId, spec.driveFileName);
  } catch (err) {
    return Promise.reject(err);
  }
  const fetcher = fetchImpl || fetch;
  return singleFlight(childKey('sheet', parent, spec.driveFileName), async () => {
    const existing = await findDriveChildStrict(
      accessToken,
      parent,
      spec.driveFileName,
      DRIVE_SHEET_MIME,
      fetcher
    );
    if (existing) return existing;
    return createSpreadsheetInParent(accessToken, parent, spec, fetcher);
  });
}

/** Always create a new spreadsheet inside `parentId` (one per widget, never shared by name). */
export function createDriveChildSpreadsheet(
  accessToken: string,
  parentId: string | null | undefined,
  spec: SpreadsheetSpec,
  fetchImpl?: typeof fetch
): Promise<string> {
  try {
    return createSpreadsheetInParent(
      accessToken,
      requireParent(parentId, spec.driveFileName),
      spec,
      fetchImpl || fetch
    );
  } catch (err) {
    return Promise.reject(err);
  }
}

/** Run `fn` after every earlier task queued under `key` has settled. */
export function runSerial<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = serialTails.get(key) || Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  const tail = next.catch(() => undefined);
  serialTails.set(key, tail);
  void tail.then(() => {
    if (serialTails.get(key) === tail) serialTails.delete(key);
  });
  return next;
}

/** Test-only: clear in-flight, resolved and serial state. */
export function clearDriveChildState(): void {
  inflight.clear();
  resolved.clear();
  serialTails.clear();
}
