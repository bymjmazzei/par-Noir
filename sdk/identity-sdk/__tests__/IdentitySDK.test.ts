import { IdentitySDK } from '../src/IdentitySDK';
import { createMockSDKConfig, createMockSession } from './setup';

describe('IdentitySDK', () => {
  let sdk: IdentitySDK;
  let mockConfig: any;

  beforeEach(() => {
    mockConfig = createMockSDKConfig();
    sdk = new IdentitySDK(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with valid configuration', () => {
      expect(sdk).toBeInstanceOf(IdentitySDK);
      expect(sdk.getCurrentSession()).toBeNull();
    });

    it('should initialize with custom storage', () => {
      const customStorage = {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn()
      };
      
      const sdkWithStorage = new IdentitySDK(mockConfig, customStorage);
      expect(sdkWithStorage).toBeInstanceOf(IdentitySDK);
    });

    it('should throw error for invalid configuration', () => {
      expect(() => {
        new IdentitySDK(null as any);
      }).toThrow();
    });
  });

  describe('Authentication', () => {
    it('should initialize authentication flow', async () => {
      const authRequest = await sdk.initializeAuth();
      expect(authRequest).toBeDefined();
      expect(authRequest.url).toBeDefined();
    });

    it('should handle authentication callback', async () => {
      const mockCallbackUrl = 'http://localhost:3000/callback?code=test-code&state=test-state';
      const response = await sdk.handleAuthCallback(mockCallbackUrl);
      
      expect(response).toBeDefined();
      expect(response.success).toBeDefined();
    });

    it('should handle invalid authentication callback', async () => {
      const invalidUrl = 'http://localhost:3000/callback?error=access_denied';
      const response = await sdk.handleAuthCallback(invalidUrl);
      
      expect(response.success).toBe(false);
    });

    it('should logout user', async () => {
      await sdk.logout();
      expect(sdk.getCurrentSession()).toBeNull();
    });

    it('should check session validity', () => {
      const isValid = sdk.isSessionValid();
      expect(typeof isValid).toBe('boolean');
    });

    it('should refresh session if needed', async () => {
      const refreshed = await sdk.refreshSessionIfNeeded();
      expect(typeof refreshed).toBe('boolean');
    });
  });

  describe('Session Management', () => {
    it('should get current session', () => {
      const session = sdk.getCurrentSession();
      expect(session).toBeNull(); // No session initially
    });

    it('should handle session expiration', () => {
      const isValid = sdk.isSessionValid();
      expect(isValid).toBe(false); // No valid session
    });
  });

  describe('Data Collection', () => {
    it('should get compliance data for platform', () => {
      const complianceData = sdk.getComplianceData('test-platform');
      expect(complianceData).toBeDefined();
    });

    it('should request data collection', async () => {
      const request = {
        platform: 'test-platform',
        dataPoints: ['email', 'name']
      };
      
      const response = await sdk.requestDataCollection(request);
      expect(response).toBeDefined();
    });

    it('should request standard data point', async () => {
      const request = {
        dataPointId: 'email',
        userId: 'test-user-id'
      };
      
      const response = await sdk.requestStandardDataPoint(request);
      expect(response).toBeDefined();
    });

    it('should propose new data point', async () => {
      const proposal = {
        name: 'test-data-point',
        description: 'Test data point',
        category: 'personal'
      };
      
      const response = await sdk.proposeDataPoint(proposal);
      expect(response).toBeDefined();
    });

    it('should vote on proposal', async () => {
      const vote = {
        proposalId: 'test-proposal-id',
        vote: 'approve'
      };
      
      const response = await sdk.voteOnProposal(vote);
      expect(response).toBeDefined();
    });
  });

  describe('Zero-Knowledge Proofs', () => {
    it('should generate Schnorr proof', async () => {
      const data = {
        privateKey: 'test-private-key'
      };
      
      const proof = await sdk.generateProof('schnorr', data);
      expect(proof).toBeDefined();
    });

    it('should generate Pedersen proof', async () => {
      const data = {
        publicPNId: 'test-public-id'
      };
      
      const proof = await sdk.generateProof('pedersen', data);
      expect(proof).toBeDefined();
    });

    it('should throw error for unknown proof type', async () => {
      const data = { test: 'data' };
      
      await expect(sdk.generateProof('unknown', data)).rejects.toThrow('Unknown proof type');
    });

    it('should verify proof', async () => {
      const proof = { type: 'schnorr', data: 'test-proof' };
      const isValid = await sdk.verifyProof(proof, 'schnorr');
      expect(typeof isValid).toBe('boolean');
    });

    it('should generate data point proof', async () => {
      const proof = await sdk.generateDataPointProof('test-data-point', 'test-user-id');
      expect(proof).toBeDefined();
    });

    it('should generate ownership proof', async () => {
      const data = { owner: 'test-user', asset: 'test-asset' };
      const proof = await sdk.generateOwnershipProof(data);
      expect(proof).toBeDefined();
    });
  });

  describe('Data Point Management', () => {
    it('should get available data points', () => {
      const dataPoints = sdk.getAvailableDataPoints();
      expect(dataPoints).toBeDefined();
      expect(typeof dataPoints).toBe('object');
    });

    it('should validate data point request', () => {
      const isValid = sdk.validateDataPointRequest('email');
      expect(typeof isValid).toBe('boolean');
    });

    it('should get data point metadata', () => {
      const metadata = sdk.getDataPointMetadata('email');
      expect(metadata).toBeDefined();
    });
  });

  describe('Manager Access', () => {
    it('should provide access to authentication manager', () => {
      const authManager = sdk.getAuthenticationManager();
      expect(authManager).toBeDefined();
    });

    it('should provide access to ZKP manager', () => {
      const zkpManager = sdk.getZKPManager();
      expect(zkpManager).toBeDefined();
    });

    it('should provide access to data collection manager', () => {
      const dataManager = sdk.getDataCollectionManager();
      expect(dataManager).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle authentication errors gracefully', async () => {
      const invalidUrl = 'invalid-url';
      const response = await sdk.handleAuthCallback(invalidUrl);
      expect(response.success).toBe(false);
    });

    it('should handle data collection errors gracefully', async () => {
      const invalidRequest = null;
      await expect(sdk.requestDataCollection(invalidRequest)).rejects.toThrow();
    });
  });
});
