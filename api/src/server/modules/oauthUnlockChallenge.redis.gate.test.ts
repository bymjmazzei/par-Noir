/**
 * @jest-environment node
 *
 * Unlock challenges and auth codes are Redis-first. A second caller that does
 * not share this process's memory map can consume a challenge once.
 */

jest.mock('../utils/cache', () => ({
  getCacheClient: jest.fn(),
}));

import { getCacheClient } from '../utils/cache';
import {
  clearMemoryAuthCodesForTests,
  peekAuthCodeRecord,
  putAuthCodeRecord,
  putUnlockChallengeRecord,
  takeUnlockChallengeRecord,
} from './oauthAuthCodeStore';

const mockCache = getCacheClient as jest.Mock;

function fakeRedis() {
  const rows = new Map<string, string>();
  return {
    rows,
    set: jest.fn(async (key: string, value: string) => {
      rows.set(key, value);
    }),
    get: jest.fn(async (key: string) => rows.get(key) ?? null),
    getDel: jest.fn(async (key: string) => {
      const value = rows.get(key) ?? null;
      rows.delete(key);
      return value;
    }),
    del: jest.fn(async (key: string) => {
      rows.delete(key);
    }),
  };
}

describe('Redis-first OAuth challenges', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    mockCache.mockReset();
    clearMemoryAuthCodesForTests();
  });

  it('lets a second caller consume a challenge from Redis without the memory map', async () => {
    const redis = fakeRedis();
    mockCache.mockReturnValue(redis);
    const record = {
      challengeId: 'chal-1',
      challenge: 'nonce',
      clientId: 'browser-app',
      redirectUri: 'https://browse.example/cb',
      expiresAt: Date.now() + 60_000,
    };

    await putUnlockChallengeRecord(record, 60_000);
    clearMemoryAuthCodesForTests();

    const first = await takeUnlockChallengeRecord('chal-1');
    const second = await takeUnlockChallengeRecord('chal-1');

    expect(first?.challenge).toBe('nonce');
    expect(second).toBeNull();
    expect(redis.getDel).toHaveBeenCalledTimes(2);
  });

  it('peeks an auth code from Redis when this process has no memory copy', async () => {
    const redis = fakeRedis();
    mockCache.mockReturnValue(redis);
    await putAuthCodeRecord(
      {
        code: 'code-1',
        clientId: 'browser-app',
        redirectUri: 'https://browse.example/cb',
        scope: ['openid'],
        did: 'did:key:z',
        publicKey: 'pk',
        expiresAt: Date.now() + 60_000,
      },
      60_000
    );
    clearMemoryAuthCodesForTests();

    const peeked = await peekAuthCodeRecord('code-1', 'browser-app');
    expect(peeked?.code).toBe('code-1');
    expect(redis.get).toHaveBeenCalled();
  });

  it('fails closed in production when Redis is down', async () => {
    process.env.NODE_ENV = 'production';
    mockCache.mockReturnValue(null);

    await expect(
      putUnlockChallengeRecord(
        {
          challengeId: 'chal-2',
          challenge: 'nonce',
          clientId: 'browser-app',
          redirectUri: 'https://browse.example/cb',
          expiresAt: Date.now() + 60_000,
        },
        60_000
      )
    ).rejects.toThrow(/Redis is required/);
    expect(await takeUnlockChallengeRecord('chal-2')).toBeNull();
  });
});
