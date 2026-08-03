import { storageCredentialsService } from './storageCredentialsService';

export interface RecoveryDriveContext {
  pnIdentifier: string;
  token: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number };
  accountId?: string;
  metadataFolderId: string;
}

function extractAccountId(account: Record<string, unknown>): string | undefined {
  return (
    (account.backendId as string | undefined) ||
    (account.keyPrefix as string | undefined) ||
    (account.accountId as string | undefined) ||
    (account.id as string | undefined)
  );
}

export async function getRecoveryDriveContext(
  userPnIdentifier: string,
  opts?: { accessToken?: string }
): Promise<RecoveryDriveContext | null> {
  const pnIdentifier = userPnIdentifier.startsWith('pn-') ? userPnIdentifier : `pn-${userPnIdentifier}`;
  const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
  if (!userCredentials?.credentials) return null;

  const googleDriveAccounts =
    userCredentials.credentials.googleDriveAccounts
    || (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
  if (googleDriveAccounts.length === 0) return null;

  const account = googleDriveAccounts[0];
  const accountId = extractAccountId(account);
  const access_token =
    opts?.accessToken ||
    account.access_token ||
    account.accessToken;
  if (!access_token) return null;

  const token = {
    access_token,
    refresh_token: account.refresh_token || account.refreshToken,
    expires_at: account.expires_at,
    expires_in: account.expires_in,
  };

  const { readPnDriveIndex, isPnDriveIndexComplete } = await import('./pnDriveIndex');
  const index = readPnDriveIndex(userCredentials.credentials as Record<string, unknown>);
  if (!isPnDriveIndexComplete(index)) return null;

  return {
    pnIdentifier,
    token,
    accountId,
    metadataFolderId: index.metadataFolderId,
  };
}
