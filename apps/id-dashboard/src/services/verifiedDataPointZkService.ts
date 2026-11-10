/**
 * Issue ZK v2 envelopes for ID-verified data points left in the local queue (verified house).
 * Issuance requires unlocked identity with ML-DSA keys.
 */

import type { EncryptedIdentity } from '@par-noir/identity-crypto';
import { loadMlDsaKeypairForZk } from '../utils/zkPqcSigning';

const QUEUE_KEY = 'pn_verified_datapoint_zk_queue';

export interface VerifiedDataPointQueueEntry {
  verificationId: string;
  verifiedAt: string;
  dataPoints: Array<{
    dataPointId: string;
    value: string;
    verificationLevel: 'verified';
  }>;
}

export function listQueuedVerifiedDataPoints(): VerifiedDataPointQueueEntry[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as VerifiedDataPointQueueEntry[]) : [];
  } catch {
    return [];
  }
}

export async function issueVerifiedZkpsForQueue(params: {
  identityId: string;
  encryptedIdentity: EncryptedIdentity;
  verificationId: string;
}): Promise<string[]> {
  const queue = listQueuedVerifiedDataPoints();
  const entry = queue.find((e) => e.verificationId === params.verificationId);
  if (!entry) return [];

  const { mlDsaSecretKey, mlDsaPublicKey } = await loadMlDsaKeypairForZk(
    params.identityId,
    params.encryptedIdentity
  );

  const { generateZkProofEnvelopeV2 } = await import('@par-noir/zk-protocol-v2');
  const proofs: string[] = [];
  const expiresAtMs = Date.now() + 365 * 24 * 60 * 60 * 1000;

  for (const dp of entry.dataPoints) {
    const proof = generateZkProofEnvelopeV2({
      mlDsaSecretKey,
      mlDsaPublicKey,
      context: `par-noir.zkp.${dp.dataPointId}`,
      public_inputs: {
        zkp_type: dp.dataPointId,
        data_point_id: dp.dataPointId,
        verification_level: dp.verificationLevel,
        provider_verification_id: params.verificationId,
        verified_at: entry.verifiedAt
      },
      expiresAtMs
    });
    proofs.push(proof);
  }

  const remaining = queue.filter((e) => e.verificationId !== params.verificationId);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  return proofs;
}
