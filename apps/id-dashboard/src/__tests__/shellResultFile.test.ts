import { shellIdentityFilename } from '../services/shellResultFile';

const base = { v: 1 as const, op: 'create' as const, did: 'did:key:1', publicKey: 'pk', accessToken: '' };

describe('shellIdentityFilename', () => {
  it('names a new pN file after its nickname, like pn977164442.pn', () => {
    expect(shellIdentityFilename({ ...base, nickname: 'pN977164442' })).toBe('pn977164442.pn');
    expect(shellIdentityFilename({ ...base, result: { nickname: 'pN123456789' } })).toBe('pn123456789.pn');
  });

  it('falls back when Unlock returned no nickname', () => {
    expect(shellIdentityFilename(base)).toBe('par-noir-identity.pn');
  });
});
