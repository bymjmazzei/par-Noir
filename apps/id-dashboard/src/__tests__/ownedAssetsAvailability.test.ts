/**
 * @jest-environment jsdom
 */
import { clearOwnedAssetsUnavailable } from '../services/storage/ownedAssetsAvailability';

const ownerGet = jest.fn();
const ownerFetch = jest.fn();
const listDeviceOwnedAssets = jest.fn(async () => [] as Array<{ id: string }>);

jest.mock('@par-noir/device-cloud-credentials', () => ({
  listDeviceOwnedAssets: () => listDeviceOwnedAssets(),
  ensureDeviceOwnedAssetsSheet: async () => 'sheet-owned',
  setSessionDriveIndex: () => undefined,
  upsertDeviceOwnedAsset: async () => undefined,
  listDeviceAssetDelegations: async () => [],
  upsertDeviceAssetDelegation: async () => undefined,
}));

jest.mock('../services/sessionDrive', () => ({
  sessionDriveFor: async () => ({
    accessToken: 'google-token',
    index: {
      metadataFolderId: 'meta',
      sheetIds: { 'owned-assets': 'sheet-owned' },
    },
  }),
}));

jest.mock('../services/ownerApiService', () => ({
  ownerGet: (...args: unknown[]) => ownerGet(...args),
  ownerFetch: (...args: unknown[]) => ownerFetch(...args),
}));

import { fetchOwnedAssets } from '../services/ownedAssetsApi';

describe('fetchOwnedAssets device sheet', () => {
  beforeEach(async () => {
    clearOwnedAssetsUnavailable();
    listDeviceOwnedAssets.mockResolvedValue([]);
    jest.clearAllMocks();
    const { resetDriveLayoutInitGate } = await import('../services/storage/driveLayoutInitGate');
    resetDriveLayoutInitGate();
  });

  it('reads the device sheet and does not GET /api/owned-assets', async () => {
    listDeviceOwnedAssets.mockResolvedValue([{ id: 'asset-1' }]);
    const list = await fetchOwnedAssets('tok', 'pn-abc');
    expect(list).toEqual([{ id: 'asset-1' }]);
    expect(ownerGet).not.toHaveBeenCalled();
    const paths = ownerFetch.mock.calls.map((call) => String(call[2]));
    expect(paths.some((path) => path.includes('/api/owned-assets'))).toBe(false);
  });

  it('single-flights parallel reads', async () => {
    let resolveRes: (v: Array<{ id: string }>) => void = () => undefined;
    listDeviceOwnedAssets.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRes = resolve;
        })
    );

    const p1 = fetchOwnedAssets('tok', 'pn-xyz');
    const p2 = fetchOwnedAssets('tok', 'pn-xyz');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listDeviceOwnedAssets).toHaveBeenCalledTimes(1);
    resolveRes([{ id: '1' }]);
    await expect(Promise.all([p1, p2])).resolves.toEqual([[{ id: '1' }], [{ id: '1' }]]);
  });

  it('skips the sheet read while Drive layout init is active', async () => {
    const gate = await import('../services/storage/driveLayoutInitGate');
    gate.beginDriveLayoutInit();
    try {
      const list = await fetchOwnedAssets('tok', 'pn-busy');
      expect(list).toEqual([]);
      expect(listDeviceOwnedAssets).not.toHaveBeenCalled();
      expect(ownerGet).not.toHaveBeenCalled();
    } finally {
      gate.endDriveLayoutInit();
    }
  });
});
