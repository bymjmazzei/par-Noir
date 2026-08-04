export const securityFlags = {
  enableAsymmetricTokens: process.env.PN_OAUTH_ENABLE_ASYMMETRIC === 'true',
  // Backward-compatible default: do not enforce rotation until clients are upgraded.
  enforceRefreshRotation: process.env.PN_OAUTH_ENFORCE_REFRESH_ROTATION === 'true',
  enableStorageEnvelopeV2: process.env.STORAGE_CREDENTIALS_ENVELOPE_V2 === 'true',
  enableAdminIdentityHeaders: process.env.ADMIN_IDENTITY_HEADERS_ENABLED === 'true',
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
