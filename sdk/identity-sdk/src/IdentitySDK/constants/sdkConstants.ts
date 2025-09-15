export const SDK_DEFAULTS = {
  TIMEOUT: 30000, // 30 seconds
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 second
  SESSION_TIMEOUT: 3600000, // 1 hour
  STATE_TIMEOUT: 300000, // 5 minutes
  NONCE_LENGTH: 32,
  STATE_LENGTH: 32
};

export const STORAGE_KEYS = {
  AUTH_STATE: 'identity_auth_state',
  SESSION: 'identity_session',
  LICENSE_INFO: 'identity_license',
  USER_PREFERENCES: 'identity_preferences'
} as const;

export const ERROR_MESSAGES = {
  INVALID_CONFIG: 'Invalid SDK configuration',
  AUTH_FAILED: 'Authentication failed',
  SESSION_EXPIRED: 'Session expired',
  INVALID_STATE: 'Invalid authentication state',
  NETWORK_ERROR: 'Network error occurred',
  INVALID_RESPONSE: 'Invalid response from server',
  LICENSE_REQUIRED: 'Commercial license required for this operation',
  INVALID_DATA_POINT: 'Invalid data point requested',
  PROOF_GENERATION_FAILED: 'Zero-knowledge proof generation failed',
  PROOF_VERIFICATION_FAILED: 'Zero-knowledge proof verification failed'
} as const;

export const ZKP_PROOF_TYPES = {
  SCHNORR: 'schnorr',
  PEDERSEN: 'pedersen',
  SIGMA: 'sigma'
} as const;

export const LICENSE_TYPES = {
  PERSONAL: 'personal',
  COMMERCIAL: 'commercial',
  ENTERPRISE: 'enterprise'
} as const;
