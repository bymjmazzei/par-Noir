/**
 * @jest-environment node
 */
import {
  invalidateConversationCache,
  invalidateInboxCache,
} from './messagingReadCache';

jest.mock('../utils/cache', () => ({
  getCache: jest.fn(),
  setCache: jest.fn(),
  deleteCache: jest.fn(),
  deleteCachePattern: jest.fn(),
}));

import { deleteCache, deleteCachePattern } from '../utils/cache';

describe('messagingReadCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('invalidateInboxCache deletes the inbox key', async () => {
    await invalidateInboxCache('pn-abc');
    expect(deleteCache).toHaveBeenCalledWith('msg:inbox:pn-abc');
  });

  it('invalidateConversationCache deletes participant-scoped keys', async () => {
    await invalidateConversationCache('pn-abc', 'pn-def');
    expect(deleteCachePattern).toHaveBeenCalledWith('msg:conv:pn-abc:pn-def:*');
  });
});
