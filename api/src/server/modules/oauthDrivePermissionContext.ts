/**
 * Resolve Google Drive + metadata layout for OAuth permission read/write.
 * Uses credential candidate lookup (pn + DID) consistent with googleDriveProxy.
 */

import { lookupPnFolderLayout } from './integratorFolderService';
import { normalizePnIdentifier } from './integratorStoragePaths';
import { storageCredentialsService, type StoredCredentialsRecord } from './storageCredentialsService';
import { ThirdPartyPermissionsService } from './thirdPartyPermissionsService';
import { ThirdPartyPermissionsSheetsService } from './thirdPartyPermissionsSheetsService';
import { hashIdentifier, safeLogger } from '../../utils/logger';

export interface OAuthDrivePermissionContext {
  credentialsRecord: StoredCredentialsRecord;
  userAccessToken: string;
  accountId: string | undefined;
  metadataFolderId: string;
  normalizedPn: string;
}

export function buildOAuthIdentityCandidates(params: {
  pnIdentifier?: string;
  did?: string;
}): string[] {
  const candidates: string[] = [];
  const add = (value?: string) => {
    if (!value || candidates.includes(value)) return;
    candidates.push(value);
  };

  if (params.pnIdentifier) {
    add(normalizePnIdentifier(params.pnIdentifier));
  }
  if (params.did) {
    add(params.did);
    if (params.did.startsWith('did:key:')) {
      const keyPart = params.did.split(':').pop();
      if (keyPart) add(keyPart);
    }
  }

  return candidates;
}

function extractDriveAccountId(account: Record<string, unknown>): string | undefined {
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
  return credentials as Record<string, unknown>;
}

/**
 * Resolve Drive access token + _metadata folder for OAuth flows.
 */
export async function resolveOAuthDriveContext(params: {
  pnIdentifier?: string;
  did?: string;
}): Promise<OAuthDrivePermissionContext | null> {
  const candidates = buildOAuthIdentityCandidates(params);
  if (candidates.length === 0) return null;

  const credentialsRecord = await storageCredentialsService.findCredentialsByIdentityCandidates(candidates);
  if (!credentialsRecord?.credentials) return null;

  const normalizedPn = params.pnIdentifier
    ? normalizePnIdentifier(params.pnIdentifier)
    : normalizePnIdentifier(credentialsRecord.identityId);

  const account = pickGoogleDriveAccount(credentialsRecord.credentials as Record<string, unknown>);
  if (!account) return null;

  const accountId = extractDriveAccountId(account);
  const extraCandidates = candidates.filter((c) => c !== normalizedPn);

  try {
    const { googleDriveProxyService } = await import('./googleDriveProxy');
    const userAccessToken = await googleDriveProxyService.getAccessToken(
      normalizedPn,
      accountId,
      extraCandidates
    );

    const layout = await lookupPnFolderLayout(userAccessToken, normalizedPn);
    if (!layout?.metadataFolderId) return null;

    return {
      credentialsRecord,
      userAccessToken,
      accountId,
      metadataFolderId: layout.metadataFolderId,
      normalizedPn,
    };
  } catch (error: unknown) {
    safeLogger.warn('[OAuth] resolveOAuthDriveContext failed', {
      message: error instanceof Error ? error.message : String(error),
      pnIdHash: hashIdentifier(normalizedPn),
    });
    return null;
  }
}

export const BROWSER_APP_PERMISSION_CHECK_TIMEOUT_MS = 15_000;

/** Race a permission lookup; returns null on timeout so unlock is not blocked by slow Drive. */
export async function getBrowserAppExistingPermissionsWithTimeout(
  params: { pnIdentifier?: string; did?: string },
  timeoutMs: number = BROWSER_APP_PERMISSION_CHECK_TIMEOUT_MS
): Promise<{ ageShared: boolean } | null> {
  try {
    return await Promise.race([
      getBrowserAppExistingPermissions(params),
      new Promise<null>((resolve) =>
        setTimeout(() => {
          safeLogger.warn('[OAuth] browser-app permission Drive lookup timed out', {
            pnIdHash: params.pnIdentifier ? hashIdentifier(params.pnIdentifier) : undefined,
            timeoutMs,
          });
          resolve(null);
        }, timeoutMs)
      ),
    ]);
  } catch {
    return null;
  }
}

/** Returns consent skip hint when browser-app grant is active on user Drive. */
export async function getBrowserAppExistingPermissions(params: {
  pnIdentifier?: string;
  did?: string;
}): Promise<{ ageShared: boolean } | null> {
  const ctx = await resolveOAuthDriveContext(params);
  if (!ctx) return null;

  try {
    const permissions = await ThirdPartyPermissionsService.getPermissions(
      ctx.userAccessToken,
      ctx.metadataFolderId,
      ctx.normalizedPn,
      ctx.accountId
    );

    const browserApp = permissions['browser-app'];
    const browserStatus = browserApp
      ? ThirdPartyPermissionsSheetsService.normalizePermissionStatus(browserApp.status)
      : null;
    if (browserApp && browserStatus === 'active') {
      safeLogger.info('[OAuth] Found active browser-app permissions on Drive', {
        ageShared: browserApp.dataPoints.includes('age_attestation'),
      });
      return {
        ageShared: browserApp.dataPoints.includes('age_attestation'),
      };
    }
    return null;
  } catch (error: unknown) {
    safeLogger.warn('[OAuth] Could not read third-party-permissions', {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
