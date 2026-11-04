/**
 * Build the par Noir Drive folder and sheet index on the device.
 * The pN root is found by its pnId app property, not its display name.
 */

import { ensureDeviceOwnedAssetsSheet } from './deviceIndexes.js';
import {
  DEVICE_PN_LAYOUT,
  createPnRootFolder,
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

export type DeviceDriveLayoutProgress = { done: number; total: number; label: string };
export type DeviceDriveLayoutProgressListener = (progress: DeviceDriveLayoutProgress) => void;

const CONTENT_CLASS_STEPS = DEVICE_PN_LAYOUT.contentClassDirs.length * 3;
/** Root, _metadata, integrators, messages, metadata sheets, inbox, owned-assets, class index sheets, files + content folders. */
export const DEVICE_DRIVE_LAYOUT_TOTAL_STEPS =
  4 + SHEET_KEYS.length + 2 + CONTENT_CLASS_STEPS + 5;

const layoutInflight = new Map<
  string,
  { promise: Promise<DeviceDriveLayout>; listeners: Set<DeviceDriveLayoutProgressListener> }
>();

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
  fetchImpl: typeof fetch | undefined,
  report: DeviceDriveLayoutProgressListener
): Promise<DeviceDriveLayout> {
  const normalized = normalizePnIdentifier(pnIdentifier);
  let done = 0;
  const tick = (label: string) => {
    done += 1;
    report({ done, total: DEVICE_DRIVE_LAYOUT_TOTAL_STEPS, label });
  };

  const pnFolderId =
    (await findPnRootFolderId(accessToken, normalized, fetchImpl)) ||
    (await createPnRootFolder(accessToken, normalized, fetchImpl));
  tick('Storage folder ready');

  const metadataFolderId = await findOrCreateFolder(
    accessToken,
    DEVICE_PN_LAYOUT.metadataDir,
    pnFolderId,
    fetchImpl
  );
  tick('Metadata folder ready');
  const integratorsRootId = await findOrCreateFolder(
    accessToken,
    DEVICE_PN_LAYOUT.integratorsDir,
    pnFolderId,
    fetchImpl
  );
  tick('Integrations folder ready');
  const messagesFolderId = await findOrCreateFolder(
    accessToken,
    DEVICE_PN_LAYOUT.messagesDir,
    pnFolderId,
    fetchImpl
  );
  tick('Messages folder ready');

  const sheetIds: Record<string, string> = {};
  for (let i = 0; i < SHEET_KEYS.length; i++) {
    const key = SHEET_KEYS[i];
    sheetIds[key] = await ensureDeviceMetadataSheet(
      accessToken,
      key,
      metadataFolderId,
      fetchImpl
    );
    tick(`Sheet ${i + 1} of ${SHEET_KEYS.length} ready`);
    if (i < SHEET_KEYS.length - 1) {
      await pace();
    }
  }

  const inboxSheetId = await ensureDeviceInboxSheet(accessToken, messagesFolderId, fetchImpl);
  tick('Inbox ready');

  sheetIds['owned-assets'] = await ensureDeviceOwnedAssetsSheet(
    accessToken,
    metadataFolderId,
    fetchImpl
  );
  tick('Owned assets ready');

  for (const className of DEVICE_PN_LAYOUT.contentClassDirs) {
    const classFolderId = await findOrCreateFolder(
      accessToken,
      className,
      metadataFolderId,
      fetchImpl
    );
    tick(`${className} index folder ready`);
    await ensureDeviceIndexSheet(accessToken, classFolderId, 'owner', className as ContentClassName, fetchImpl);
    tick(`${className} private index ready`);
    await pace();
    await ensureDeviceIndexSheet(accessToken, classFolderId, 'public', className as ContentClassName, fetchImpl);
    tick(`${className} public index ready`);
    await pace();
  }

  const filesFolderId = await findOrCreateFolder(
    accessToken,
    DEVICE_PN_LAYOUT.filesDir,
    pnFolderId,
    fetchImpl
  );
  tick('Files folder ready');
  const contentFolderId = await findOrCreateFolder(
    accessToken,
    DEVICE_PN_LAYOUT.contentDir,
    pnFolderId,
    fetchImpl
  );
  tick('Content folder ready');
  const contentNotesFolderId = await findOrCreateFolder(
    accessToken,
    DEVICE_PN_LAYOUT.contentNotes,
    contentFolderId,
    fetchImpl
  );
  tick('Notes folder ready');
  const contentMediaFolderId = await findOrCreateFolder(
    accessToken,
    DEVICE_PN_LAYOUT.contentMedia,
    contentFolderId,
    fetchImpl
  );
  tick('Media folder ready');
  const contentCollectionsFolderId = await findOrCreateFolder(
    accessToken,
    DEVICE_PN_LAYOUT.contentCollections,
    contentFolderId,
    fetchImpl
  );
  tick('Collections folder ready');

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
  fetchImpl?: typeof fetch,
  onProgress?: DeviceDriveLayoutProgressListener
): Promise<DeviceDriveLayout> {
  const key = normalizePnIdentifier(pnIdentifier);
  const existing = layoutInflight.get(key);
  if (existing) {
    if (onProgress) existing.listeners.add(onProgress);
    return existing.promise;
  }

  const listeners = new Set<DeviceDriveLayoutProgressListener>(onProgress ? [onProgress] : []);
  const report: DeviceDriveLayoutProgressListener = (progress) => {
    for (const listener of listeners) {
      try {
        listener(progress);
      } catch {
        /* a UI listener must not break the build */
      }
    }
  };
  const promise = buildDeviceDriveLayout(accessToken, key, fetchImpl, report).finally(() => {
    layoutInflight.delete(key);
  });
  layoutInflight.set(key, { promise, listeners });
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
