/**
 * @jest-environment jsdom
 */
const listDeviceZkpPoints = jest.fn();
const sessionDriveFor = jest.fn();

jest.mock('@par-noir/device-cloud-credentials', () => ({
  listDeviceZkpPoints: (token: string, sheet: string) => listDeviceZkpPoints(token, sheet),
}));

jest.mock('../services/ownerApiService', () => ({
  ownerFetch: jest.fn(),
  ownerGet: jest.fn(),
}));

jest.mock('../services/sessionDrive', () => ({
  sessionDriveFor: (pn: string, token: string) => sessionDriveFor(pn, token),
}));

import { fetchZkpsFromDrive } from '../services/identityMigrationApi';

describe('fetchZkpsFromDrive', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionDriveFor.mockResolvedValue({
      accessToken: 'google-token',
      index: { sheetIds: { 'zkp-data-points': 'sheet-zkp' } },
    });
  });

  it('reads ZKP rows from the device sheet', async () => {
    listDeviceZkpPoints.mockResolvedValue([
      { dataPointId: 'dp-1', zkpProof: 'proof', proofType: 'age' },
    ]);
    const proofs = await fetchZkpsFromDrive('api-token', 'mig-1', 'pn-self');
    expect(sessionDriveFor).toHaveBeenCalledWith('pn-self', 'api-token');
    expect(listDeviceZkpPoints).toHaveBeenCalledWith('google-token', 'sheet-zkp');
    expect(proofs).toEqual([{ dataPointId: 'dp-1', zkpProof: 'proof', proofType: 'age' }]);
  });
});
