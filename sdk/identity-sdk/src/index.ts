// Main SDK exports
export { IdentitySDK } from './IdentitySDK';

// Advanced Security exports
export { CertificatePinning, ThreatDetectionEngine, DistributedRateLimiter } from './advancedSecurity';

// Type exports
export type {
  Identity,
  AuthRequest,
  AuthResponse,
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
export { ErrorCodes, EventTypes } from './types';

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
    name: 'Identity Protocol',
    type: 'oauth2' as const,
    config: {
      name: 'Identity Protocol',
      clientId: '', // Set by developer
      redirectUri: '', // Set by developer
      scopes: ['openid', 'profile', 'email'],
      endpoints: {
        authorization: 'https://identity-protocol.com/oauth/authorize',
        token: 'https://identity-protocol.com/oauth/token',
        userInfo: 'https://identity-protocol.com/oauth/userinfo',
        revocation: 'https://identity-protocol.com/oauth/revoke'
      }
    },
    metadata: {
      logo: 'https://identity-protocol.com/logo.png',
      description: 'Universal identity authentication'
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

// React hook for easy integration
export const useIdentitySDK = (config: SDKConfig) => {
  // This would be implemented in a separate React-specific file
  // For now, return the SDK instance
  return new IdentitySDK(config);
}; 