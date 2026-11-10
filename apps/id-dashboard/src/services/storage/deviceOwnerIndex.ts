/**
 * Owner file index lives in the device Google sheet. The API stores the sheet id only.
 */
import {
  deviceDriveCall,
  listDeviceOwnerFiles,
  removeDeviceIndexFiles,
  upsertDeviceOwnerFile,
  type DeviceOwnerIndexFile,
} from '@par-noir/device-cloud-credentials';
import { sessionDriveFor } from '../sessionDrive';

export function ownerIndexEntryFromDeviceRow(row: DeviceOwnerIndexFile): Record<string, unknown> {
  return {
    ...row.entry,
    fileId: row.fileId,
    googleDriveFileId: row.googleDriveFileId || row.entry.googleDriveFileId,
    backendFileId: row.googleDriveFileId || row.entry.backendFileId,
    visibility: row.visibility || row.entry.visibility,
    uploadedAt: row.uploadedAt || row.entry.uploadedAt,
    backend: row.entry.backend || 'google_drive',
  };
}

export async function readDeviceOwnerIndex(
  pnIdentifier: string,
  apiToken: string
): Promise<Record<string, unknown>[]> {
  const pn = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
  const drive = await sessionDriveFor(pn, apiToken);
  const sheetId = drive.index.sheetIds['owner-file-index'];
  if (!sheetId) return [];
  const rows = await listDeviceOwnerFiles(drive.accessToken, sheetId);
  return rows.map(ownerIndexEntryFromDeviceRow);
}

export async function writeDeviceOwnerIndexEntry(
  pnIdentifier: string,
  apiToken: string,
  entry: {
    fileId: string;
    googleDriveFileId: string;
    visibility: string;
    uploadedAt: string;
  }
): Promise<void> {
  const pn = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
  const drive = await sessionDriveFor(pn, apiToken);
  const sheetId = drive.index.sheetIds['owner-file-index'];
  if (!sheetId) throw new Error('owner-file-index sheet missing');
  await upsertDeviceOwnerFile(drive.accessToken, sheetId, {
    fileId: entry.fileId,
    googleDriveFileId: entry.googleDriveFileId,
    visibility: entry.visibility,
    uploadedAt: entry.uploadedAt,
    entry: { ...entry } as Record<string, unknown>,
  });
}

/**
 * Removes a deleted post from the owner's cloud: the Drive files, each file's companion
 * metadata sheet, and the owner/public index rows. A file already gone counts as removed.
 */
export async function deleteDeviceOwnerFiles(
  pnIdentifier: string,
  apiToken: string,
  fileIds: readonly string[]
): Promise<void> {
  const ids = [...new Set(fileIds.filter(Boolean))];
  if (ids.length === 0) return;
  const pn = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
  const drive = await sessionDriveFor(pn, apiToken);
  const call = (method: string, path: string) =>
    deviceDriveCall(method, path, undefined, { accessToken: drive.accessToken });

  const failed: string[] = [];
  for (const id of ids) {
    const q = `name='${id.replace(/'/g, "\\'")}.metadata' and trashed=false`;
    const companions = await call('GET', `/api/drive/files?q=${encodeURIComponent(q)}`);
    const companionIds = companions.ok
      ? ((await companions.json()) as { files?: Array<{ id: string }> }).files?.map((f) => f.id) ?? []
      : [];
    for (const target of [id, ...companionIds]) {
      const res = await call('DELETE', `/api/drive/files/${encodeURIComponent(target)}`);
      if (!res.ok && res.status !== 404) failed.push(target);
    }
  }

  for (const key of ['owner-file-index', 'public-file-index'] as const) {
    const sheetId = drive.index.sheetIds[key];
    if (sheetId) await removeDeviceIndexFiles(drive.accessToken, sheetId, ids);
  }

  if (failed.length > 0) {
    throw new Error(`Could not delete ${failed.length} file(s) from your cloud`);
  }
}
