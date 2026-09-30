/**
 * Media rows from the device owner-file-index sheet.
 */
import { listDeviceOwnerFiles } from '@par-noir/device-cloud-credentials';
import { isMediaMimeType } from './messagingMediaService';
import { sessionDriveFor } from './sessionDrive';

export interface OwnPnMediaEntry {
  fileId: string;
  googleDriveFileId?: string;
  fileName?: string;
  originalName?: string;
  mimeType?: string;
  thumbnail?: string;
}

export async function loadOwnPnMedia(pnIdentifier: string): Promise<OwnPnMediaEntry[]> {
  const pn = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
  const drive = await sessionDriveFor(pn);
  const sheetId = drive.index.sheetIds['owner-file-index'];
  if (!sheetId) return [];
  const rows = await listDeviceOwnerFiles(drive.accessToken, sheetId);
  return rows
    .map((row) => ({
      fileId: row.fileId,
      googleDriveFileId: row.googleDriveFileId || undefined,
      fileName: typeof row.entry.fileName === 'string' ? row.entry.fileName : undefined,
      originalName: typeof row.entry.originalName === 'string' ? row.entry.originalName : undefined,
      mimeType: typeof row.entry.mimeType === 'string' ? row.entry.mimeType : undefined,
      thumbnail: typeof row.entry.thumbnail === 'string' ? row.entry.thumbnail : undefined,
    }))
    .filter((file) => {
      const id = file.googleDriveFileId || file.fileId;
      return !!id && isMediaMimeType(file.mimeType);
    });
}
