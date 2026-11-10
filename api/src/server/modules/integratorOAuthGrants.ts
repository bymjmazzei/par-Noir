/**
 * OAuth grants: what each client may read for a pN, and what the user was asked.
 */

import { ClientRegistrationService } from './clientRegistration';
import { dataPointIdsFromScopes, normalizePnIdentifier } from './integratorStoragePaths';
import {
  ThirdPartyPermission,
  ThirdPartyPermissionsService
} from './thirdPartyPermissionsService';
import { hashIdentifier, safeLogger } from '../../utils/logger';
import { applyStaticContract, getClientContract, normalizePermissionManifest } from '@par-noir/standard-data-points';

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

export async function getExistingGrant(
  clientId: string,
  pnIdentifier: string
): Promise<ExistingGrant | null> {
  const permission = await ThirdPartyPermissionsService.getPermission(
    normalizePnIdentifier(pnIdentifier),
    clientId
  );
  if (!permission || permission.status !== 'active') return null;
  const dataPoints = [...(permission.dataPoints ?? [])];
  return {
    dataPoints,
    consideredDataPoints: [
      ...new Set([
        ...(permission.requiredDataPoints ?? []),
        ...(permission.optionalDataPoints ?? []),
        ...dataPoints,
      ]),
    ],
  };
}

export async function persistIntegratorGrant(params: {
  clientId: string;
  scopes: string[];
  pnIdentifier: string;
  /** User's per-data-point choices from consent; undefined when consent was skipped. */
  grantedDataPoints?: string[];
}): Promise<void> {
  const { clientId, scopes, grantedDataPoints } = params;
  const normalizedPn = normalizePnIdentifier(params.pnIdentifier);

  const client = await ClientRegistrationService.getClient(clientId);
  const requestedDataPoints = dataPointIdsFromScopes(scopes);
  const prev = await ThirdPartyPermissionsService.getPermission(normalizedPn, clientId);
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
  };

  permission = applyStaticContract(clientId, permission);
  await ThirdPartyPermissionsService.storePermission(normalizedPn, permission);

  safeLogger.info('[OAuth] Persisted integrator grant', {
    clientId,
    pnIdHash: hashIdentifier(normalizedPn),
    dataPointCount: permission.dataPoints.length,
  });
}
