/**
 * ZK proof envelope v1 — re-export shared implementation (see docs/standards/ZK_PROOF_V1.md).
 */
export {
  ZK_PROOF_TYPE_V1,
  ageBucketMeetsMinimum,
  canonicalJsonForSigning,
  decodeEnvelopeFromProofString,
  generateZkProofEnvelopeV1,
  isZkProofEnvelopeV1,
  verifyZkProofEnvelopeV1,
  type ZkProofEnvelopeV1,
  type ZkVerifyResult,
} from '@par-noir/zk-protocol-v1';
