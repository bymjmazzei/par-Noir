// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPnSession, bindSessionLockedEvent } from './pnSession';
import { PN_LAST_ACTIVE_COOKIE, getOrCreateBrowserId, sharedCookieDomain } from './browserCookies';

const HOUR = 60 * 60 * 1000;

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

function clearCookies() {
  for (const c of document.cookie.split(';')) {
    const name = c.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
}

let clock = 1_000_000_000_000;
const reload = vi.fn();

function makeSession(storage = memoryStorage()) {
  return createPnSession<{ extra?: string }>({
    clientId: 'pen-app',
    apiEndpoint: 'https://api.test',
    storageKey: 'pen_session',
    storage,
    now: () => clock,
    reload,
  });
}

function seed(session: ReturnType<typeof makeSession>, overrides: Record<string, unknown> = {}) {
  session.begin(
    { access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600, idle_timeout_s: 3600 },
    { pnIdentifier: 'pn-abc', extra: 'x' }
  );
  if (Object.keys(overrides).length) session.update(overrides);
}

beforeEach(() => {
  clock = 1_000_000_000_000;
  reload.mockReset();
  clearCookies();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getAccessToken', () => {
  it('returns the stored token while fresh', async () => {
    const s = makeSession();
    seed(s);
    expect(await s.getAccessToken()).toBe('at-1');
  });

  it('refreshes near expiry once for parallel callers and stores the rotated token', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ access_token: 'at-2', refresh_token: 'rt-2', expires_in: 3600, idle_timeout_s: 900 }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const s = makeSession();
    seed(s);
    clock += 56 * 60 * 1000;
    s.touch();
    const [a, b] = await Promise.all([s.getAccessToken(), s.getAccessToken()]);
    expect(a).toBe('at-2');
    expect(b).toBe('at-2');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(s.load()?.refreshToken).toBe('rt-2');
    expect(s.load()?.idleTimeoutS).toBe(900);
    expect(s.load()?.extra).toBe('x');
  });

  it('locks and reloads home when refresh is refused', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 400 })));
    const s = makeSession();
    seed(s);
    clock += 56 * 60 * 1000;
    s.touch();
    expect(await s.getAccessToken()).toBeNull();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledWith('/'));
    expect(s.load()).toBeNull();
  });

  it('keeps the session when offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('network');
    }));
    const s = makeSession();
    seed(s);
    clock += 57 * 60 * 1000;
    s.touch();
    expect(await s.getAccessToken()).toBe('at-1');
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('idle lock', () => {
  it('detects idle after a simulated sleep by timestamp, not timers', async () => {
    const s = makeSession();
    seed(s);
    clock += HOUR + 1000;
    expect(s.isIdleExpired()).toBe(true);
    expect(await s.getAccessToken()).toBeNull();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledWith('/'));
  });

  it('counts activity in another app via the shared cookie', () => {
    const s = makeSession();
    seed(s);
    clock += HOUR - 60_000;
    document.cookie = `${PN_LAST_ACTIVE_COOKIE}=${clock}; Path=/`;
    clock += 2 * 60_000;
    expect(s.isIdleExpired()).toBe(false);
  });

  it('never idles a trusted device', () => {
    const s = makeSession();
    seed(s, { idleTimeoutS: 0 });
    clock += 30 * HOUR;
    expect(s.isIdleExpired()).toBe(false);
  });

  it('activity after the window lapsed locks instead of reviving', async () => {
    const s = makeSession();
    seed(s);
    clock += 2 * HOUR;
    s.touch();
    await vi.waitFor(() => expect(reload).toHaveBeenCalled());
  });
});

describe('lock', () => {
  it('runs before-lock hooks, then wipe hooks, calls lock-browser on manual, clears, reloads', async () => {
    const order: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      order.push(`fetch:${url}`);
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    reload.mockImplementation(() => order.push('reload'));
    const s = makeSession();
    seed(s);
    s.onBeforeLock(async () => {
      order.push('flush');
    });
    s.onWipe(() => {
      order.push('wipe');
    });
    await s.lock('manual');
    expect(order).toEqual(['flush', 'wipe', 'fetch:https://api.test/oauth/lock-browser', 'reload']);
    expect(s.load()).toBeNull();
  });

  it('does not call lock-browser for idle or remote locks', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const s = makeSession();
    seed(s);
    await s.lock('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a stuck before-lock hook cannot block the lock', async () => {
    const s = createPnSession({
      clientId: 'pen-app',
      apiEndpoint: 'https://api.test',
      storageKey: 'k',
      storage: memoryStorage(),
      reload,
      beforeLockTimeoutMs: 10,
    });
    s.begin({ access_token: 'a', expires_in: 3600 }, { pnIdentifier: 'pn-abc' });
    s.onBeforeLock(() => new Promise(() => undefined));
    await s.lock('remote');
    expect(reload).toHaveBeenCalledWith('/');
  });

  it('locks on session_locked from another app', async () => {
    const handlers = new Map<string, () => void>();
    const socket = { on: (ev: string, fn: () => void) => handlers.set(ev, fn) };
    const s = makeSession();
    seed(s);
    bindSessionLockedEvent(socket, s);
    handlers.get('session_locked')?.();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledWith('/'));
  });
});

describe('browser cookies', () => {
  it('scopes to the parent domain on parnoir.com only', () => {
    expect(sharedCookieDomain('pen.parnoir.com')).toBe('.parnoir.com');
    expect(sharedCookieDomain('localhost')).toBeUndefined();
  });

  it('creates a stable browser id', () => {
    const first = getOrCreateBrowserId();
    expect(first).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(getOrCreateBrowserId()).toBe(first);
  });
});
