export const securityFlags = {
  enableStorageEnvelopeV2: process.env.STORAGE_CREDENTIALS_ENVELOPE_V2 === 'true',
  disableLegacyAdminApiKey: process.env.ADMIN_DISABLE_LEGACY_API_KEY === 'true',
  allowUnsafeDevAdminBypass: process.env.ALLOW_UNSAFE_DEV_ADMIN_BYPASS === 'true',
  /** Dev-only: allow identity+Drive registry wipe without custodian quorum. */
  allowDeviceRegistryResetWithoutQuorum:
    process.env.ALLOW_DEVICE_REGISTRY_RESET_WITHOUT_QUORUM === '1' ||
    process.env.ALLOW_DEVICE_REGISTRY_RESET_WITHOUT_QUORUM === 'true',
};

export function isProduction(): boolean {
  return (process.env.NODE_ENV || 'development') === 'production';
}
