/**
 * @jest-environment node
 */
// API unit helpers for opaque social mailbox (no DB).
import {
  enqueueSocialMailboxJob,
  isDeviceCloudCustodyEnabled,
  isMailboxRouteKey,
  mailboxOwnerHash,
  sanitizeMailboxPayload,
} from './socialMailboxService';
import { getDatabasePool } from '../utils/database';

jest.mock('../utils/database', () => ({
  getDatabasePool: jest.fn(),
}));

describe('DEVICE_CLOUD_CUSTODY flag', () => {
  const original = process.env.DEVICE_CLOUD_CUSTODY;

  afterEach(() => {
    if (original === undefined) delete process.env.DEVICE_CLOUD_CUSTODY;
    else process.env.DEVICE_CLOUD_CUSTODY = original;
  });

  it('defaults to enabled when unset', () => {
    delete process.env.DEVICE_CLOUD_CUSTODY;
    expect(isDeviceCloudCustodyEnabled()).toBe(true);
  });

  it('opts out only on 0/false/no/off', () => {
    for (const value of ['0', 'false', 'FALSE', 'no', 'off']) {
      process.env.DEVICE_CLOUD_CUSTODY = value;
      expect(isDeviceCloudCustodyEnabled()).toBe(false);
    }
    for (const value of ['1', 'true', 'yes', 'anything-else']) {
      process.env.DEVICE_CLOUD_CUSTODY = value;
      expect(isDeviceCloudCustodyEnabled()).toBe(true);
    }
  });
});

describe('MAILBOX_ROUTE_PEPPER fail-closed', () => {
  const original = process.env.MAILBOX_ROUTE_PEPPER;

  afterEach(() => {
    if (original === undefined) delete process.env.MAILBOX_ROUTE_PEPPER;
    else process.env.MAILBOX_ROUTE_PEPPER = original;
  });

  it('THE GUARD: throws when MAILBOX_ROUTE_PEPPER is unset (no soft default)', () => {
    delete process.env.MAILBOX_ROUTE_PEPPER;
    expect(() => mailboxOwnerHash('pn-bob')).toThrow(/MAILBOX_ROUTE_PEPPER must be set/);
  });

  it('THE GUARD: throws when MAILBOX_ROUTE_PEPPER is blank', () => {
    process.env.MAILBOX_ROUTE_PEPPER = '   ';
    expect(() => mailboxOwnerHash('pn-bob')).toThrow(/MAILBOX_ROUTE_PEPPER must be set/);
  });

  it('hashes when pepper is set', () => {
    process.env.MAILBOX_ROUTE_PEPPER = 'unit-test-pepper';
    const a = mailboxOwnerHash('pn-bob');
    const b = mailboxOwnerHash('pn-bob');
    const c = mailboxOwnerHash('pn-alice');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('isMailboxRouteKey', () => {
  it('accepts 64-char hex route keys', () => {
    expect(isMailboxRouteKey('a'.repeat(64))).toBe(true);
    expect(isMailboxRouteKey(`  ${'F'.repeat(64)}  `)).toBe(true);
  });

  it('rejects anything that is not an opaque route key', () => {
    expect(isMailboxRouteKey('a'.repeat(63))).toBe(false);
    expect(isMailboxRouteKey('pn-abcdef123456')).toBe(false);
    expect(isMailboxRouteKey(undefined)).toBe(false);
    expect(isMailboxRouteKey(123)).toBe(false);
  });
});

describe('sanitizeMailboxPayload', () => {
  it('strips clear identity fields from durable payloads', () => {
    const out = sanitizeMailboxPayload({
      messageId: 'm1',
      fromPnIdentifier: 'pn-aaa',
      toPnIdentifier: 'pn-bbb',
      actorPnIdentifier: 'pn-ccc',
      fileOwnerDid: 'did:key:x',
      ownerPn: 'pn-ddd',
      recipientIdentityId: 'pn-eee',
      userPnIdentifier: 'pn-fff',
      ciphertext: 'opaque',
    });

    expect(out).toEqual({ messageId: 'm1', ciphertext: 'opaque' });
  });

  it('drops nested identity keys, a pn threadId, a pn-keyed media map, and a pn requestId', async () => {
    const routeKey = 'ab'.repeat(32);
    const inserted: unknown[][] = [];
    const query = jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT')) {
        inserted.push(params || []);
        const payload = JSON.parse(String(params?.[3]));
        return {
          rows: [
            {
              id: 'job-1',
              route_key: routeKey,
              job_type: 'message_append',
              payload,
              created_at: new Date().toISOString(),
              expires_at: new Date().toISOString(),
              acked_at: null,
            },
          ],
        };
      }
      return { rows: [] };
    });
    (getDatabasePool as jest.Mock).mockReturnValue({ query });

    await enqueueSocialMailboxJob({
      routeKey,
      jobType: 'message_append',
      recipientPn: 'pn-bob',
      payload: {
        messageId: 'm1',
        fromPnIdentifier: 'pn-alice',
        toPnIdentifier: 'pn-bob',
        nested: { ownerPn: 'pn-alice', ciphertext: 'inner' },
        threadId: 'pn-alice_pn-bob',
        mediaEnvelopesByPn: {
          'pn-alice': 'sender-ct',
          'pn-bob': 'recipient-ct',
        },
        requestId: 'gmsg:m1:pn-bob',
        connectionId: 'conn-1',
      },
    });

    const stored = String(inserted[0][3]);
    expect(stored).not.toContain('pn-alice');
    expect(stored).not.toContain('pn-bob');
    expect(stored).not.toContain('pn-');
    const payload = JSON.parse(stored) as Record<string, unknown>;
    expect(payload).toMatchObject({
      messageId: 'm1',
      connectionId: 'conn-1',
      mediaEnvelope: 'recipient-ct',
    });
    expect(payload.requestId).toBeUndefined();
    expect(payload.threadId).toBeUndefined();
    expect(payload.mediaEnvelopesByPn).toBeUndefined();
    expect((payload.nested as Record<string, unknown>).ownerPn).toBeUndefined();
  });

  it('rejects a route key that is long but not 64 hex', async () => {
    await expect(
      enqueueSocialMailboxJob({
        routeKey: 'x'.repeat(40),
        jobType: 'message_append',
        payload: { messageId: 'm1' },
      })
    ).rejects.toThrow(/routeKey required/);
  });
});
