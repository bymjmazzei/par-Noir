/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  completeOAuthUnlock,
  invalidateOAuthSessionCoordinator
} from './oauthSessionCoordinator';
import { resetOauthConsumedCodesForTests } from './oauthConsumedCodes';

const { exchangeCodeForToken, getUserInfo } = vi.hoisted(() => ({
  exchangeCodeForToken: vi.fn(async () => ({
    access_token: 'access-1',
    refresh_token: 'refresh-1',
    expires_in: 3600,
    token_type: 'Bearer'
  })),
  getUserInfo: vi.fn(async () => ({
    did: 'did:key:abc',
    pn_identifier: 'pn-test',
    nickname: 'nick',
    public_key: 'pk'
  }))
}));

vi.mock('./pnOAuthService', () => ({
  PNOAuthService: {
    exchangeCodeForToken,
    getUserInfo,
    loadSession: vi.fn(() => null),
    isSessionValid: vi.fn(() => false)
  }
}));

vi.mock('./unlockBootstrap', () => ({
  runUnlockBootstrap: vi.fn(async () => ({
    userInfo: { did: 'did:key:abc', pn_identifier: 'pn-test' },
    feedTokens: [],
    profileDisplayName: null,
    registry: null
  }))
}));

describe('completeOAuthUnlock', () => {
  afterEach(() => {
    invalidateOAuthSessionCoordinator();
    resetOauthConsumedCodesForTests();
    vi.clearAllMocks();
  });

  it('coalesces parallel unlock for the same authorization code', async () => {
    const payload = {
      code: 'auth-code-1',
      redirectUri: 'https://browse.parnoir.com/oauth-callback.html'
    };

    const a = completeOAuthUnlock(payload);
    const b = completeOAuthUnlock(payload);
    const [ra, rb] = await Promise.all([a, b]);

    expect(exchangeCodeForToken).toHaveBeenCalledTimes(1);
    expect(getUserInfo).toHaveBeenCalledTimes(1);
    expect(ra.session.accessToken).toBe('access-1');
    expect(rb.userInfo.pn_identifier).toBe('pn-test');
  });
});
