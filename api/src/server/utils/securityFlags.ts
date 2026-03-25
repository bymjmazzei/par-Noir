export const securityFlags = {
  enableAsymmetricTokens: process.env.PN_OAUTH_ENABLE_ASYMMETRIC === 'true',
  enforceRefreshRotation: process.env.PN_OAUTH_ENFORCE_REFRESH_ROTATION !== 'false',
  enableStorageEnvelopeV2: process.env.STORAGE_CREDENTIALS_ENVELOPE_V2 === 'true',
  enableAdminIdentityHeaders: process.env.ADMIN_IDENTITY_HEADERS_ENABLED === 'true',
  disableLegacyAdminApiKey: process.env.ADMIN_DISABLE_LEGACY_API_KEY === 'true',
  allowUnsafeDevAdminBypass: process.env.ALLOW_UNSAFE_DEV_ADMIN_BYPASS === 'true',
};

export function isProduction(): boolean {
  return (process.env.NODE_ENV || 'development') === 'production';
}
