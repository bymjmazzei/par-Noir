/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { buildOAuthConsentAppUrl, buildOAuthConsentUrl } from './pnOAuthPopup';
import { httpsConsentUrlToAppUrl, tryPreferUnlockApp, unlockDialogDecision } from './unlockPreferApp';
import { searchFromUnlockUrl } from './consentUnlock/searchFromUnlockUrl';
import { DEFAULT_UNLOCK_ORIGIN, callerCapAppResumeUrl } from './consentUnlock/constants';

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

describe('unlockDialogDecision', () => {
  it('keeps the app when the page hides and uses the web form when cancel returns focus', () => {
    expect(
      unlockDialogDecision({
        nativePlatform: false,
        documentHidden: true,
        sawBlur: true,
        focusedAfterBlur: false,
        noDialogTimedOut: false,
      })
    ).toBe('app');
    expect(
      unlockDialogDecision({
        nativePlatform: false,
        documentHidden: false,
        sawBlur: true,
        focusedAfterBlur: true,
        noDialogTimedOut: false,
      })
    ).toBe('web');
    expect(
      unlockDialogDecision({
        nativePlatform: false,
        documentHidden: false,
        sawBlur: true,
        focusedAfterBlur: true,
        noDialogTimedOut: false,
        claimPollEnabled: true,
        cancelGraceElapsed: false,
      })
    ).toBe('pending');
    expect(
      unlockDialogDecision({
        nativePlatform: false,
        documentHidden: false,
        sawBlur: true,
        focusedAfterBlur: true,
        noDialogTimedOut: false,
        claimPollEnabled: true,
        cancelGraceElapsed: true,
      })
    ).toBe('web');
    expect(
      unlockDialogDecision({
        nativePlatform: false,
        documentHidden: false,
        sawBlur: false,
        focusedAfterBlur: false,
        noDialogTimedOut: false,
        appLaunched: true,
      })
    ).toBe('app');
    expect(
      unlockDialogDecision({
        nativePlatform: false,
        documentHidden: false,
        sawBlur: true,
        focusedAfterBlur: false,
        noDialogTimedOut: false,
      })
    ).toBe('pending');
    expect(
      unlockDialogDecision({
        nativePlatform: false,
        documentHidden: false,
        sawBlur: false,
        focusedAfterBlur: false,
        noDialogTimedOut: true,
      })
    ).toBe('web');
  });
});

describe('tryPreferUnlockApp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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

  it('stays with the app when the launch claim arrives and the page never hides', async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        status: 200,
        ok: true,
        json: async () => ({ launched: true }),
      }))
    );
    const p = tryPreferUnlockApp(
      'com.parnoir.unlock://oauth/consent?state=state12345&client_id=browser-app&api_endpoint=https%3A%2F%2Fapi.parnoir.com',
      { waitMs: 5000 }
    );
    const r = await p;
    expect(r.opened).toBe(true);
    expect(r.mode).toBe('app');
  });

  it('opens the web form only after focus returns and the launch claim is still missing', async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        status: 204,
        ok: true,
        json: async () => ({}),
      }))
    );
    const p = tryPreferUnlockApp(
      'com.parnoir.unlock://oauth/consent?state=state12345&client_id=browser-app&api_endpoint=https%3A%2F%2Fapi.parnoir.com',
      { waitMs: 10000, cancelGraceMs: 1000 }
    );
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
    let settled = false;
    void p.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(400);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    const r = await p;
    expect(r.opened).toBe(false);
  });

  it('treats blur then focus with the page still visible as cancel', async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    const p = tryPreferUnlockApp('com.parnoir.unlock://oauth/consent?x=1', { waitMs: 5000 });
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
    const r = await p;
    expect(r.opened).toBe(false);
    expect(r.mode).toBe('fallback');
  });

  it('assumes opened on Capacitor native even when page stays visible', async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    (window as Window & { Capacitor?: { isNativePlatform: () => boolean } }).Capacitor = {
      isNativePlatform: () => true,
    };
    const p = tryPreferUnlockApp('com.parnoir.unlock://oauth/consent?x=1', { waitMs: 100 });
    await vi.advanceTimersByTimeAsync(150);
    const r = await p;
    expect(r.opened).toBe(true);
    expect(r.mode).toBe('app');
    delete (window as Window & { Capacitor?: unknown }).Capacitor;
  });
});

describe('callerCapAppResumeUrl', () => {
  it('maps messaging-app and messaging redirect host', () => {
    expect(callerCapAppResumeUrl({ clientId: 'messaging-app' })).toBe(
      'com.parnoir.messaging://oauth/resume'
    );
    expect(
      callerCapAppResumeUrl({
        redirectUri: 'https://messaging.parnoir.com/oauth-callback.html',
      })
    ).toBe('com.parnoir.messaging://oauth/resume');
  });

  it('maps browser-app and browse redirect host', () => {
    expect(callerCapAppResumeUrl({ clientId: 'browser-app' })).toBe(
      'com.parnoir.browser://oauth/resume'
    );
    expect(
      callerCapAppResumeUrl({
        redirectUri: 'https://browse.parnoir.com/oauth-callback.html',
      })
    ).toBe('com.parnoir.browser://oauth/resume');
  });

  it('returns null when unknown', () => {
    expect(callerCapAppResumeUrl({ clientId: 'third-party' })).toBeNull();
    expect(callerCapAppResumeUrl({})).toBeNull();
  });
});
