/**
 * Persist third-party permissions and integrator folders after OAuth token exchange.
 */

import { ClientRegistrationService } from './clientRegistration';
import { IntegratorFolderService } from './integratorFolderService';
import {
  dataPointIdsFromScopes,
  isFirstPartyClient,
  normalizePnIdentifier,
  scopesIncludeCloudApp
} from './integratorStoragePaths';
import {
  ThirdPartyPermission,
  ThirdPartyPermissionsService
} from './thirdPartyPermissionsService';
import { isPnDriveIndexComplete, loadPnDriveIndex } from './pnDriveIndex';
import type { TokenPayload } from './pnOAuthService';
import { hashIdentifier, safeLogger } from '../../utils/logger';
import {
  applyBrowserAppStaticContract,
  browserAppOver21Shared,
} from '@par-noir/standard-data-points';

export async function persistIntegratorGrantAfterTokenExchange(params: {
  clientId: string;
  scopes: string[];
  tokenPayload: TokenPayload;
  userAccessToken: string;
  accountId?: string;
  ageShared?: boolean;
}): Promise<void> {
  const { clientId, scopes, tokenPayload, userAccessToken, accountId, ageShared } = params;
  const pnIdentifier = tokenPayload.pnIdentifier;
  if (!pnIdentifier) return;

  const normalizedPn = normalizePnIdentifier(pnIdentifier);
  const index = await loadPnDriveIndex(normalizedPn);
  if (!isPnDriveIndexComplete(index)) return;

  const { metadataFolderId } = index;
  const existing = await ThirdPartyPermissionsService.getPermissions(
    userAccessToken,
    metadataFolderId,
    normalizedPn,
    accountId
  );

  let integratorFolderId: string | undefined =
    existing[clientId]?.integratorFolderId;

  if (scopesIncludeCloudApp(scopes) && !isFirstPartyClient(clientId)) {
    const folder = await IntegratorFolderService.ensureIntegratorFolder(
      userAccessToken,
      normalizedPn,
      clientId,
      accountId,
      index
    );
    integratorFolderId = folder.integratorFolderId;
  }

  const client = await ClientRegistrationService.getClient(clientId);
  const dataPointsFromScopes = dataPointIdsFromScopes(scopes);
  const prev = existing[clientId];

  let dataPoints = [...new Set([...(prev?.dataPoints || []), ...dataPointsFromScopes])];
  // age_shared / ageShared = user granted over_21 for browser NSFW
  if (clientId === 'browser-app' && ageShared === true && !dataPoints.includes('over_21')) {
    dataPoints = [...dataPoints, 'over_21'];
  } else if (clientId === 'browser-app' && ageShared === false) {
    dataPoints = dataPoints.filter((d) => d !== 'over_21' && d !== 'age_attestation');
  }

  let permission: ThirdPartyPermission = {
    toolId: clientId,
    toolName: client?.name || clientId,
    toolDescription: client?.description || '',
    permissions: scopes,
    dataPoints,
    requiredDataPoints: prev?.requiredDataPoints || [],
    optionalDataPoints: prev?.optionalDataPoints || [],
    dataPointLevels: prev?.dataPointLevels,
    grantedAt: prev?.grantedAt || new Date().toISOString(),
    status: 'active',
    integratorFolderId
  };

  if (clientId === 'browser-app') {
    permission = applyBrowserAppStaticContract(permission);
  }

  await ThirdPartyPermissionsService.storePermissions(
    userAccessToken,
    metadataFolderId,
    normalizedPn,
    { ...existing, [clientId]: permission },
    normalizedPn,
    accountId
  );

  if (clientId === 'browser-app') {
    const { setCachedBrowserAppPermissions } = await import('./oauthPermissionCache');
    await setCachedBrowserAppPermissions(normalizedPn, {
      ageShared: browserAppOver21Shared(permission.dataPoints),
    });
  }

  safeLogger.info('[OAuth] Persisted integrator grant to Drive third-party-permissions', {
    clientId,
    pnIdHash: hashIdentifier(normalizedPn),
    status: permission.status,
  });
}
