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

/** Pace metadata sheet creates to reduce Sheets/Drive 429s during full init. */
const METADATA_SHEET_PACE_MS = 120;

const layoutInflight = new Map<string, Promise<DeviceDriveLayout>>();

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

export function isDeviceDriveLayoutComplete(
  layout: DeviceDriveLayout | null | undefined
): boolean {
  if (!layout?.pnFolderId || !layout.metadataFolderId || !layout.inboxSheetId) return false;
  if (!layout.sheetIds?.connections || !layout.sheetIds['owner-file-index']) return false;
  if (!layout.filesFolderId) return false;
  return true;
}

function pace(ms = METADATA_SHEET_PACE_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buildDeviceDriveLayout(
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
  for (let i = 0; i < SHEET_KEYS.length; i++) {
    const key = SHEET_KEYS[i];
    sheetIds[key] = await ensureDeviceMetadataSheet(
      accessToken,
      key,
      metadataFolderId,
      fetchImpl
    );
    if (i < SHEET_KEYS.length - 1) {
      await pace();
    }
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
    await pace();
    await ensureDeviceIndexSheet(accessToken, classFolderId, 'public', className as ContentClassName, fetchImpl);
    await pace();
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

/**
 * One in-flight full layout per pN — reconnect must not run parallel inits (duplicate roots + 429s).
 */
export function ensureDeviceDriveLayout(
  accessToken: string,
  pnIdentifier: string,
  fetchImpl?: typeof fetch
): Promise<DeviceDriveLayout> {
  const key = normalizePnIdentifier(pnIdentifier);
  const existing = layoutInflight.get(key);
  if (existing) return existing;

  const promise = buildDeviceDriveLayout(accessToken, key, fetchImpl).finally(() => {
    layoutInflight.delete(key);
  });
  layoutInflight.set(key, promise);
  return promise;
}

/** Test-only: clear in-flight layout guard. */
export function clearDeviceDriveLayoutInflight(pnIdentifier?: string): void {
  if (pnIdentifier) {
    layoutInflight.delete(normalizePnIdentifier(pnIdentifier));
    return;
  }
  layoutInflight.clear();
}
