/**
 * @jest-environment node
 */
import { fetchGrantedZkpProofs } from '../modules/integratorDataPointService';
import { ThirdPartyPermissionsService } from '../modules/thirdPartyPermissionsService';

jest.mock('../modules/thirdPartyPermissionsService', () => ({
  ThirdPartyPermissionsService: {
    getPermission: jest.fn(),
    getReleasedProofs: jest.fn(),
  },
}));

const mockGetPermission = ThirdPartyPermissionsService.getPermission as jest.Mock;
const mockGetReleasedProofs = ThirdPartyPermissionsService.getReleasedProofs as jest.Mock;

const proof = (dataPointId: string, verificationLevel: string) => ({
  dataPointId,
  proofType: 'zk',
  zkpProof: `proof-${dataPointId}`,
  verifiedAt: '2026-01-01T00:00:00.000Z',
  verificationLevel,
});

describe('fetchGrantedZkpProofs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetReleasedProofs.mockResolvedValue([proof('email_verified', 'basic'), proof('age_attestation', 'basic')]);
  });

  it('returns nothing when every requested data point is blocked', async () => {
    const proofs = await fetchGrantedZkpProofs({
      userPnIdentifier: 'pn-abc123',
      clientId: 'test-client',
      dataPointIds: ['key1', 'key2', 'pn_file', 'pnIdentifier'],
    });

    expect(proofs).toEqual([]);
    // Blocked ids must never reach the permission or proof lookup path.
    expect(mockGetPermission).not.toHaveBeenCalled();
    expect(mockGetReleasedProofs).not.toHaveBeenCalled();
  });

  it('returns nothing without an active grant, first-party clients included', async () => {
    mockGetPermission.mockResolvedValue(null);
    for (const clientId of ['test-client', 'browser-app']) {
      await expect(
        fetchGrantedZkpProofs({ userPnIdentifier: 'pn-abc123', clientId, dataPointIds: ['email_verified'] })
      ).resolves.toEqual([]);
    }
    expect(mockGetReleasedProofs).not.toHaveBeenCalled();
  });

  it('returns only released proofs the grant covers', async () => {
    mockGetPermission.mockResolvedValue({
      toolId: 'test-client',
      status: 'active',
      dataPoints: ['email_verified'],
      requiredDataPoints: [],
      optionalDataPoints: ['email_verified', 'age_attestation'],
    });

    const proofs = await fetchGrantedZkpProofs({
      userPnIdentifier: 'pn-abc123',
      clientId: 'test-client',
      dataPointIds: ['email_verified', 'age_attestation'],
    });

    expect(proofs.map((p) => p.dataPointId)).toEqual(['email_verified']);
    expect(proofs[0].zkpProof).toBe('proof-email_verified');
  });

  it('omits a proof below the level the grant requires', async () => {
    mockGetPermission.mockResolvedValue({
      toolId: 'test-client',
      status: 'active',
      dataPoints: ['email_verified'],
      requiredDataPoints: [],
      optionalDataPoints: [],
      dataPointLevels: { email_verified: 'verified' },
    });

    await expect(
      fetchGrantedZkpProofs({
        userPnIdentifier: 'pn-abc123',
        clientId: 'test-client',
        dataPointIds: ['email_verified'],
      })
    ).resolves.toEqual([]);
  });
});
