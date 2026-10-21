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

import {
  buildSealedSubExportFile,
  isSubKindExportable,
  sealSubExportPayload,
  unsealSubExportPayload,
} from '../utils/subIdentitySeal';

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

  it('export file carries only the sealed blob, never factors in plain text', async () => {
    const plain = JSON.stringify({ pnName: 'sub-name-xyz', passcode: 'sub-pass-xyz', encryptedIdentity: {} });
    const sealed = await sealSubExportPayload(plain, 'pass-123');
    const file = buildSealedSubExportFile('asset-1', sealed);
    expect(file).not.toContain('sub-name-xyz');
    expect(file).not.toContain('sub-pass-xyz');
    expect(file).not.toMatch(/"pnName"|"passcode"/);
    const parsed = JSON.parse(file) as { type: string; sealed: unknown };
    expect(parsed.type).toBe('par-noir-sub-identity-sealed');
    expect(await unsealSubExportPayload(JSON.stringify(parsed.sealed), 'pass-123')).toBe(plain);
  });

  it('AI agents are not exportable', () => {
    expect(isSubKindExportable('ai_agent')).toBe(false);
    expect(isSubKindExportable('device')).toBe(true);
  });
});
