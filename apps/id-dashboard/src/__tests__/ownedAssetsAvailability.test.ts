/**
 * @jest-environment jsdom
 */
import {
  clearOwnedAssetsUnavailable,
  isOwnedAssetsUnavailable,
  markOwnedAssetsUnavailable,
} from '../services/storage/ownedAssetsAvailability';

const ownerGet = jest.fn();

jest.mock('../services/ownerApiService', () => ({
  ownerGet: (...args: unknown[]) => ownerGet(...args),
  ownerFetch: jest.fn(),
}));

import { fetchOwnedAssets } from '../services/ownedAssetsApi';

describe('fetchOwnedAssets 409 memo', () => {
  beforeEach(() => {
    clearOwnedAssetsUnavailable();
    jest.clearAllMocks();
  });

  it('memos 409 and does not re-GET owned-assets', async () => {
    ownerGet.mockResolvedValue({
      status: 409,
      ok: false,
      json: async () => ({ error: 'cloud_token_required' }),
    });

    const a = await fetchOwnedAssets('tok', 'pn-abc');
    const b = await fetchOwnedAssets('tok', 'pn-abc');
    expect(a).toEqual([]);
    expect(b).toEqual([]);
    expect(ownerGet).toHaveBeenCalledTimes(1);
    expect(isOwnedAssetsUnavailable('pn-abc')).toBe(true);
  });

  it('single-flights parallel first probes', async () => {
    let resolveRes: (v: unknown) => void = () => undefined;
    ownerGet.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRes = resolve;
        })
    );

    const p1 = fetchOwnedAssets('tok', 'pn-xyz');
    const p2 = fetchOwnedAssets('tok', 'pn-xyz');
    expect(ownerGet).toHaveBeenCalledTimes(1);

    resolveRes({
      status: 409,
      ok: false,
      json: async () => ({ error: 'cloud_token_required' }),
    });
    await Promise.all([p1, p2]);
    expect(ownerGet).toHaveBeenCalledTimes(1);
  });

  it('force clears memo and probes again', async () => {
    markOwnedAssetsUnavailable('pn-abc');
    ownerGet.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ assets: [{ id: '1' }] }),
    });
    const list = await fetchOwnedAssets('tok', 'pn-abc', { force: true });
    expect(list).toEqual([{ id: '1' }]);
    expect(ownerGet).toHaveBeenCalledTimes(1);
    expect(isOwnedAssetsUnavailable('pn-abc')).toBe(false);
  });
});
