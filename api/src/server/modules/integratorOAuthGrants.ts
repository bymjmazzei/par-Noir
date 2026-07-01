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
  if (clientId === 'browser-app' && ageShared === true && !dataPoints.includes('age_attestation')) {
    dataPoints = [...dataPoints, 'age_attestation'];
  } else if (clientId === 'browser-app' && ageShared === false) {
    dataPoints = dataPoints.filter((d) => d !== 'age_attestation');
  }

  const permission: ThirdPartyPermission = {
    toolId: clientId,
    toolName: client?.name || clientId,
    toolDescription: client?.description || '',
    permissions: scopes,
    dataPoints,
    requiredDataPoints:
      clientId === 'browser-app' ? [] : prev?.requiredDataPoints || [],
    optionalDataPoints:
      clientId === 'browser-app'
        ? ['age_attestation']
        : prev?.optionalDataPoints || [],
    grantedAt: prev?.grantedAt || new Date().toISOString(),
    status: 'active',
    integratorFolderId
  };

  await ThirdPartyPermissionsService.storePermissions(
    userAccessToken,
    metadataFolderId,
    normalizedPn,
    { ...existing, [clientId]: permission },
    normalizedPn,
    accountId
  );

  safeLogger.info('[OAuth] Persisted integrator grant to Drive third-party-permissions', {
    clientId,
    pnIdHash: hashIdentifier(normalizedPn),
    status: permission.status,
  });
}
