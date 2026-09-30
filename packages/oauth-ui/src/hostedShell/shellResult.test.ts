import { describe, expect, it, vi } from 'vitest';

vi.mock('@par-noir/identity-crypto', () => ({
  IdentityCrypto: {},
}));

import { encodeShellReturn, parseShellReturn } from './session';
import { buildShellResult } from './shellResult';

describe('buildShellResult export round-trip', () => {
  it('returns an identity file the hosted page can store', async () => {
    const result = await buildShellResult({
      op: 'export',
      pnName: 'unused',
      passcode: 'unused',
      unlocked: {
        publicKey: 'pk',
        decryptedIdentity: { id: 'did:pn:1' },
        encryptedIdentity: { id: 'did:pn:1', encryptedData: 'ciphertext' },
      },
    });
    const fragment = encodeShellReturn({
      v: 1,
      op: 'export',
      did: 'did:pn:1',
      publicKey: 'pk',
      accessToken: '',
      result,
    });
    const parsed = parseShellReturn(fragment);
    expect(parsed?.result?.identityFile).toContain('ciphertext');
    expect(parsed?.result?.passcode).toBeUndefined();
  });

  it('returns the device messaging key on a session unlock so cloud credentials can be unsealed later', async () => {
    const result = await buildShellResult({
      op: 'session',
      pnName: 'unused',
      passcode: 'unused',
      unlocked: {
        publicKey: 'pk',
        decryptedIdentity: { pqcSecrets: { mlKemSecretKey: 'sek', mlKemPublicKey: 'pubk' } },
        encryptedIdentity: {},
      },
    });
    const fragment = encodeShellReturn({
      v: 1,
      op: 'session',
      did: 'did:pn:1',
      publicKey: 'pk',
      accessToken: '',
      result,
    });
    expect(parseShellReturn(fragment)?.result?.mlKemSecretKey).toBe('sek');
  });
});
