/**
 * Falsification: promote must POST apply-inbound for message_append (Sheets SoT).
 * Must not succeed via JSONL / appendConversationLine.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { promoteOutboxRecord } from './promoteOutbox.js';
import type { OutboxRecord } from './outbox.js';
import type { SealSession } from './types.js';

const session: SealSession = {
  sessionId: 'pn-sender',
  pnName: 'test',
  passcode: 'x'.repeat(64)
};

describe('promoteOutboxRecord (Sheets SoT)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      store: {} as Record<string, string>,
      getItem(k: string) {
        return this.store[k] ?? null;
      },
      setItem(k: string, v: string) {
        this.store[k] = v;
      },
      removeItem(k: string) {
        delete this.store[k];
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs /api/messages/apply-inbound with role sender before marking materialized', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/api/messages/apply-inbound')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (String(url).includes('/api/mailbox/lookup')) {
        return new Response(JSON.stringify({ found: false, pending: false }), { status: 200 });
      }
      if (String(url).includes('/api/mailbox/enqueue')) {
        return new Response(JSON.stringify({ created: true }), { status: 200 });
      }
      return new Response('unexpected', { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const record: OutboxRecord = {
      outboxId: 'msg_1',
      kind: 'message_append',
      status: 'enqueued',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      payload: {
        messageId: 'msg_1',
        encryptedContent: 'ct',
        connectionId: 'conn-1',
        timestamp: new Date().toISOString()
      },
      fanout: [{ routeKey: 'a'.repeat(64), jobType: 'message_append' }]
    };

    // Seed sealed outbox so upsert can round-trip (seal needs real crypto — stub upsert via fetch-only path).
    // promoteOutboxRecord calls upsertLocalOutboxRecord which seals; use a minimal seal by mocking module.
    const { upsertLocalOutboxRecord } = await import('./outbox.js');
    const upsertSpy = vi
      .spyOn(await import('./outbox.js'), 'upsertLocalOutboxRecord')
      .mockImplementation(async (_id, _s, r) => [r]);

    await promoteOutboxRecord(
      {
        apiBaseUrl: 'https://api.example.test',
        authToken: 'oauth',
        identityId: 'pn-sender',
        session,
        getCloudAccessToken: async () => 'cloud-at'
      },
      record
    );

    const applyCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/api/messages/apply-inbound')
    );
    expect(applyCalls.length).toBe(1);
    const body = JSON.parse(String((applyCalls[0]![1] as RequestInit).body));
    expect(body.role).toBe('sender');
    expect(body.jobType).toBe('message_append');
    expect(body.encryptedContent).toBe('ct');
    expect(body.userPnIdentifier).toBe('pn-sender');
    expect(upsertSpy).toHaveBeenCalled();
    const lastUpsert = upsertSpy.mock.calls.at(-1)?.[2] as OutboxRecord;
    expect(lastUpsert.status).toBe('materialized');

    upsertSpy.mockRestore();
    void upsertLocalOutboxRecord;
  });

  it('does not mark materialized when apply-inbound fails', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const upsertSpy = vi
      .spyOn(await import('./outbox.js'), 'upsertLocalOutboxRecord')
      .mockImplementation(async (_id, _s, r) => [r]);

    const record: OutboxRecord = {
      outboxId: 'msg_fail',
      kind: 'message_append',
      status: 'enqueued',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      payload: {
        messageId: 'msg_fail',
        encryptedContent: 'ct',
        connectionId: 'conn-1'
      },
      fanout: []
    };

    await expect(
      promoteOutboxRecord(
        {
          apiBaseUrl: 'https://api.example.test',
          authToken: 'oauth',
          identityId: 'pn-sender',
          session
        },
        record
      )
    ).rejects.toThrow(/own-sheet apply/);

    const materialized = upsertSpy.mock.calls.some(
      (c) => (c[2] as OutboxRecord).status === 'materialized'
    );
    expect(materialized).toBe(false);
    upsertSpy.mockRestore();
  });
});
