/**
 * Queue and issue ZK v2 envelopes for Veriff-verified data points (verified house).
 * Issuance requires unlocked identity with ML-DSA keys.
 */

import { generateZkProofEnvelopeV2 } from '@par-noir/zk-protocol-v2';
import type { EncryptedIdentity } from '../utils/crypto';
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

export function queueVerifiedDataPoints(entry: VerifiedDataPointQueueEntry): void {
  const list = listQueuedVerifiedDataPoints();
  list.push(entry);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(list));
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
        veriff_verification_id: params.verificationId,
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

/** Map Veriff extracted fields to standard verified data point queue entries. */
export function queueFromVeriffResult(
  verificationId: string,
  extracted: {
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
    documentType?: string;
    country?: string;
  }
): void {
  const dataPoints: VerifiedDataPointQueueEntry['dataPoints'] = [
    { dataPointId: 'identity_attestation', value: 'verified', verificationLevel: 'verified' }
  ];
  if (extracted.firstName) {
    dataPoints.push({ dataPointId: 'first_name', value: extracted.firstName, verificationLevel: 'verified' });
  }
  if (extracted.lastName) {
    dataPoints.push({ dataPointId: 'last_name', value: extracted.lastName, verificationLevel: 'verified' });
  }
  if (extracted.dateOfBirth) {
    dataPoints.push({ dataPointId: 'date_of_birth', value: extracted.dateOfBirth, verificationLevel: 'verified' });
  }
  queueVerifiedDataPoints({
    verificationId,
    verifiedAt: new Date().toISOString(),
    dataPoints
  });
}
