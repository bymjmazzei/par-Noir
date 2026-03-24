import { AuthenticationManager } from '../../src/IdentitySDK/modules/authenticationManager';
import { MemoryStorage } from '../../src/MemoryStorage';
import { createMockSDKConfig } from '../setup';
import { mockFetchOAuthSuccess } from '../oauthFetchMock';

describe('AuthenticationManager', () => {
  let authManager: AuthenticationManager;
  let mockConfig: ReturnType<typeof createMockSDKConfig>;
  let storage: MemoryStorage;

  beforeEach(() => {
    mockConfig = createMockSDKConfig();
    storage = new MemoryStorage();
    authManager = new AuthenticationManager(mockConfig, storage);
  });

  afterEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn() as typeof fetch;
  });

  describe('Initialization', () => {
    it('initializes with valid configuration', () => {
      expect(authManager).toBeInstanceOf(AuthenticationManager);
    });

    it('throws for invalid configuration', () => {
      expect(() => new AuthenticationManager(null as any, storage)).toThrow();
    });
  });

  describe('Authentication Flow', () => {
    it('initializeAuth returns client, redirect, scope, state', async () => {
      const authRequest = await authManager.initializeAuth();
      expect(authRequest.clientId).toBe('test-client-id');
      expect(authRequest.redirectUri).toBe('http://localhost:3000/callback');
      expect(authRequest.scope?.length).toBeGreaterThan(0);
      expect(authRequest.state).toBeDefined();
    });

    it('handleAuthCallback succeeds when state matches and OAuth endpoints respond', async () => {
      global.fetch = mockFetchOAuthSuccess();

      const { state } = await authManager.initializeAuth();
      const url = `http://localhost:3000/callback?code=valid-code&state=${encodeURIComponent(state!)}`;
      const response = await authManager.handleAuthCallback(url);

      expect(response.success).toBe(true);
      expect(response.session).toBeDefined();
    });

    it('handleAuthCallback returns error for OAuth error param', async () => {
      const errorUrl =
        'http://localhost:3000/callback?error=access_denied&error_description=User+denied+access';
      const response = await authManager.handleAuthCallback(errorUrl);
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('handleAuthCallback returns error for invalid URL', async () => {
      const response = await authManager.handleAuthCallback('invalid-url');
      expect(response.success).toBe(false);
    });
  });

  describe('Session Management', () => {
    it('getCurrentSession is null before login', () => {
      expect(authManager.getCurrentSession()).toBeNull();
    });

    it('isSessionValid returns boolean', () => {
      expect(typeof authManager.isSessionValid()).toBe('boolean');
    });

    it('refreshSessionIfNeeded returns boolean', async () => {
      const refreshed = await authManager.refreshSessionIfNeeded();
      expect(typeof refreshed).toBe('boolean');
    });

    it('logout clears session', async () => {
      await authManager.logout();
      expect(authManager.getCurrentSession()).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('handleAuthCallback returns failure when fetch rejects', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
      const response = await authManager.handleAuthCallback(
        'http://localhost:3000/callback?code=test&state=x'
      );
      expect(response.success).toBe(false);
    });
  });

  describe('Security', () => {
    it('rejects callback when state does not match stored state', async () => {
      global.fetch = mockFetchOAuthSuccess();
      await authManager.initializeAuth();
      const response = await authManager.handleAuthCallback(
        'http://localhost:3000/callback?code=test&state=wrong-state'
      );
      expect(response.success).toBe(false);
    });

    it('initializeAuth produces non-trivial state', async () => {
      const authRequest = await authManager.initializeAuth();
      expect(authRequest.state!.length).toBeGreaterThan(16);
    });
  });
});
