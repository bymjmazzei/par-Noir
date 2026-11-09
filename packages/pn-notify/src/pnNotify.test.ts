import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { subscribeWebPush, unsubscribeWebPush, urlBase64ToUint8Array } from './client';

type Handler = (event: unknown) => void;

function loadServiceWorker(clientsList: Array<Record<string, unknown>>) {
  const handlers: Record<string, Handler> = {};
  const showNotification = vi.fn(async () => undefined);
  const openWindow = vi.fn(async () => null);
  const self = {
    location: { origin: 'https://pen.parnoir.com' },
    addEventListener: (type: string, fn: Handler) => {
      handlers[type] = fn;
    },
    registration: { showNotification },
    clients: { matchAll: vi.fn(async () => clientsList), openWindow },
  };
  const src = readFileSync(resolve(__dirname, '../sw/pn-notify-sw.js'), 'utf-8');
  new Function('self', src)(self);
  return { handlers, showNotification, openWindow };
}

function pushEvent(json: unknown) {
  let pending: Promise<unknown> = Promise.resolve();
  return {
    event: {
      data: { json: () => json },
      waitUntil: (p: Promise<unknown>) => {
        pending = p;
      },
    },
    done: () => pending,
  };
}

describe('service worker push handler', () => {
  it('shows fixed copy for the category and ignores payload text', async () => {
    const { handlers, showNotification } = loadServiceWorker([]);
    const e = pushEvent({ title: 'Alice', body: 'secret plans', data: { category: 'messages', app: 'messaging' } });
    handlers.push(e.event);
    await e.done();
    expect(showNotification).toHaveBeenCalledWith(
      'par Noir',
      expect.objectContaining({ body: 'You have a new message', tag: 'pn-messages' })
    );
    expect(JSON.stringify(showNotification.mock.calls)).not.toContain('secret');
  });

  it('falls back to generic copy for unknown payloads', async () => {
    const { handlers, showNotification } = loadServiceWorker([]);
    const e = pushEvent({ data: { category: 'dm-from-bob' } });
    handlers.push(e.event);
    await e.done();
    expect(showNotification).toHaveBeenCalledWith('par Noir', expect.objectContaining({ tag: 'pn-general' }));
  });

  it('stays quiet when the app is focused (realtime already covers it)', async () => {
    const { handlers, showNotification } = loadServiceWorker([{ focused: true, visibilityState: 'visible' }]);
    const e = pushEvent({ data: { category: 'social' } });
    handlers.push(e.event);
    await e.done();
    expect(showNotification).not.toHaveBeenCalled();
  });

  it('click focuses an open tab without navigating it, else opens home', async () => {
    const focus = vi.fn(async () => undefined);
    const open = loadServiceWorker([{ url: 'https://pen.parnoir.com/doc/1', focus }]);
    let pending: Promise<unknown> = Promise.resolve();
    const close = vi.fn();
    open.handlers.notificationclick({ notification: { close }, waitUntil: (p: Promise<unknown>) => (pending = p) });
    await pending;
    expect(close).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
    expect(open.openWindow).not.toHaveBeenCalled();

    const none = loadServiceWorker([]);
    none.handlers.notificationclick({ notification: { close }, waitUntil: (p: Promise<unknown>) => (pending = p) });
    await pending;
    expect(none.openWindow).toHaveBeenCalledWith('https://pen.parnoir.com/');
  });
});

describe('web push client', () => {
  const sub = {
    endpoint: 'https://push.example/sub-1',
    toJSON: () => ({ endpoint: 'https://push.example/sub-1', keys: { p256dh: 'k', auth: 'a' } }),
    unsubscribe: vi.fn(async () => true),
  };
  const pushManager = { getSubscription: vi.fn(), subscribe: vi.fn(async () => sub) };
  const reg = { pushManager };
  const fetchMock = vi.fn();

  beforeEach(() => {
    pushManager.getSubscription.mockResolvedValue(null);
    vi.stubGlobal('window', { PushManager: function PushManager() {} });
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration: vi.fn(async () => undefined),
        register: vi.fn(async () => reg),
        ready: Promise.resolve(reg),
      },
    });
    vi.stubGlobal('Notification', { requestPermission: vi.fn(async () => 'granted'), permission: 'granted' });
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('subscribes with the VAPID key and registers the endpoint for this app', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ publicKey: 'AQID' }) })
      .mockResolvedValueOnce({ ok: true });
    const result = await subscribeWebPush({
      apiEndpoint: 'https://api',
      getAccessToken: async () => 'at',
      appId: 'pen',
      categories: ['social'],
    });
    expect(result).toBe('subscribed');
    expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/pn-notify-sw.js');
    expect(pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true, applicationServerKey: new Uint8Array([1, 2, 3]) })
    );
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer at');
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://api/api/push/subscriptions');
    expect(init.headers.Authorization).toBe('Bearer at');
    expect(JSON.parse(init.body)).toMatchObject({ appId: 'pen', categories: ['social'] });
  });

  it('reports denied without touching the network', async () => {
    vi.stubGlobal('Notification', { requestPermission: vi.fn(async () => 'denied'), permission: 'denied' });
    const result = await subscribeWebPush({ apiEndpoint: 'https://api', getAccessToken: async () => 'at', appId: 'pen' });
    expect(result).toBe('denied');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports unconfigured when the API has no VAPID key', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    const result = await subscribeWebPush({ apiEndpoint: 'https://api', getAccessToken: async () => 'at', appId: 'pen' });
    expect(result).toBe('unconfigured');
  });

  it('unsubscribe deletes the endpoint server-side and locally', async () => {
    (navigator.serviceWorker.getRegistration as ReturnType<typeof vi.fn>).mockResolvedValue(reg);
    pushManager.getSubscription.mockResolvedValue(sub);
    fetchMock.mockResolvedValue({ ok: true });
    await unsubscribeWebPush({ apiEndpoint: 'https://api', getAccessToken: async () => 'at' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api/api/push/subscriptions',
      expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ endpoint: sub.endpoint }) })
    );
    expect(sub.unsubscribe).toHaveBeenCalled();
  });

  it('decodes url-safe base64', () => {
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([251, 255]);
  });
});
