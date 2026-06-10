import { metadataPath } from '@par-noir/user-owned-storage';
import { readPortableJsonBlob, writePortableJsonBlob } from './portableJsonBlob';
import type { CreatorSubscriberList } from '../creatorSubscriberStorage';

function subscribersPath(feedId: string): string {
  return metadataPath('feeds', feedId, 'subscribers.json');
}

export async function readSubscribersPortable(
  pnIdentifier: string,
  feedId: string,
  accountId?: string
): Promise<CreatorSubscriberList | null> {
  return readPortableJsonBlob<CreatorSubscriberList>(pnIdentifier, subscribersPath(feedId), accountId);
}

export async function writeSubscribersPortable(
  pnIdentifier: string,
  feedId: string,
  data: CreatorSubscriberList,
  accountId?: string
): Promise<void> {
  await writePortableJsonBlob(pnIdentifier, subscribersPath(feedId), data, accountId);
}
