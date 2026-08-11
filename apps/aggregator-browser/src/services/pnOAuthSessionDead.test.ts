/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PNOAuthService, PN_OAUTH_SESSION_DEAD_EVENT } from '../services/pnOAuthService';

describe('PNOAuthService auth death', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('emits pn_oauth_session_dead and clears session when refresh fails', async () => {
    PNOAuthService.saveSession({
      accessToken: 'expired-access',
      refreshToken: 'bad-refresh',
      expiresAt: Date.now() - 1000,
      did: 'did:test',
      pnIdentifier: 'pn-test',
    });

    vi.spyOn(PNOAuthService, 'refreshAccessToken').mockRejectedValue(new Error('invalid_grant'));

    const events: Event[] = [];
    const onDead = (e: Event) => events.push(e);
    window.addEventListener(PN_OAUTH_SESSION_DEAD_EVENT, onDead);

    const token = await PNOAuthService.getValidAccessToken();

    window.removeEventListener(PN_OAUTH_SESSION_DEAD_EVENT, onDead);

    expect(token).toBeNull();
    expect(PNOAuthService.loadSession()).toBeNull();
    expect(events).toHaveLength(1);
  });

  it('emits once when expired with no refresh token', async () => {
    PNOAuthService.saveSession({
      accessToken: 'expired-access',
      expiresAt: Date.now() - 1000,
      did: 'did:test',
      pnIdentifier: 'pn-test',
    });

    const events: Event[] = [];
    const onDead = (e: Event) => events.push(e);
    window.addEventListener(PN_OAUTH_SESSION_DEAD_EVENT, onDead);

    const token = await PNOAuthService.getValidAccessToken();
    const token2 = await PNOAuthService.getValidAccessToken();

    window.removeEventListener(PN_OAUTH_SESSION_DEAD_EVENT, onDead);

    expect(token).toBeNull();
    expect(token2).toBeNull();
    expect(events).toHaveLength(1);
  });
});
