import { isFirstPartyClient } from '../modules/integratorStoragePaths';

describe('OAuth client verified status', () => {
  it('treats first-party par Noir clients as verified', () => {
    expect(isFirstPartyClient('browser-app')).toBe(true);
    expect(isFirstPartyClient('prism-app')).toBe(true);
    expect(isFirstPartyClient('developer-portal')).toBe(true);
  });

  it('does not treat arbitrary integrators as first-party', () => {
    expect(isFirstPartyClient('my-startup-app')).toBe(false);
  });
});
