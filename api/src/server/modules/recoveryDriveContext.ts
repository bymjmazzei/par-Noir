import { storageCredentialsService } from './storageCredentialsService';

export interface RecoveryDriveContext {
  pnIdentifier: string;
  token: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number };
  accountId?: string;
  metadataFolderId: string;
}

function extractAccountId(account: { accountId?: string; id?: string }): string | undefined {
  return account.accountId || account.id;
}

export async function getRecoveryDriveContext(userPnIdentifier: string): Promise<RecoveryDriveContext | null> {
  const pnIdentifier = userPnIdentifier.startsWith('pn-') ? userPnIdentifier : `pn-${userPnIdentifier}`;
  const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
  if (!userCredentials?.credentials) return null;

  const googleDriveAccounts =
    userCredentials.credentials.googleDriveAccounts
    || (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
  if (googleDriveAccounts.length === 0) return null;

  const account = googleDriveAccounts[0];
  const accountId = extractAccountId(account);
  const token = {
    access_token: account.access_token || account.accessToken,
    refresh_token: account.refresh_token || account.refreshToken,
    expires_at: account.expires_at,
    expires_in: account.expires_in,
  };

  const { resolvePnDriveFolders } = await import('./resolvePnDriveFolders');
  const pinned = await storageCredentialsService.getDriveFolderId(pnIdentifier);
  const folders = await resolvePnDriveFolders(token, pnIdentifier, accountId, pinned);
  if (!folders) return null;

  return {
    pnIdentifier,
    token,
    accountId,
    metadataFolderId: folders.metadataFolderId,
  };
}
