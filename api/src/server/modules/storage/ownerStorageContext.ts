import { resolvePrimaryProvider } from '@par-noir/user-owned-storage';
import type { GoogleDriveToken } from '../googleOAuth2Helper';
import { getRecoveryDriveContext } from '../recoveryDriveContext';
import { storageCredentialsService } from '../storageCredentialsService';
import { isPortableStorageProvider } from './storageProviderUtils';

export type OwnerStorageContext =
  | {
      kind: 'google_drive';
      pnIdentifier: string;
      token: GoogleDriveToken;
      metadataFolderId: string;
      accountId?: string;
    }
  | {
      kind: 'portable';
      pnIdentifier: string;
      accountId?: string;
    };

function normalizePn(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

export async function getOwnerStorageContext(
  userPnIdentifier: string,
  opts?: { accessToken?: string }
): Promise<OwnerStorageContext | null> {
  const pnIdentifier = normalizePn(userPnIdentifier);
  const record = await storageCredentialsService.getCredentials(pnIdentifier);
  if (!record?.credentials) return null;

  if (await isPortableStorageProvider(pnIdentifier)) {
    return { kind: 'portable', pnIdentifier, accountId: undefined };
  }

  // Soft: device capability / registry probes must not throw when JWT-only (pre-mint).
  // Real Drive I/O uses resolveOwnerDriveToken → 409 instead.
  const drive = await getRecoveryDriveContext(pnIdentifier, {
    ...opts,
    softMissingToken: true,
  });
  if (!drive) return null;

  return {
    kind: 'google_drive',
    pnIdentifier: drive.pnIdentifier,
    token: drive.token,
    metadataFolderId: drive.metadataFolderId,
    accountId: drive.accountId
  };
}

export async function hasOwnerStorage(userPnIdentifier: string): Promise<boolean> {
  const pnIdentifier = normalizePn(userPnIdentifier);
  const record = await storageCredentialsService.getCredentials(pnIdentifier);
  if (!record?.credentials) return false;
  const provider = resolvePrimaryProvider(record.credentials);
  if (provider !== 'google_drive') return true;
  return (await getRecoveryDriveContext(pnIdentifier, { softMissingToken: true })) !== null;
}
