/**
 * Request-scoped Google Drive credentials for MetadataIndex and related handlers.
 * Resolves DB credentials once per HTTP request to avoid repeated lookups.
 */

import type { Request } from 'express';
import { storageCredentialsService } from '../storageCredentialsService';
import { hashIdentifier, safeLogger } from '../../../utils/logger';
import { isDeviceCloudCustodyEnabled } from '../socialMailboxService';
import { DriveIndexError } from '../pnDriveIndex';

export interface StorageRequestContext {
  pnIdentifier: string;
  accountId?: string;
  credentialsRecord: Awaited<ReturnType<typeof storageCredentialsService.getCredentials>>;
  accessToken?: string;
  driveToken?: {
    access_token: string;
    refresh_token?: string;
    expires_at?: number;
    expires_in?: number;
  };
}

export async function createStorageRequestContext(
  req: Request,
  pnIdentifier: string,
  accountId?: string
): Promise<StorageRequestContext | null> {
  if (!pnIdentifier) return null;
  const credentialsRecord = await storageCredentialsService.getCredentials(pnIdentifier);
  if (!credentialsRecord?.credentials) return null;

  const ctx: StorageRequestContext = {
    pnIdentifier,
    accountId,
    credentialsRecord,
  };

  const custody = isDeviceCloudCustodyEnabled();
  try {
    const { resolveOwnerDriveToken } = await import('../ownerDriveToken');
    const resolved = await resolveOwnerDriveToken(req, pnIdentifier, { accountId });
    ctx.accessToken = resolved.token.access_token;
  } catch (err) {
    safeLogger.warn('[StorageRequestContext] Could not resolve owner Drive token', {
      reason: (err as { code?: string })?.code || 'resolve_failed',
      pnIdHash: hashIdentifier(pnIdentifier),
      message: err instanceof Error ? err.message : String(err),
    });
    if (custody) {
      // Fail closed: do not resurrect secrets from the DB shell.
      throw err instanceof DriveIndexError
        ? err
        : new DriveIndexError(
            'Google Drive access token required. Forward X-PN-Cloud-Access-Token after unlocking with cloud credentials.',
            'CLOUD_TOKEN_REQUIRED'
          );
    }
  }

  const forwarded = ctx.accessToken?.trim();
  if (custody) {
    if (forwarded) {
      ctx.driveToken = { access_token: forwarded };
    }
    return ctx;
  }

  const accounts =
    credentialsRecord.credentials.googleDriveAccounts ||
    (credentialsRecord.credentials.googleDrive
      ? [credentialsRecord.credentials.googleDrive]
      : []);
  const account = accountId
    ? accounts.find(
        (acc: { backendId?: string; keyPrefix?: string }) =>
          acc.backendId === accountId || acc.keyPrefix === accountId
      ) || accounts[0]
    : accounts[0];

  if (account) {
    ctx.driveToken = {
      access_token:
        forwarded ||
        account.access_token ||
        (account as { accessToken?: string }).accessToken ||
        ctx.accessToken ||
        '',
      refresh_token: account.refresh_token || (account as { refreshToken?: string }).refreshToken,
      expires_at: account.expires_at,
      expires_in: account.expires_in,
    };
  } else if (forwarded) {
    ctx.driveToken = { access_token: forwarded };
  }

  return ctx;
}

export function getDriveTokenFromContext(ctx: StorageRequestContext): {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
} {
  if (ctx.driveToken?.access_token) {
    return ctx.driveToken;
  }
  if (!ctx.accessToken) {
    throw new Error('No Google Drive access token in storage context');
  }
  return { access_token: ctx.accessToken };
}
