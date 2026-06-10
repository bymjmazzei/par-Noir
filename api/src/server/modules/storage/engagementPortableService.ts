import { METADATA_DIR } from '@par-noir/user-owned-storage';
import type { UserComment } from '../engagementSheetsService';
import { readPortableJsonBlob, writePortableJsonBlob } from './portableJsonBlob';

export interface UserEngagement {
  userPnIdentifier: string;
  updatedAt: string;
  likes: string[];
  dislikes: string[];
  comments: UserComment[];
  shares: string[];
  saves: string[];
}

const ENGAGEMENT_REL = `${METADATA_DIR}/engagement.json`;

function emptyEngagement(userPnIdentifier: string): UserEngagement {
  return {
    userPnIdentifier,
    updatedAt: new Date().toISOString(),
    likes: [],
    dislikes: [],
    comments: [],
    shares: [],
    saves: []
  };
}

export async function getEngagementPortable(
  userPnIdentifier: string,
  accountId?: string
): Promise<UserEngagement | null> {
  const data = await readPortableJsonBlob<UserEngagement>(userPnIdentifier, ENGAGEMENT_REL, accountId);
  return data ?? null;
}

export async function saveEngagementPortable(
  userPnIdentifier: string,
  engagement: UserEngagement,
  accountId?: string
): Promise<void> {
  await writePortableJsonBlob(
    userPnIdentifier,
    ENGAGEMENT_REL,
    { ...engagement, updatedAt: new Date().toISOString() },
    accountId
  );
}

export async function getOrInitEngagementPortable(
  userPnIdentifier: string,
  accountId?: string
): Promise<UserEngagement> {
  const existing = await getEngagementPortable(userPnIdentifier, accountId);
  return existing ?? emptyEngagement(userPnIdentifier);
}
