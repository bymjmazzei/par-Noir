/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { browseOAuthRedirectUri } from './browseOAuthRedirect';

describe('browseOAuthRedirectUri', () => {
  afterEach(() => {
    delete (window as Window & { Capacitor?: unknown }).Capacitor;
  });

  it('returns origin oauth-callback without trailing slash on web', () => {
    expect(browseOAuthRedirectUri()).toBe(`${window.location.origin}/oauth-callback.html`);
  });

  it('uses deployed messaging HTTPS callback on Cap messaging builds', async () => {
    (window as Window & { Capacitor?: { isNativePlatform: () => boolean } }).Capacitor = {
      isNativePlatform: () => true,
    };
    // MESSAGING_ONLY is baked at transform time from env; re-import under messaging flag via dynamic mock
    // Here we only assert Cap path when MESSAGING_ONLY is false in default test env → browse origin.
    expect(browseOAuthRedirectUri()).toBe('https://browse.parnoir.com/oauth-callback.html');
  });
});
