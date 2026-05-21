// Main SDK exports
export { IdentitySDK } from './IdentitySDK';

// pN OAuth Client (for third-party developers)
export { 
  PNOAuthClient, 
  createPNOAuthClient,
  type PNOAuthConfig,
  type PNOAuthTokenResponse,
  type PNOAuthUserInfo,
  type PNOAuthSession
} from './PNOAuthClient';

export {
  IntegratorStorageClient,
  createIntegratorStorageClient,
  type IntegratorStorageRoot,
  type IntegratorClientConfig as IntegratorStorageClientConfig,
  type DriveFileRef,
  type DriveFolderRef,
  SCOPE_CLOUD_APP
} from './IntegratorStorageClient';

export {
  IntegratorZkpClient,
  createIntegratorZkpClient,
  type ZkpDataPointProof,
  type ZkpDataPointsResponse
} from './IntegratorZkpClient';

export {
  IdentitySuccessionClient,
  createIdentitySuccessionClient,
  type SuccessorInfo
} from './IdentitySuccessionClient';

export {
  PublicIndexClient,
  createPublicIndexClient,
  type PublicIndexFile,
  type PublicIndexResponse
} from './PublicIndexClient';

export {
  PnIntegratorClient,
  createPnIntegratorClient,
  type PnIntegratorClientConfig,
  PN_INTEGRATOR_SCOPES
} from './PnIntegratorClient';

export {
  PnApiError,
  SCOPE_OPENID,
  SCOPE_PROFILE,
  PN_INTEGRATOR_SCOPES as PN_OAUTH_INTEGRATOR_SCOPES,
  normalizeApiEndpoint
} from './integrator/pnApiClient';

// Advanced Security exports
export { CertificatePinning, ThreatDetectionEngine, DistributedRateLimiter } from './advancedSecurity';

// Type exports
export type {
  Identity,
  AuthRequest,
  AuthResponse,
  AuthCallbackResult,
  TokenInfo,
  UserSession,
  SDKConfig,
  IdentityProvider,
  PlatformConfig,
  IdentityError,
  ComplianceData,
  DataCollectionRequest
} from './types';

// Enum exports
export { ErrorCo, EventTypes } from './types';

// Import types for internal use
import type { SDKConfig } from './types';
import { IdentitySDK } from './IdentitySDK';

// Utility functions for common use cases
export const createIdentitySDK = (config: SDKConfig) => {
  return new IdentitySDK(config);
};

// Pre-configured providers for common platforms
export const providers = {
  identityProtocol: {
    name: 'par Noir',
    type: 'oauth2' as const,
    config: {
      name: 'par Noir',
      clientId: '', // Set by developer
      redirectUri: '', // Set by developer
      scopes: ['openid', 'profile', 'email'],
      endpoints: {
        authorization: 'https://api.parnoir.com/oauth/authorize',
        token: 'https://api.parnoir.com/oauth/token',
        userInfo: 'https://api.parnoir.com/oauth/userinfo',
        revocation: 'https://api.parnoir.com/oauth/revoke'
      }
    },
    metadata: {
      logo: 'https://parnoir.com/logo.png',
      description: 'Universal identity authentication'
    }
  },
  // pN OAuth provider (recommended for new integrations)
  pnOAuth: {
    name: 'par Noir OAuth',
    type: 'oauth2' as const,
    config: {
      name: 'par Noir',
      clientId: '', // Set by developer
      redirectUri: '', // Set by developer (optional for popup flow)
      scopes: ['openid', 'profile'],
      endpoints: {
        authorization: 'https://api.parnoir.com/oauth/authorize',
        token: 'https://api.parnoir.com/oauth/token',
        userInfo: 'https://api.parnoir.com/oauth/userinfo',
        revocation: 'https://api.parnoir.com/oauth/revoke'
      },
      usePopup: true // Default to popup flow
    },
    metadata: {
      logo: 'https://parnoir.com/logo.png',
      description: 'Login with your pN identity'
    }
  }
};

// Helper function to create a simple configuration
export const createSimpleConfig = (
  clientId: string,
  redirectUri: string,
  options?: {
    scopes?: string[];
    storage?: 'localStorage' | 'sessionStorage' | 'indexedDB' | 'memory';
    autoRefresh?: boolean;
    debug?: boolean;
  }
): SDKConfig => {
  return {
    identityProvider: {
      ...providers.identityProtocol,
      config: {
        ...providers.identityProtocol.config,
        clientId,
        redirectUri,
        scopes: options?.scopes || providers.identityProtocol.config.scopes
      }
    },
    storage: options?.storage || 'localStorage',
    autoRefresh: options?.autoRefresh ?? true,
    debug: options?.debug ?? false
  };
};

export { useIdentitySDK } from './react/useIdentitySDK'; 