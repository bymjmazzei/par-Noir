import { describe, expect, it, vi } from 'vitest';

vi.mock('@par-noir/identity-crypto', () => ({
  IdentityCrypto: {},
}));

import { IdentityCrypto } from '@par-noir/identity-crypto';
import { encodeShellReturn, parseShellReturn } from './session';
import { buildShellResult, randomPnNickname } from './shellResult';
import { parseIdentityFileJson } from '../consentUnlock/decryptIdentityLocal';

describe('buildShellResult create', () => {
  it('names the new pN pN + 9 digits and stores that nickname in the identity', async () => {
    const createIdentity = vi.fn(async () => ({ identity: { publicKey: 'pk', encryptedData: 'ct' } }));
    Object.assign(IdentityCrypto, {
      createIdentity,
      authenticateIdentity: vi.fn(async () => ({ id: 'did:key:1', publicKey: 'pk' })),
    });
    const result = await buildShellResult({ op: 'create', key1: 'k1', key2: 'k2' });
    expect(result?.nickname).toMatch(/^pN\d{9}$/);
    expect(createIdentity).toHaveBeenCalledWith('k1', result?.nickname, 'k2');
    expect(randomPnNickname()).toMatch(/^pN\d{9}$/);
  });
});

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
