/**
 * ZK proof envelope v2 — re-export shared implementation (see docs/standards/ZK_PROOF_V2.md).
 * For `decodeEnvelopeFromProofString` / `canonicalJsonForSigning`, use `./zkProtocolV1` (same wire helpers).
 */
export {
  ZK_PROOF_TYPE_V2,
  generateZkProofEnvelopeV2,
  isZkProofEnvelopeV2,
  verifyZkProofEnvelopeV2,
  type ZkProofEnvelopeV2,
  type ZkVerifyResultV2,
} from '@par-noir/zk-protocol-v2';
