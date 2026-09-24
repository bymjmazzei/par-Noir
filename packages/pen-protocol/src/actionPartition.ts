/**
 * Partition Pen layers into inert (compose/flatten) vs action (HTML overlay).
 * Votes/CTA write path binds after the feed overlay contract ships.
 */

import type { PenPageLayer, PenSectionContent } from './types.js';

export type ActionOverlaySpec = {
  layerId: string;
  kind: 'interactive';
  behavior: NonNullable<PenPageLayer['behavior']>;
  /** Same canvas rect as the IR layer (CSS px). */
  rect: { x: number; y: number; w: number; h: number };
  bindDocId?: string;
  bindRowId?: string;
  label?: string;
};

export type LayerActionPartition = {
  /** Layers safe to bake into composed media / CDN flatten. */
  inert: PenPageLayer[];
  /** Interactive stickers — must not bake into flatten; render as HTML overlay. */
  action: PenPageLayer[];
  /** Feed-tile overlay contract (same rects as IR). */
  overlays: ActionOverlaySpec[];
};

function isActionLayer(layer: PenPageLayer): boolean {
  if (layer.kind !== 'interactive') return false;
  if (layer.visible === false) return false;
  return Boolean(layer.behavior);
}

/** Split one section's layers for compose vs feed HTML overlay. */
export function partitionLayersForCompose(
  layers: PenPageLayer[] | null | undefined
): LayerActionPartition {
  const inert: PenPageLayer[] = [];
  const action: PenPageLayer[] = [];
  const overlays: ActionOverlaySpec[] = [];
  for (const layer of layers || []) {
    if (isActionLayer(layer)) {
      action.push(layer);
      overlays.push({
        layerId: layer.id,
        kind: 'interactive',
        behavior: layer.behavior!,
        rect: { x: layer.x, y: layer.y, w: layer.w, h: layer.h },
        bindDocId: layer.bindDocId,
        bindRowId: layer.bindRowId,
        label: layer.label
      });
    } else {
      inert.push(layer);
    }
  }
  return { inert, action, overlays };
}

/** Section with action layers stripped (for flatten / compose encode). */
export function sectionWithoutActionLayers(
  section: PenSectionContent
): PenSectionContent {
  const { inert } = partitionLayersForCompose(section.layers);
  return { ...section, layers: inert };
}

/** Collect overlay specs across all sections (feed CDN contract). */
export function collectActionOverlays(
  sections: PenSectionContent[] | null | undefined
): ActionOverlaySpec[] {
  const out: ActionOverlaySpec[] = [];
  for (const sec of sections || []) {
    out.push(...partitionLayersForCompose(sec.layers).overlays);
  }
  return out;
}
