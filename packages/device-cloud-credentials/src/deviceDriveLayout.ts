/**
 * Build the par Noir Drive folder and sheet index on the device.
 * The Google token is sent to Google only. The API later stores the ids.
 */

import { deviceDriveCall } from './deviceDriveCall.js';
import { ensureDeviceOwnedAssetsSheet } from './deviceIndexes.js';

const SHEET_KEYS = [
  'connections',
  'third-party-permissions',
  'devices',
  'groups',
  'notifications',
  'activity_ledger',
  'messaging_ledger',
  'message_requests',
  'data-point-requests',
  'zkp-data-points',
  'preferences',
  'engagement',
  'prism_ledger',
  'public-file-index',
  'owner-file-index',
  'followers',
  'following',
] as const;

export type DeviceDriveLayout = {
  schemaVersion: 1;
  pnFolderId: string;
  metadataFolderId: string;
  integratorsRootId: string;
  messagesFolderId: string;
  inboxSheetId: string;
  filesFolderId?: string;
  contentFolderId?: string;
  contentNotesFolderId?: string;
  contentMediaFolderId?: string;
  contentCollectionsFolderId?: string;
  sheetIds: Record<string, string>;
  conversationSheets: Record<string, string>;
};

async function createFolder(
  accessToken: string,
  folderName: string,
  parentFolderId: string | undefined,
  fetchImpl?: typeof fetch
): Promise<string> {
  const res = await deviceDriveCall(
    'POST',
    '/api/drive/folders',
    { folderName, parentFolderId },
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

async function createSheet(
  accessToken: string,
  name: string,
  parentFolderId: string,
  fetchImpl?: typeof fetch
): Promise<string> {
  const res = await deviceDriveCall(
    'POST',
    '/api/drive/native',
    { fileName: name, mimeType: 'application/vnd.google-apps.spreadsheet', parents: [parentFolderId] },
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

export async function ensureDeviceDriveLayout(
  accessToken: string,
  fetchImpl?: typeof fetch
): Promise<DeviceDriveLayout> {
  const pnFolderId = await createFolder(accessToken, 'par Noir', undefined, fetchImpl);
  const metadataFolderId = await createFolder(accessToken, '_metadata', pnFolderId, fetchImpl);
  const integratorsRootId = await createFolder(accessToken, 'integrators', pnFolderId, fetchImpl);
  const messagesFolderId = await createFolder(accessToken, 'messages', pnFolderId, fetchImpl);
  const sheetIds: Record<string, string> = {};
  for (const key of SHEET_KEYS) {
    sheetIds[key] = await createSheet(accessToken, key, metadataFolderId, fetchImpl);
  }
  const inboxSheetId = await createSheet(accessToken, 'inbox', messagesFolderId, fetchImpl);
  sheetIds['owned-assets'] = await ensureDeviceOwnedAssetsSheet(accessToken, metadataFolderId, fetchImpl);
  const filesFolderId = await createFolder(accessToken, 'files', pnFolderId, fetchImpl);
  const contentFolderId = await createFolder(accessToken, 'content', pnFolderId, fetchImpl);
  const contentNotesFolderId = await createFolder(accessToken, 'notes', contentFolderId, fetchImpl);
  const contentMediaFolderId = await createFolder(accessToken, 'media', contentFolderId, fetchImpl);
  const contentCollectionsFolderId = await createFolder(
    accessToken,
    'collections',
    contentFolderId,
    fetchImpl
  );
  return {
    schemaVersion: 1,
    pnFolderId,
    metadataFolderId,
    integratorsRootId,
    messagesFolderId,
    inboxSheetId,
    filesFolderId,
    contentFolderId,
    contentNotesFolderId,
    contentMediaFolderId,
    contentCollectionsFolderId,
    sheetIds,
    conversationSheets: {},
  };
}
