/**
 * @jest-environment node
 */
import { isPenVerifiedAuthor, penVerifiedAuthorAllowlist } from './penVerifiedAuthor';

describe('penVerifiedAuthor', () => {
  const prev = process.env.PEN_VERIFIED_AUTHOR_PN_IDS;

  afterEach(() => {
    process.env.PEN_VERIFIED_AUTHOR_PN_IDS = prev;
  });

  it('reads allowlist from env', () => {
    process.env.PEN_VERIFIED_AUTHOR_PN_IDS = 'pn-test-a,pn-test-b';
    expect(penVerifiedAuthorAllowlist()).toEqual(['pn-test-a', 'pn-test-b']);
    expect(isPenVerifiedAuthor('pn-test-a')).toBe(true);
    expect(isPenVerifiedAuthor('pn-nope')).toBe(false);
  });
});
