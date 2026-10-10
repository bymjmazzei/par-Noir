/**
 * Owner cloud layout migrations on the device (keep migration ids in sync with
 * api/src/server/modules/storage/cloudLayoutMigrations.ts).
 */

import { DEVICE_PN_LAYOUT, findOrCreateFolder } from './deviceDriveFind.js';
import { deviceDriveCall } from './deviceDriveCall.js';
import type { DeviceDriveLayout } from './deviceDriveLayout.js';
import { readSheetValues, writeSheetValues } from './deviceSheet.js';

/** @see api cloudLayoutMigrations MIGRATION_INBOX_CHANNEL_CLIENT_ID_V1 */
export const MIGRATION_INBOX_CHANNEL_CLIENT_ID_V1 = 'inbox_channel_client_id_v1' as const;
/** @see api cloudLayoutMigrations MIGRATION_ROOT_BLOBS_OUT_OF_PN_ROOT_V2 */
export const MIGRATION_ROOT_BLOBS_OUT_OF_PN_ROOT_V2 = 'root_blobs_out_of_pn_root_v2' as const;

export type DeviceCloudLayoutMigrationId =
  | typeof MIGRATION_INBOX_CHANNEL_CLIENT_ID_V1
  | typeof MIGRATION_ROOT_BLOBS_OUT_OF_PN_ROOT_V2;

const INBOX_HEADER_ROW = [
  'participantPnIdentifier',
  'spreadsheetId',
  'connectionId',
  'lastMessageAt',
  'lastMessagePreview',
  'kemCiphertext',
  'threadType',
  'wrappedMessageRootKey',
  'channelClientId',
];

const PEN_ROOT_FOLDER_NAME = 'par-noir-pen';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

async function listPnRootChildren(
  accessToken: string,
  pnFolderId: string,
  fetchImpl?: typeof fetch
): Promise<Array<{ id: string; name: string; mimeType?: string }>> {
  const q = `'${pnFolderId}' in parents and trashed=false`;
  const res = await deviceDriveCall(
    'GET',
    `/api/drive/files?q=${encodeURIComponent(q)}&pageSize=100`,
    undefined,
    { accessToken, fetchImpl }
  );
  if (!res.ok) {
    throw new Error(`Failed to list pN root children (${res.status})`);
  }
  const body = (await res.json()) as {
    files?: Array<{ id?: string; name?: string; mimeType?: string }>;
  };
  return (body.files || [])
    .filter((f) => f.id && f.name)
    .map((f) => ({ id: f.id!, name: f.name!, mimeType: f.mimeType }));
}

export async function ensureDeviceInboxChannelColumn(
  accessToken: string,
  inboxSheetId: string,
  fetchImpl?: typeof fetch
): Promise<void> {
  const fetchImplOrDefault = fetchImpl || fetch;
  const row = await readSheetValues(accessToken, inboxSheetId, 'Inbox!A1:I1', fetchImplOrDefault);
  const headers = row[0] || [];
  if (headers[8] === 'channelClientId') return;
  await writeSheetValues(
    accessToken,
    inboxSheetId,
    'Inbox!A1:I1',
    [INBOX_HEADER_ROW],
    fetchImplOrDefault
  );
}

async function runInboxChannelMigration(
  accessToken: string,
  index: DeviceDriveLayout,
  fetchImpl?: typeof fetch
): Promise<void> {
  if (!index.inboxSheetId?.trim()) {
    throw new Error('DRIVE_NOT_INITIALIZED');
  }
  await ensureDeviceInboxChannelColumn(accessToken, index.inboxSheetId, fetchImpl);
}

/**
 * Ensure v2 folder ids under the pN root. Does not relocate loose root files
 * (legacy pen-media / blob moves remain server-only until ported).
 */
async function runRootBlobsV2Migration(
  accessToken: string,
  index: DeviceDriveLayout,
  persistIndex: (index: DeviceDriveLayout) => Promise<void>,
  fetchImpl?: typeof fetch
): Promise<void> {
  if (!index.pnFolderId?.trim()) {
    throw new Error('DRIVE_NOT_INITIALIZED');
  }
  const children = await listPnRootChildren(accessToken, index.pnFolderId, fetchImpl);
  const loose = children.filter((c) => c.mimeType !== FOLDER_MIME);
  if (loose.length > 0) {
    throw new Error(
      'Loose files remain in the pN root; full relocate is not available on device yet. Move them manually or contact support.'
    );
  }

  const filesFolderId = await findOrCreateFolder(
    accessToken,
    DEVICE_PN_LAYOUT.filesDir,
    index.pnFolderId,
    fetchImpl
  );
  const contentFolderId = await findOrCreateFolder(
    accessToken,
    DEVICE_PN_LAYOUT.contentDir,
    index.pnFolderId,
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
  await findOrCreateFolder(accessToken, PEN_ROOT_FOLDER_NAME, index.pnFolderId, fetchImpl);

  const next: DeviceDriveLayout = {
    ...index,
    filesFolderId,
    contentFolderId,
    contentNotesFolderId,
    contentMediaFolderId,
    contentCollectionsFolderId,
  };
  await persistIndex(next);
}

export async function runDeviceCloudLayoutMigration(opts: {
  migrationId: DeviceCloudLayoutMigrationId | string;
  accessToken: string;
  index: DeviceDriveLayout;
  persistIndex: (index: DeviceDriveLayout) => Promise<void>;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const { migrationId, accessToken, index, persistIndex, fetchImpl } = opts;
  if (migrationId === MIGRATION_INBOX_CHANNEL_CLIENT_ID_V1) {
    await runInboxChannelMigration(accessToken, index, fetchImpl);
    return;
  }
  if (migrationId === MIGRATION_ROOT_BLOBS_OUT_OF_PN_ROOT_V2) {
    await runRootBlobsV2Migration(accessToken, index, persistIndex, fetchImpl);
    return;
  }
  throw new Error(`Unknown device cloud layout migration: ${migrationId}`);
}

export async function runPendingDeviceCloudLayoutMigrations(opts: {
  pendingIds: string[];
  accessToken: string;
  index: DeviceDriveLayout;
  persistIndex: (index: DeviceDriveLayout) => Promise<void>;
  fetchImpl?: typeof fetch;
}): Promise<DeviceDriveLayout> {
  let current = opts.index;
  for (const id of opts.pendingIds) {
    await runDeviceCloudLayoutMigration({
      migrationId: id,
      accessToken: opts.accessToken,
      index: current,
      persistIndex: async (next) => {
        current = next;
        await opts.persistIndex(next);
      },
      fetchImpl: opts.fetchImpl,
    });
  }
  return current;
}
