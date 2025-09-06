import { AuthenticationManager } from '../../src/IdentitySDK/modules/authenticationManager';
import { createMockSDKConfig, createMockSession } from '../setup';

describe('AuthenticationManager', () => {
  let authManager: AuthenticationManager;
  let mockConfig: any;

  beforeEach(() => {
    mockConfig = createMockSDKConfig();
    authManager = new AuthenticationManager(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with valid configuration', () => {
      expect(authManager).toBeInstanceOf(AuthenticationManager);
    });

    it('should throw error for invalid configuration', () => {
      expect(() => {
        new AuthenticationManager(null as any);
      }).toThrow();
    });
  });

  describe('Authentication Flow', () => {
    it('should initialize authentication', async () => {
      const authRequest = await authManager.initializeAuth();
      expect(authRequest).toBeDefined();
      expect(authRequest.url).toBeDefined();
      expect(authRequest.state).toBeDefined();
    });

    it('should handle authentication callback with valid code', async () => {
      const mockCallbackUrl = 'http://localhost:3000/callback?code=valid-code&state=test-state';
      const response = await authManager.handleAuthCallback(mockCallbackUrl);
      
      expect(response).toBeDefined();
      expect(response.success).toBeDefined();
    });

    it('should handle authentication callback with error', async () => {
      const errorUrl = 'http://localhost:3000/callback?error=access_denied&error_description=User+denied+access';
      const response = await authManager.handleAuthCallback(errorUrl);
      
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should handle invalid callback URL', async () => {
      const invalidUrl = 'invalid-url';
      const response = await authManager.handleAuthCallback(invalidUrl);
      
      expect(response.success).toBe(false);
    });
  });

  describe('Session Management', () => {
    it('should get current session', () => {
      const session = authManager.getCurrentSession();
      expect(session).toBeNull(); // No session initially
    });

    it('should check session validity', () => {
      const isValid = authManager.isSessionValid();
      expect(typeof isValid).toBe('boolean');
    });

    it('should refresh session if needed', async () => {
      const refreshed = await authManager.refreshSessionIfNeeded();
      expect(typeof refreshed).toBe('boolean');
    });

    it('should logout user', async () => {
      await authManager.logout();
      expect(authManager.getCurrentSession()).toBeNull();
    });
  });

  describe('Token Management', () => {
    it('should handle token refresh', async () => {
      const refreshed = await authManager.refreshToken('mock-refresh-token');
      expect(refreshed).toBeDefined();
    });

    it('should handle token validation', () => {
      const isValid = authManager.validateToken('mock-token');
      expect(typeof isValid).toBe('boolean');
    });

    it('should handle token expiration', () => {
      const isExpired = authManager.isTokenExpired('mock-token');
      expect(typeof isExpired).toBe('boolean');
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      // Mock network error
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
      
      const response = await authManager.handleAuthCallback('http://localhost:3000/callback?code=test');
      expect(response.success).toBe(false);
      
      global.fetch = originalFetch;
    });

    it('should handle invalid token errors', async () => {
      const response = await authManager.refreshToken('invalid-token');
      expect(response.success).toBe(false);
    });
  });

  describe('Security', () => {
    it('should validate state parameter', async () => {
      const callbackUrl = 'http://localhost:3000/callback?code=test&state=invalid-state';
      const response = await authManager.handleAuthCallback(callbackUrl);
      expect(response.success).toBe(false);
    });

    it('should handle CSRF protection', async () => {
      const authRequest = await authManager.initializeAuth();
      expect(authRequest.state).toBeDefined();
      expect(authRequest.state.length).toBeGreaterThan(0);
    });
  });
});
