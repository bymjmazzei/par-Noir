import { IdentitySDK } from '../src/IdentitySDK';
import { MemoryStorage } from '../src/MemoryStorage';
import { createMockSDKConfig } from './setup';
import { installIdentityEventAutoResolve } from './identityEventTestSetup';
import { mockFetchOAuthSuccess } from './oauthFetchMock';

describe('IdentitySDK', () => {
  let sdk: IdentitySDK;
  let mockConfig: ReturnType<typeof createMockSDKConfig>;
  let storage: MemoryStorage;
  let uninstallEvents: () => void;

  beforeEach(() => {
    mockConfig = createMockSDKConfig();
    storage = new MemoryStorage();
    sdk = new IdentitySDK(mockConfig, storage);
    uninstallEvents = installIdentityEventAutoResolve();
  });

  afterEach(() => {
    uninstallEvents();
    jest.clearAllMocks();
    global.fetch = jest.fn() as typeof fetch;
  });

  describe('Initialization', () => {
    it('initializes with valid configuration', () => {
      expect(sdk).toBeInstanceOf(IdentitySDK);
      expect(sdk.getCurrentSession()).toBeNull();
    });

    it('accepts custom storage adapter', () => {
      const customStorage = {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
      };
      const sdkWithStorage = new IdentitySDK(mockConfig, customStorage);
      expect(sdkWithStorage).toBeInstanceOf(IdentitySDK);
    });

    it('throws for invalid configuration', () => {
      expect(() => new IdentitySDK(null as any)).toThrow();
    });
  });

  describe('Authentication', () => {
    it('initializeAuth returns redirect-oriented fields', async () => {
      const authRequest = await sdk.initializeAuth();
      expect(authRequest.redirectUri).toBeDefined();
      expect(authRequest.clientId).toBeDefined();
    });

    it('handleAuthCallback succeeds with mocked OAuth', async () => {
      global.fetch = mockFetchOAuthSuccess();
      const { state } = await sdk.initializeAuth();
      const url = `http://localhost:3000/callback?code=c&state=${encodeURIComponent(state!)}`;
      const response = await sdk.handleAuthCallback(url);
      expect(response.success).toBe(true);
    });

    it('handleAuthCallback returns error for OAuth error', async () => {
      const response = await sdk.handleAuthCallback(
        'http://localhost:3000/callback?error=access_denied'
      );
      expect(response.success).toBe(false);
    });

    it('logout clears session', async () => {
      await sdk.logout();
      expect(sdk.getCurrentSession()).toBeNull();
    });

    it('session validity is boolean', () => {
      expect(typeof sdk.isSessionValid()).toBe('boolean');
    });

    it('refreshSessionIfNeeded returns boolean', async () => {
      const refreshed = await sdk.refreshSessionIfNeeded();
      expect(typeof refreshed).toBe('boolean');
    });
  });

  describe('Data Collection', () => {
    it('getComplianceData', () => {
      expect(sdk.getComplianceData('p')).toBeDefined();
    });

    it('requestDataCollection resolves with event bridge', async () => {
      const response = await sdk.requestDataCollection({
        platform: 'test-platform',
        dataPoints: ['email'],
        purpose: 'authentication',
        consentText: 'c',
        dataUsage: 'u',
      });
      expect(response.success).toBe(true);
    });

    it('requestStandardDataPoint resolves', async () => {
      const response = await sdk.requestStandardDataPoint({
        dataPointId: 'email',
        platform: 'test',
        purpose: 'auth',
      });
      expect(response.success).toBe(true);
    });

    it('proposeDataPoint resolves when valid', async () => {
      const response = await sdk.proposeDataPoint({
        name: 'Unique Proposal Z',
        description: 'd',
        category: 'identity',
        dataType: 'string',
        requiredFields: [],
        examples: [],
        useCase: 'u',
        proposedBy: 'me',
      });
      expect(response.success).toBe(true);
    });

    it('voteOnProposal resolves', async () => {
      const response = await sdk.voteOnProposal({
        proposalId: 'p1',
        voterId: 'v1',
        vote: 'upvote',
      });
      expect(response.success).toBe(true);
    });
  });

  describe('Zero-Knowledge Proofs', () => {
    it('generateProof schnorr / pedersen throw (ZK v1 is dashboard-only)', async () => {
      await expect(sdk.generateProof('schnorr', { privateKey: {} as CryptoKey })).rejects.toThrow();
      await expect(sdk.generateProof('pedersen', { publicPNId: 'pn-x' })).rejects.toThrow();
    });

    it('throws for unknown proof type', async () => {
      await expect(sdk.generateProof('unknown', {})).rejects.toThrow('Unknown proof type');
    });

    it('verifyProof returns boolean for string proofs', async () => {
      const ok = await sdk.verifyProof('x'.repeat(50), 'schnorr');
      expect(typeof ok).toBe('boolean');
    });

    it('generateDataPointProof throws', async () => {
      await expect(sdk.generateDataPointProof('email', 'u1')).rejects.toThrow(/not supported/);
    });

    it('generateOwnershipProof throws', async () => {
      await expect(sdk.generateOwnershipProof({ owner: 'a', asset: 'b' })).rejects.toThrow(/not implemented/);
    });
  });

  describe('Data Point Management', () => {
    it('getAvailableDataPoints', () => {
      expect(typeof sdk.getAvailableDataPoints()).toBe('object');
    });

    it('validateDataPointRequest', () => {
      expect(sdk.validateDataPointRequest('email')).toBe(true);
    });

    it('getDataPointMetadata', () => {
      expect(sdk.getDataPointMetadata('email').id).toBe('email');
    });
  });

  describe('Manager Access', () => {
    it('exposes managers', () => {
      expect(sdk.getAuthenticationManager()).toBeDefined();
      expect(sdk.getZKPManager()).toBeDefined();
      expect(sdk.getDataCollectionManager()).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('handleAuthCallback invalid URL', async () => {
      const response = await sdk.handleAuthCallback('invalid-url');
      expect(response.success).toBe(false);
    });

    it('requestDataCollection rejects null', async () => {
      await expect(sdk.requestDataCollection(null as any)).rejects.toThrow();
    });
  });
});
