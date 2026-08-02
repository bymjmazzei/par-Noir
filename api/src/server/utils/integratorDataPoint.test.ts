/**
 * @jest-environment node
 */
import { getUserDriveMetadataContext, normalizePnIdentifier } from '../modules/driveMetadataHelper';
import { fetchGrantedZkpProofs } from '../modules/integratorDataPointService';
import { ThirdPartyPermissionsService } from '../modules/thirdPartyPermissionsService';

jest.mock('../modules/driveMetadataHelper', () => {
  const actual = jest.requireActual('../modules/driveMetadataHelper');
  return {
    ...actual,
    getUserDriveMetadataContext: jest.fn(),
  };
});

jest.mock('../modules/thirdPartyPermissionsService', () => ({
  ThirdPartyPermissionsService: {
    getPermissions: jest.fn(),
  },
}));

const mockGetContext = getUserDriveMetadataContext as jest.MockedFunction<
  typeof getUserDriveMetadataContext
>;
const mockGetPermissions = ThirdPartyPermissionsService.getPermissions as jest.MockedFunction<
  typeof ThirdPartyPermissionsService.getPermissions
>;

describe('driveMetadataHelper', () => {
  it('normalizePnIdentifier adds pn- prefix', () => {
    expect(normalizePnIdentifier('abc123')).toBe('pn-abc123');
    expect(normalizePnIdentifier('pn-abc123')).toBe('pn-abc123');
  });
});

describe('integratorDataPointService BLOCKED list', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetContext.mockResolvedValue({
      accessToken: 'token',
      metadataFolderId: 'meta',
      normalizedPnIdentifier: 'pn-abc123',
      accountId: undefined,
    } as never);
  });

  it('returns nothing when every requested data point is blocked', async () => {
    const proofs = await fetchGrantedZkpProofs({
      userPnIdentifier: 'pn-abc123',
      clientId: 'test-client',
      dataPointIds: ['pn_name', 'passcode', 'pn_file', 'pnIdentifier'],
    });

    expect(proofs).toEqual([]);
    // Blocked ids must never reach the permission or proof lookup path.
    expect(mockGetPermissions).not.toHaveBeenCalled();
  });

  it('returns nothing when the user has no storage context', async () => {
    mockGetContext.mockResolvedValue(null);

    const proofs = await fetchGrantedZkpProofs({
      userPnIdentifier: 'pn-nonexistent-user-xyz',
      clientId: 'test-client',
      dataPointIds: ['age_attestation'],
    });

    expect(proofs).toEqual([]);
  });
});
