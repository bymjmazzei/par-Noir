/** Re-export shared device key storage from @par-noir/device-client. */
export {
  saveDeviceRegistration,
  loadDeviceRegistration,
  loadDeviceRegistrationByDeviceId,
  clearDeviceRegistration,
  importStoredPrivateKey,
  persistNewKeypair,
  type StoredDeviceRegistration,
} from '@par-noir/device-client';
