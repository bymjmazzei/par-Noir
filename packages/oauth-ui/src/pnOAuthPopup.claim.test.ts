/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startPnOAuthPopup } from './pnOAuthPopup';

describe('startPnOAuthPopup launch claim', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not load the consent page while the launch claim is still pending', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        status: 204,
        ok: true,
        json: async () => ({}),
      }))
    );
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
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);

    const pending = startPnOAuthPopup({
      url: 'https://unlock.parnoir.com/oauth/consent?state=state12345&client_id=browser-app&api_endpoint=https%3A%2F%2Fapi.parnoir.com&popup=true',
      expectedState: 'state12345',
      timeoutMs: 30000,
    });
    pending.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(500);
    expect(popup.location.href).toBe('');
  });
});