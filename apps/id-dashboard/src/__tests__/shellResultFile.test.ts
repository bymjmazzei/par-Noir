import { deriveCanonicalPnIdentifier } from '@par-noir/pqc-crypto/oauth-unlock-proof';
import { shellIdentityFilename } from '../services/shellResultFile';
import { pnFileName, pnFilePublicKey } from '../services/pnFileName';

const base = { v: 1 as const, op: 'create' as const, did: 'did:key:1', publicKey: 'pk-b64', accessToken: '' };
const id = (pk: string) => deriveCanonicalPnIdentifier(pk);

describe('pN file names', () => {
  it('names every pN file after its pN identifier', () => {
    expect(pnFileName('pk-b64')).toBe(`${id('pk-b64')}.pn`);
    expect(pnFileName('pk-b64')).toMatch(/^pn-[0-9a-f]{12}\.pn$/);
    expect(pnFileName('pk-b64', 'device-bound')).toBe(`${id('pk-b64')}.device-bound.pn`);
    expect(pnFileName(undefined)).toBe('par-noir-identity.pn');
  });

  it('reads the public key from each pN file shape', () => {
    expect(pnFilePublicKey({ publicKey: 'a' })).toBe('a');
    expect(pnFilePublicKey({ identity: { publicKey: 'b' } })).toBe('b');
    expect(pnFilePublicKey({ version: '1.0', identities: [{ publicKey: 'c' }] })).toBe('c');
    expect(pnFilePublicKey(null)).toBeUndefined();
  });

  it('names an Unlock result after the returned file, so a rotated pN gets its new identifier', () => {
    const rotated = { ...base, op: 'rotate' as const, result: { identityFile: JSON.stringify({ publicKey: 'new-pk' }) } };
    expect(shellIdentityFilename(rotated)).toBe(`${id('new-pk')}.pn`);
    expect(shellIdentityFilename(base)).toBe(`${id('pk-b64')}.pn`);
    expect(shellIdentityFilename({ ...base, publicKey: '' })).toBe('par-noir-identity.pn');
  });
});
