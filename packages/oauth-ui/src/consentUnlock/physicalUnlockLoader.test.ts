import { describe, expect, it } from 'vitest';
import { physicalResultToBundle } from './physicalUnlockLoader';

describe('physicalResultToBundle', () => {
  it('normalizes encryptedData from physical unlock result', () => {
    const bundle = physicalResultToBundle({
      publicKey: 'pk',
      did: 'did:key:x',
      decryptedIdentity: { id: 'did:key:x', username: 'u' },
      encryptedIdentity: {
        publicKey: 'pk',
        encryptedData: 'enc',
        iv: 'iv',
        salt: 'salt',
      },
    });
    expect(bundle.encryptedIdentity.encryptedData).toBe('enc');
    expect(bundle.publicKey).toBe('pk');
    expect(bundle.did).toBe('did:key:x');
  });

  it('accepts legacy encrypted field', () => {
    const bundle = physicalResultToBundle({
      publicKey: 'pk',
      did: 'did:key:x',
      decryptedIdentity: {},
      encryptedIdentity: {
        publicKey: 'pk',
        encrypted: 'legacy-enc',
        iv: 'iv',
        salt: 'salt',
      } as any,
    });
    expect(bundle.encryptedIdentity.encryptedData).toBe('legacy-enc');
  });
});
