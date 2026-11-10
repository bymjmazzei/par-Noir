import {
  FOLLOWERS_SCHEMA,
  FOLLOWING_SCHEMA,
  JSON_BLOB_PATHS,
  NOTIFICATIONS_SCHEMA,
  OWNED_ASSETS_SCHEMA,
  metadataPath,
} from '@par-noir/user-owned-storage';
import type { DeviceOwnedAsset } from '../deviceIndexes.js';
import type { DeviceFollower, DeviceFollowing, DeviceNotification } from '../deviceProduct.js';
import { editBlobText, readJsonBlob } from './blobText.js';
import type { TablesSocialContext } from './socialContext.js';

/** Same file the API's portable engagement service wrote. */
const ENGAGEMENT_PATH = metadataPath('engagement.json');

type JsonObject = Record<string, unknown>;

async function editJson<T extends JsonObject>(
  ctx: TablesSocialContext,
  path: string,
  edit: (current: T | null) => T | null
): Promise<void> {
  await editBlobText(ctx.blobs, `${ctx.layoutRoot}${path}`, 'application/json', (text) => {
    const next = edit(text?.trim() ? (JSON.parse(text) as T) : null);
    return next ? JSON.stringify({ ...next, updatedAt: new Date().toISOString() }) : null;
  });
}

const followingKey = (targetType: string, targetId: string) => `${targetType}:${targetId}`;

export function tablesFollowing(ctx: TablesSocialContext) {
  const open = () => ctx.tables.openTable(FOLLOWING_SCHEMA);
  return {
    async list(): Promise<DeviceFollowing[]> {
      return ((await (await open()).scan()) as JsonObject[])
        .filter((row) => row.targetPnIdentifier)
        .map((row) => ({
          targetType: row.targetType === 'feed' ? 'feed' : 'user',
          targetPnIdentifier: String(row.targetPnIdentifier),
          followedAt: String(row.followedAt || ''),
        }));
    },
    async add(targetType: 'user' | 'feed', targetId: string): Promise<void> {
      await (await open()).append({
        followingKey: followingKey(targetType, targetId),
        targetType,
        targetPnIdentifier: targetId,
        followedAt: new Date().toISOString(),
      });
    },
    async remove(targetId: string): Promise<void> {
      const table = await open();
      for (const row of (await table.scan()) as JsonObject[]) {
        if (row.targetPnIdentifier === targetId) await table.delete(String(row.followingKey));
      }
    },
  };
}

export async function listTablesFollowers(ctx: TablesSocialContext): Promise<DeviceFollower[]> {
  return ((await (await ctx.tables.openTable(FOLLOWERS_SCHEMA)).scan()) as JsonObject[])
    .filter((row) => row.followerPnIdentifier)
    .map((row) => ({
      followerPnIdentifier: String(row.followerPnIdentifier),
      followedAt: String(row.followedAt || ''),
      ...(row.feedId ? { feedId: String(row.feedId) } : {}),
    }));
}

export function tablesNotifications(ctx: TablesSocialContext) {
  const open = () => ctx.tables.openTable(NOTIFICATIONS_SCHEMA);
  return {
    async list(): Promise<DeviceNotification[]> {
      return ((await (await open()).scan()) as JsonObject[])
        .filter((row) => row.notification_id)
        .map((row) => ({
          notification_id: String(row.notification_id),
          user_pn_identifier: String(row.user_pn_identifier || ''),
          type: String(row.type || ''),
          title: String(row.title || ''),
          message: String(row.message || ''),
          data: (row.data && typeof row.data === 'object' ? row.data : {}) as JsonObject,
          read: row.read === true || row.read === 'true' || row.read === 'TRUE',
          created_at: String(row.created_at || ''),
        }));
    },
    async markRead(ids: string[] | 'all'): Promise<number> {
      const table = await open();
      let marked = 0;
      for (const row of (await table.scan()) as JsonObject[]) {
        const id = String(row.notification_id || '');
        if (!id || (ids !== 'all' && !ids.includes(id))) continue;
        if (row.read === true || row.read === 'true' || row.read === 'TRUE') continue;
        await table.append({ ...row, read: true });
        marked += 1;
      }
      return marked;
    },
    async remove(id: string): Promise<void> {
      await (await open()).delete(id);
    },
  };
}

export function tablesPreferences(ctx: TablesSocialContext) {
  return {
    async read(): Promise<JsonObject | null> {
      return readJsonBlob<JsonObject>(ctx.blobs, `${ctx.layoutRoot}${JSON_BLOB_PATHS.preferences}`);
    },
    async merge(patch: JsonObject): Promise<void> {
      await editJson<JsonObject>(ctx, JSON_BLOB_PATHS.preferences, (current) => ({ ...(current || {}), ...patch }));
    },
  };
}

export function tablesOwnedAssets(ctx: TablesSocialContext) {
  const open = () => ctx.tables.openTable(OWNED_ASSETS_SCHEMA);
  return {
    async get(id: string): Promise<DeviceOwnedAsset | null> {
      return ((await (await open()).getByKey(id)) as DeviceOwnedAsset | null) ?? null;
    },
    async upsert(asset: DeviceOwnedAsset): Promise<void> {
      await (await open()).append(asset as unknown as JsonObject);
    },
  };
}

type EngagementDoc = JsonObject & { likes?: string[]; dislikes?: string[] };

export function tablesEngagement(ctx: TablesSocialContext, userPnIdentifier: string) {
  const read = () => readJsonBlob<EngagementDoc>(ctx.blobs, `${ctx.layoutRoot}${ENGAGEMENT_PATH}`);
  const set = (list: 'likes' | 'dislikes', fileId: string, on: boolean) =>
    editJson<EngagementDoc>(ctx, ENGAGEMENT_PATH, (current) => {
      const doc: EngagementDoc = current || { userPnIdentifier, likes: [], dislikes: [], comments: [], shares: [], saves: [] };
      const ids = new Set(doc[list] || []);
      if (on === ids.has(fileId)) return null;
      if (on) ids.add(fileId);
      else ids.delete(fileId);
      return { ...doc, [list]: [...ids] };
    });
  return {
    async likedIds(): Promise<string[]> {
      return (await read())?.likes || [];
    },
    async dislikedIds(): Promise<string[]> {
      return (await read())?.dislikes || [];
    },
    setLiked: (fileId: string, liked: boolean) => set('likes', fileId, liked),
    setDisliked: (fileId: string, disliked: boolean) => set('dislikes', fileId, disliked),
  };
}
