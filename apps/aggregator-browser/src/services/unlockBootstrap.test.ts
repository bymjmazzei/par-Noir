/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { invalidateUnlockBootstrap, runUnlockBootstrap } from './unlockBootstrap';

vi.mock('../config/buildFlags', () => ({ MESSAGING_ONLY: false }));

vi.mock('./pnOAuthService', () => ({
  PNOAuthService: {
    getUserInfo: vi.fn(async () => ({
      did: 'did:key:abc',
      pn_identifier: 'pn-test',
      nickname: 'nick'
    }))
  }
}));

vi.mock('./profileService', () => ({
  getUserProfile: vi.fn(async () => ({ displayName: 'Test User' }))
}));

vi.mock('./deviceService', () => ({
  wireLocalDeviceProofSigner: vi.fn(async () => undefined),
  fetchDeviceRegistry: vi.fn(async () => ({
    devices: [],
    policy: { unkeyedAllows: [], firstDeviceKeyedAt: undefined },
    hasKeyedDevices: false
  }))
}));

describe('runUnlockBootstrap', () => {
  afterEach(() => {
    invalidateUnlockBootstrap();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('coalesces parallel bootstrap for same unlock', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/api/feeds/tokens')) {
        return { ok: true, json: async () => ({ feedTokens: [] }) };
      }
      return { ok: false, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const a = runUnlockBootstrap('token-abc', 'pn-test');
    const b = runUnlockBootstrap('token-abc', 'pn-test');
    const [ra, rb] = await Promise.all([a, b]);

    expect(ra.userInfo.pn_identifier).toBe('pn-test');
    expect(rb.profileDisplayName).toBe('Test User');
    const tokenCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/feeds/tokens'));
    expect(tokenCalls.length).toBe(1);
  });
});
