import { deriveCanonicalPnIdentifier } from '@par-noir/pqc-crypto/oauth-unlock-proof';
import { shellIdentityFilename } from '../services/shellResultFile';
import { pnFileName, pnFilePublicKey, pnShortName } from '../services/pnFileName';

const mlDsaKey = (fill: number) => Buffer.alloc(1952, fill).toString('base64');
const PK = mlDsaKey(1);
const NEW_PK = mlDsaKey(2);
const base = { v: 1 as const, op: 'create' as const, did: 'did:pn:1', publicKey: PK, accessToken: '' };
const id = (pk: string) => deriveCanonicalPnIdentifier(pk);

const short = (pk: string) => `pn-${id(pk).slice(3, 11)}`;

describe('pN file names', () => {
  it('names every pN file after the first 8 hex of its pN identifier', () => {
    expect(pnFileName(PK)).toBe(`${short(PK)}.pn`);
    expect(pnFileName(PK)).toMatch(/^pn-[0-9a-f]{8}\.pn$/);
    expect(pnFileName(PK, 'device-bound')).toBe(`${short(PK)}.device-bound.pn`);
    expect(pnFileName(undefined)).toBe('par-noir-identity.pn');
  });

  it('a pN with no nickname shows the same short name as its file', () => {
    expect(pnShortName(PK)).toBe(short(PK));
    expect(pnShortName(undefined)).toBeUndefined();
  });

  it('reads the public key from each pN file shape', () => {
    expect(pnFilePublicKey({ publicKey: 'a' })).toBe('a');
    expect(pnFilePublicKey({ identity: { publicKey: 'b' } })).toBe('b');
    expect(pnFilePublicKey({ version: '1.0', identities: [{ publicKey: 'c' }] })).toBe('c');
    expect(pnFilePublicKey(null)).toBeUndefined();
  });

  it('names an Unlock result after the returned file, so a rotated pN gets its new identifier', () => {
    const rotated = { ...base, op: 'rotate' as const, result: { identityFile: JSON.stringify({ publicKey: NEW_PK }) } };
    expect(shellIdentityFilename(rotated)).toBe(`${short(NEW_PK)}.pn`);
    expect(shellIdentityFilename(base)).toBe(`${short(PK)}.pn`);
    expect(shellIdentityFilename({ ...base, publicKey: '' })).toBe('par-noir-identity.pn');
  });
});
