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
export {
  encryptOwnerVaultShare,
  decryptOwnerVaultShare,
  serializeOwnerVaultShare,
  parseOwnerVaultShare,
  type OwnerVaultEncryptedShare
} from './ownerShareVault';
export {
  RECOVERY_CUSTODIAN_CONTEXT,
  RECOVERY_APPROVAL_CONTEXT,
  RECOVERY_ZKP_TYPES,
  type RecoveryCustodianshipPublicInputs,
  type RecoveryApprovalPublicInputs,
  type RecoveryZkApprovalPayload
} from './recoveryZkContexts';
export {
  createRecoveryApprovalBinding,
  serializeApprovalBinding,
  parseApprovalBinding,
  verifyRecoveryApprovalBinding,
  type RecoveryApprovalBinding
} from './recoveryApprovalBinding';
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
