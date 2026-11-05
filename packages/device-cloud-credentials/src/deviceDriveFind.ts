/**
 * pN root discovery on the device (Google token only). Children of the root are
 * found and created through driveChild.
 */

import {
  INTEGRATORS_DIR,
  METADATA_DIR,
  MESSAGES_DIR,
  PN_DRIVE_ROOT_PROPERTY,
  pnDriveRootFolderName,
} from '@par-noir/user-owned-storage';
import { deviceDriveCall } from './deviceDriveCall.js';
import { DRIVE_FOLDER_MIME } from './driveChild.js';

export function normalizePnIdentifier(pnIdentifier: string): string {
  return pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** The oldest folder tagged with this pN id, so roots created at the same moment resolve to one. */
export async function findPnRootFolderId(
  accessToken: string,
  pnIdentifier: string,
  fetchImpl?: typeof fetch
): Promise<string | null> {
  const normalized = normalizePnIdentifier(pnIdentifier);
  const q =
    `appProperties has { key='${PN_DRIVE_ROOT_PROPERTY}' and value='${escapeDriveQueryValue(normalized)}' }` +
    ` and mimeType='${DRIVE_FOLDER_MIME}' and trashed=false`;
  const res = await deviceDriveCall(
    'GET',
    `/api/drive/files?q=${encodeURIComponent(q)}&orderBy=createdTime&pageSize=10`,
    undefined,
    { accessToken, fetchImpl }
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { files?: Array<{ id?: string }> };
  return body.files?.find((f) => f.id)?.id ?? null;
}

/** Create the pN root with its short display name, tagged with the full pN id for lookup. */
export async function createPnRootFolder(
  accessToken: string,
  pnIdentifier: string,
  fetchImpl?: typeof fetch
): Promise<string> {
  const normalized = normalizePnIdentifier(pnIdentifier);
  const res = await deviceDriveCall(
    'POST',
    '/api/drive/folders',
    {
      folderName: pnDriveRootFolderName(normalized),
      appProperties: { [PN_DRIVE_ROOT_PROPERTY]: normalized },
    },
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
