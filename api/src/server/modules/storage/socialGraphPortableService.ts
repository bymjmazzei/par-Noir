import type { Follower, Following } from '../connectionsSheetsService';
import {
  portableTableAppend,
  portableTableDelete,
  portableTableScan
} from './portableTableService';
import { FOLLOWERS_SCHEMA, FOLLOWING_SCHEMA } from './tableSchemas';

function followingKey(f: Following): string {
  return `${f.targetType}:${f.targetPnIdentifier}`;
}

export async function addFollowerPortable(
  userPnIdentifier: string,
  follower: Follower,
  accountId?: string
): Promise<void> {
  const normalized = follower.followerPnIdentifier.startsWith('pn-')
    ? follower.followerPnIdentifier
    : `pn-${follower.followerPnIdentifier}`;
  await portableTableAppend(
    userPnIdentifier,
    FOLLOWERS_SCHEMA,
    { ...follower, followerPnIdentifier: normalized } as unknown as Record<string, unknown>,
    accountId
  );
}

export async function getFollowersPortable(
  userPnIdentifier: string,
  accountId?: string,
  options?: { limit?: number; offset?: number }
): Promise<{ followers: Follower[]; total: number }> {
  const rows = await portableTableScan<Follower>(userPnIdentifier, FOLLOWERS_SCHEMA, accountId);
  const total = rows.length;
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  return { followers: rows.slice(offset, offset + limit), total };
}

export async function removeFollowerPortable(
  userPnIdentifier: string,
  followerPnIdentifier: string,
  accountId?: string
): Promise<void> {
  const normalized = followerPnIdentifier.startsWith('pn-')
    ? followerPnIdentifier
    : `pn-${followerPnIdentifier}`;
  await portableTableDelete(userPnIdentifier, FOLLOWERS_SCHEMA, normalized, accountId);
}

export async function addFollowingPortable(
  userPnIdentifier: string,
  following: Following,
  accountId?: string
): Promise<void> {
  await portableTableAppend(
    userPnIdentifier,
    FOLLOWING_SCHEMA,
    { ...following, followingKey: followingKey(following) } as unknown as Record<string, unknown>,
    accountId
  );
}

export async function getFollowingPortable(
  userPnIdentifier: string,
  accountId?: string,
  options?: { limit?: number; offset?: number; targetType?: 'user' | 'feed' }
): Promise<{ following: Following[]; total: number }> {
  let rows = await portableTableScan<Following>(userPnIdentifier, FOLLOWING_SCHEMA, accountId);
  if (options?.targetType) {
    rows = rows.filter((r) => r.targetType === options.targetType);
  }
  const total = rows.length;
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  return { following: rows.slice(offset, offset + limit), total };
}

export async function removeFollowingPortable(
  userPnIdentifier: string,
  targetType: 'user' | 'feed',
  targetPnIdentifier: string,
  accountId?: string
): Promise<void> {
  const key = `${targetType}:${targetPnIdentifier}`;
  await portableTableDelete(userPnIdentifier, FOLLOWING_SCHEMA, key, accountId);
}
