import { describe, expect, it } from 'vitest';
import { pnIdAliases, pnMatchesVerifiedAllowlist, parseVerifiedAllowlistEnv } from './verifiedAuthor';

const HASH = 'abc123def4567890'.repeat(4);

describe('verifiedAuthor allowlist', () => {
  it('matches pn- and did:pn aliases of the same key hash', () => {
    expect(pnMatchesVerifiedAllowlist(`pn-${HASH}`, [`did:pn:${HASH}`])).toBe(true);
    expect(pnMatchesVerifiedAllowlist(`did:pn:${HASH}`, [`pn-${HASH}`])).toBe(true);
    expect(pnMatchesVerifiedAllowlist(`pn-${HASH}`, [HASH])).toBe(true);
    expect(pnIdAliases(`pn-${HASH}`)).toEqual([HASH, `pn-${HASH}`, `did:pn:${HASH}`]);
  });

  it('never matches on a shared prefix', () => {
    const other = `${HASH.slice(0, 63)}f`;
    expect(pnMatchesVerifiedAllowlist(`pn-${other}`, [`pn-${HASH}`])).toBe(false);
    expect(pnMatchesVerifiedAllowlist(`pn-${HASH.slice(0, 12)}`, [`pn-${HASH}`])).toBe(false);
    expect(pnMatchesVerifiedAllowlist(`pn-${HASH}`, [])).toBe(false);
    expect(pnMatchesVerifiedAllowlist(null, [`pn-${HASH}`])).toBe(false);
  });

  it('parses env list', () => {
    expect(parseVerifiedAllowlistEnv(' a , b ')).toEqual(['a', 'b']);
  });
});
