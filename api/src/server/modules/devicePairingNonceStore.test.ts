/**
 * @jest-environment node
 */
import {
  clearMemoryPairingNoncesForTests,
  consumePairingNonce,
  storePairingNonce,
} from './devicePairingNonceStore';

jest.mock('../utils/cache', () => ({
  getCacheClient: jest.fn(() => null),
}));

describe('devicePairingNonceStore', () => {
  beforeEach(() => {
    clearMemoryPairingNoncesForTests();
  });

  it('stores and consumes a nonce in memory fallback', async () => {
    await storePairingNonce('nonce-1', {
      pnIdentifier: 'pn-test',
      expiresAt: Date.now() + 60_000,
      createdByDeviceId: 'dev-1',
    });

    const entry = await consumePairingNonce('nonce-1');
    expect(entry?.pnIdentifier).toBe('pn-test');
    expect(await consumePairingNonce('nonce-1')).toBeNull();
  });

  it('rejects expired nonce', async () => {
    await storePairingNonce('expired', {
      pnIdentifier: 'pn-test',
      expiresAt: Date.now() - 1000,
      createdByDeviceId: 'dev-1',
    });
    expect(await consumePairingNonce('expired')).toBeNull();
  });
});
