/**
 * @jest-environment node
 */
// API unit helpers for opaque social mailbox (no DB).
import {
  isDeviceCloudCustodyEnabled,
  isMailboxRouteKey,
  sanitizeMailboxPayload,
} from './socialMailboxService';

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
});
