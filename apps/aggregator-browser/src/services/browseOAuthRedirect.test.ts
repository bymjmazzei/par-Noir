/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { browseOAuthRedirectUri } from './browseOAuthRedirect';

describe('browseOAuthRedirectUri', () => {
  it('returns origin oauth-callback without trailing slash', () => {
    expect(browseOAuthRedirectUri()).toBe(`${window.location.origin}/oauth-callback.html`);
  });
});
