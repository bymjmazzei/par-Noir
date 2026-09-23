/**
 * Presentational browse feed-shaped preview — delegates to @par-noir/feed-tile.
 */
import { FeedTileSurface } from '@par-noir/feed-tile';
import type { PenDocManifest, PenSectionContent } from '@par-noir/pen-protocol';
import { bundleToFeedTileModel } from '../services/feedTileFromPen';

export function BrowseFeedTilePreview({
  manifest,
  sections,
  compact,
  bare
}: {
  manifest: PenDocManifest;
  sections: PenSectionContent[];
  compact?: boolean;
  bare?: boolean;
}) {
  const model = bundleToFeedTileModel({
    title: manifest.title || 'Untitled',
    sections,
    pagePresentation: manifest.pagePresentation,
    contentClass: manifest.docType
  });

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
