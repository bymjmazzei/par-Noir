/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDeviceRegistry, invalidateDeviceRegistryCache } from './deviceService';

describe('fetchDeviceRegistry cache', () => {
  afterEach(() => {
    invalidateDeviceRegistryCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('serves a second caller from memory without another fetch', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        devices: [],
        policy: { unkeyedAllows: [], firstDeviceKeyedAt: undefined },
        hasKeyedDevices: false,
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const a = await fetchDeviceRegistry('pn-test', 'token-1');
    const b = await fetchDeviceRegistry('pn-test', 'token-2');

    expect(a).toEqual(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent fetches', async () => {
    let resolveFetch: (v: unknown) => void = () => undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const p1 = fetchDeviceRegistry('pn-test', 'token');
    const p2 = fetchDeviceRegistry('pn-test', 'token');
    resolveFetch({
      ok: true,
      json: async () => ({
        devices: [],
        policy: { unkeyedAllows: [], firstDeviceKeyedAt: undefined },
        hasKeyedDevices: false,
      }),
    });
    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toEqual(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
