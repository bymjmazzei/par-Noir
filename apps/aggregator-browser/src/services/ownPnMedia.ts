/**
 * Media rows from the pN's owner file index on its own cloud.
 */
import { deviceFileIndex } from '@par-noir/device-cloud-credentials';
import { isMediaMimeType } from './messagingMediaService';
import { sessionSocialFor } from './sessionSocial';

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
  const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);
  const rows = await deviceFileIndex(await sessionSocialFor(pn), 'owner').list();
  return rows
    .map((row) => ({
      fileId: String(row.fileId),
      googleDriveFileId: text(row.googleDriveFileId),
      fileName: text(row.fileName),
      originalName: text(row.originalName),
      mimeType: text(row.mimeType),
      thumbnail: text(row.thumbnail),
    }))
    .filter((file) => {
      const id = file.googleDriveFileId || file.fileId;
      return !!id && isMediaMimeType(file.mimeType);
    });
}
