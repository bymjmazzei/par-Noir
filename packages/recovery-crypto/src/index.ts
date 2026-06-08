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
