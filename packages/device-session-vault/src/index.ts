export type {
  SessionVaultAppId,
  NativeKv,
  VerifyBiometric,
  BiometricAvailability,
  DashboardKeysPayload,
  UnlockKeysPayload,
  UnlockMultiPayload,
  UnlockIdentityListing,
  BrowseOauthPayload,
  MessagingSessionPayload,
  PrismSessionPayload,
  SessionVaultPayload,
  SessionVaultDeps,
  SealedVaultRecord,
} from './types.js';
export { unlockIdentityLabel } from './types.js';
export { sealPayload, unsealPayload } from './seal.js';
export {
  DeviceSessionVault,
  UnsupportedSessionVault,
  vaultStorageKey,
  unlockVaultIndexKey,
} from './vault.js';
export {
  capacitorSecureStorageKv,
  memoryKv,
  createDeviceSessionVault,
} from './adapters.js';
