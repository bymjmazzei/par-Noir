/**
 * Fetch ZKP data points for L5 integrators (OAuth bearer or API-key + user grant).
 */

import { ThirdPartyPermissionsService } from './thirdPartyPermissionsService';
import { ZKPDataPointsService } from './zkpDataPointsService';
import { getUserDriveMetadataContext, normalizePnIdentifier } from './driveMetadataHelper';
import { filterAllowedDataPointIds } from '@par-noir/standard-data-points';
import { loadZkpBundle } from './storage/zkpStorageService';

export interface IntegratorZkpProofPayload {
  dataPointId: string;
  proofType: string;
  zkpProof: string;
  verifiedAt: string;
  expiresAt?: string;
  verificationLevel: string;
}

export async function fetchGrantedZkpProofs(params: {
  userPnIdentifier: string;
  clientId: string;
  dataPointIds: string[];
  skipPermissionCheck?: boolean;
}): Promise<IntegratorZkpProofPayload[]> {
  const zkpBundle = await loadZkpBundle(params.userPnIdentifier);
  if (!zkpBundle) {
    return [];
  }

  const allowedIds = filterAllowedDataPointIds(params.dataPointIds);
  if (allowedIds.length === 0) {
    return [];
  }

  let finalAllowed = allowedIds;

  if (!params.skipPermissionCheck && params.clientId !== 'browser-app') {
    const ctx = await getUserDriveMetadataContext(params.userPnIdentifier);
    if (!ctx) {
      return [];
    }

    const permissions = await ThirdPartyPermissionsService.getPermissions(
      ctx.accessToken,
      ctx.metadataFolderId,
      ctx.normalizedPnIdentifier,
      ctx.accountId
    );

    const toolPermission = permissions[params.clientId];
    if (!toolPermission || toolPermission.status !== 'active') {
      return [];
    }

    finalAllowed = allowedIds.filter(
      (dp) =>
        toolPermission.requiredDataPoints.includes(dp) || toolPermission.dataPoints.includes(dp)
    );
  }

  const results: IntegratorZkpProofPayload[] = [];

  for (const dataPointId of finalAllowed) {
    try {
      const proof = await ZKPDataPointsService.getDataPointProof(
        zkpBundle.token?.access_token || '',
        zkpBundle.spreadsheetId || '',
        dataPointId,
        zkpBundle.pnIdentifier,
        zkpBundle.accountId
      );

      if (proof) {
        results.push({
          dataPointId: proof.dataPointId,
          proofType: proof.proofType,
          zkpProof: proof.zkpProof,
          verifiedAt: proof.verifiedAt,
          expiresAt: proof.expiresAt,
          verificationLevel: proof.verificationLevel
        });
      }
    } catch {
      // Continue with other data points
    }
  }

  return results;
}

export async function grantDataPointsToClient(params: {
  userPnIdentifier: string;
  clientId: string;
  toolName: string;
  dataPointIds: string[];
}): Promise<void> {
  const ctx = await getUserDriveMetadataContext(params.userPnIdentifier);
  if (!ctx) {
    throw new Error('User Drive not connected');
  }

  const permissions = await ThirdPartyPermissionsService.getPermissions(
    ctx.accessToken,
    ctx.metadataFolderId,
    ctx.normalizedPnIdentifier,
    ctx.accountId
  );

  const existing = permissions[params.clientId];
  const mergedDataPoints = [
    ...new Set([...(existing?.dataPoints || []), ...params.dataPointIds])
  ];

  const updated = {
    ...(existing || {
      toolId: params.clientId,
      toolName: params.toolName,
      toolDescription: '',
      permissions: ['data_points'],
      requiredDataPoints: [],
      optionalDataPoints: params.dataPointIds,
      grantedAt: new Date().toISOString(),
      status: 'active' as const
    }),
    dataPoints: mergedDataPoints,
    status: 'active' as const,
    grantedAt: existing?.grantedAt || new Date().toISOString()
  };

  await ThirdPartyPermissionsService.storePermissions(
    ctx.accessToken,
    ctx.metadataFolderId,
    normalizePnIdentifier(params.userPnIdentifier),
    { [params.clientId]: updated },
    ctx.normalizedPnIdentifier,
    ctx.accountId
  );
}
