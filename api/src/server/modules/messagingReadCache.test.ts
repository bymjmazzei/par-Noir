/**
 * @jest-environment node
 */
import {
  invalidateConversationCache,
  invalidateGroupFileMtime,
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

  it('invalidateGroupFileMtime deletes owner spreadsheet mtime key', async () => {
    await invalidateGroupFileMtime('pn-owner', 'sheet-123');
    expect(deleteCache).toHaveBeenCalledWith('msg:group-mtime:pn-owner:sheet-123');
  });
});
