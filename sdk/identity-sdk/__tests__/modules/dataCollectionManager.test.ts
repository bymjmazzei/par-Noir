import { DataCollectionManager } from '../../src/IdentitySDK/modules/dataCollectionManager';
import { installIdentityEventAutoResolve } from '../identityEventTestSetup';

describe('DataCollectionManager', () => {
  let dataManager: DataCollectionManager;
  let uninstallEvents: () => void;

  beforeEach(() => {
    dataManager = new DataCollectionManager();
    uninstallEvents = installIdentityEventAutoResolve();
  });

  afterEach(() => {
    uninstallEvents();
    jest.clearAllMocks();
  });

  it('initializes', () => {
    expect(dataManager).toBeInstanceOf(DataCollectionManager);
  });

  describe('Compliance Data', () => {
    it('returns compliance data for platform', () => {
      const complianceData = dataManager.getComplianceData('test-platform');
      expect(complianceData.platform).toBe('test-platform');
    });
  });

  describe('Data Collection Requests', () => {
    it('requestDataCollection resolves when event bridge is installed', async () => {
      const response = await dataManager.requestDataCollection({
        platform: 'test-platform',
        dataPoints: ['email'],
        purpose: 'authentication',
        consentText: 'consent',
        dataUsage: 'usage',
      });
      expect(response.success).toBe(true);
      expect(response.requestId).toBe('mock-req-id');
    });

    it('throws on unknown data point ids', async () => {
      await expect(
        dataManager.requestDataCollection({
          platform: 'test-platform',
          dataPoints: ['not-a-real-dp'],
          purpose: 'authentication',
          consentText: 'consent',
          dataUsage: 'usage',
        })
      ).rejects.toThrow(/Invalid data points/);
    });

    it('validateDataCollectionRequest rejects empty platform', () => {
      expect(
        dataManager.validateDataCollectionRequest({
          platform: '',
          dataPoints: ['email'],
        })
      ).toBe(false);
    });

    it('validateDataCollectionRequest accepts valid email request', () => {
      expect(
        dataManager.validateDataCollectionRequest({
          platform: 'x',
          dataPoints: ['email'],
        })
      ).toBe(true);
    });
  });

  describe('Standard Data Points', () => {
    it('requestStandardDataPoint resolves', async () => {
      const response = await dataManager.requestStandardDataPoint({
        dataPointId: 'email',
        platform: 'test',
        purpose: 'auth',
      });
      expect(response.success).toBe(true);
      expect(response.dataPointId).toBe('email');
    });

    it('getAvailableDataPoints returns registry', () => {
      expect(dataManager.getAvailableDataPoints().email).toBeDefined();
    });

    it('validateDataPointRequest', () => {
      expect(dataManager.validateDataPointRequest('email')).toBe(true);
      expect(dataManager.validateDataPointRequest('nope')).toBe(false);
    });

    it('getDataPointMetadata throws for unknown id', () => {
      expect(() => dataManager.getDataPointMetadata('invalid-data-point')).toThrow();
    });
  });

  describe('Proposals & votes', () => {
    it('proposeDataPoint resolves when useCase present and name is unique', async () => {
      const response = await dataManager.proposeDataPoint({
        name: 'Unique Test DP 001',
        description: 'desc',
        category: 'identity',
        dataType: 'string',
        requiredFields: [],
        examples: [],
        useCase: 'testing',
        proposedBy: 'user',
      });
      expect(response.success).toBe(true);
      expect(response.proposalId).toBe('mock-proposal-id');
    });

    it('proposeDataPoint returns error when required fields missing', async () => {
      const response = await dataManager.proposeDataPoint({
        name: '',
        description: '',
        category: 'identity',
        dataType: 'string',
        requiredFields: [],
        examples: [],
        useCase: '',
        proposedBy: 'user',
      });
      expect(response.success).toBe(false);
    });

    it('voteOnProposal resolves', async () => {
      const response = await dataManager.voteOnProposal({
        proposalId: 'p1',
        voterId: 'v1',
        vote: 'upvote',
      });
      expect(response.success).toBe(true);
    });

    it('voteOnProposal returns error when ids missing', async () => {
      const response = await dataManager.voteOnProposal({
        proposalId: '',
        voterId: 'v1',
        vote: 'upvote',
      });
      expect(response.success).toBe(false);
    });
  });

  describe('Categories & validation helpers', () => {
    it('getDataPointsByCategory', () => {
      const list = dataManager.getDataPointsByCategory('personal');
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
    });

    it('getCategories', () => {
      expect(dataManager.getCategories()).toContain('personal');
    });

    it('validateDataPointValue', () => {
      expect(dataManager.validateDataPointValue('email', 'a@b.co')).toBe(true);
      expect(dataManager.validateDataPointValue('email', 'not-an-email')).toBe(false);
    });

    it('validateRequiredDataPoints', () => {
      const missing = dataManager.validateRequiredDataPoints(
        { email: 'a@b.co', name: 'Test' },
        ['email', 'name', 'phone']
      );
      expect(missing).toContain('phone');
    });
  });

  describe('Security helpers', () => {
    it('sanitizeDataPointValue strips tags', () => {
      const malicious = '<script>alert("xss")</script>';
      expect(dataManager.sanitizeDataPointValue(malicious)).not.toContain('<script>');
    });

    it('validateDataPointPermission returns boolean', () => {
      expect(typeof dataManager.validateDataPointPermission('email', 'u1')).toBe('boolean');
    });
  });
});
