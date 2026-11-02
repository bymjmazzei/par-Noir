import { describe, expect, it, vi } from 'vitest';

vi.mock('@par-noir/identity-crypto', () => ({
  IdentityCrypto: {},
}));

import { encodeShellReturn, parseShellReturn } from './session';
import { buildShellResult, shellMlKemResult } from './shellResult';
import { parseIdentityFileJson } from '../consentUnlock/decryptIdentityLocal';

describe('buildShellResult export round-trip', () => {
  it('returns an identity file the hosted page can store', async () => {
    const result = await buildShellResult({
      op: 'export',
      key1: 'unused',
      key2: 'unused',
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
    expect(parsed?.result?.key2).toBeUndefined();
  });

  it('returns the device messaging key on a session unlock so cloud credentials can be unsealed later', async () => {
    const result = await buildShellResult({
      op: 'session',
      key1: 'unused',
      key2: 'unused',
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

  it('a create return carries the new pN messaging key, so a cloud connected right after create gets a vault', () => {
    const created = {
      identityFile: '{"encryptedData":"ct"}',
      did: 'did:pn:1',
      publicKey: 'pk',
      ...shellMlKemResult({
        publicKey: 'pk',
        decryptedIdentity: { pqcSecrets: { mlKemSecretKey: 'sek', mlKemPublicKey: 'pubk' } },
        encryptedIdentity: {},
      }),
    };
    const fragment = encodeShellReturn({
      v: 1,
      op: 'create',
      did: 'did:pn:1',
      publicKey: 'pk',
      accessToken: '',
      result: created,
    });
    const parsed = parseShellReturn(fragment);
    expect(parsed?.result?.mlKemSecretKey).toBe('sek');
    expect(parsed?.result?.identityFile).toContain('ct');
  });

  it('keeps the recovery envelope when Unlock exports a .pn it parsed', async () => {
    const envelope = { version: 1, iv: 'env-iv', ciphertext: 'env-ct' };
    const row = parseIdentityFileJson({
      publicKey: 'pk',
      encryptedData: 'ciphertext',
      iv: 'iv',
      salt: 'salt',
      recoveryEnvelope: envelope,
    });
    const result = await buildShellResult({
      op: 'export',
      key1: 'unused',
      key2: 'unused',
      unlocked: {
        publicKey: 'pk',
        decryptedIdentity: {},
        encryptedIdentity: row as unknown as Record<string, unknown>,
      },
    });
    expect(JSON.parse(result?.identityFile || '{}').recoveryEnvelope).toEqual(envelope);
  });
});
