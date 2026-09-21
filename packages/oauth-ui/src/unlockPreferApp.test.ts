/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { buildOAuthConsentAppUrl, buildOAuthConsentUrl } from './pnOAuthPopup';
import { httpsConsentUrlToAppUrl, tryPreferUnlockApp } from './unlockPreferApp';
import { searchFromUnlockUrl } from './consentUnlock/searchFromUnlockUrl';
import { DEFAULT_UNLOCK_ORIGIN } from './consentUnlock/constants';

describe('buildOAuthConsentAppUrl', () => {
  it('uses custom scheme with same query and popup=false', () => {
    const url = buildOAuthConsentAppUrl({
      clientId: 'browser-app',
      apiEndpoint: 'https://api.parnoir.com',
      redirectUri: 'https://browse.parnoir.com/oauth-callback.html',
      scope: ['openid'],
      state: 'st',
      nonce: 'nn',
      forPopup: true,
    });
    expect(url.startsWith('com.parnoir.unlock://oauth/consent?')).toBe(true);
    const q = new URL(url.replace('com.parnoir.unlock://', 'https://x/')).searchParams;
    expect(q.get('popup')).toBe('false');
    expect(q.get('api_endpoint')).toBe('https://api.parnoir.com');
    expect(q.get('client_id')).toBe('browser-app');
  });
});

describe('httpsConsentUrlToAppUrl', () => {
  it('maps https consent to scheme', () => {
    const https = buildOAuthConsentUrl({
      clientId: 'c',
      apiEndpoint: 'https://api.parnoir.com',
      redirectUri: 'https://browse.parnoir.com/cb',
      forPopup: true,
    });
    expect(https.startsWith(DEFAULT_UNLOCK_ORIGIN)).toBe(true);
    const app = httpsConsentUrlToAppUrl(https);
    expect(app.startsWith('com.parnoir.unlock://oauth/consent?')).toBe(true);
    expect(app).toContain('popup=false');
  });
});

describe('searchFromUnlockUrl', () => {
  it('parses custom scheme and https', () => {
    expect(
      searchFromUnlockUrl('com.parnoir.unlock://oauth/consent?client_id=c&state=s')
    ).toBe('?client_id=c&state=s');
    expect(
      searchFromUnlockUrl('https://unlock.parnoir.com/oauth/consent?client_id=c')
    ).toBe('?client_id=c');
  });
});

describe('tryPreferUnlockApp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('falls back when page stays visible', async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    const p = tryPreferUnlockApp('com.parnoir.unlock://oauth/consent?x=1', { waitMs: 100 });
    await vi.advanceTimersByTimeAsync(150);
    const r = await p;
    expect(r.opened).toBe(false);
    expect(r.mode).toBe('fallback');
  });

  it('reports opened when page becomes hidden', async () => {
    let hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    const p = tryPreferUnlockApp('com.parnoir.unlock://oauth/consent?x=1', { waitMs: 100 });
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(150);
    const r = await p;
    expect(r.opened).toBe(true);
    expect(r.mode).toBe('app');
  });
});
