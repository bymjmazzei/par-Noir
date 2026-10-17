import type { PenFeedPagePayload } from '@par-noir/pen-protocol';
import type { FeedTilePage, FeedTileViewModel } from './FeedTileSurface.js';

export type PenFeedCompilePageInput = {
  mediaSrc?: string;
  mediaKind?: 'image' | 'video';
  posterUrl?: string;
  bodyText?: string;
  bodyHtml?: string;
  title?: string;
  backgroundColor?: string;
  textColor?: string;
  penFeedPage?: PenFeedPagePayload;
  actionStageHtml?: string;
};

export type PenFeedCompileInput = {
  title: string;
  caption?: string;
  fileId?: string;
  contentClass?: string;
  pageView?: FeedTileViewModel['pageView'];
  pageSwipeAxis?: FeedTileViewModel['pageSwipeAxis'];
  posterUrl?: string;
  pages: PenFeedCompilePageInput[];
};

function pageFromInput(input: PenFeedCompilePageInput, titleFallback: string): FeedTilePage {
  return {
    title: input.title || titleFallback,
    bodyText: input.bodyText,
    bodyHtml: input.bodyHtml,
    mediaSrc: input.mediaSrc,
    mediaKind: input.mediaKind,
    backgroundColor: input.backgroundColor,
    textColor: input.textColor,
    actionStageHtml: input.penFeedPage ? undefined : input.actionStageHtml,
    penFeedPage: input.penFeedPage
  };
}

/** Build a feed tile model from published Pen metadata + resolved media URLs. */
export function compilePenFeedTileModel(input: PenFeedCompileInput): FeedTileViewModel {
  const pages = input.pages.map((page) => pageFromInput(page, input.title));
  return {
    title: input.title,
    caption: input.caption || input.title,
    pages: pages.length ? pages : [{ title: input.title, mediaSrc: input.posterUrl }],
    posterUrl: input.posterUrl,
    fileId: input.fileId,
    contentClass: input.contentClass,
    pageView: input.pageView,
    pageSwipeAxis: input.pageSwipeAxis
  };
}

/** True when the post should use Pen feed tile playback (not legacy raw video). */
export function isPenFeedPlaybackMetadata(meta: Record<string, unknown> | null | undefined): boolean {
  if (!meta || typeof meta.penDocId !== 'string' || !meta.penDocId.trim()) return false;
  if (meta.penTemplateKind === 'template' || meta.penTemplateKind === 'remix') return false;
  return true;
}
