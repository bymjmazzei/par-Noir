/**
 * @jest-environment node
 *
 * Locked-state push: content-free copy, category mapping, 60s coalescing,
 * and pruning subscriptions the push service reports as gone.
 */
import {
  PushDispatcher,
  PushService,
  PUSH_COALESCE_MS,
  normalizeWebSubscription,
  onePerBrowser,
  pushCategoryForRealtime,
  pushPayloadFor,
} from './pushService';

type Query = { sql: string; params: unknown[] };

jest.mock('../utils/database', () => {
  const state: { rows: Record<string, unknown>[]; queries: Query[] } = { rows: [], queries: [] };
  return {
    getDatabasePool: () => ({
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        state.queries.push({ sql, params });
        if (sql.includes('SELECT id, kind')) return { rows: state.rows };
        return { rows: [] };
      }),
    }),
    __state: state,
  };
});

jest.mock('web-push', () => ({
  __esModule: true,
  default: { setVapidDetails: jest.fn(), sendNotification: jest.fn() },
}));

jest.mock('./pushFcm', () => ({ sendPushViaFCM: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const dbState = require('../utils/database').__state as { rows: Record<string, unknown>[]; queries: Query[] };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const webpush = require('web-push').default as { sendNotification: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sendPushViaFCM } = require('./pushFcm') as { sendPushViaFCM: jest.Mock };

beforeAll(() => {
  process.env.VAPID_PUBLIC_KEY = 'pub';
  process.env.VAPID_PRIVATE_KEY = 'priv';
});

beforeEach(() => {
  dbState.rows = [];
  dbState.queries = [];
  webpush.sendNotification.mockReset();
  sendPushViaFCM.mockReset();
  PushDispatcher.reset();
});

describe('push copy and mapping', () => {
  it('maps realtime events to categories', () => {
    expect(pushCategoryForRealtime('mailbox_pending', { jobType: 'message_append' })).toBe('messages');
    expect(pushCategoryForRealtime('new_notification', { notificationType: 'device_unkeyed_unlock' })).toBe(
      'security'
    );
    expect(pushCategoryForRealtime('new_notification', { notificationType: 'follow' })).toBe('social');
    expect(pushCategoryForRealtime('new_message', { messageId: 'm1' })).toBeNull();
    expect(pushCategoryForRealtime('session_locked', {})).toBeNull();
  });

  it('carries only fixed copy, the category, and the target app', () => {
    const p = pushPayloadFor('messages');
    expect(p).toEqual({
      title: 'par Noir',
      body: 'You have a new message',
      data: { category: 'messages', app: 'messaging' },
    });
  });

  it('accepts only https endpoints with keys and a valid app id', () => {
    const ok = normalizeWebSubscription({
      appId: 'pen',
      subscription: { endpoint: 'https://push.example/abc', keys: { p256dh: 'k', auth: 'a' } },
      categories: ['messages', 'bogus'],
    });
    expect(ok).toMatchObject({ kind: 'web', appId: 'pen', categories: ['messages'] });
    expect(
      normalizeWebSubscription({
        appId: 'pen',
        subscription: { endpoint: 'http://push.example/abc', keys: { p256dh: 'k', auth: 'a' } },
      })
    ).toBeNull();
    expect(
      normalizeWebSubscription({ appId: 'Pen!', subscription: { endpoint: 'https://x', keys: { p256dh: 'k', auth: 'a' } } })
    ).toBeNull();
  });
});

describe('PushService.send', () => {
  it('sends web and fcm, prunes 410 and invalid tokens, stamps successes', async () => {
    dbState.rows = [
      { id: 'w-ok', kind: 'web', endpoint: 'https://push/ok', p256dh: 'k', auth: 'a' },
      { id: 'w-gone', kind: 'web', endpoint: 'https://push/gone', p256dh: 'k', auth: 'a' },
      { id: 'f-ok', kind: 'fcm', endpoint: 'tok-ok', p256dh: null, auth: null },
      { id: 'f-bad', kind: 'fcm', endpoint: 'tok-bad', p256dh: null, auth: null },
    ];
    webpush.sendNotification.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint.endsWith('gone')) throw Object.assign(new Error('gone'), { statusCode: 410 });
    });
    sendPushViaFCM.mockResolvedValue({ invalidTokens: ['tok-bad'] });

    await PushService.send('pn-a', 'messages');

    const [, body, opts] = webpush.sendNotification.mock.calls[0];
    expect(JSON.parse(body)).toEqual(pushPayloadFor('messages'));
    expect(opts).toMatchObject({ topic: 'messages' });
    expect(sendPushViaFCM).toHaveBeenCalledWith(['tok-ok', 'tok-bad'], pushPayloadFor('messages'), 'messages');

    const del = dbState.queries.find((q) => q.sql.startsWith('DELETE'));
    expect((del?.params[0] as string[]).sort()).toEqual(['f-bad', 'w-gone']);
    const upd = dbState.queries.find((q) => q.sql.startsWith('UPDATE'));
    expect((upd?.params[0] as string[]).sort()).toEqual(['f-ok', 'w-ok']);
  });
});

describe('onePerBrowser', () => {
  it('keeps one subscription per browser, preferring the app for the category', () => {
    const row = (id: string, app_id: string, browser_id: string | null, created_at = '2026-01-01') =>
      ({ id, kind: 'web' as const, app_id, endpoint: id, p256dh: 'k', auth: 'a', browser_id, created_at });
    const picked = onePerBrowser(
      [
        row('pen-b1', 'pen', 'b1'),
        row('msg-b1', 'messaging', 'b1'),
        row('dash-b1', 'dashboard', 'b1'),
        row('pen-b2', 'pen', 'b2'),
        row('dash-b2-new', 'dashboard', 'b2', '2026-02-01'),
        row('loose', 'pen', null),
      ],
      'messages'
    ).map((r) => r.id);
    expect(picked.sort()).toEqual(['dash-b2-new', 'loose', 'msg-b1']);
  });
});

describe('PushDispatcher', () => {
  it('sends at most one push per pN and category per window', () => {
    const t0 = 1_000_000;
    expect(PushDispatcher.notify('pn-a', 'messages', t0)).toBe(true);
    expect(PushDispatcher.notify('pn-a', 'messages', t0 + 1_000)).toBe(false);
    expect(PushDispatcher.notify('pn-a', 'social', t0 + 1_000)).toBe(true);
    expect(PushDispatcher.notify('a', 'messages', t0 + 2_000)).toBe(false);
    expect(PushDispatcher.notify('pn-a', 'messages', t0 + PUSH_COALESCE_MS)).toBe(true);
  });
});
