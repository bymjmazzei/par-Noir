import { afterEach, describe, expect, it, vi } from 'vitest';
import { startPnOAuthPopup } from './pnOAuthPopup';

describe('startPnOAuthPopup', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('opens the consent window in the click turn, before the app probe can block a later open', async () => {
    vi.useFakeTimers();
    const opened: string[] = [];
    const popup = {
      closed: false,
      location: { href: '' },
      close() {
        this.closed = true;
      },
      resizeTo() {},
      moveTo() {},
      focus() {},
    };
    vi.stubGlobal('window', {
      open: (url: string) => {
        opened.push(String(url));
        return popup;
      },
      name: '',
      focus() {},
      location: { origin: 'https://pen.parnoir.com', href: 'https://pen.parnoir.com/' },
      addEventListener() {},
      removeEventListener() {},
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
    });
    vi.stubGlobal('localStorage', {
      length: 0,
      key: () => null,
      getItem: () => null,
      setItem() {},
      removeItem() {},
    });

    const pending = startPnOAuthPopup({
      url: 'https://unlock.parnoir.com/oauth/consent?state=abc&popup=true',
      expectedState: 'abc',
      timeoutMs: 20,
    });
    expect(opened).toEqual(['about:blank']);
    await Promise.resolve();
    await Promise.resolve();
    expect(popup.location.href).toBe('https://unlock.parnoir.com/oauth/consent?state=abc&popup=true');

    const settled = expect(pending).rejects.toThrow('POPUP_TIMEOUT');
    await vi.advanceTimersByTimeAsync(50);
    await settled;
  });
});
