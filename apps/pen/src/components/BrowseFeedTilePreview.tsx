/**
 * Presentational browse feed-shaped preview — delegates to @par-noir/feed-tile.
 * Resolves penlocal:/penmedia: media refs to blob URLs before building the tile.
 */
import { useEffect, useState } from 'react';
import { FeedTileSurface, type FeedTileViewModel } from '@par-noir/feed-tile';
import type { PenDocManifest, PenSectionContent } from '@par-noir/pen-protocol';
import { bundleToFeedTileModel } from '../services/feedTileFromPen';
import { resolvePenMediaSrc } from '../services/penLocalMedia';
import type { PenSession } from '../services/penSession';

async function resolveTileMedia(
  model: FeedTileViewModel,
  docId?: string
): Promise<FeedTileViewModel> {
  const pages = await Promise.all(
    (model.pages || []).map(async (page) => {
      if (!page.mediaSrc) return page;
      const resolved = await resolvePenMediaSrc(page.mediaSrc, docId);
      return resolved ? { ...page, mediaSrc: resolved } : { ...page, mediaSrc: undefined };
    })
  );
  return { ...model, pages };
}

export function BrowseFeedTilePreview({
  manifest,
  sections,
  compact,
  bare,
  session
}: {
  manifest: PenDocManifest;
  sections: PenSectionContent[];
  compact?: boolean;
  bare?: boolean;
  session?: PenSession | null;
}) {
  const base = bundleToFeedTileModel({
    title: manifest.title || 'Untitled',
    sections,
    pagePresentation: manifest.pagePresentation,
    contentClass: manifest.docType
  });
  const [model, setModel] = useState(base);

  useEffect(() => {
    let cancelled = false;
    const next = bundleToFeedTileModel({
      title: manifest.title || 'Untitled',
      sections,
      pagePresentation: manifest.pagePresentation,
      contentClass: manifest.docType
    });
    void resolveTileMedia(next, manifest.docId).then((resolved) => {
      if (!cancelled) setModel(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [manifest, sections, session?.pnIdentifier]);

  const tile = (
    <FeedTileSurface model={model} mode="preview" compact={compact || bare} />
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
