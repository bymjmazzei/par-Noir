import {
  compilePenFeedTileModel,
  type FeedTileViewModel,
  type PenFeedCompilePageInput
} from '@par-noir/feed-tile';
import type { PenFeedPagePayload } from '@par-noir/pen-protocol';
import type { IndexedFile } from '../types/aggregator';

function metaRecord(meta: IndexedFile['metadata']): Record<string, unknown> {
  return (meta || {}) as Record<string, unknown>;
}

export function penFeedPageFromMetadata(
  meta: Record<string, unknown> | null | undefined
): PenFeedPagePayload | undefined {
  const raw = meta?.penFeedPage;
  if (!raw || typeof raw !== 'object') return undefined;
  return raw as PenFeedPagePayload;
}

function mediaKindForMeta(meta: Record<string, unknown>): 'image' | 'video' | undefined {
  const ft = typeof meta.fileType === 'string' ? meta.fileType.toLowerCase() : '';
  if (ft === 'video') return 'video';
  if (ft === 'image' || ft === 'note-collection-thumbnail') return 'image';
  return undefined;
}

export function buildPenFeedTileModelForPost(
  file: IndexedFile,
  media: { src?: string; posterUrl?: string; kind?: 'image' | 'video' }
) {
  const meta = metaRecord(file.metadata);
  const penFeedPage = penFeedPageFromMetadata(meta);
  const page: PenFeedCompilePageInput = {
    mediaSrc: media.src || media.posterUrl,
    mediaKind: media.kind || mediaKindForMeta(meta),
    posterUrl: media.posterUrl,
    penFeedPage,
    actionStageHtml:
      typeof meta.actionStageHtml === 'string' ? meta.actionStageHtml : undefined
  };
  const model = compilePenFeedTileModel({
    title:
      (typeof meta.title === 'string' && meta.title) ||
      (typeof meta.name === 'string' && meta.name) ||
      'Post',
    caption: typeof meta.description === 'string' ? meta.description : undefined,
    fileId: file.metadata.fileId,
    contentClass:
      typeof meta.contentClass === 'string' ? meta.contentClass : undefined,
    pageView: meta.pageView as FeedTileViewModel['pageView'],
    pageSwipeAxis: meta.pageSwipeAxis === 'y' ? 'y' : meta.pageSwipeAxis === 'x' ? 'x' : undefined,
    posterUrl: media.posterUrl,
    pages: [page]
  });
  const penDocId = typeof meta.penDocId === 'string' ? meta.penDocId : undefined;
  return penDocId ? { ...model, penDocId } : model;
}

export function buildPenCollectionFeedTileModel(
  parent: IndexedFile,
  memberIds: string[],
  resolveMember: (fileId: string) => {
    meta: Record<string, unknown>;
    videoUrl?: string;
    posterUrl?: string;
  } | null
) {
  const parentMeta = metaRecord(parent.metadata);
  const pages: PenFeedCompilePageInput[] = [];
  for (const id of memberIds) {
    const member = resolveMember(id);
    if (!member) continue;
    const kind = mediaKindForMeta(member.meta);
    pages.push({
      ...(typeof member.meta.penPageSlug === 'string' ? { slug: member.meta.penPageSlug } : {}),
      ...(typeof member.meta.penPageTitle === 'string' ? { title: member.meta.penPageTitle } : {}),
      mediaSrc: member.videoUrl || member.posterUrl,
      mediaKind: kind,
      posterUrl: member.posterUrl,
      penFeedPage: penFeedPageFromMetadata(member.meta),
      actionStageHtml:
        typeof member.meta.actionStageHtml === 'string'
          ? member.meta.actionStageHtml
          : undefined
    });
  }
  return compilePenFeedTileModel({
    title:
      (typeof parentMeta.title === 'string' && parentMeta.title) ||
      (typeof parentMeta.name === 'string' && parentMeta.name) ||
      'Collection',
    caption:
      typeof parentMeta.description === 'string' ? parentMeta.description : undefined,
    fileId: parent.metadata.fileId,
    contentClass: 'collection',
    pageView: parentMeta.pageView as FeedTileViewModel['pageView'],
    pageSwipeAxis:
      parentMeta.pageSwipeAxis === 'y' ? 'y' : parentMeta.pageSwipeAxis === 'x' ? 'x' : undefined,
    posterUrl: pages[0]?.posterUrl,
    pages
  });
}
