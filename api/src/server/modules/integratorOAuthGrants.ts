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
import { applyStaticContract, getClientContract, normalizePermissionManifest } from '@par-noir/standard-data-points';
import { autoSubscribeCommunityOnIntegratorGrant } from './communityGrantHelper';

export async function persistIntegratorGrantAfterTokenExchange(params: {
  clientId: string;
  scopes: string[];
  tokenPayload: TokenPayload;
  userAccessToken: string;
  accountId?: string;
  /** User's per-data-point choices from consent; undefined when consent was skipped. */
  grantedDataPoints?: string[];
}): Promise<void> {
  const { clientId, scopes, tokenPayload, userAccessToken, accountId, grantedDataPoints } = params;
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
  const requestedDataPoints = dataPointIdsFromScopes(scopes);
  const prev = existing[clientId];
  const contract = getClientContract(clientId);

  // Only the data points this authorization asked about are rewritten from the
  // user's choice. Anything else the user has granted this app previously is
  // left alone, so a dashboard toggle is not undone by an unrelated unlock.
  const requested = new Set(requestedDataPoints);
  const carriedOver = (prev?.dataPoints || []).filter((d) => !requested.has(d));
  const chosen = grantedDataPoints
    ? grantedDataPoints.filter((d) => requested.has(d))
    : (prev?.dataPoints || []).filter((d) => requested.has(d));
  const dataPoints = [...new Set([...carriedOver, ...chosen])];

  // Record what the user was shown, so declining is remembered and only a
  // genuinely new request re-opens the consent screen.
  const consideredOptional = contract
    ? [...contract.optionalDataPoints]
    : [...new Set([...(prev?.optionalDataPoints || []), ...requestedDataPoints])];

  let permission: ThirdPartyPermission = {
    toolId: clientId,
    toolName: contract?.name || client?.name || clientId,
    toolDescription: contract?.description || client?.description || '',
    permissions: scopes,
    dataPoints,
    requiredDataPoints: prev?.requiredDataPoints || [],
    optionalDataPoints: consideredOptional,
    dataPointLevels: prev?.dataPointLevels,
    permissionManifest: normalizePermissionManifest(
      client?.permissionManifest || prev?.permissionManifest,
      scopes
    ),
    grantedAt: prev?.grantedAt || new Date().toISOString(),
    status: 'active',
    integratorFolderId
  };

  permission = applyStaticContract(clientId, permission);

  await ThirdPartyPermissionsService.storePermissions(
    userAccessToken,
    metadataFolderId,
    normalizedPn,
    { ...existing, [clientId]: permission },
    normalizedPn,
    accountId
  );

  try {
    await autoSubscribeCommunityOnIntegratorGrant({
      clientId,
      userAccessToken,
      metadataFolderId,
      normalizedPn,
      accountId
    });
  } catch (err) {
    safeLogger.warn('[OAuth] Community auto-subscribe failed (non-fatal)', {
      clientId,
      pnIdHash: hashIdentifier(normalizedPn)
    });
  }

  // storePermissions syncs the consent-skip hint for what it just wrote.
  safeLogger.info('[OAuth] Persisted integrator grant to Drive third-party-permissions', {
    clientId,
    pnIdHash: hashIdentifier(normalizedPn),
    status: permission.status,
  });
}
