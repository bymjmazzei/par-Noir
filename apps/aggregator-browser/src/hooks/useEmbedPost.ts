/** Load one public Pen post (or collection) for an embed: metadata, public media, tile model. */

import { useEffect, useState } from 'react';
import type { FeedTileViewModel } from '@par-noir/feed-tile';
import type { IndexedFile } from '../types/aggregator';
import { feedMetadataIsVideo, loadMemberFeedMeta } from '../services/feedMemberMeta';
import { resolvePublicFeedObjectUrl, type FeedPlaybackMetadata } from '../services/feedPreviewPlayback';
import {
  buildPenCollectionFeedTileModel,
  buildPenFeedTileModelForPost
} from '../utils/penFeedTileModel';
import {
  collectionMemberIds,
  embedPostAspect,
  embedPostRefusal,
  type EmbedPostAspect,
  type EmbedRefusal
} from '../utils/embedPost';

export type EmbedPostState =
  | { status: 'loading' }
  | { status: 'refused'; reason: Exclude<EmbedRefusal, null> | 'failed' }
  | { status: 'ready'; file: IndexedFile; model: FeedTileViewModel; aspect: EmbedPostAspect };

type MemberMedia = { meta: Record<string, unknown>; videoUrl?: string; posterUrl?: string };

async function memberMedia(fileId: string, meta: Record<string, unknown>): Promise<MemberMedia> {
  const playback = meta as FeedPlaybackMetadata;
  const posterUrl = await resolvePublicFeedObjectUrl(fileId, playback, { variant: 'poster' });
  const videoUrl = feedMetadataIsVideo(playback)
    ? await resolvePublicFeedObjectUrl(fileId, playback, { variant: 'hd' })
    : undefined;
  return { meta, videoUrl, posterUrl };
}

export async function loadEmbedPost(fileId: string, creator?: string): Promise<EmbedPostState> {
  const meta = await loadMemberFeedMeta(fileId);
  const refusal = embedPostRefusal(meta);
  if (refusal || !meta) return { status: 'refused', reason: refusal || 'not_found' };
  const file = {
    metadata: { ...meta, fileId },
    ...(creator ? { pnIdentifier: creator } : {})
  } as unknown as IndexedFile;
  const memberIds = collectionMemberIds(meta);
  let model: FeedTileViewModel;
  if (memberIds.length) {
    const members = new Map<string, MemberMedia>();
    await Promise.all(
      memberIds.map(async (id) => {
        const memberMeta = await loadMemberFeedMeta(id);
        if (memberMeta && embedPostRefusal(memberMeta) !== 'private') {
          members.set(id, await memberMedia(id, memberMeta));
        }
      })
    );
    model = buildPenCollectionFeedTileModel(file, memberIds, (id) => members.get(id) || null);
  } else {
    const media = await memberMedia(fileId, meta);
    model = buildPenFeedTileModelForPost(file, {
      src: media.videoUrl || media.posterUrl,
      posterUrl: media.posterUrl,
      kind: media.videoUrl ? 'video' : 'image'
    });
  }
  return { status: 'ready', file, model, aspect: embedPostAspect(meta) };
}

export function useEmbedPost(fileId: string, creator?: string): EmbedPostState {
  const [state, setState] = useState<EmbedPostState>({ status: 'loading' });
  useEffect(() => {
    if (!fileId) {
      setState({ status: 'refused', reason: 'not_found' });
      return;
    }
    let cancel = false;
    setState({ status: 'loading' });
    loadEmbedPost(fileId, creator)
      .then((next) => {
        if (!cancel) setState(next);
      })
      .catch(() => {
        if (!cancel) setState({ status: 'refused', reason: 'failed' });
      });
    return () => {
      cancel = true;
    };
  }, [fileId, creator]);
  return state;
}
