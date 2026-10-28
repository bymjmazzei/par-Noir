import { TextEncoder } from 'util';
import { deriveCanonicalPnIdentifier } from '@par-noir/pqc-crypto/oauth-unlock-proof';
import { shellIdentityFilename } from '../services/shellResultFile';

Object.assign(globalThis, { TextEncoder });

const base = { v: 1 as const, op: 'create' as const, did: 'did:key:1', publicKey: 'pk-b64', accessToken: '' };

describe('shellIdentityFilename', () => {
  it('names the pN file after its pN identifier', () => {
    const name = shellIdentityFilename({ ...base, nickname: 'Alice' });
    expect(name).toBe(`${deriveCanonicalPnIdentifier('pk-b64')}.pn`);
    expect(name).toMatch(/^pn-[0-9a-f]{12}\.pn$/);
  });

  it('falls back when Unlock returned no public key', () => {
    expect(shellIdentityFilename({ ...base, publicKey: '' })).toBe('par-noir-identity.pn');
  });
});
