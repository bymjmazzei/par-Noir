/**
 * Build the par Noir Drive folder and sheet index on the device.
 * Layout matches api pnDriveInit / GOOGLE_DRIVE_STRUCTURE (canonical pN root name).
 */

import { pnRootFolderName } from '@par-noir/user-owned-storage';
import { ensureDeviceOwnedAssetsSheet } from './deviceIndexes.js';
import {
  DEVICE_PN_LAYOUT,
  findOrCreateFolder,
  findPnRootFolderId,
  normalizePnIdentifier,
} from './deviceDriveFind.js';
import {
  ensureDeviceInboxSheet,
  ensureDeviceIndexSheet,
  ensureDeviceMetadataSheet,
  type ContentClassName,
  type DeviceMetadataSheetKey,
} from './deviceMetadataSheetCatalog.js';

const SHEET_KEYS: DeviceMetadataSheetKey[] = [
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
];

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

export async function ensureDeviceDriveLayout(
  accessToken: string,
  pnIdentifier: string,
  fetchImpl?: typeof fetch
): Promise<DeviceDriveLayout> {
  const normalized = normalizePnIdentifier(pnIdentifier);
  let pnFolderId = await findPnRootFolderId(accessToken, normalized, fetchImpl);
  if (!pnFolderId) {
    pnFolderId = await findOrCreateFolder(
      accessToken,
      pnRootFolderName(normalized),
      undefined,
      fetchImpl
    );
  }

  const metadataFolderId = await findOrCreateFolder(
    accessToken,
    DEVICE_PN_LAYOUT.metadataDir,
    pnFolderId,
    fetchImpl
  );
  const integratorsRootId = await findOrCreateFolder(
    accessToken,
    DEVICE_PN_LAYOUT.integratorsDir,
    pnFolderId,
    fetchImpl
  );
  const messagesFolderId = await findOrCreateFolder(
    accessToken,
    DEVICE_PN_LAYOUT.messagesDir,
    pnFolderId,
    fetchImpl
  );

  const sheetIds: Record<string, string> = {};
  for (const key of SHEET_KEYS) {
    sheetIds[key] = await ensureDeviceMetadataSheet(
      accessToken,
      key,
      metadataFolderId,
      fetchImpl
    );
  }

  const inboxSheetId = await ensureDeviceInboxSheet(accessToken, messagesFolderId, fetchImpl);

  sheetIds['owned-assets'] = await ensureDeviceOwnedAssetsSheet(
    accessToken,
    metadataFolderId,
    fetchImpl
  );

  for (const className of DEVICE_PN_LAYOUT.contentClassDirs) {
    const classFolderId = await findOrCreateFolder(
      accessToken,
      className,
      metadataFolderId,
      fetchImpl
    );
    await ensureDeviceIndexSheet(accessToken, classFolderId, 'owner', className as ContentClassName, fetchImpl);
    await ensureDeviceIndexSheet(accessToken, classFolderId, 'public', className as ContentClassName, fetchImpl);
  }

  const filesFolderId = await findOrCreateFolder(
    accessToken,
    DEVICE_PN_LAYOUT.filesDir,
    pnFolderId,
    fetchImpl
  );
  const contentFolderId = await findOrCreateFolder(
    accessToken,
    DEVICE_PN_LAYOUT.contentDir,
    pnFolderId,
    fetchImpl
  );
  const contentNotesFolderId = await findOrCreateFolder(
    accessToken,
    DEVICE_PN_LAYOUT.contentNotes,
    contentFolderId,
    fetchImpl
  );
  const contentMediaFolderId = await findOrCreateFolder(
    accessToken,
    DEVICE_PN_LAYOUT.contentMedia,
    contentFolderId,
    fetchImpl
  );
  const contentCollectionsFolderId = await findOrCreateFolder(
    accessToken,
    DEVICE_PN_LAYOUT.contentCollections,
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
