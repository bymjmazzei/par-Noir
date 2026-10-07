import { describe, expect, it } from 'vitest';
import { pnMatchesVerifiedAllowlist, parseVerifiedAllowlistEnv } from './verifiedAuthor';

describe('verifiedAuthor allowlist', () => {
  it('matches pn- and did:key aliases', () => {
    const list = ['did:key:abc123def456'];
    expect(pnMatchesVerifiedAllowlist('pn-abc123def456', list)).toBe(true);
    expect(pnMatchesVerifiedAllowlist('pn-other', list)).toBe(false);
  });

  it('parses env list', () => {
    expect(parseVerifiedAllowlistEnv(' a , b ')).toEqual(['a', 'b']);
  });
});
