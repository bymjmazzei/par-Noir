/**
 * Resolve par Noir Google Drive folder ids (pn root + _metadata child).
 * Prefers pinned driveFolderId from storage credentials over name lookup.
 */

import { GoogleOAuth2Helper, type GoogleDriveToken } from './googleOAuth2Helper';

export interface PnDriveFolders {
  metadataFolderId: string;
  pnFolderId: string;
}

function normalizePn(pnIdentifier: string): string {
  return pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
}

async function findMetadataChild(
  drive: ReturnType<typeof import('googleapis').google.drive>,
  pnFolderId: string
): Promise<string | null> {
  const metadataFolderQuery = `name='_metadata' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const metadataFolderResponse = await drive.files.list({
    q: metadataFolderQuery,
    fields: 'files(id)',
    pageSize: 1,
  });
  if (!metadataFolderResponse.data.files?.length) return null;
  return metadataFolderResponse.data.files[0]!.id!;
}

export async function resolvePnDriveFolders(
  token: GoogleDriveToken,
  pnIdentifier: string,
  accountId?: string,
  pinnedPnFolderId?: string | null
): Promise<PnDriveFolders | null> {
  const { google } = await import('googleapis');
  const auth = GoogleOAuth2Helper.createClient(token, pnIdentifier, accountId);
  const drive = google.drive({ version: 'v3', auth });

  try {
    if (pinnedPnFolderId) {
      const metadataFolderId = await findMetadataChild(drive, pinnedPnFolderId);
      if (metadataFolderId) {
        return { pnFolderId: pinnedPnFolderId, metadataFolderId };
      }
    }

    const normalizedPn = normalizePn(pnIdentifier);
    const pnFolderName = `par Noir - ${normalizedPn}`;
    const pnFolderQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const pnFolderResponse = await drive.files.list({
      q: pnFolderQuery,
      fields: 'files(id)',
      pageSize: 1,
    });

    if (!pnFolderResponse.data.files?.length) return null;
    const pnFolderId = pnFolderResponse.data.files[0]!.id!;
    const metadataFolderId = await findMetadataChild(drive, pnFolderId);
    if (!metadataFolderId) return null;
    return { metadataFolderId, pnFolderId };
  } catch (error: unknown) {
    const err = error as { response?: { status?: number }; code?: number; message?: string };
    if (err?.response?.status === 401 || err?.response?.status === 403 || err?.code === 401 || err?.code === 403) {
      throw new Error(`Google Drive authentication failed: ${err?.message || 'Invalid credentials'}`);
    }
    throw error;
  }
}
