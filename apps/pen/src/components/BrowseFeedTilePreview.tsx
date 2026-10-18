/**
 * Presentational browse feed-shaped preview — delegates to @par-noir/feed-tile.
 * Resolves penlocal:/penmedia: media refs to blob URLs before building the tile.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { FeedTileSurface, type FeedTileViewModel } from '@par-noir/feed-tile';
import type { PenDocManifest, PenSectionContent } from '@par-noir/pen-protocol';
import { bundleToFeedTileModel } from '../services/feedTileFromPen';
import { ensurePenMediaUrl, isPenMediaSrcRef } from '@par-noir/pen-media';
import type { PenSession } from '../services/penSession';

/** Strip custom-scheme mediaSrc so first paint never hits ERR_UNKNOWN_URL_SCHEME. */
function scrubUnresolvedMedia(model: FeedTileViewModel): FeedTileViewModel {
  return {
    ...model,
    pages: (model.pages || []).map((page) => {
      if (!page.mediaSrc || !isPenMediaSrcRef(page.mediaSrc)) return page;
      return { ...page, mediaSrc: undefined };
    }),
    posterUrl:
      model.posterUrl && isPenMediaSrcRef(model.posterUrl) ? undefined : model.posterUrl
  };
}

function resolveOneMediaSrc(
  src: string,
  docId: string | undefined,
  session: PenSession | null | undefined
): Promise<string | null> {
  return ensurePenMediaUrl({ src, docId, pnIdentifier: session?.pnIdentifier });
}

async function resolveTileMedia(
  model: FeedTileViewModel,
  docId: string | undefined,
  session: PenSession | null | undefined
): Promise<FeedTileViewModel> {
  const pages = await Promise.all(
    (model.pages || []).map(async (page) => {
      if (!page.mediaSrc) return page;
      if (!isPenMediaSrcRef(page.mediaSrc)) return page;
      try {
        const resolved = await resolveOneMediaSrc(page.mediaSrc, docId, session);
        // Keep mediaKind so PenMediaPlayer still runs after hydrate.
        return resolved ? { ...page, mediaSrc: resolved } : { ...page, mediaSrc: undefined };
      } catch {
        return { ...page, mediaSrc: undefined };
      }
    })
  );
  let posterUrl = model.posterUrl;
  if (posterUrl && isPenMediaSrcRef(posterUrl)) {
    try {
      posterUrl = (await resolveOneMediaSrc(posterUrl, docId, session)) || undefined;
    } catch {
      posterUrl = undefined;
    }
  }
  return { ...model, pages, posterUrl };
}

export function BrowseFeedTilePreview({
  manifest,
  sections,
  compact,
  bare,
  session,
  hideEngagementRail = false,
  engagementOverlay,
  aspectRatio,
  showWidgets = true,
  playheadSec
}: {
  manifest: PenDocManifest;
  sections: PenSectionContent[];
  compact?: boolean;
  bare?: boolean;
  session?: PenSession | null;
  /** Hide decorative in-tile engagement (Templates feed puts chrome outside). */
  hideEngagementRail?: boolean;
  /** Browse-shaped preview-only overlay (editor live preview). */
  engagementOverlay?: ReactNode;
  aspectRatio?: '9/16' | '16/9' | '1/1';
  /** Voter HTML for placed widgets. The editor overlay paints the author frame instead. */
  showWidgets?: boolean;
  /** Timeline scrubber — drives motion-synced action overlays in preview. */
  playheadSec?: number;
}) {
  const base = bundleToFeedTileModel({
    title: manifest.title || 'Untitled',
    sections,
    pagePresentation: manifest.pagePresentation,
    contentClass: manifest.docType,
    pageSwipeAxis: manifest.pageSwipeAxis,
    pageView: manifest.pageView,
    galleryPreviewRef: manifest.galleryPreviewRef,
    galleryPreviewKind: manifest.galleryPreviewKind,
    galleryPreviewPosterRef: manifest.galleryPreviewPosterRef,
    galleryAspect: manifest.galleryAspect,
    fileId: manifest.docId,
    penFeedMediaBySlug: manifest.penFeedMediaBySlug
  });
  // Never paint unresolved penmedia:/penlocal: on first render.
  const [model, setModel] = useState(() => scrubUnresolvedMedia(base));

  useEffect(() => {
    let cancelled = false;
    const next = bundleToFeedTileModel({
      title: manifest.title || 'Untitled',
      sections,
      pagePresentation: manifest.pagePresentation,
      contentClass: manifest.docType,
      pageSwipeAxis: manifest.pageSwipeAxis,
      pageView: manifest.pageView,
      galleryPreviewRef: manifest.galleryPreviewRef,
      galleryPreviewKind: manifest.galleryPreviewKind,
      galleryPreviewPosterRef: manifest.galleryPreviewPosterRef,
      galleryAspect: manifest.galleryAspect,
      fileId: manifest.docId,
      penFeedMediaBySlug: manifest.penFeedMediaBySlug
    });
    setModel(scrubUnresolvedMedia(next));
    void resolveTileMedia(next, manifest.docId, session).then((resolved) => {
      if (!cancelled) setModel(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [manifest, sections, session?.pnIdentifier]);

  const resolvedAspect =
    aspectRatio ||
    (manifest.galleryAspect === '16/9'
      ? '16/9'
      : manifest.galleryAspect === '1/1'
        ? '1/1'
        : '9/16');

  const tile = (
    <FeedTileSurface
      model={model}
      mode="preview"
      compact={compact || bare}
      hideEngagementRail={hideEngagementRail}
      engagementOverlay={engagementOverlay}
      aspectRatio={resolvedAspect}
      externalClockSec={playheadSec}
    />
  );

  if (bare) return tile;

  if (compact) {
    return <div className="overflow-hidden rounded-lg bg-neutral-950">{tile}</div>;
  }

  return (
    <div className="flex h-full flex-col bg-neutral-950">
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-800 bg-neutral-900 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
          Browse preview
        </span>
        <span className="truncate text-[11px] text-neutral-500">{manifest.templateId}</span>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto p-4">{tile}</div>
    </div>
  );
}
