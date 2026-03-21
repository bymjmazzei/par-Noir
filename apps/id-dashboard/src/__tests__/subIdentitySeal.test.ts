/**
 * @jest-environment jsdom
 */
import { TextEncoder, TextDecoder } from 'util';
import { webcrypto } from 'crypto';

if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
  globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
}
Object.defineProperty(globalThis, 'crypto', {
  value: webcrypto,
  configurable: true
});

import { sealSubExportPayload, unsealSubExportPayload } from '../utils/subIdentitySeal';

describe('subIdentitySeal', () => {
  it('round-trips payload with passphrase', async () => {
    const plain = JSON.stringify({ pnName: 'x', passcode: 'y', k: 1 });
    const sealed = await sealSubExportPayload(plain, 'test-passphrase-123');
    const out = await unsealSubExportPayload(sealed, 'test-passphrase-123');
    expect(out).toBe(plain);
  });

  it('fails on wrong passphrase', async () => {
    const sealed = await sealSubExportPayload('secret', 'a');
    await expect(unsealSubExportPayload(sealed, 'b')).rejects.toThrow();
  });
});
