/**
 * Resolve Google Drive + metadata layout for OAuth permission read/write.
 * Uses credential candidate lookup (pn + DID) consistent with googleDriveProxy.
 *
 * Under custody: forwarded X-PN-Cloud-Access-Token + complete pnDriveIndex
 * (incomplete index is bootstrapped via ensureCompletePnDriveIndex, not aborted).
 */

import type { Request } from 'express';
import {
  isPnDriveIndexComplete,
  readPnDriveIndex,
  PN_DRIVE_SHEET_KEYS,
  DriveIndexError
} from './pnDriveIndex';
import { normalizePnIdentifier } from './integratorStoragePaths';
import { storageCredentialsService, type StoredCredentialsRecord } from './storageCredentialsService';
import { ThirdPartyPermissionsService } from './thirdPartyPermissionsService';
import { isPortableStorageProvider } from './storage/storageProviderUtils';
import { hashIdentifier, safeLogger } from '../../utils/logger';
import { getCachedGrant, setCachedGrant } from './oauthPermissionCache';
import { extractCloudAccessToken } from './cloudAccessToken';

export interface OAuthDrivePermissionContext {
  credentialsRecord: StoredCredentialsRecord;
  userAccessToken: string;
  accountId: string | undefined;
  metadataFolderId: string;
  thirdPartyPermissionsSheetId: string;
  normalizedPn: string;
}

export type OAuthDriveResolveFailure =
  | 'cloud_token_required'
  | 'drive_index_incomplete'
  | 'no_credentials'
  | 'unknown';

export type OAuthDriveResolveResult =
  | { ok: true; ctx: OAuthDrivePermissionContext }
  | { ok: false; reason: OAuthDriveResolveFailure };

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
 * Prefer this when callers need distinct failure reasons (grant persist).
 */
export async function resolveOAuthDriveContextDetailed(
  req: Request,
  params: {
    pnIdentifier?: string;
    did?: string;
  }
): Promise<OAuthDriveResolveResult> {
  const candidates = buildOAuthIdentityCandidates(params);
  if (candidates.length === 0) {
    return { ok: false, reason: 'no_credentials' };
  }

  const credentialsRecord = await storageCredentialsService.findCredentialsByIdentityCandidates(candidates);
  if (!credentialsRecord?.credentials) {
    return { ok: false, reason: 'no_credentials' };
  }

  const normalizedPn = params.pnIdentifier
    ? normalizePnIdentifier(params.pnIdentifier)
    : normalizePnIdentifier(credentialsRecord.identityId);

  const account = pickGoogleDriveAccount(credentialsRecord.credentials as Record<string, unknown>);
  if (!account) {
    return { ok: false, reason: 'no_credentials' };
  }

  const accountId = extractDriveAccountId(account);

  let userAccessToken: string;
  try {
    const { resolveOwnerDriveToken } = await import('./ownerDriveToken');
    const resolved = await resolveOwnerDriveToken(req, normalizedPn, { account, accountId });
    userAccessToken = resolved.token.access_token;
  } catch (error: unknown) {
    const code = (error as { code?: string } | null)?.code;
    if (code === 'CLOUD_TOKEN_REQUIRED') {
      safeLogger.warn('[OAuth] No forwarded cloud access token — grant path unavailable', {
        reason: 'cloud_token_required',
        pnIdHash: hashIdentifier(normalizedPn),
      });
      return { ok: false, reason: 'cloud_token_required' };
    }
    safeLogger.warn('[OAuth] resolveOAuthDriveContext token resolve failed', {
      reason: code || 'unknown',
      message: error instanceof Error ? error.message : String(error),
      pnIdHash: hashIdentifier(normalizedPn),
    });
    return { ok: false, reason: 'unknown' };
  }

  let credentials = credentialsRecord.credentials as Record<string, unknown>;
  let index = readPnDriveIndex(credentials);

  if (!isPnDriveIndexComplete(index)) {
    safeLogger.warn('[OAuth] Drive index incomplete — bootstrapping with forwarded token', {
      reason: 'drive_index_incomplete',
      pnIdHash: hashIdentifier(normalizedPn),
    });
    try {
      const { ensureCompletePnDriveIndex } = await import('./driveInitSteps');
      await ensureCompletePnDriveIndex({
        token: { access_token: userAccessToken },
        pnIdentifier: normalizedPn,
        accountId,
        credentials,
        identityId: credentialsRecord.identityId || normalizedPn,
        logPrefix: '[OAuth ensureCompletePnDriveIndex]',
      });
      const refreshed = await storageCredentialsService.getCredentials(normalizedPn);
      if (refreshed?.credentials) {
        credentialsRecord.credentials = refreshed.credentials;
        credentials = refreshed.credentials as Record<string, unknown>;
      }
      index = readPnDriveIndex(credentials);
    } catch (ensureErr: unknown) {
      safeLogger.warn('[OAuth] ensureCompletePnDriveIndex failed', {
        reason: 'drive_index_incomplete',
        message: ensureErr instanceof Error ? ensureErr.message : String(ensureErr),
        pnIdHash: hashIdentifier(normalizedPn),
      });
      return { ok: false, reason: 'drive_index_incomplete' };
    }
  }

  if (!isPnDriveIndexComplete(index)) {
    safeLogger.warn('[OAuth] Drive index still incomplete after ensure', {
      reason: 'drive_index_incomplete',
      pnIdHash: hashIdentifier(normalizedPn),
    });
    return { ok: false, reason: 'drive_index_incomplete' };
  }

  return {
    ok: true,
    ctx: {
      credentialsRecord,
      userAccessToken,
      accountId,
      metadataFolderId: index.metadataFolderId,
      thirdPartyPermissionsSheetId: index.sheetIds[PN_DRIVE_SHEET_KEYS.THIRD_PARTY_PERMISSIONS],
      normalizedPn,
    },
  };
}

