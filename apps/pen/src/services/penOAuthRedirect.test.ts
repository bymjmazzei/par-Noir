/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { penOAuthRedirectUri } from './penOAuthRedirect';

describe('penOAuthRedirectUri', () => {
  afterEach(() => {
    delete (window as Window & { Capacitor?: unknown }).Capacitor;
    delete (window as Window & { penDesktop?: unknown }).penDesktop;
  });

  it('uses web origin callback on ordinary https', () => {
    expect(penOAuthRedirectUri()).toBe(`${window.location.origin}/oauth-callback.html`);
  });

  it('uses custom scheme on Electron penDesktop', () => {
    (window as Window & { penDesktop?: object }).penDesktop = {};
    expect(penOAuthRedirectUri()).toBe('com.parnoir.pen://oauth-callback');
  });

  it('uses https localhost callback on Cap androidScheme https', () => {
    (window as Window & { Capacitor?: { isNativePlatform: () => boolean } }).Capacitor = {
      isNativePlatform: () => true
    };
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://localhost', href: 'https://localhost/' },
      writable: true,
      configurable: true
    });
    expect(penOAuthRedirectUri()).toBe('https://localhost/oauth-callback.html');
  });
});
