/**
 * ZK data points for L5 integrators (OAuth bearer or API-key + user grant).
 * Grants and released proofs are server-owned rows; the user's cloud is not read.
 */

import {
  applyStaticContract,
  filterAllowedDataPointIds,
  getDataPointMinLevel,
  proofMeetsMinLevel,
} from '@par-noir/standard-data-points';
import { ThirdPartyPermissionsService, type ThirdPartyPermission } from './thirdPartyPermissionsService';

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
}): Promise<IntegratorZkpProofPayload[]> {
  const allowedIds = filterAllowedDataPointIds(params.dataPointIds);
  if (allowedIds.length === 0) return [];

  const stored = await ThirdPartyPermissionsService.getPermission(
    params.userPnIdentifier,
    params.clientId
  );
  if (!stored || stored.status !== 'active') return [];
  // Re-stamp the static contract so a stored row predating dataPointLevels
  // cannot downgrade the required verification level.
  const permission: ThirdPartyPermission = applyStaticContract(params.clientId, stored);
  const finalAllowed = allowedIds.filter(
    (dp) => permission.requiredDataPoints.includes(dp) || permission.dataPoints.includes(dp)
  );
  if (finalAllowed.length === 0) return [];

  const wanted = new Set(finalAllowed);
  const released = await ThirdPartyPermissionsService.getReleasedProofs(params.userPnIdentifier);
  return released
    .filter((proof) => wanted.has(proof.dataPointId))
    .filter((proof) =>
      proofMeetsMinLevel(
        proof.verificationLevel,
        getDataPointMinLevel(permission.dataPointLevels, proof.dataPointId)
      )
    )
    .map((proof) => ({
      dataPointId: proof.dataPointId,
      proofType: proof.proofType,
      zkpProof: proof.zkpProof,
      verifiedAt: proof.verifiedAt,
      expiresAt: proof.expiresAt,
      verificationLevel: proof.verificationLevel,
    }));
}

export async function grantDataPointsToClient(params: {
  userPnIdentifier: string;
  clientId: string;
  toolName: string;
  dataPointIds: string[];
}): Promise<void> {
  const existing = await ThirdPartyPermissionsService.getPermission(
    params.userPnIdentifier,
    params.clientId
  );
  const mergedDataPoints = [
    ...new Set([...(existing?.dataPoints || []), ...params.dataPointIds]),
  ];
  const now = new Date().toISOString();
  await ThirdPartyPermissionsService.storePermission(params.userPnIdentifier, {
    ...(existing || {
      toolId: params.clientId,
      toolName: params.toolName,
      toolDescription: '',
      permissions: ['data_points'],
      requiredDataPoints: [],
      optionalDataPoints: params.dataPointIds,
      grantedAt: now,
    }),
    dataPoints: mergedDataPoints,
    status: 'active',
    grantedAt: existing?.grantedAt || now,
  } as ThirdPartyPermission);
}
