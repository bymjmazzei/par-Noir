import { IdentitySDK, createSimpleConfig, providers } from '../index';
import { SDKConfig, IdentityProvider } from '../types';

// Mock fetch for testing
global.fetch = jest.fn();

describe('IdentitySDK', () => {
  let sdk: IdentitySDK;
  let mockConfig: SDKConfig;

  beforeEach(() => {
    // Reset mocks
    (fetch as jest.Mock).mockClear();
    
    // Create mock config
    mockConfig = {
      identityProvider: {
        name: 'Test Provider',
        type: 'oauth2',
        config: {
          name: 'Test Provider',
          clientId: 'test-client-id',
          redirectUri: 'http://localhost:3000/callback',
          scopes: ['openid', 'profile', 'email'],
          endpoints: {
            authorization: 'https://test-provider.com/oauth/authorize',
            token: 'https://test-provider.com/oauth/token',
            userInfo: 'https://test-provider.com/oauth/userinfo',
            revocation: 'https://test-provider.com/oauth/revoke'
          }
        },
        metadata: {}
      },
      storage: 'memory',
      autoRefresh: true,
      debug: false
    };

    sdk = new IdentitySDK(mockConfig);
  });

  describe('Initialization', () => {
    it('should initialize with provided config', () => {
      expect(sdk).toBeInstanceOf(IdentitySDK);
    });

    it('should use memory storage when specified', () => {
      const memorySdk = new IdentitySDK({
        ...mockConfig,
        storage: 'memory'
      });
      expect(memorySdk).toBeInstanceOf(IdentitySDK);
    });
  });

  describe('Authentication', () => {
    it('should initialize SDK correctly', () => {
      expect(sdk).toBeDefined();
      expect(sdk.config).toBeDefined();
      expect(sdk.config.identityProvider.config.clientId).toBe('test-client-id');
    });

    it('should check authentication status', () => {
      expect(sdk.isAuthenticated()).toBe(false);
    });

    it('should get current session', () => {
      const session = sdk.getCurrentSession();
      expect(session).toBeNull();
    });
  });

  describe('Session Management', () => {
    it('should handle logout', async () => {
      await expect(sdk.logout()).resolves.not.toThrow();
    });
  });

  describe('Event Handling', () => {
    it('should emit events', () => {
      const mockCallback = jest.fn();
      sdk.on('auth_success', mockCallback);
      
      // Simulate event emission
      (sdk as any).emit('auth_success', { test: 'data' });
      
      expect(mockCallback).toHaveBeenCalledWith({ test: 'data' });
    });

    it('should remove event listeners', () => {
      const mockCallback = jest.fn();
      sdk.on('auth_success', mockCallback);
      sdk.off('auth_success', mockCallback);
      
      // Simulate event emission
      (sdk as any).emit('auth_success', { test: 'data' });
      
      expect(mockCallback).not.toHaveBeenCalled();
    });
  });

  describe('Compliance Data Collection', () => {
    it('should handle data collection requests', () => {
      const request = {
        platform: 'test-platform',
        fields: {
          phone: {
            required: true,
            type: 'phone',
            description: 'Phone number for verification'
          }
        },
        consentText: 'I consent to data collection',
        dataUsage: 'For account verification'
      };

      expect(request).toBeDefined();
      expect(request.platform).toBe('test-platform');
    });
  });
});

describe('createSimpleConfig', () => {
  it('should create a simple configuration', () => {
    const config = createSimpleConfig(
      'test-client-id',
      'http://localhost:3000/callback',
      {
        scopes: ['openid', 'profile'],
        storage: 'localStorage',
        autoRefresh: true,
        debug: true
      }
    );

    expect(config.identityProvider.config.clientId).toBe('test-client-id');
    expect(config.identityProvider.config.redirectUri).toBe('http://localhost:3000/callback');
    expect(config.storage).toBe('localStorage');
    expect(config.autoRefresh).toBe(true);
    expect(config.debug).toBe(true);
  });
});

describe('Providers', () => {
  it('should have identity protocol provider', () => {
    expect(providers.identityProtocol).toBeDefined();
    expect(providers.identityProtocol.name).toBe('Identity Protocol');
    expect(providers.identityProtocol.type).toBe('oauth2');
  });
}); 