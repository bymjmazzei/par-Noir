/**
 * In-memory path (getCacheClient null) for prefer-app broker pending.
 */

jest.mock('../utils/cache', () => ({
  getCacheClient: jest.fn(() => null),
}));

import {
  clearMemoryBrokerPendingForTests,
  storeBrokerPendingRecord,
  takeBrokerPendingRecord,
} from './oauthBrokerPendingStore';
import {
  clearMemoryAuthCodesForTests,
  peekAuthCodeRecord,
  putAuthCodeRecord,
  takeAuthCodeRecord,
} from './oauthAuthCodeStore';

describe('oauthBrokerPendingStore (memory)', () => {
  beforeEach(() => {
    clearMemoryBrokerPendingForTests();
  });

  it('stores and takes once', async () => {
    await storeBrokerPendingRecord(
      'state12345',
      {
        clientId: 'messaging-app',
        expiresAt: Date.now() + 60_000,
        payload: { type: 'oauth_callback', code: 'abc', state: 'state12345' },
      },
      60_000
    );
    const first = await takeBrokerPendingRecord('state12345', 'messaging-app');
    expect(first?.code).toBe('abc');
    const second = await takeBrokerPendingRecord('state12345', 'messaging-app');
    expect(second).toBeNull();
  });
});

describe('oauthAuthCodeStore (memory)', () => {
  beforeEach(() => {
    clearMemoryAuthCodesForTests();
  });

  it('peek does not consume; take does', async () => {
    await putAuthCodeRecord(
      {
        code: 'code1',
        clientId: 'messaging-app',
        redirectUri: 'https://messaging.parnoir.com/oauth-callback.html',
        scope: ['openid'],
        state: 'state12345',
        did: 'did:key:x',
        publicKey: 'pk',
        expiresAt: Date.now() + 60_000,
      },
      60_000
    );
    const peeked = await peekAuthCodeRecord('code1', 'messaging-app');
    expect(peeked?.state).toBe('state12345');
    const taken = await takeAuthCodeRecord('code1');
    expect(taken?.code).toBe('code1');
    expect(await peekAuthCodeRecord('code1', 'messaging-app')).toBeNull();
  });
});
