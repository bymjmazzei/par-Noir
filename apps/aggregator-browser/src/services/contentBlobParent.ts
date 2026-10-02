/**
 * Browse blobs live under content/{notes,media,collections}, never the pN root.
 */

import {
  blobFolderId,
  ensureOwnerBlobFolders,
  type ContentBlobClass,
} from '@par-noir/device-cloud-credentials';
import { sessionDriveFor } from './sessionDrive';

export type { ContentBlobClass };

export async function contentBlobParent(
  pnIdentifier: string,
  kind: ContentBlobClass
): Promise<string> {
  const drive = await sessionDriveFor(pnIdentifier);
  const folders = await ensureOwnerBlobFolders(drive.accessToken, drive.index);
  return blobFolderId(folders, kind);
}
