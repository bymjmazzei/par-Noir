/**
 * ZKP Data Points Service
 * Returns a pN's held ZK proofs (never the underlying identity data).
 * Proofs live on the pN's Pen Knowledge claim docs in their Drive.
 */

import {
  ageBucketMeetsMinimum,
  decodeEnvelopeFromProofString,
  isZkProofEnvelopeV1,
  verifyZkProofEnvelopeV1,
} from '@par-noir/zk-protocol-v1';
import { isZkProofEnvelopeV2, verifyZkProofEnvelopeV2 } from '@par-noir/zk-protocol-v2';
import { listKnowledgeProofs, type HeldKnowledgeProof } from './knowledgeProofsDrive';
import type { ZkpStorageBundle } from './storage/zkpStorageService';

export type ZKPDataPoint = HeldKnowledgeProof;

export interface ZKPVerificationResult {
  isValid: boolean;
  condition?: string; // e.g., "age >= 18"
  verifiedAt?: string;
  expiresAt?: string;
  error?: string;
  /** True when predecessor-key proof accepted during post-migration grace window */
  successionGraceApplied?: boolean;
}

export class ZKPDataPointsService {
  /** Every held, unexpired proof on the pN's Knowledge docs (one per data point, newest doc wins). */
  static async getHeldProofs(bundle: ZkpStorageBundle): Promise<ZKPDataPoint[]> {
    if (!bundle.token?.access_token) return [];
    const proofs = await listKnowledgeProofs({
      token: bundle.token,
      pnFolderId: bundle.pnFolderId,
      pnIdentifier: bundle.pnIdentifier,
      accountId: bundle.accountId,
    });
    const now = Date.now();
    const byId = new Map<string, ZKPDataPoint>();
    for (const proof of proofs) {
      if (proof.expiresAt && new Date(proof.expiresAt).getTime() < now) continue;
      if (!byId.has(proof.dataPointId)) byId.set(proof.dataPointId, proof);
    }
    return [...byId.values()];
  }

  /** Proof metadata only, never the proof body or the underlying data. */
  static async getAvailableDataPoints(bundle: ZkpStorageBundle): Promise<Array<{
    dataPointId: string;
    proofType: string;
    verifiedAt: string;
    expiresAt?: string;
    verificationLevel: string;
  }>> {
    return (await this.getHeldProofs(bundle)).map((dp) => ({
      dataPointId: dp.dataPointId,
      proofType: dp.proofType,
      verifiedAt: dp.verifiedAt,
      expiresAt: dp.expiresAt,
      verificationLevel: dp.verificationLevel,
    }));
  }

  static async getDataPointProof(bundle: ZkpStorageBundle, dataPointId: string): Promise<ZKPDataPoint | null> {
    try {
      return (await this.getHeldProofs(bundle)).find((dp) => dp.dataPointId === dataPointId) || null;
    } catch (error) {
      console.error('Error reading ZKP proof from Knowledge docs:', error);
      return null;
    }
  }

  /**
   * Verify ZKP v2 (preferred) or v1 (legacy stored proofs). Legacy unstructured JSON blobs are rejected.
   */
  static async verifyProof(
    zkpProof: string,
    condition: string,
    opts?: { successorPnIdentifier?: string }
  ): Promise<ZKPVerificationResult> {
    try {
      const env = decodeEnvelopeFromProofString(zkpProof);
      if (!env || typeof env !== 'object') {
        return { isValid: false, condition, error: 'invalid_envelope' };
      }

      let cryptoOk: boolean;
      let cryptoReason: string | undefined;
      let expiresAtMs: number;
      let pub: Record<string, unknown>;

      if (isZkProofEnvelopeV2(env)) {
        const r = verifyZkProofEnvelopeV2(zkpProof);
        cryptoOk = r.ok;
        cryptoReason = r.reason;
        expiresAtMs = env.expires_at_ms;
        pub = env.public_inputs as Record<string, unknown>;
      } else if (isZkProofEnvelopeV1(env)) {
        const r = verifyZkProofEnvelopeV1(zkpProof);
        cryptoOk = r.ok;
        cryptoReason = r.reason;
        expiresAtMs = env.expires_at_ms;
        pub = env.public_inputs as Record<string, unknown>;
      } else {
        return { isValid: false, condition, error: 'invalid_envelope' };
      }

      if (!cryptoOk) {
        return {
          isValid: false,
          condition,
          error: cryptoReason ?? 'verify_failed',
        };
      }

      const expiresAt = new Date(expiresAtMs).toISOString();

      if (condition.startsWith('age >= ')) {
        const minAge = parseInt(condition.replace('age >= ', ''), 10);
        if (Number.isNaN(minAge)) {
          return { isValid: false, condition, error: 'invalid_condition' };
        }
        const zkpType = typeof pub.zkp_type === 'string' ? pub.zkp_type : '';
        if (zkpType !== 'age_verification') {
          return { isValid: false, condition, error: 'proof_type_mismatch' };
        }
        const bucket = typeof pub.age_bucket === 'string' ? pub.age_bucket : '';
        const isValid = ageBucketMeetsMinimum(bucket, minAge);
        return {
          isValid,
          condition,
          verifiedAt: new Date().toISOString(),
          expiresAt,
        };
      }

      let successionGraceApplied = false;
      if (opts?.successorPnIdentifier) {
        const { findLineageMigrationForSuccessor } = await import('./identityMigrationService');
        const lineage = await findLineageMigrationForSuccessor(opts.successorPnIdentifier);
        successionGraceApplied = lineage !== null;
      }

      return {
        isValid: true,
        condition,
        verifiedAt: new Date().toISOString(),
        expiresAt,
        ...(successionGraceApplied ? { successionGraceApplied: true } : {}),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Invalid proof format';
      return {
        isValid: false,
        condition,
        error: message,
      };
    }
  }
}
