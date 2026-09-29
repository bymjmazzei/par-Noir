/**
 * Partition Pen layers into inert (compose/flatten) vs action (HTML overlay).
 * The overlay stays clickable on the compiled image or video. spreadsheetId
 * is the tracking sheet in the poster's cloud.
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
  /** Owner spreadsheet this press writes. Absent on a reusable template. */
  spreadsheetId?: string;
};

export type LayerActionPartition = {
  /** Layers safe to bake into composed media / CDN flatten. */
  inert: PenPageLayer[];
  /** Interactive stickers — must not bake into flatten; render as HTML overlay. */
  action: PenPageLayer[];
  /** Feed-tile overlay contract (same rects as IR). */
  overlays: ActionOverlaySpec[];
};

function trackingSpreadsheetId(
  layers: PenPageLayer[],
  layer: PenPageLayer
): string | undefined {
  const own = layer.spreadsheetId?.trim();
  if (own) return own;
  if (!layer.parentGroupId) return undefined;
  const group = layers.find((item) => item.id === layer.parentGroupId);
  const id = group?.spreadsheetId?.trim();
  return id || undefined;
}

function isActionLayer(layer: PenPageLayer): boolean {
  if (layer.visible === false) return false;
  if (layer.widgetElement === 'html' || layer.widgetElement === 'time' || layer.widgetElement === 'input') {
    return true;
  }
  if (layer.kind !== 'interactive') return false;
  return true;
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
      if (layer.kind === 'interactive' && layer.behavior) {
        const spreadsheetId = trackingSpreadsheetId(layers || [], layer);
        overlays.push({
          layerId: layer.id,
          kind: 'interactive',
          behavior: layer.behavior,
          rect: { x: layer.x, y: layer.y, w: layer.w, h: layer.h },
          bindDocId: layer.bindDocId,
          bindRowId: layer.bindRowId,
          label: layer.label,
          ...(spreadsheetId ? { spreadsheetId } : {})
        });
      }
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
