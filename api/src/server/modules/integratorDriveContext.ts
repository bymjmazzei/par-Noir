/**
 * Resolves Drive proxy context for L5 integrator silo enforcement.
 */

import { getBearerTokenPayload } from '../middleware/authMiddleware';
import type { Request } from 'express';
import { googleDriveProxyService } from './googleDriveProxy';
import {
  IntegratorFolderService,
  IntegratorStorageError,
  lookupPnFolderLayout
} from './integratorFolderService';
import {
  isFirstPartyClient,
  normalizePnIdentifier,
  scopesIncludeCloudApp,
  SCOPE_CLOUD_APP
} from './integratorStoragePaths';
import { loadCachedFolderIds } from './pnDriveLayout';
import type { TokenPayload } from './pnOAuthService';

export interface IntegratorDriveContext {
  tokenPayload: TokenPayload;
  pnIdentifier: string;
  userIdentifier: string;
  accountId?: string;
  accessToken: string;
  isFirstParty: boolean;
  integratorFolderId?: string;
  metadataFolderId?: string;
  pnFolderId?: string;
}

export async function resolveIntegratorDriveContext(
  req: Request,
  accountIdFromBody?: string
): Promise<IntegratorDriveContext | { error: string; status: number; code?: string }> {
  const tokenPayload = getBearerTokenPayload(req);
  if (!tokenPayload) {
    return {
      error: 'Invalid or expired access token',
      status: 401
    };
  }

  const pnIdentifier = tokenPayload.pnIdentifier;
  if (!pnIdentifier) {
    return {
      error: 'Token must include pnIdentifier for storage access',
      status: 400
    };
  }

  const userIdentifier = normalizePnIdentifier(pnIdentifier);
  const accountId =
    accountIdFromBody ||
    (typeof req.query.accountId === 'string' ? req.query.accountId : undefined);

  let accessToken: string;
  try {
    accessToken = await googleDriveProxyService.getAccessToken(
      userIdentifier,
      accountId,
      [userIdentifier]
    );
  } catch {
    return {
      error: 'Could not retrieve Google Drive credentials',
      status: 401
    };
  }

  const isFirstParty = isFirstPartyClient(tokenPayload.clientId);
  const ctx: IntegratorDriveContext = {
    tokenPayload,
    pnIdentifier: userIdentifier,
    userIdentifier,
    accountId,
    accessToken,
    isFirstParty
  };

  if (isFirstParty) return ctx;

  if (!scopesIncludeCloudApp(tokenPayload.scope)) {
    return {
      error: `Integrator Drive access requires the ${SCOPE_CLOUD_APP} scope`,
      status: 403,
      code: 'insufficient_scope'
    };
  }

  const cached = await loadCachedFolderIds(userIdentifier);
  const layout =
    cached?.pnFolderId && cached?.metadataFolderId
      ? { pnFolderId: cached.pnFolderId, metadataFolderId: cached.metadataFolderId }
      : await lookupPnFolderLayout(accessToken, userIdentifier);

  if (!layout) {
    return {
      error: 'Google Drive pN folder is not initialized',
      status: 409,
      code: 'DRIVE_NOT_INITIALIZED'
    };
  }

  ctx.metadataFolderId = layout.metadataFolderId;
  ctx.pnFolderId = layout.pnFolderId;

  let integratorFolderId = await IntegratorFolderService.resolveIntegratorFolderId(
    accessToken,
    userIdentifier,
    tokenPayload.clientId,
    cached
  );

  if (!integratorFolderId) {
    const ensured = await IntegratorFolderService.ensureIntegratorFolder(
      accessToken,
      userIdentifier,
      tokenPayload.clientId,
      accountId,
      cached
    );
    integratorFolderId = ensured.integratorFolderId;
    ctx.metadataFolderId = ensured.metadataFolderId;
    ctx.pnFolderId = ensured.pnFolderId;
  }

  ctx.integratorFolderId = integratorFolderId;
  return ctx;
}

export function integratorStorageErrorResponse(err: unknown): {
  status: number;
  body: Record<string, string>;
} {
  if (err instanceof IntegratorStorageError) {
    const status =
      err.code === 'DRIVE_NOT_INITIALIZED'
        ? 409
        : err.code === 'MISSING_SCOPE'
          ? 403
          : 403;
    return {
      status,
      body: {
        error: err.code.toLowerCase(),
        error_description: err.message
      }
    };
  }
  throw err;
}
