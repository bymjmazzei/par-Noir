/** Public metadata for one post or collection member, shared by the feed and the embeds. */

import { apiGet } from './ownerApiFetch';
import { feedPlaybackVariant, type FeedPlaybackMetadata } from './feedPreviewPlayback';

/** Skip repeat GETs for fileIds that already 404'd from metadata-index (collection members often aren't cached). */
const metadataIndexMisses = new Set<string>();

export async function loadMemberFeedMeta(fileId: string): Promise<Record<string, unknown> | null> {
  if (metadataIndexMisses.has(fileId)) return null;
  try {
    const res = await apiGet(`/api/aggregator/metadata-index/${encodeURIComponent(fileId)}`);
    if (res.status === 404) {
      metadataIndexMisses.add(fileId);
      return null;
    }
    if (!res.ok) return null;
    const data = await res.json();
    return (data.metadata || data) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function feedMetadataIsVideo(meta: FeedPlaybackMetadata | null | undefined): boolean {
  if (!meta) return false;
  return feedPlaybackVariant(meta) === 'sd';
}
