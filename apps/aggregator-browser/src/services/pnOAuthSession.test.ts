/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PNOAuthService, browseSession } from './pnOAuthService';

const base = {
  accessToken: 'at-1',
  refreshToken: 'rt-1',
  expiresAt: Date.now() + 3600_000,
  did: 'did:test',
};

describe('browse session on the shared pN session', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('beginSession starts idle clocks now and falls back to did for pnIdentifier', () => {
    PNOAuthService.beginSession({ ...base, idleTimeoutS: 900 });
    const s = browseSession.load();
    expect(s?.pnIdentifier).toBe('did:test');
    expect(s?.idleTimeoutS).toBe(900);
    expect(Date.now() - (s?.unlockedAt ?? 0)).toBeLessThan(1000);
  });

  it('saveSession never writes back stale tokens from a snapshot', () => {
    PNOAuthService.beginSession({ ...base, pnIdentifier: 'pn-me' });
    const snapshot = PNOAuthService.loadSession()!;
    browseSession.update({ accessToken: 'at-2', refreshToken: 'rt-2' });
    PNOAuthService.saveSession({ ...snapshot, publicKey: 'pk' });
    const s = browseSession.load();
    expect(s?.refreshToken).toBe('rt-2');
    expect(s?.accessToken).toBe('at-2');
    expect(s?.publicKey).toBe('pk');
  });

  it('refused refresh returns no token and clears the session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 400 })));
    PNOAuthService.beginSession({ ...base, pnIdentifier: 'pn-me', expiresAt: Date.now() - 1000 });
    expect(await PNOAuthService.getValidAccessToken()).toBeNull();
    await vi.waitFor(() => expect(PNOAuthService.loadSession()).toBeNull());
  });
});
