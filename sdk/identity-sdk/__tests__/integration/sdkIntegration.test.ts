import { IdentitySDK, createIdentitySDK, createSimpleConfig } from '../../src';
import { createMockSDKConfig } from '../setup';

describe('SDK Integration Tests', () => {
  let sdk: IdentitySDK;

  beforeEach(() => {
    const config = createMockSDKConfig();
    sdk = new IdentitySDK(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('End-to-End Authentication Flow', () => {
    it('should complete full authentication flow', async () => {
      // Step 1: Initialize authentication
      const authRequest = await sdk.initializeAuth();
      expect(authRequest.url).toBeDefined();
      expect(authRequest.state).toBeDefined();

      // Step 2: Simulate callback with valid code
      const callbackUrl = `${authRequest.url}&code=test-code&state=${authRequest.state}`;
      const authResponse = await sdk.handleAuthCallback(callbackUrl);
      expect(authResponse.success).toBeDefined();

      // Step 3: Check session validity
      const isValid = sdk.isSessionValid();
      expect(typeof isValid).toBe('boolean');

      // Step 4: Logout
      await sdk.logout();
      expect(sdk.getCurrentSession()).toBeNull();
    });

    it('should handle authentication failure gracefully', async () => {
      const authRequest = await sdk.initializeAuth();
      const errorCallbackUrl = `${authRequest.url}&error=access_denied&state=${authRequest.state}`;
      
      const authResponse = await sdk.handleAuthCallback(errorCallbackUrl);
      expect(authResponse.success).toBe(false);
      expect(authResponse.error).toBeDefined();
    });
  });

  describe('Data Collection Integration', () => {
    it('should complete data collection workflow', async () => {
      // Step 1: Get compliance data
      const complianceData = sdk.getComplianceData('test-platform');
      expect(complianceData).toBeDefined();

      // Step 2: Request data collection
      const dataRequest = {
        platform: 'test-platform',
        dataPoints: ['email', 'name'],
        purpose: 'authentication',
        userId: 'test-user-id'
      };
      
      const collectionResponse = await sdk.requestDataCollection(dataRequest);
      expect(collectionResponse).toBeDefined();

      // Step 3: Request specific data point
      const dataPointResponse = await sdk.requestStandardDataPoint({
        dataPointId: 'email',
        userId: 'test-user-id'
      });
      expect(dataPointResponse).toBeDefined();
    });

    it('should handle data point proposal workflow', async () => {
      // Step 1: Propose new data point
      const proposal = {
        name: 'test-data-point',
        description: 'Test data point',
        category: 'personal',
        dataType: 'string',
        required: false,
        proposer: 'test-user-id'
      };
      
      const proposalResponse = await sdk.proposeDataPoint(proposal);
      expect(proposalResponse).toBeDefined();

      // Step 2: Vote on proposal
      const vote = {
        proposalId: proposalResponse.proposalId,
        vote: 'approve',
        voter: 'test-user-id',
        reason: 'Good proposal'
      };
      
      const voteResponse = await sdk.voteOnProposal(vote);
      expect(voteResponse).toBeDefined();
    });
  });

  describe('Zero-Knowledge Proof Integration', () => {
    it('should complete ZKP workflow', async () => {
      // Step 1: Generate Schnorr proof
      const schnorrProof = await sdk.generateProof('schnorr', {
        privateKey: 'test-private-key'
      });
      expect(schnorrProof).toBeDefined();

      // Step 2: Verify Schnorr proof
      const schnorrValid = await sdk.verifyProof(schnorrProof, 'schnorr');
      expect(typeof schnorrValid).toBe('boolean');

      // Step 3: Generate Pedersen proof
      const pedersenProof = await sdk.generateProof('pedersen', {
        publicPNId: 'test-public-id'
      });
      expect(pedersenProof).toBeDefined();

      // Step 4: Verify Pedersen proof
      const pedersenValid = await sdk.verifyProof(pedersenProof, 'pedersen');
      expect(typeof pedersenValid).toBe('boolean');
    });

    it('should generate data point and ownership proofs', async () => {
      // Generate data point proof
      const dataPointProof = await sdk.generateDataPointProof('email', 'test-user-id');
      expect(dataPointProof).toBeDefined();

      // Generate ownership proof
      const ownershipProof = await sdk.generateOwnershipProof({
        owner: 'test-user-id',
        asset: 'email-data',
        timestamp: Date.now()
      });
      expect(ownershipProof).toBeDefined();
    });
  });

  describe('Manager Integration', () => {
    it('should provide access to all managers', () => {
      const authManager = sdk.getAuthenticationManager();
      const zkpManager = sdk.getZKPManager();
      const dataManager = sdk.getDataCollectionManager();

      expect(authManager).toBeDefined();
      expect(zkpManager).toBeDefined();
      expect(dataManager).toBeDefined();
    });

    it('should maintain consistent state across managers', async () => {
      // Initialize auth
      await sdk.initializeAuth();
      
      // Check that all managers are in consistent state
      const authManager = sdk.getAuthenticationManager();
      const currentSession = authManager.getCurrentSession();
      const sdkSession = sdk.getCurrentSession();
      
      expect(currentSession).toEqual(sdkSession);
    });
  });

  describe('Error Recovery', () => {
    it('should recover from authentication errors', async () => {
      // Simulate authentication error
      const errorUrl = 'http://localhost:3000/callback?error=access_denied';
      const errorResponse = await sdk.handleAuthCallback(errorUrl);
      expect(errorResponse.success).toBe(false);

      // Should be able to retry authentication
      const retryAuth = await sdk.initializeAuth();
      expect(retryAuth).toBeDefined();
    });

    it('should recover from data collection errors', async () => {
      // Simulate data collection error
      const invalidRequest = {
        platform: '',
        dataPoints: [],
        purpose: '',
        userId: ''
      };

      await expect(sdk.requestDataCollection(invalidRequest)).rejects.toThrow();

      // Should be able to make valid requests after error
      const validRequest = {
        platform: 'test-platform',
        dataPoints: ['email'],
        purpose: 'authentication',
        userId: 'test-user-id'
      };

      const response = await sdk.requestDataCollection(validRequest);
      expect(response).toBeDefined();
    });
  });
});

describe('SDK Factory Functions', () => {
  describe('createIdentitySDK', () => {
    it('should create SDK instance with factory function', () => {
      const config = createMockSDKConfig();
      const sdk = createIdentitySDK(config);
      expect(sdk).toBeInstanceOf(IdentitySDK);
    });
  });

  describe('createSimpleConfig', () => {
    it('should create simple configuration', () => {
      const config = createSimpleConfig('test-client-id', 'http://localhost:3000/callback');
      expect(config.identityProvider.config.clientId).toBe('test-client-id');
      expect(config.identityProvider.config.redirectUri).toBe('http://localhost:3000/callback');
    });

    it('should create configuration with options', () => {
      const config = createSimpleConfig(
        'test-client-id',
        'http://localhost:3000/callback',
        {
          scopes: ['openid', 'profile'],
          storage: 'indexedDB',
          autoRefresh: false,
          debug: true
        }
      );

      expect(config.identityProvider.config.scopes).toEqual(['openid', 'profile']);
      expect(config.storage).toBe('indexedDB');
      expect(config.autoRefresh).toBe(false);
      expect(config.debug).toBe(true);
    });
  });
});