/**
 * Resolve Drive access token + _metadata folder for OAuth flows.
 *
 * Under device cloud custody the server holds no Google secrets, so the owner's
 * token must arrive as a forwarded X-PN-Cloud-Access-Token. `resolveOwnerDriveToken`
 * is the single resolver for that; do not reintroduce a direct proxy call here.
 */
export async function resolveOAuthDriveContext(
  req: Request,
  params: {
    pnIdentifier?: string;
    did?: string;
  }
): Promise<OAuthDrivePermissionContext | null> {
  const result = await resolveOAuthDriveContextDetailed(req, params);
  return result.ok ? result.ctx : null;
}

export const GRANT_LOOKUP_TIMEOUT_MS = 5_000;

export interface ExistingGrant {
  /** Data points the user chose to share. */
  dataPoints: string[];
  /**
   * Data points the user was shown at consent time, whether or not they shared
   * them. Declining is a decision we remember; only a genuinely new request
   * sends the user back to the consent screen.
   */
  consideredDataPoints: string[];
}

function activeGrant(
  clientId: string,
  permission:
    | {
        status: string;
        dataPoints?: string[];
        requiredDataPoints?: string[];
        optionalDataPoints?: string[];
      }
    | undefined
): ExistingGrant | null {
  if (!permission || permission.status !== 'active') return null;
  const dataPoints = [...(permission.dataPoints ?? [])];
  const consideredDataPoints = [
    ...new Set([
      ...(permission.requiredDataPoints ?? []),
      ...(permission.optionalDataPoints ?? []),
      ...dataPoints,
    ]),
  ];
  safeLogger.info('[OAuth] Found active grant', {
    clientId,
    dataPointCount: dataPoints.length,
    consideredCount: consideredDataPoints.length,
  });
  return { dataPoints, consideredDataPoints };
}

