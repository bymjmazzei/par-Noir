/**
 * ZK proofs the owner releases to the API for apps they granted. The API never
 * reads the owner's cloud, so the device lists held Knowledge claims and hands
 * over only the proofs for granted data points (never the raw answers).
 */

import { findPnRootFolderId } from './deviceDriveFind.js';
import { listDeviceKnowledgeClaims } from './knowledgeClaimDoc.js';
import { getSessionDriveIndex } from './sessionMemory.js';

export type ReleasableProof = {
  dataPointId: string;
  proofType: string;
  zkpProof: string;
  verifiedAt: string;
  expiresAt?: string;
  verificationLevel: 'basic' | 'enhanced' | 'verified';
  provider: string;
};

type GrantLike = {
  status?: string;
  dataPoints?: string[];
  requiredDataPoints?: string[];
};

/** Data points shared with at least one active grant. */
export function grantedDataPointIds(permissions: Record<string, GrantLike> | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const grant of Object.values(permissions || {})) {
    if (grant?.status !== 'active') continue;
    for (const id of [...(grant.dataPoints || []), ...(grant.requiredDataPoints || [])]) out.add(id);
  }
  return out;
}

/** Held, unexpired proofs for the given data points. Empty when the pN has no cloud root yet. */
export async function heldProofsFor(params: {
  accessToken: string;
  pnIdentifier: string;
  dataPointIds: Iterable<string>;
  fetchImpl?: typeof fetch;
}): Promise<ReleasableProof[]> {
  const wanted = new Set(params.dataPointIds);
  if (wanted.size === 0) return [];
  const pnFolderId =
    getSessionDriveIndex(params.pnIdentifier)?.pnFolderId ||
    (await findPnRootFolderId(params.accessToken, params.pnIdentifier, params.fetchImpl));
  if (!pnFolderId) return [];
  const now = Date.now();
  return (await listDeviceKnowledgeClaims({ accessToken: params.accessToken, pnFolderId }))
    .filter((c) => wanted.has(c.dataPointId))
    .filter((c) => !c.expiresAt || new Date(c.expiresAt).getTime() >= now)
    .map((c) => ({
      dataPointId: c.dataPointId,
      proofType: c.proofType,
      zkpProof: c.zkpProof,
      verifiedAt: c.verifiedAt,
      expiresAt: c.expiresAt,
      verificationLevel: c.verificationLevel,
      provider: c.provider,
    }));
}
