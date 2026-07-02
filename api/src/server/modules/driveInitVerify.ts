/**
 * Pre-persist verification: ensure every folder and sheet in the Drive layout exists before
 * writing pnDriveIndex to Postgres.
 */

import type { GoogleDriveToken } from './googleOAuth2Helper';
import { driveV3FetchWithRetry } from './googleApiRetry';
import { DriveIndexError, type PnDriveIndex } from './pnDriveIndex';
import { findFolderByNameUnderParent } from './pnDriveLayout';

const CONTENT_CLASSES = ['media', 'thoughts', 'collections'] as const;

function escapeDriveQueryName(name: string): string {
  return name.replace(/'/g, "\\'");
}

function contentClassIndexFileName(
  contentClass: (typeof CONTENT_CLASSES)[number],
  indexType: 'owner' | 'public'
): string {
  return `${contentClass}-${indexType}-index.xlsx`;
}

async function driveFileExistsAndNotTrashed(
  accessToken: string,
  fileId: string,
  label: string
): Promise<boolean> {
  const res = await driveV3FetchWithRetry(
    accessToken,
    `/files/${fileId}?fields=id,trashed`,
    undefined,
    `verifyFile ${label}`
  );
  if (res.status === 404) return false;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Drive verify failed for ${label}: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { trashed?: boolean };
  return !data.trashed;
}

async function spreadsheetExistsUnderParent(
  accessToken: string,
  parentFolderId: string,
  fileName: string,
  label: string
): Promise<boolean> {
  const q = `name='${escapeDriveQueryName(fileName)}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
  const res = await driveV3FetchWithRetry(
    accessToken,
    `/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`,
    undefined,
    `verifySheet ${label}`
  );
  const data = (await res.json()) as { files?: Array<{ id: string }> };
  return Boolean(data.files?.[0]?.id);
}

export async function verifyPnDriveLayout(
  token: GoogleDriveToken,
  index: PnDriveIndex,
  pnIdentifier: string,
  _accountId?: string
): Promise<void> {
  const accessToken = token.access_token;
  const missing: string[] = [];

  const folderChecks: Array<{ id: string; label: string }> = [
    { id: index.pnFolderId, label: 'pnFolder' },
    { id: index.metadataFolderId, label: 'metadataFolder' },
    { id: index.integratorsRootId, label: 'integratorsRoot' },
    { id: index.messagesFolderId, label: 'messagesFolder' },
  ];

  for (const { id, label } of folderChecks) {
    if (!(await driveFileExistsAndNotTrashed(accessToken, id, label))) {
      missing.push(label);
    }
  }

  if (!(await driveFileExistsAndNotTrashed(accessToken, index.inboxSheetId, 'inboxSheet'))) {
    missing.push('inboxSheet');
  }

  for (const contentClass of CONTENT_CLASSES) {
    const ccFolderId = await findFolderByNameUnderParent(
      accessToken,
      contentClass,
      index.metadataFolderId
    );
    if (!ccFolderId) {
      missing.push(`contentClassFolder:${contentClass}`);
      continue;
    }
    for (const indexType of ['owner', 'public'] as const) {
      const fileName = contentClassIndexFileName(contentClass, indexType);
      const exists = await spreadsheetExistsUnderParent(
        accessToken,
        ccFolderId,
        fileName,
        `${contentClass}:${indexType}`
      );
      if (!exists) {
        missing.push(`contentClassSheet:${contentClass}:${indexType}`);
      }
    }
  }

  for (const [key, sheetId] of Object.entries(index.sheetIds)) {
    if (!sheetId?.trim()) {
      missing.push(`sheetId:${key}`);
      continue;
    }
    if (!(await driveFileExistsAndNotTrashed(accessToken, sheetId, `sheet:${key}`))) {
      missing.push(`sheet:${key}`);
    }
  }

  if (missing.length > 0) {
    throw new DriveIndexError(
      `Drive layout incomplete after init (${missing.join(', ')}). Will retry.`,
      'DRIVE_LAYOUT_INCOMPLETE'
    );
  }
}
