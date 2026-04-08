import {
  decodeEnvelopeFromProofString,
  isZkProofEnvelopeV1,
  verifyZkProofEnvelopeV1,
} from '@par-noir/zk-protocol-v1';
import { isZkProofEnvelopeV2, verifyZkProofEnvelopeV2 } from '@par-noir/zk-protocol-v2';
import type { StandardDataPoint, ZKPGenerationRequest, ZKPProof, ZKPType } from '../types/standardDataPoints';
import { STANDARD_DATA_POINTS } from '../constants/dataPointRegistry';

/**
 * SDK stub: ZKP v2 proofs are generated in the id-dashboard with ML-DSA keys.
 * Use {@link verifyEnvelope} to verify proof strings from the wire.
 */
export class ZKPGenerator {
  static verifyEnvelope(proof: string) {
    const env = decodeEnvelopeFromProofString(proof);
    if (env && isZkProofEnvelopeV2(env)) {
      return verifyZkProofEnvelopeV2(proof);
    }
    return verifyZkProofEnvelopeV1(proof);
  }

  /**
   * @throws Always — generation requires encrypted identity + ML-DSA keys (dashboard only).
   */
  static async generateZKP(_request: ZKPGenerationRequest): Promise<ZKPProof> {
    const dataPoint = STANDARD_DATA_POINTS[_request.dataPointId];
    const zt: ZKPType | undefined = dataPoint?.zkpType;
    void zt;
    throw new Error(
      'ZKP v2 proofs must be generated in the par Noir id-dashboard (ML-DSA keys in encrypted identity). ' +
        'For verification, use ZKPGenerator.verifyEnvelope(proofString) or @par-noir/zk-protocol-v2.'
    );
  }

  /**
   * Validate user data against data point requirements (shared helper).
   */
  static validateUserData(dataPoint: StandardDataPoint, userData: any): void {
    for (const field of dataPoint.requiredFields || []) {
      if (!userData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    if (dataPoint.validation?.required && !userData) {
      throw new Error('Data is required');
    }
    if (dataPoint.validation?.pattern && typeof userData === 'string') {
      if (!dataPoint.validation.pattern.test(userData)) {
        throw new Error('Data does not match required pattern');
      }
    }
    if (dataPoint.validation?.custom && !dataPoint.validation.custom(userData)) {
      throw new Error('Data failed custom validation');
    }
  }
}
