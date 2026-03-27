import { verifyZkProofEnvelopeV1 } from '@par-noir/zk-protocol-v1';
import { ZKP_PROOF_TYPES } from '../constants/sdkConstants';

/**
 * ZKP verification for v1 envelopes (base64 JSON). Legacy object-shaped “proofs” are rejected.
 * Proof generation with ML-DSA keys is performed in the id-dashboard / @par-noir/zk-protocol-v1.
 */
export class ZKPManager {
  /**
   * @deprecated Legacy Schnorr placeholder removed — use v1 envelope generation in the dashboard.
   */
  async generateSchnorrProof(_privateKey: CryptoKey): Promise<never> {
    throw new Error('Legacy Schnorr proofs removed; use @par-noir/zk-protocol-v1 generateZkProofEnvelopeV1 with ML-DSA keys.');
  }

  /**
   * @deprecated Legacy Pedersen placeholder removed.
   */
  async generatePedersenProof(_publicPNId: string): Promise<never> {
    throw new Error('Legacy Pedersen proofs removed; use ZK v1 envelope generation.');
  }

  /**
   * @deprecated Not used for v1 envelopes (ML-DSA signature is inside the envelope).
   */
  async signProof(_privateKey: CryptoKey): Promise<never> {
    throw new Error('Use generateZkProofEnvelopeV1; signing is embedded in the v1 envelope.');
  }

  /**
   * Verify a v1 proof string. For non-string payloads, returns false.
   */
  async verifyProof(proof: unknown, type?: string): Promise<boolean> {
    try {
      if (typeof proof !== 'string') {
        return false;
      }
      const result = verifyZkProofEnvelopeV1(proof);
      if (!result.ok) {
        return false;
      }
      if (type === ZKP_PROOF_TYPES.SCHNORR || type === ZKP_PROOF_TYPES.PEDERSEN || type === ZKP_PROOF_TYPES.SIGMA) {
        return true;
      }
      return type === undefined || type === '';
    } catch {
      return false;
    }
  }

  /**
   * @deprecated Use dashboard ZKP flows for v1 data-point proofs.
   */
  async generateDataPointProof(_dataPointId: string, _userId: string): Promise<never> {
    throw new Error('generateDataPointProof is not supported in SDK; use id-dashboard ZKPGenerator.');
  }

  /**
   * @deprecated Ownership proof shape is not ZK v1; integrate via API/dashboard when needed.
   */
  async generateOwnershipProof(_data: unknown): Promise<never> {
    throw new Error('generateOwnershipProof is not implemented for ZK v1; use API or dashboard flows.');
  }
}
