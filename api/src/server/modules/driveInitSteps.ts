/**
 * Drive layout init steps — sole implementation for content-class folders, index sheets,
 * profile/preferences, and post-layout permissions during storage init.
 */

import type { GoogleDriveToken } from './googleOAuth2Helper';
import type { DriveInitHooks } from './pnDriveInit';
import {
  ensureIndexSheetInFolder,
  fetchGoogleDriveWithRetry,
  setPublicPermissionWithRetry,
  type ContentClassName,
} from './googleApiRetry';
import { PN_DRIVE_SHEET_KEYS, type PnDriveIndex } from './pnDriveIndex';

const CONTENT_CLASSES: ContentClassName[] = ['media', 'thoughts', 'collections'];

export interface DriveInitStepsOptions {
  identityId: string;
  logPrefix: string;
}

export function createDriveInitHooks(options: DriveInitStepsOptions): DriveInitHooks {
  return {
    initializeContentClassFolders: (token, metadataFolderId, pnIdentifier, accountId) =>
      initializeContentClassFolders(token, metadataFolderId, pnIdentifier, accountId),
    initializeProfileAndMetadataFiles: (token, metadataFolderId, pnIdentifier, accountId) =>
      initializeProfileAndMetadataFiles(
        token,
        metadataFolderId,
        pnIdentifier,
        accountId,
        options.identityId,
        options.logPrefix
      ),
  };
}

export async function initializeContentClassFolders(
  token: GoogleDriveToken,
  metadataFolderId: string,
  pnIdentifier: string,
  accountId?: string
): Promise<void> {
  const accessToken = token.access_token;

  for (const folderName of CONTENT_CLASSES) {
    const folderQuery = `name='${folderName}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id)&pageSize=1`;
    const searchResponse = await fetchGoogleDriveWithRetry(
      searchUrl,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      `contentClassFolder search ${folderName}`
    );

    let folderId: string | null = null;
    if (searchResponse.ok) {
      const searchData = (await searchResponse.json()) as { files?: Array<{ id: string }> };
      if (searchData.files && searchData.files.length > 0) {
        folderId = searchData.files[0].id;
        console.log(`[initializeContentClassFolders] Folder '${folderName}' already exists`);
        await initializeContentClassIndexFiles(token, folderId, folderName, pnIdentifier, accountId);
        continue;
      }
    }

    const createResponse = await fetchGoogleDriveWithRetry(
      'https://www.googleapis.com/drive/v3/files',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [metadataFolderId],
        }),
      },
      `contentClassFolder create ${folderName}`
    );

    if (!createResponse.ok) {
      const errorText = await createResponse.text().catch(() => '');
      throw new Error(
        `[initializeContentClassFolders] Failed to create folder '${folderName}': ${createResponse.status} ${errorText.slice(0, 200)}`
      );
    }

    const folderData = (await createResponse.json()) as { id: string };
    folderId = folderData.id;
    console.log(`[initializeContentClassFolders] Created folder '${folderName}' (ID: ${folderId})`);
    await initializeContentClassIndexFiles(token, folderId, folderName, pnIdentifier, accountId);
  }
}

export async function initializeContentClassIndexFiles(
  token: GoogleDriveToken,
  folderId: string,
  folderName: string,
  pnIdentifier: string,
  accountId?: string
): Promise<void> {
  const cc = folderName as ContentClassName;

  await ensureIndexSheetInFolder(
    `contentClass:${folderName}:owner`,
    token,
    folderId,
    'owner',
    pnIdentifier,
    accountId,
    cc
  );
  console.log(`[initializeContentClassIndexFiles] Initialized owner index in '${folderName}'`);

  const publicSheetId = await ensureIndexSheetInFolder(
    `contentClass:${folderName}:public`,
    token,
    folderId,
    'public',
    pnIdentifier,
    accountId,
    cc
  );
  await setPublicPermissionWithRetry(
    token.access_token,
    publicSheetId,
    `contentClass:${folderName}:publicPerm`
  );
  console.log(`[initializeContentClassIndexFiles] Initialized public index in '${folderName}'`);
}

export async function initializeProfileAndMetadataFiles(
  token: GoogleDriveToken,
  metadataFolderId: string,
  pnIdentifier: string,
  accountId: string | undefined,
  identityId: string,
  logPrefix: string
): Promise<void> {
  const now = new Date().toISOString();
  const { PreferencesService } = await import('./preferencesService');
  const { ProfileService } = await import('./profileService');

  const existingPreferences = await PreferencesService.getPreferencesFile(
    token.access_token,
    metadataFolderId,
    pnIdentifier
  );
  if (!existingPreferences) {
    await PreferencesService.updatePreferencesFile(
      token.access_token,
      metadataFolderId,
      pnIdentifier,
      { identifier: pnIdentifier, updatedAt: now, tagPreferences: [] },
      pnIdentifier,
      accountId
    );
    console.log(`${logPrefix} Initialized preferences.json`);
  }

  const existingProfile = await ProfileService.getProfileFile(token.access_token, metadataFolderId);
  if (!existingProfile) {
    await ProfileService.updateProfileFile(token.access_token, metadataFolderId, identityId, {
      identifier: identityId,
      updatedAt: now,
    });
    console.log(`${logPrefix} Initialized profile.json`);
  }
}

/** Set public read on root public-file-index after layout build (init-only, fail-fast). */
export async function applyPostLayoutPermissions(
  token: GoogleDriveToken,
  index: PnDriveIndex,
  logPrefix: string
): Promise<void> {
  const publicSheetId = index.sheetIds[PN_DRIVE_SHEET_KEYS.PUBLIC_FILE_INDEX];
  if (!publicSheetId) {
    throw new Error(`${logPrefix} Missing public-file-index sheet id after layout build`);
  }
  await setPublicPermissionWithRetry(
    token.access_token,
    publicSheetId,
    'rootPublicFileIndex:publicPerm'
  );
  console.log(`${logPrefix} Set public permissions on public-file-index.xlsx`);
}

export async function runFullDriveInitAndPersist(
  token: GoogleDriveToken,
  pnIdentifier: string,
  accountId: string | undefined,
  credentials: Record<string, unknown>,
  identityId: string,
  logPrefix: string
): Promise<{ metadataFolderId: string; pnFolderId: string }> {
  const { initializeGoogleDriveIndex } = await import('./pnDriveInit');
  const { persistPnDriveIndex } = await import('./pnDriveIndex');
  const { verifyPnDriveLayout } = await import('./driveInitVerify');

  console.log(`[DriveInit] phase=layout for ${pnIdentifier}`);
  const index = await initializeGoogleDriveIndex(
    token,
    pnIdentifier,
    accountId,
    createDriveInitHooks({ identityId, logPrefix })
  );

  console.log(`[DriveInit] phase=permissions for ${pnIdentifier}`);
  await applyPostLayoutPermissions(token, index, logPrefix);

  console.log(`[DriveInit] phase=verify for ${pnIdentifier}`);
  await verifyPnDriveLayout(token, index, pnIdentifier, accountId);

  console.log(`[DriveInit] phase=persist for ${pnIdentifier}`);
  await persistPnDriveIndex(pnIdentifier, credentials, index);
  console.log(`${logPrefix} Persisted complete pnDriveIndex`);

  return { metadataFolderId: index.metadataFolderId, pnFolderId: index.pnFolderId };
}
