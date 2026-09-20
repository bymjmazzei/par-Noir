import { describe, expect, it } from 'vitest';
import { buildOAuthConsentUrl } from './pnOAuthPopup';
import { DEFAULT_UNLOCK_ORIGIN } from './consentUnlock/constants';

describe('buildOAuthConsentUrl unlock broker', () => {
  it('targets unlock origin and passes api_endpoint', () => {
    const url = buildOAuthConsentUrl({
      clientId: 'browser-app',
      apiEndpoint: 'https://api.parnoir.com',
      redirectUri: 'https://browse.parnoir.com/oauth-callback.html',
      scope: ['openid', 'profile'],
      state: 'abc',
      nonce: 'def',
      forPopup: true,
    });
    expect(url.startsWith(`${DEFAULT_UNLOCK_ORIGIN}/oauth/consent?`)).toBe(true);
    const u = new URL(url);
    expect(u.searchParams.get('api_endpoint')).toBe('https://api.parnoir.com');
    expect(u.searchParams.get('client_id')).toBe('browser-app');
    expect(u.hostname).toBe('unlock.parnoir.com');
  });

  it('honors unlockOrigin override', () => {
    const url = buildOAuthConsentUrl({
      clientId: 'c',
      apiEndpoint: 'http://localhost:4000',
      redirectUri: 'http://localhost:5173/oauth-callback.html',
      unlockOrigin: 'http://localhost:5178',
      forPopup: false,
    });
    expect(url.startsWith('http://localhost:5178/oauth/consent?')).toBe(true);
    expect(new URL(url).searchParams.get('api_endpoint')).toBe('http://localhost:4000');
  });
});
