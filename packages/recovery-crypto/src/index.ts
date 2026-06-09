export {
  splitSecret,
  combineShares,
  generateRecoveryMaster,
  normalizeShare,
  bytesToB64,
  b64ToBytes,
  type ShamirShare
} from './shamir';
export {
  encryptRecoveryEnvelope,
  decryptRecoveryEnvelope,
  buildRecoveryPayload,
  type RecoveryConfig,
  type RecoveryPayload,
  type RecoveryEnvelope
} from './envelope';
export {
  encryptCustodianShare,
  decryptCustodianShare,
  serializeEncryptedShare,
  parseEncryptedShare,
  type EncryptedCustodianShare
} from './shareEncryption';
export {
  createShareCommitment,
  proveShareKnowledge,
  verifyShareKnowledgeProof,
  verifyRecoveryApprovalPayload,
  type ShareCommitment,
  type ShareKnowledgeProof,
  type RecoveryApprovalPayload
} from './shareProof';
