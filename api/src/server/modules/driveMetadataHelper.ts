/**
 * Resolve user Google Drive access token and _metadata folder id.
 */

import { googleDriveProxyService } from './googleDriveProxy';
import { storageCredentialsService } from './storageCredentialsService';

export interface UserDriveMetadataContext {
  normalizedPnIdentifier: string;
  accessToken: string;
  accountId: string;
  metadataFolderId: string;
}

export function normalizePnIdentifier(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

export async function getUserDriveMetadataContext(
  userPnIdentifier: string
): Promise<UserDriveMetadataContext | null> {
  const normalizedPnIdentifier = normalizePnIdentifier(userPnIdentifier);

  const userCredentials = await storageCredentialsService.getCredentials(normalizedPnIdentifier);
  if (!userCredentials?.credentials) {
    return null;
  }

  const googleDriveAccounts =
    userCredentials.credentials.googleDriveAccounts ||
    (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);

  if (googleDriveAccounts.length === 0) {
    return null;
  }

  const account = googleDriveAccounts[0] as {
    backendId?: string;
    keyPrefix?: string;
    accountId?: string;
    id?: string;
  };
  const accountId =
    account.backendId ||
    account.keyPrefix ||
    account.accountId ||
    account.id;
  let accessToken: string;
  try {
    accessToken = await googleDriveProxyService.getAccessToken(
      normalizedPnIdentifier,
      accountId
    );
  } catch {
    // DEVICE_CLOUD_CUSTODY strips OAuth secrets — server cannot read Drive.
    return null;
  }
  if (!accessToken) {
    return null;
  }

  const pnFolderName = `par Noir - ${normalizedPnIdentifier}`;
  const pnFolderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const pnFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(pnFolderSearchQuery)}&fields=files(id)&pageSize=1`;

  const pnFolderResponse = await fetch(pnFolderSearchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!pnFolderResponse.ok) {
    return null;
  }

  const pnFolderData = (await pnFolderResponse.json()) as { files?: Array<{ id: string }> };
  const pnFolderId = pnFolderData.files?.[0]?.id;
  if (!pnFolderId) {
    return null;
  }

  const metadataSearchQuery = `name='_metadata' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const metadataSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataSearchQuery)}&fields=files(id)&pageSize=1`;

  const metadataFolderResponse = await fetch(metadataSearchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!metadataFolderResponse.ok) {
    return null;
  }

  const metadataFolderData = (await metadataFolderResponse.json()) as { files?: Array<{ id: string }> };
  const metadataFolderId = metadataFolderData.files?.[0]?.id;
  if (!metadataFolderId) {
    return null;
  }

  return {
    normalizedPnIdentifier,
    accessToken,
    accountId: accountId ?? '',
    metadataFolderId,
  };
}