async function lookupGrantFromDrive(
  req: Request,
  clientId: string,
  params: { pnIdentifier?: string; did?: string }
): Promise<ExistingGrant | null> {
  const candidates = buildOAuthIdentityCandidates(params);
  if (candidates.length === 0) return null;

  const credentialsRecord = await storageCredentialsService.findCredentialsByIdentityCandidates(candidates);
  if (!credentialsRecord?.credentials) return null;

  const normalizedPn = params.pnIdentifier
    ? normalizePnIdentifier(params.pnIdentifier)
    : normalizePnIdentifier(credentialsRecord.identityId);

  try {
    if (await isPortableStorageProvider(normalizedPn)) {
      const permissions = await ThirdPartyPermissionsService.getPermissions(
        '',
        '',
        normalizedPn
      );
      return activeGrant(clientId, permissions[clientId]);
    }

    const ctx = await resolveOAuthDriveContext(req, params);
    if (!ctx) return null;

    const permissions = await ThirdPartyPermissionsService.getPermissions(
      ctx.userAccessToken,
      ctx.metadataFolderId,
      ctx.normalizedPn,
      ctx.accountId,
      ctx.thirdPartyPermissionsSheetId
    );
    return activeGrant(clientId, permissions[clientId]);
  } catch (error: unknown) {
    // "Google refused the token" is not "the user has no grant". Let it out so
    // callers can say so, instead of silently sending the user back to consent.
    if (error instanceof DriveIndexError && error.code === 'CLOUD_TOKEN_EXPIRED') {
      safeLogger.warn('[OAuth] Grant lookup blocked by an expired Drive token', {
        clientId,
        reason: 'cloud_token_expired',
        pnIdHash: hashIdentifier(normalizedPn),
      });
      throw error;
    }
    safeLogger.warn('[OAuth] Could not read third-party-permissions', {
      clientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Consent-skip hint for a client. Cache first; Drive only when the device
 * forwarded X-PN-Cloud-Access-Token (or portable path needs no Drive AT).
 *
 * Unlock brokers (desktop/Cap/web unlock page) mint the code *before* browse
 * hydrates the cloud vault — probing Drive there stalls unlock and falsely
 * looks like "no grant" / re-prompt. Defer authoritative Drive reads until
 * post-handoff grant persist with a cloud token.
 */
export async function getExistingGrant(
  req: Request,
  clientId: string,
  params: { pnIdentifier?: string; did?: string }
): Promise<ExistingGrant | null> {
  const normalizedPn = params.pnIdentifier
    ? normalizePnIdentifier(params.pnIdentifier)
    : undefined;
  if (normalizedPn) {
    const cached = await getCachedGrant(clientId, normalizedPn);
    if (cached) return cached;
  }

  const hasCloudToken = Boolean(extractCloudAccessToken(req));
  if (!hasCloudToken) {
    if (normalizedPn && (await isPortableStorageProvider(normalizedPn))) {
      try {
        const permissions = await ThirdPartyPermissionsService.getPermissions(
          '',
          '',
          normalizedPn
        );
        const grant = activeGrant(clientId, permissions[clientId]);
        if (grant) await setCachedGrant(clientId, normalizedPn, grant);
        return grant;
      } catch (error: unknown) {
        safeLogger.warn('[OAuth] Portable grant lookup failed during unlock', {
          clientId,
          message: error instanceof Error ? error.message : String(error),
          pnIdHash: hashIdentifier(normalizedPn),
        });
        return null;
      }
    }
    safeLogger.info('[OAuth] Grant lookup deferred — no cloud token on unlock path', {
      clientId,
      pnIdHash: normalizedPn ? hashIdentifier(normalizedPn) : undefined,
    });
    return null;
  }

  const result = await lookupGrantFromDrive(req, clientId, params);
  if (normalizedPn && result) {
    await setCachedGrant(clientId, normalizedPn, result);
  }
  return result;
}

/** Race the lookup; returns null on timeout so unlock is not blocked by slow Drive. */
export async function getExistingGrantWithTimeout(
  req: Request,
  clientId: string,
  params: { pnIdentifier?: string; did?: string },
  timeoutMs: number = GRANT_LOOKUP_TIMEOUT_MS
): Promise<ExistingGrant | null> {
  // No cloud token → getExistingGrant is cache/portable only; do not burn the
  // 5s timeout waiting for a Drive path that cannot run under custody.
  if (!extractCloudAccessToken(req)) {
    try {
      return await getExistingGrant(req, clientId, params);
    } catch (error: unknown) {
      safeLogger.warn('[OAuth] Grant lookup failed during unlock', {
        clientId,
        reason:
          error instanceof DriveIndexError ? error.code.toLowerCase() : 'unknown',
        pnIdHash: params.pnIdentifier ? hashIdentifier(params.pnIdentifier) : undefined,
      });
      return null;
    }
  }

  try {
    return await Promise.race([
      getExistingGrant(req, clientId, params),
      new Promise<null>((resolve) =>
        setTimeout(() => {
          safeLogger.warn('[OAuth] grant lookup timed out', {
            clientId,
            pnIdHash: params.pnIdentifier ? hashIdentifier(params.pnIdentifier) : undefined,
            timeoutMs,
          });
          resolve(null);
        }, timeoutMs)
      ),
    ]);
  } catch (error: unknown) {
    // Unlock must not fail because the grant could not be read, but the reason
    // has to be visible: a silent null here reads as "first time consent".
    safeLogger.warn('[OAuth] Grant lookup failed during unlock', {
      clientId,
      reason:
        error instanceof DriveIndexError ? error.code.toLowerCase() : 'unknown',
      pnIdHash: params.pnIdentifier ? hashIdentifier(params.pnIdentifier) : undefined,
    });
    return null;
  }
}
