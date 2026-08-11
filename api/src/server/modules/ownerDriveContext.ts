/**
 * Runtime Google Drive context: token + complete PnDriveIndex (no Drive discovery).
 */

import type { GoogleDriveToken } from './googleOAuth2Helper';
import { normalizePnIdentifier } from './integratorStoragePaths';
import { storageCredentialsService } from './storageCredentialsService';
import {
  assertPnDriveIndexComplete,
  clearPnDriveIndex,
  DriveIndexError,
  getSheetIdFromIndex,
  pnDriveFoldersExistOnDrive,
  readPnDriveIndex,
  type PnDriveIndex,
  type PnDriveSheetKey,
} from './pnDriveIndex';
import { hashIdentifier, safeLogger } from '../../utils/logger';
import { isDeviceCloudCustodyEnabled } from './socialMailboxService';

export interface OwnerDriveContext {
  pnIdentifier: string;
  accountId: string | undefined;
  token: GoogleDriveToken;
  credentials: Record<string, unknown>;
  index: PnDriveIndex;
  sheetId(key: PnDriveSheetKey): string;
  conversationSheetId(peerPnIdentifier: string): string | undefined;
}

export type OwnerDriveContextOpts = {
  /** Ephemeral Google access token forwarded under device custody (X-PN-Cloud-Access-Token). */
  accessToken?: string;
};

function extractAccountId(account: Record<string, unknown>): string | undefined {
  return (
    (account.backendId as string | undefined) ||
    (account.keyPrefix as string | undefined) ||
    (account.accountId as string | undefined) ||
    (account.id as string | undefined)
  );
}

function pickGoogleDriveAccount(credentials: Record<string, unknown>): Record<string, unknown> | null {
  const accounts = credentials.googleDriveAccounts as Record<string, unknown>[] | undefined;
  if (accounts?.length) return accounts[0];
  if (credentials.googleDrive) return credentials.googleDrive as Record<string, unknown>;
  return null;
}

export { DriveIndexError };

/**
 * Load OAuth token + validate complete pnDriveIndex. Throws DriveIndexError if missing/incomplete.
 * Under custody: requires opts.accessToken (header-only). Opt-out may mint via proxy.
 */
export async function requireOwnerDriveContext(
  pnIdentifier: string,
  accountId?: string,
  opts?: OwnerDriveContextOpts
): Promise<OwnerDriveContext> {
  const normalized = normalizePnIdentifier(pnIdentifier);
  const record = await storageCredentialsService.getCredentials(normalized);
  if (!record?.credentials) {
    throw new DriveIndexError('Storage credentials not found', 'DRIVE_NOT_INITIALIZED');
  }

  const credentials = record.credentials as Record<string, unknown>;
  const index = readPnDriveIndex(credentials);
  assertPnDriveIndexComplete(index);

  const account = pickGoogleDriveAccount(credentials);
  if (!account) {
    throw new DriveIndexError('Google Drive not connected', 'DRIVE_NOT_INITIALIZED');
  }

  const resolvedAccountId = accountId ?? extractAccountId(account);
  const forwarded = opts?.accessToken?.trim();
  const custody = isDeviceCloudCustodyEnabled();
  let accessToken: string;

  if (forwarded) {
    accessToken = forwarded;
  } else if (custody) {
    safeLogger.warn('[OwnerDriveContext] Cloud access token required under custody', {
      reason: 'cloud_token_required',
      pnIdHash: hashIdentifier(normalized),
    });
    throw new DriveIndexError(
      'Google Drive access token required. Reconnect cloud storage or forward X-PN-Cloud-Access-Token.',
      'CLOUD_TOKEN_REQUIRED'
    );
  } else {
    try {
      const { googleDriveProxyService } = await import('./googleDriveProxy');
      accessToken = await googleDriveProxyService.getAccessToken(
        normalized,
        resolvedAccountId,
        [normalized]
      );
    } catch (err) {
      safeLogger.warn('[OwnerDriveContext] Proxy token mint failed (custody off)', {
        reason: 'proxy_get_access_token_failed',
        pnIdHash: hashIdentifier(normalized),
        message: err instanceof Error ? err.message : String(err),
      });
      throw new DriveIndexError(
        'Google Drive access token required. Reconnect cloud storage or forward X-PN-Cloud-Access-Token.',
        'CLOUD_TOKEN_REQUIRED'
      );
    }
  }

  const token: GoogleDriveToken = custody
    ? { access_token: accessToken }
    : {
        access_token: accessToken,
        refresh_token: (account.refresh_token || account.refreshToken) as string | undefined,
        expires_at: account.expires_at as number | undefined,
        expires_in: account.expires_in as number | undefined,
      };

  const foldersExist = await pnDriveFoldersExistOnDrive(
    accessToken,
    index.pnFolderId,
    index.metadataFolderId
  );
  if (!foldersExist) {
    await clearPnDriveIndex(normalized);
    throw new DriveIndexError(
      'Google Drive folders were deleted or moved. Re-initialize storage in the dashboard.',
      'DRIVE_INDEX_STALE'
    );
  }

  return {
    pnIdentifier: normalized,
    accountId: resolvedAccountId,
    token,
    credentials,
    index,
    sheetId: (key: PnDriveSheetKey) => getSheetIdFromIndex(index, key),
    conversationSheetId: (peer: string) => {
      const normalizedPeer = peer.startsWith('pn-') ? peer : `pn-${peer}`;
      return index.conversationSheets[normalizedPeer];
    },
  };
}

/** Non-throwing lookup for optional flows (returns null if index incomplete). */
export async function tryOwnerDriveContext(
  pnIdentifier: string,
  accountId?: string,
  opts?: OwnerDriveContextOpts
): Promise<OwnerDriveContext | null> {
  try {
    return await requireOwnerDriveContext(pnIdentifier, accountId, opts);
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    safeLogger.warn('[OwnerDriveContext] tryOwnerDriveContext soft-failed', {
      reason: code || 'unknown',
      pnIdHash: hashIdentifier(pnIdentifier),
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
