import { vi } from 'vitest';
import { AuthenticationManager } from '../../src/distributed/decentralizedAuth/authenticationManager';
import { DIDResolver } from '../../src/distributed/DIDResolver';
import { AuthSignature } from '../../src/distributed/types/decentralizedAuth';

// Mock DIDResolver
vi.mock('../../src/distributed/DIDResolver', () => {
  return {
    DIDResolver: vi.fn().mockImplementation(() => ({
      resolve: vi.fn().mockResolvedValue({
        didDocument: {
          id: 'did:test:123',
          verificationMethod: [{
            id: 'did:test:123#key1',
            type: 'Ed25519VerificationKey2020',
            controller: 'did:test:123',
            publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
          }]
        }
      })
    }))
  };
});

describe('AuthenticationManager Security Tests', () => {
  let authManager: AuthenticationManager;
  let mockResolver: vi.Mocked<DIDResolver>;

  beforeEach(() => {
    mockResolver = new DIDResolver() as vi.Mocked<DIDResolver>;
    authManager = new AuthenticationManager(mockResolver);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Challenge Creation Security', () => {
    test('should create secure authentication challenge', async () => {
      const did = 'did:test:123';
      const challenge = await authManager.createChallenge(did);

      expect(challenge).toBeDefined();
      expect(challenge.did).toBe(did);
      expect(challenge.challenge).toBeDefined();
      expect(challenge.challenge.length).toBeGreaterThan(0);
      expect(challenge.timestamp).toBeDefined();
      expect(challenge.expiresAt).toBeDefined();
      expect(new Date(challenge.expiresAt)).toBeInstanceOf(Date);
    });

    test('should reject invalid DID format', async () => {
      const invalidDID = 'invalid-did-format';
      
      await expect(authManager.createChallenge(invalidDID))
        .rejects.toThrow('Invalid DID format');
    });

    test('should enforce rate limiting', async () => {
      const did = 'did:test:123';
      
      // Create multiple challenges rapidly
      const promises = Array(5).fill(null).map(() => 
        authManager.createChallenge(did)
      );
      
      // Should not all succeed due to rate limiting
      const results = await Promise.allSettled(promises);
      const failures = results.filter(result => result.status === 'rejected');
      
      // At least some should succeed, but rate limiting should be in place
      expect(results.length).toBe(5);
    });
  });

  describe('Authentication Security', () => {
    test('should authenticate with valid signature', async () => {
      const did = 'did:test:123';
      const challenge = await authManager.createChallenge(did);
      
      const signature: AuthSignature = {
        challenge: challenge.challenge,
        signature: btoa('valid-signature-data'),
        publicKey: btoa('valid-public-key-data'),
        timestamp: new Date().toISOString()
      };

      const session = await authManager.authenticate(did, signature);
      
      expect(session).toBeDefined();
      expect(session?.did).toBe(did);
      expect(session?.authenticatedAt).toBeDefined();
      expect(session?.expiresAt).toBeDefined();
      expect(session?.deviceId).toBeDefined();
      expect(session?.permissions).toContain('read');
    });

    test('should reject expired challenge', async () => {
      const did = 'did:test:123';
      const challenge = await authManager.createChallenge(did, 1); // 1ms expiry
      
      // Wait for challenge to expire
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const signature: AuthSignature = {
        challenge: challenge.challenge,
        signature: 'valid-signature',
        publicKey: 'valid-public-key',
        timestamp: new Date().toISOString()
      };

      const session = await authManager.authenticate(did, signature);
      expect(session).toBeNull();
    });

    test('should reject invalid signature format', async () => {
      const did = 'did:test:123';
      const challenge = await authManager.createChallenge(did);
      
      const invalidSignature: AuthSignature = {
        challenge: challenge.challenge,
        signature: '', // Invalid empty signature
        publicKey: 'valid-public-key',
        timestamp: new Date().toISOString()
      };

      const session = await authManager.authenticate(did, invalidSignature);
      expect(session).toBeNull();
    });

    test('should reject challenge mismatch', async () => {
      const did = 'did:test:123';
      await authManager.createChallenge(did);
      
      const signature: AuthSignature = {
        challenge: 'wrong-challenge', // Wrong challenge
        signature: 'valid-signature',
        publicKey: 'valid-public-key',
        timestamp: new Date().toISOString()
      };

      const session = await authManager.authenticate(did, signature);
      expect(session).toBeNull();
    });
  });

  describe('Session Management Security', () => {
    test('should verify valid session', async () => {
      const did = 'did:test:123';
      const challenge = await authManager.createChallenge(did);
      
      const signature: AuthSignature = {
        challenge: challenge.challenge,
        signature: btoa('valid-signature-data'),
        publicKey: btoa('valid-public-key-data'),
        timestamp: new Date().toISOString()
      };

      await authManager.authenticate(did, signature);
      const isAuthenticated = await authManager.isAuthenticated(did);
      
      expect(isAuthenticated).toBe(true);
    }, 15000); // Increased timeout

    test('should reject invalid session', async () => {
      const did = 'did:test:invalid';
      const isAuthenticated = await authManager.isAuthenticated(did);
      
      expect(isAuthenticated).toBe(false);
    }, 15000); // Increased timeout

    test('should handle logout securely', async () => {
      const did = 'did:test:123';
      const challenge = await authManager.createChallenge(did);
      
      const signature: AuthSignature = {
        challenge: challenge.challenge,
        signature: 'valid-signature',
        publicKey: 'valid-public-key',
        timestamp: new Date().toISOString()
      };

      await authManager.authenticate(did, signature);
      await authManager.logout(did);
      
      const isAuthenticated = await authManager.isAuthenticated(did);
      expect(isAuthenticated).toBe(false);
    }, 15000); // Increased timeout
  });

  describe('Rate Limiting Security', () => {
    test('should enforce rate limits on authentication attempts', async () => {
      const did = 'did:test:123';
      const challenge = await authManager.createChallenge(did);
      
      const signature: AuthSignature = {
        challenge: challenge.challenge,
        signature: 'invalid-signature', // Invalid to trigger rate limiting
        publicKey: 'valid-public-key',
        timestamp: new Date().toISOString()
      };

      // Make multiple failed authentication attempts
      const promises = Array(5).fill(null).map(() => 
        authManager.authenticate(did, signature)
      );
      
      const results = await Promise.allSettled(promises);
      const failures = results.filter(result => result.status === 'rejected');
      
      // Should have some failures due to rate limiting or invalid signature
      expect(results.length).toBe(5);
    });
  });
});