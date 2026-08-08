/**
 * Request-scoped Google Drive credentials for MetadataIndex and related handlers.
 * Resolves DB credentials once per HTTP request to avoid repeated lookups.
 */

import { googleDriveProxyService } from '../googleDriveProxy';
import { storageCredentialsService } from '../storageCredentialsService';

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
  pnIdentifier: string,
  accountId?: string,
  forwardedAccessToken?: string
): Promise<StorageRequestContext | null> {
  if (!pnIdentifier) return null;
  const credentialsRecord = await storageCredentialsService.getCredentials(pnIdentifier);
  if (!credentialsRecord?.credentials) return null;

  const ctx: StorageRequestContext = {
    pnIdentifier,
    accountId,
    credentialsRecord,
  };

  const forwarded = forwardedAccessToken?.trim();
  if (forwarded) {
    ctx.accessToken = forwarded;
  } else {
    try {
      ctx.accessToken = await googleDriveProxyService.getAccessToken(pnIdentifier, accountId);
    } catch {
      try {
        ctx.accessToken = googleDriveProxyService.extractAccessTokenFromCredentials(
          credentialsRecord.credentials,
          accountId
        );
      } catch {
        /* caller handles missing token */
      }
    }
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
