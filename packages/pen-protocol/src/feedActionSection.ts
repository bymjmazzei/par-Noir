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
import { layerVisibleInViewer, revealTargetIds, type PenViewerState } from './penViewerOverlay.js';
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
  for (const layer of action) {
    const targetId = layer.behavior === 'widget.reveal' ? layer.revealLayerId : undefined;
    const target = targetId ? all.find((item) => item.id === targetId) : undefined;
    if (!target) continue;
    want.add(target.id);
    if (target.parentGroupId) want.add(target.parentGroupId);
  }
  for (const id of revealTargetIds(all)) want.add(id);
  for (const layer of all) {
    if (layer.stepFrame != null || layer.widgetElement === 'score') {
      want.add(layer.id);
      if (layer.parentGroupId) want.add(layer.parentGroupId);
    }
  }
  const layers = all.filter((layer) => want.has(layer.id));
  const timelineDurationSec = resolveTimelineDuration({ ...sec, layers }, undefined, ctx);
  return {
    layers,
    ...(timelineDurationSec > 0 ? { timelineDurationSec } : {})
  };
}

export type PenViewerOverlaySlice = Pick<PenViewerState, 'revealed' | 'hidden' | 'steps'>;

/**
 * Posed action layers at page time `t` (visibility + motion).
 * Viewer state controls reveal, tabs, and step frames.
 */
export function buildActionOverlayAtTime(
  actionSection: PenFeedActionSection,
  timeSec: number,
  viewer?: PenViewerOverlaySlice,
  fullViewer?: PenViewerState
): PenPageLayer[] {
  const state: PenViewerState = {
    revealed: viewer?.revealed || [],
    hidden: viewer?.hidden || [],
    steps: viewer?.steps || {},
    inputs: fullViewer?.inputs || {},
    toggled: fullViewer?.toggled || [],
    ranks: fullViewer?.ranks || {},
    amounts: fullViewer?.amounts || {},
    voted: fullViewer?.voted || {},
    answers: fullViewer?.answers || {}
  };
  const shown = new Set(state.revealed);
  const section: PenSectionContent = {
    slug: 'feed-action',
    doc: { type: 'doc', content: [] },
    layers: shown.size
      ? actionSection.layers.map((layer) =>
          shown.has(layer.id) ? { ...layer, visible: true } : layer
        )
      : actionSection.layers,
    ...(actionSection.timelineDurationSec != null
      ? { timelineDurationSec: actionSection.timelineDurationSec }
      : {})
  };
  const sampled = sampleSectionLayers(section, timeSec);
  const all = actionSection.layers;
  return sampled.filter((layer) => {
    if (layer.kind === 'group') return false;
    if (!layerVisibleInViewer(layer, all, state)) return false;
    const { action } = partitionLayersForCompose([layer]);
    if (action.length > 0) return true;
    return shown.has(layer.id);
  });
}
