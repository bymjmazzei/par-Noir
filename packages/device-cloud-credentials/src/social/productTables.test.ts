import { describe, expect, it } from 'vitest';
import { FOLLOWERS_SCHEMA, MemoryBlobStore, NOTIFICATIONS_SCHEMA } from '@par-noir/user-owned-storage';
import { SqliteBlobTableAdapter } from '@par-noir/user-owned-storage/sqlite';
import type { DeviceBlobStore } from '../deviceBlobStore.js';
import {
  listTablesFollowers,
  tablesEngagement,
  tablesFollowing,
  tablesNotifications,
  tablesOwnedAssets,
  tablesPreferences,
} from './productTables.js';
import type { TablesSocialContext } from './socialContext.js';

function ctx(): TablesSocialContext {
  const blobs = new MemoryBlobStore();
  return {
    kind: 'tables',
    provider: 'aws_s3',
    tables: new SqliteBlobTableAdapter(blobs, 'root/'),
    blobs: blobs as unknown as DeviceBlobStore,
    layoutRoot: 'root/',
  };
}

describe('product data on a non-Google social cloud', () => {
  it('follows and unfollows', async () => {
    const following = tablesFollowing(ctx());
    await following.add('feed', 'feed-1');
    await following.add('user', 'pn-a');
    await following.add('feed', 'feed-1');
    expect((await following.list()).map((f) => f.targetPnIdentifier).sort()).toEqual(['feed-1', 'pn-a']);
    await following.remove('feed-1');
    expect((await following.list()).map((f) => f.targetPnIdentifier)).toEqual(['pn-a']);
  });

  it('lists followers the mailbox wrote', async () => {
    const c = ctx();
    await (await c.tables.openTable(FOLLOWERS_SCHEMA)).append({ followerPnIdentifier: 'pn-b', followedAt: '1' });
    expect(await listTablesFollowers(c)).toEqual([{ followerPnIdentifier: 'pn-b', followedAt: '1' }]);
  });

  it('upserts an owned asset', async () => {
    const assets = tablesOwnedAssets(ctx());
    const asset = {
      id: 'a1',
      rootPnIdentifier: 'pn-me',
      subjectPnIdentifier: 'pn-sub',
      kind: 'feed',
      status: 'active',
      metadata: { feedId: 'f1' },
      apiKeyId: null,
      createdAt: '1',
      updatedAt: '1',
      revokedAt: null,
    };
    await assets.upsert(asset);
    await assets.upsert({ ...asset, updatedAt: '2' });
    expect(await assets.get('a1')).toMatchObject({ subjectPnIdentifier: 'pn-sub', updatedAt: '2', metadata: { feedId: 'f1' } });
  });

  it('marks notifications read and deletes them', async () => {
    const c = ctx();
    const table = await c.tables.openTable(NOTIFICATIONS_SCHEMA);
    await table.append({ notification_id: 'n1', type: 't', title: 'a', message: 'm', read: false, created_at: '1' });
    await table.append({ notification_id: 'n2', type: 't', title: 'b', message: 'm', read: false, created_at: '2' });
    const notifications = tablesNotifications(c);
    expect(await notifications.markRead(['n1'])).toBe(1);
    expect(await notifications.markRead('all')).toBe(1);
    expect((await notifications.list()).every((n) => n.read)).toBe(true);
    await notifications.remove('n1');
    expect((await notifications.list()).map((n) => n.notification_id)).toEqual(['n2']);
  });

  it('merges preferences and toggles likes in the shared JSON files', async () => {
    const c = ctx();
    const prefs = tablesPreferences(c);
    await prefs.merge({ theme: 'dark' });
    await prefs.merge({ notificationPreferences: { push: false } });
    expect(await prefs.read()).toMatchObject({ theme: 'dark', notificationPreferences: { push: false } });

    const engagement = tablesEngagement(c, 'pn-me');
    await engagement.setLiked('f1', true);
    await engagement.setDisliked('f2', true);
    await engagement.setLiked('f1', false);
    expect(await engagement.likedIds()).toEqual([]);
    expect(await engagement.dislikedIds()).toEqual(['f2']);
  });
});
