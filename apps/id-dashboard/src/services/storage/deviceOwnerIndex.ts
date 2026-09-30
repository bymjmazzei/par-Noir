/**
 * Owner file index lives in the device Google sheet. The API stores the sheet id only.
 */
import {
  listDeviceOwnerFiles,
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
