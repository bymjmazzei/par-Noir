import { DataCollectionManager } from '../../src/IdentitySDK/modules/dataCollectionManager';

describe('DataCollectionManager', () => {
  let dataManager: DataCollectionManager;

  beforeEach(() => {
    dataManager = new DataCollectionManager();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize data collection manager', () => {
      expect(dataManager).toBeInstanceOf(DataCollectionManager);
    });
  });

  describe('Compliance Data', () => {
    it('should get compliance data for platform', () => {
      const platform = 'test-platform';
      const complianceData = dataManager.getComplianceData(platform);
      
      expect(complianceData).toBeDefined();
      expect(complianceData.platform).toBe(platform);
    });

    it('should handle unknown platform', () => {
      const platform = 'unknown-platform';
      const complianceData = dataManager.getComplianceData(platform);
      
      expect(complianceData).toBeDefined();
      expect(complianceData.platform).toBe(platform);
    });
  });

  describe('Data Collection Requests', () => {
    it('should request data collection', async () => {
      const request = {
        platform: 'test-platform',
        dataPoints: ['email', 'name', 'phone'],
        purpose: 'authentication',
        userId: 'test-user-id'
      };
      
      const response = await dataManager.requestDataCollection(request);
      expect(response).toBeDefined();
      expect(response.requestId).toBeDefined();
    });

    it('should handle invalid data collection request', async () => {
      const invalidRequest = {
        platform: '',
        dataPoints: [],
        purpose: '',
        userId: ''
      };
      
      await expect(dataManager.requestDataCollection(invalidRequest)).rejects.toThrow();
    });

    it('should validate data collection request', () => {
      const validRequest = {
        platform: 'test-platform',
        dataPoints: ['email'],
        purpose: 'authentication',
        userId: 'test-user-id'
      };
      
      const isValid = dataManager.validateDataCollectionRequest(validRequest);
      expect(isValid).toBe(true);
    });
  });

  describe('Standard Data Points', () => {
    it('should request standard data point', async () => {
      const request = {
        dataPointId: 'email',
        userId: 'test-user-id',
        purpose: 'authentication'
      };
      
      const response = await dataManager.requestStandardDataPoint(request);
      expect(response).toBeDefined();
      expect(response.dataPointId).toBe('email');
    });

    it('should get available data points', () => {
      const dataPoints = dataManager.getAvailableDataPoints();
      expect(dataPoints).toBeDefined();
      expect(typeof dataPoints).toBe('object');
    });

    it('should validate data point request', () => {
      const isValid = dataManager.validateDataPointRequest('email');
      expect(typeof isValid).toBe('boolean');
    });

    it('should get data point metadata', () => {
      const metadata = dataManager.getDataPointMetadata('email');
      expect(metadata).toBeDefined();
      expect(metadata.id).toBe('email');
    });

    it('should handle invalid data point ID', () => {
      const metadata = dataManager.getDataPointMetadata('invalid-data-point');
      expect(metadata).toBeUndefined();
    });
  });

  describe('Data Point Proposals', () => {
    it('should propose new data point', async () => {
      const proposal = {
        name: 'test-data-point',
        description: 'Test data point for testing',
        category: 'personal',
        dataType: 'string',
        required: false,
        proposer: 'test-user-id'
      };
      
      const response = await dataManager.proposeDataPoint(proposal);
      expect(response).toBeDefined();
      expect(response.proposalId).toBeDefined();
    });

    it('should handle invalid proposal', async () => {
      const invalidProposal = {
        name: '',
        description: '',
        category: '',
        dataType: '',
        required: false,
        proposer: ''
      };
      
      await expect(dataManager.proposeDataPoint(invalidProposal)).rejects.toThrow();
    });

    it('should vote on proposal', async () => {
      const vote = {
        proposalId: 'test-proposal-id',
        vote: 'approve',
        voter: 'test-user-id',
        reason: 'Good proposal'
      };
      
      const response = await dataManager.voteOnProposal(vote);
      expect(response).toBeDefined();
      expect(response.voteId).toBeDefined();
    });

    it('should handle invalid vote', async () => {
      const invalidVote = {
        proposalId: '',
        vote: 'invalid',
        voter: '',
        reason: ''
      };
      
      await expect(dataManager.voteOnProposal(invalidVote)).rejects.toThrow();
    });
  });

  describe('Data Point Categories', () => {
    it('should get data points by category', () => {
      const personalDataPoints = dataManager.getDataPointsByCategory('personal');
      expect(personalDataPoints).toBeDefined();
      expect(Array.isArray(personalDataPoints)).toBe(true);
    });

    it('should get all categories', () => {
      const categories = dataManager.getCategories();
      expect(categories).toBeDefined();
      expect(Array.isArray(categories)).toBe(true);
    });
  });

  describe('Data Point Validation', () => {
    it('should validate data point value', () => {
      const isValid = dataManager.validateDataPointValue('email', 'test@example.com');
      expect(isValid).toBe(true);
    });

    it('should reject invalid data point value', () => {
      const isValid = dataManager.validateDataPointValue('email', 'invalid-email');
      expect(isValid).toBe(false);
    });

    it('should validate required data points', () => {
      const data = {
        email: 'test@example.com',
        name: 'Test User'
      };
      
      const missing = dataManager.validateRequiredDataPoints(data, ['email', 'name', 'phone']);
      expect(missing).toContain('phone');
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      // Mock network error
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
      
      const request = {
        platform: 'test-platform',
        dataPoints: ['email'],
        purpose: 'authentication',
        userId: 'test-user-id'
      };
      
      await expect(dataManager.requestDataCollection(request)).rejects.toThrow('Network error');
      
      global.fetch = originalFetch;
    });

    it('should handle invalid responses gracefully', async () => {
      // Mock invalid response
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Bad request' })
      });
      
      const request = {
        platform: 'test-platform',
        dataPoints: ['email'],
        purpose: 'authentication',
        userId: 'test-user-id'
      };
      
      await expect(dataManager.requestDataCollection(request)).rejects.toThrow();
      
      global.fetch = originalFetch;
    });
  });

  describe('Security', () => {
    it('should sanitize data point values', () => {
      const maliciousValue = '<script>alert("xss")</script>';
      const sanitized = dataManager.sanitizeDataPointValue(maliciousValue);
      expect(sanitized).not.toContain('<script>');
    });

    it('should validate data point permissions', () => {
      const hasPermission = dataManager.validateDataPointPermission('email', 'test-user-id');
      expect(typeof hasPermission).toBe('boolean');
    });
  });
});
