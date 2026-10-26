export {
  sealRecoveryShares,
  unsealRecoveryShares,
  type RecoverySharesSealed,
} from './sealedShares';
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
  generateRecoveryKeyPair,
  recoveryRequestIdFor,
  custodyAad,
  releaseAad,
  sealShareToKey,
  openSealedShare,
  serializeSealedShare,
  parseSealedShare,
  SEALED_SHARE_ALG,
  type SealedShare,
  type RecoveryKeyPair
} from './shareSealing';
export {
  createShareCommitment,
  proveShareKnowledge,
  verifyShareKnowledgeProof,
  verifyRecoveryApprovalPayload,
  type ShareCommitment,
  type ShareKnowledgeProof,
  type RecoveryApprovalPayload
} from './shareProof';
export {
  RECOVERY_CUSTODIAN_CONTEXT,
  RECOVERY_APPROVAL_CONTEXT,
  RECOVERY_ZKP_TYPES,
  type RecoveryCustodianshipPublicInputs,
  type RecoveryApprovalPublicInputs,
  type RecoveryZkApprovalPayload
} from './recoveryZkContexts';
export {
  parseUnrevokableFlag,
  normalizeCustodianStatus,
  computeMissingShareIndices,
  isCustodianRevokable,
  findCustodianForApproval,
  recoveryMeetsQuorumRule,
  countAcceptedCustodians,
  buildCustodianInvitationPayload,
  type RecoveryShareStatus,
  type PendingShareRow,
  type AssignedCustodianRow,
  type RecoveryQuorumInput,
  type RecoveryQuorumResult,
} from './vault';
