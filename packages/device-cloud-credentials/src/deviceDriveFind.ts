/**
 * Drive folder/spreadsheet discovery on the device (Google token only).
 */

import {
  INTEGRATORS_DIR,
  METADATA_DIR,
  MESSAGES_DIR,
  pnDriveDisplayName,
  pnRootFolderName,
} from '@par-noir/user-owned-storage';
import { deviceDriveCall } from './deviceDriveCall.js';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';

export function normalizePnIdentifier(pnIdentifier: string): string {
  return pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
}

function escapeDriveQueryName(name: string): string {
  return name.replace(/'/g, "\\'");
}

async function listDriveFiles(
  accessToken: string,
  q: string,
  fetchImpl?: typeof fetch
): Promise<Array<{ id?: string; name?: string }>> {
  const res = await deviceDriveCall(
    'GET',
    `/api/drive/files?q=${encodeURIComponent(q)}&pageSize=10`,
    undefined,
    { accessToken, fetchImpl }
  );
  if (!res.ok) return [];
  const body = (await res.json()) as { files?: Array<{ id?: string; name?: string }> };
  return body.files || [];
}

export async function findFolderByName(
  accessToken: string,
  name: string,
  parentFolderId?: string,
  fetchImpl?: typeof fetch
): Promise<string | null> {
  const escaped = escapeDriveQueryName(name);
  let q = `name='${escaped}' and mimeType='${FOLDER_MIME}' and trashed=false`;
  if (parentFolderId) {
    q += ` and '${parentFolderId}' in parents`;
  }
  const files = await listDriveFiles(accessToken, q, fetchImpl);
  const hit = files.find((f) => f.id && f.name === name);
  return hit?.id ?? null;
}

export async function findSpreadsheetByName(
  accessToken: string,
  name: string,
  parentFolderId: string,
  fetchImpl?: typeof fetch
): Promise<string | null> {
  const escaped = escapeDriveQueryName(name);
  const q =
    `name='${escaped}' and '${parentFolderId}' in parents` +
    ` and mimeType='${SHEET_MIME}' and trashed=false`;
  const files = await listDriveFiles(accessToken, q, fetchImpl);
  const hit = files.find((f) => f.id && f.name === name);
  return hit?.id ?? null;
}

export async function findPnRootFolderId(
  accessToken: string,
  pnIdentifier: string,
  fetchImpl?: typeof fetch
): Promise<string | null> {
  const normalized = normalizePnIdentifier(pnIdentifier);
  const candidates = [pnRootFolderName(normalized), pnDriveDisplayName(normalized)];
  for (const name of candidates) {
    const id = await findFolderByName(accessToken, name, undefined, fetchImpl);
    if (id) return id;
  }
  return null;
}

export async function findOrCreateFolder(
  accessToken: string,
  folderName: string,
  parentFolderId: string | undefined,
  fetchImpl?: typeof fetch
): Promise<string> {
  const existing = await findFolderByName(accessToken, folderName, parentFolderId, fetchImpl);
  if (existing) return existing;
  const res = await deviceDriveCall(
    'POST',
    '/api/drive/folders',
    { folderName, ...(parentFolderId ? { parentFolderId } : {}) },
    { accessToken, fetchImpl }
  );
  if (!res.ok) {
    throw new Error(`Drive folder create failed (${res.status})`);
  }
  const body = (await res.json()) as { folder?: { id?: string } };
  const id = body.folder?.id;
  if (!id) throw new Error('Drive folder create returned no id');
  return id;
}

export async function findOrCreateSpreadsheet(
  accessToken: string,
  name: string,
  parentFolderId: string,
  fetchImpl?: typeof fetch
): Promise<string> {
  const existing = await findSpreadsheetByName(accessToken, name, parentFolderId, fetchImpl);
  if (existing) return existing;
  const res = await deviceDriveCall(
    'POST',
    '/api/drive/native',
    { fileName: name, mimeType: SHEET_MIME, parents: [parentFolderId] },
    { accessToken, fetchImpl }
  );
  if (!res.ok) {
    throw new Error(`Drive sheet create failed (${res.status})`);
  }
  const body = (await res.json()) as { file?: { id?: string } };
  const id = body.file?.id;
  if (!id) throw new Error('Drive sheet create returned no id');
  return id;
}

export const DEVICE_PN_LAYOUT = {
  metadataDir: METADATA_DIR,
  integratorsDir: INTEGRATORS_DIR,
  messagesDir: MESSAGES_DIR,
  inboxSheetName: 'Inbox',
  filesDir: 'files',
  contentDir: 'content',
  contentNotes: 'notes',
  contentMedia: 'media',
  contentCollections: 'collections',
  contentClassDirs: ['media', 'notes', 'collections'] as const,
};
