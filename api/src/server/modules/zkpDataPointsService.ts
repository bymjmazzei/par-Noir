/**
 * ZKP Data Points Service
 * Verifies ZK proofs. Held proofs live on the pN's Pen Knowledge claim docs in
 * their cloud and are read on the device, never here.
 */

import {
  ageBucketMeetsMinimum,
  decodeEnvelopeFromProofString,
  isZkProofEnvelopeV1,
  verifyZkProofEnvelopeV1,
} from '@par-noir/zk-protocol-v1';
import { isZkProofEnvelopeV2, verifyZkProofEnvelopeV2 } from '@par-noir/zk-protocol-v2';
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
