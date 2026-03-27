import { IdentitySDK, createIdentitySDK, createSimpleConfig } from '../../src';
import { MemoryStorage } from '../../src/MemoryStorage';
import { createMockSDKConfig } from '../setup';
import { installIdentityEventAutoResolve } from '../identityEventTestSetup';
import { mockFetchOAuthSuccess } from '../oauthFetchMock';

describe('SDK Integration Tests', () => {
  let sdk: IdentitySDK;
  let uninstallEvents: () => void;

  beforeEach(() => {
    uninstallEvents = installIdentityEventAutoResolve();
    sdk = new IdentitySDK(createMockSDKConfig(), new MemoryStorage());
    global.fetch = jest.fn() as typeof fetch;
  });

  afterEach(() => {
    uninstallEvents();
    jest.clearAllMocks();
    global.fetch = jest.fn() as typeof fetch;
  });

  describe('End-to-End Authentication Flow', () => {
    it('completes OAuth code exchange when fetch succeeds', async () => {
      global.fetch = mockFetchOAuthSuccess();

      const authRequest = await sdk.initializeAuth();
      expect(authRequest.redirectUri).toBeDefined();
      expect(authRequest.state).toBeDefined();

      const callbackUrl = `http://localhost:3000/callback?code=test-code&state=${encodeURIComponent(
        authRequest.state!
      )}`;
      const authResponse = await sdk.handleAuthCallback(callbackUrl);
      expect(authResponse.success).toBe(true);

      const isValid = sdk.isSessionValid();
      expect(typeof isValid).toBe('boolean');

      await sdk.logout();
      expect(sdk.getCurrentSession()).toBeNull();
    });

    it('handles authentication failure from OAuth error param', async () => {
      await sdk.initializeAuth();
      const errorCallbackUrl = `http://localhost:3000/callback?error=access_denied&state=x`;
      const authResponse = await sdk.handleAuthCallback(errorCallbackUrl);
      expect(authResponse.success).toBe(false);
      expect(authResponse.error).toBeDefined();
    });
  });

  describe('Data Collection Integration', () => {
    it('runs compliance + collection + standard data point', async () => {
      expect(sdk.getComplianceData('test-platform')).toBeDefined();

      const collectionResponse = await sdk.requestDataCollection({
        platform: 'test-platform',
        dataPoints: ['email'],
        purpose: 'authentication',
        consentText: 'consent',
        dataUsage: 'usage',
      });
      expect(collectionResponse.success).toBe(true);

      const dataPointResponse = await sdk.requestStandardDataPoint({
        dataPointId: 'email',
        platform: 'test-platform',
        purpose: 'authentication',
      });
      expect(dataPointResponse.success).toBe(true);
    });

    it('proposal then vote', async () => {
      const proposalResponse = await sdk.proposeDataPoint({
        name: 'Integration Proposal 001',
        description: 'Test data point',
        category: 'identity',
        dataType: 'string',
        requiredFields: [],
        examples: [],
        useCase: 'integration testing',
        proposedBy: 'test-user-id',
      });
      expect(proposalResponse.success).toBe(true);

      const voteResponse = await sdk.voteOnProposal({
        proposalId: proposalResponse.proposalId ?? 'mock-proposal-id',
        voterId: 'test-user-id',
        vote: 'upvote',
      });
      expect(voteResponse.success).toBe(true);
    });
  });

  describe('Zero-Knowledge Proof Integration', () => {
    it('verify accepts v1-shaped proof strings (mocked in tests)', async () => {
      const proof = 'v1-mock-proof-string-'.padEnd(50, '0');
      expect(await sdk.verifyProof(proof, 'schnorr')).toBe(true);
    });

    it('legacy generate paths are disabled (ZK v1 in dashboard)', async () => {
      await expect(sdk.generateProof('schnorr', { privateKey: {} as CryptoKey })).rejects.toThrow();
      await expect(sdk.generateProof('pedersen', { publicPNId: 'test-public-id' })).rejects.toThrow();
      await expect(sdk.generateDataPointProof('email', 'test-user-id')).rejects.toThrow();
      await expect(
        sdk.generateOwnershipProof({
          owner: 'test-user-id',
          asset: 'email-data',
          timestamp: Date.now(),
        })
      ).rejects.toThrow();
    });
  });

  describe('Manager Integration', () => {
    it('exposes managers', () => {
      expect(sdk.getAuthenticationManager()).toBeDefined();
      expect(sdk.getZKPManager()).toBeDefined();
      expect(sdk.getDataCollectionManager()).toBeDefined();
    });

    it('keeps SDK session aligned with auth manager', async () => {
      await sdk.initializeAuth();
      const authManager = sdk.getAuthenticationManager();
      expect(authManager.getCurrentSession()).toEqual(sdk.getCurrentSession());
    });
  });

  describe('Error Recovery', () => {
    it('can initialize auth after OAuth error', async () => {
      const errorResponse = await sdk.handleAuthCallback(
        'http://localhost:3000/callback?error=access_denied'
      );
      expect(errorResponse.success).toBe(false);

      const retryAuth = await sdk.initializeAuth();
      expect(retryAuth.state).toBeDefined();
    });

    it('rejects empty collection request then accepts valid one', async () => {
      const invalidRequest = {
        platform: '',
        dataPoints: [] as string[],
        purpose: '',
        consentText: '',
        dataUsage: '',
      };

      await expect(sdk.requestDataCollection(invalidRequest as any)).rejects.toThrow();

      const response = await sdk.requestDataCollection({
        platform: 'test-platform',
        dataPoints: ['email'],
        purpose: 'authentication',
        consentText: 'c',
        dataUsage: 'u',
      });
      expect(response.success).toBe(true);
    });
  });
});

describe('SDK Factory Functions', () => {
  describe('createIdentitySDK', () => {
    it('creates SDK instance', () => {
      const config = createMockSDKConfig();
      const instance = createIdentitySDK(config);
      expect(instance).toBeInstanceOf(IdentitySDK);
    });
  });

  describe('createSimpleConfig', () => {
    it('creates simple configuration', () => {
      const config = createSimpleConfig('test-client-id', 'http://localhost:3000/callback');
      expect(config.identityProvider.config.clientId).toBe('test-client-id');
      expect(config.identityProvider.config.redirectUri).toBe('http://localhost:3000/callback');
    });

    it('creates configuration with options', () => {
      const config = createSimpleConfig('test-client-id', 'http://localhost:3000/callback', {
        scopes: ['openid', 'profile'],
        storage: 'indexedDB',
        autoRefresh: false,
        debug: true,
      });

      expect(config.identityProvider.config.scopes).toEqual(['openid', 'profile']);
      expect(config.storage).toBe('indexedDB');
      expect(config.autoRefresh).toBe(false);
      expect(config.debug).toBe(true);
    });
  });
});
