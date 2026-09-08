import { storageCredentialsService } from './storageCredentialsService';
import { DriveIndexError } from './pnDriveIndex';
import { hashIdentifier, safeLogger } from '../../utils/logger';
import { isDeviceCloudCustodyEnabled } from './socialMailboxService';

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
 * Resolve recovery Drive context. Under custody: forwarded accessToken only.
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
  const custody = isDeviceCloudCustodyEnabled();
  const forwarded = String(opts?.accessToken || '').trim();
  const access_token = custody
    ? forwarded
    : String(forwarded || account.access_token || account.accessToken || '').trim();

  if (!access_token) {
    const { readPnDriveIndex, isPnDriveIndexComplete } = await import('./pnDriveIndex');
    const indexEarly = readPnDriveIndex(userCredentials.credentials as Record<string, unknown>);
    // Incomplete layout (Connect / first init): JWT-only probes are expected — stay quiet.
    if (!isPnDriveIndexComplete(indexEarly)) return null;

    if (opts?.softMissingToken) {
      // JWT-only owner probes under custody are expected; do not warn (was flooding Railway).
      return null;
    }
    safeLogger.warn('[RecoveryDrive] Cloud access token missing', {
      reason: 'cloud_token_required',
      pnIdHash: hashIdentifier(pnIdentifier),
      soft: false,
    });
    throw new DriveIndexError(
      'Google Drive access token required. Forward X-PN-Cloud-Access-Token after unlocking with cloud credentials.',
      'CLOUD_TOKEN_REQUIRED'
    );
  }

  const token = custody
    ? { access_token }
    : {
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
