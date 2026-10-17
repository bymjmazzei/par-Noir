/**
 * Action-only section slice for feed playback (motion-synced overlay).
 */

import { normalizeSection } from './richDoc.js';
import {
  resolveTimelineDuration,
  sampleSectionLayers,
  type PenTimelineContext
} from './layerMotion.js';
import { partitionLayersForCompose } from './actionPartition.js';
import type { PenPageLayer, PenSectionContent } from './types.js';

export type PenFeedActionSection = {
  layers: PenPageLayer[];
  timelineDurationSec?: number;
};

export type PenFeedPagePayload = {
  slug: string;
  canvas: { w: number; h: number };
  timelineDurationSec?: number;
  actionSection: PenFeedActionSection;
};

/** Action layers plus parent group stubs required for motion sampling. */
export function exportActionSectionForFeed(
  section: PenSectionContent,
  ctx?: PenTimelineContext
): PenFeedActionSection {
  const sec = normalizeSection(section);
  const all = sec.layers || [];
  const { action } = partitionLayersForCompose(all);
  const want = new Set<string>();
  for (const layer of action) {
    want.add(layer.id);
    if (layer.parentGroupId) want.add(layer.parentGroupId);
  }
  const layers = all.filter((layer) => want.has(layer.id));
  const timelineDurationSec = resolveTimelineDuration({ ...sec, layers }, undefined, ctx);
  return {
    layers,
    ...(timelineDurationSec > 0 ? { timelineDurationSec } : {})
  };
}

/** Posed action layers at page time `t` (visibility + motion). */
export function buildActionOverlayAtTime(
  actionSection: PenFeedActionSection,
  timeSec: number
): PenPageLayer[] {
  const section: PenSectionContent = {
    slug: 'feed-action',
    doc: { type: 'doc', content: [] },
    layers: actionSection.layers,
    ...(actionSection.timelineDurationSec != null
      ? { timelineDurationSec: actionSection.timelineDurationSec }
      : {})
  };
  return sampleSectionLayers(section, timeSec).filter((layer) => {
    if (layer.visible === false) return false;
    if (layer.kind === 'group') return false;
    const { action } = partitionLayersForCompose([layer]);
    return action.length > 0;
  });
}
