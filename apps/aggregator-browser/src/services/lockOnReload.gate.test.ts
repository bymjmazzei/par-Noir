/**
 * @vitest-environment jsdom
 *
 * Browser reload must not revive ML-KEM from sessionStorage.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DM_SESSION_STORAGE_KEY = 'pn_dm_session_v1';

describe('lock-on-reload: ML-KEM session', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('hasRestorableDmSession is always false', async () => {
    sessionStorage.setItem(
      DM_SESSION_STORAGE_KEY,
      JSON.stringify({ mlKemSecretKey: 'fake-secret-key-material', mlKemPublicKey: 'pk' })
    );
    const { hasRestorableDmSession } = await import('./dmIdentitySession');
    expect(hasRestorableDmSession()).toBe(false);
  });

  it('restoreDmSessionFromStorage clears legacy key and does not unlock memory', async () => {
    sessionStorage.setItem(
      DM_SESSION_STORAGE_KEY,
      JSON.stringify({ mlKemSecretKey: 'fake-secret-key-material', mlKemPublicKey: 'pk' })
    );
    const { restoreDmSessionFromStorage, isDmIdentityReady, clearDmIdentity } = await import(
      './dmIdentitySession'
    );
    clearDmIdentity();
    expect(restoreDmSessionFromStorage()).toBe(false);
    expect(isDmIdentityReady()).toBe(false);
    expect(sessionStorage.getItem(DM_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('applyDmSessionHandoff keeps ML-KEM in memory only (no sessionStorage write)', async () => {
    const { isDmIdentityReady, clearDmIdentity, restoreDmSessionFromStorage } = await import(
      './dmIdentitySession'
    );
    clearDmIdentity();
    sessionStorage.setItem(DM_SESSION_STORAGE_KEY, JSON.stringify({ mlKemSecretKey: 'x' }));
    restoreDmSessionFromStorage();
    expect(sessionStorage.getItem(DM_SESSION_STORAGE_KEY)).toBeNull();
    expect(isDmIdentityReady()).toBe(false);
  });
});

describe('sanitizeMessagingOAuthOnStartup', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('clears leftover OAuth when ML-KEM is not in memory', async () => {
    sessionStorage.setItem(
      'pn_oauth_session',
      JSON.stringify({
        accessToken: 'tok',
        refreshToken: 'ref',
        expiresAt: Date.now() + 60_000,
        did: 'did:example:1',
        pnIdentifier: 'pn_test',
      })
    );
    sessionStorage.setItem(
      DM_SESSION_STORAGE_KEY,
      JSON.stringify({ mlKemSecretKey: 'leftover', mlKemPublicKey: 'pk' })
    );

    const { sanitizeMessagingOAuthOnStartup } = await import('../messagingStartupSanitize');
    sanitizeMessagingOAuthOnStartup();

    expect(sessionStorage.getItem('pn_oauth_session')).toBeNull();
    expect(sessionStorage.getItem(DM_SESSION_STORAGE_KEY)).toBeNull();
  });
});
