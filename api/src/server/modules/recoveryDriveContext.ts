import { storageCredentialsService } from './storageCredentialsService';
import { DriveIndexError } from './pnDriveIndex';

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

/**
 * Resolve recovery Drive context. Throws DriveIndexError CLOUD_TOKEN_REQUIRED when
 * no forwarded/server access token is available (do not treat as "Drive not connected").
 * Pass softMissingToken for GET unlock probes that should soft-empty instead of 409.
 */
export async function getRecoveryDriveContext(
  userPnIdentifier: string,
  opts?: { accessToken?: string; softMissingToken?: boolean }
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
  const access_token = String(
    opts?.accessToken || account.access_token || account.accessToken || ''
  ).trim();
  if (!access_token) {
    if (opts?.softMissingToken) return null;
    throw new DriveIndexError(
      'Google Drive access token required. Forward X-PN-Cloud-Access-Token after unlocking with cloud credentials.',
      'CLOUD_TOKEN_REQUIRED'
    );
  }

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
