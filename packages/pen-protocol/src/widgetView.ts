/**
 * Server-enforced view phases for backend widgets (poll, sheet triggers, collecting submit).
 */

import { pollIsClosed, type PollCounts, type PollStructure } from './pollSheet.js';
import type { PenPageLayer, PenSectionContent } from './types.js';
import { pollLayers, structureFromLayers } from './pollSheet.js';
import { groupNeedsTrackingSheet } from './widgetElements.js';

export type WidgetRevealPolicy = 'after_response' | 'at_close' | 'creator_only';

export type WidgetViewPhase = 'locked' | 'ballot' | 'waiting' | 'results' | 'owner';

export type WidgetBackendKind = 'poll' | 'toggle' | 'stamp' | 'rank' | 'allocate' | 'submit' | 'tap';

export function encodeWidgetId(docId: string, groupLayerId: string): string {
  return `${docId.trim()}:${groupLayerId.trim()}`;
}

export function parseWidgetId(widgetId: string): { docId: string; groupLayerId: string } | null {
  const raw = widgetId.trim();
  const i = raw.indexOf(':');
  if (i <= 0 || i >= raw.length - 1) return null;
  return { docId: raw.slice(0, i), groupLayerId: raw.slice(i + 1) };
}

export function widgetGroupIdForLayer(layer: PenPageLayer): string | null {
  if (layer.kind === 'group') return layer.id;
  const parent = layer.parentGroupId?.trim();
  return parent || null;
}

/** Stable public id for a backend widget group on a doc. */
export function trackingWidgetId(
  docId: string,
  layers: PenPageLayer[],
  layer: PenPageLayer
): string | undefined {
  const groupId = widgetGroupIdForLayer(layer);
  if (!groupId || !docId.trim()) return undefined;
  const section: PenSectionContent = { slug: '_', doc: { type: 'doc', content: [] }, layers };
  if (!groupNeedsTrackingSheet(section, groupId)) return undefined;
  return encodeWidgetId(docId, groupId);
}

export function revealPolicyFromLayers(
  layers: PenPageLayer[],
  groupId: string | null
): WidgetRevealPolicy {
  const group = groupId ? layers.find((item) => item.id === groupId) : undefined;
  const policy = group?.revealResults;
  if (policy === 'at_close' || policy === 'creator_only' || policy === 'after_response') {
    return policy;
  }
  return 'after_response';
}

export function closesAtForWidgetGroup(layers: PenPageLayer[], groupId: string | null): string | null {
  const section: PenSectionContent = { slug: '_', doc: { type: 'doc', content: [] }, layers };
  return structureFromLayers(section, groupId).closesAt;
}

export function backendKindForGroup(
  section: PenSectionContent,
  groupId: string | null
): WidgetBackendKind | null {
  const scoped = pollLayers(section, groupId);
  if (scoped.some((layer) => layer.behavior === 'poll.vote')) return 'poll';
  if (scoped.some((layer) => layer.behavior === 'widget.submit')) return 'submit';
  if (scoped.some((layer) => layer.behavior === 'widget.toggle')) return 'toggle';
  if (scoped.some((layer) => layer.behavior === 'widget.stamp')) return 'stamp';
  if (scoped.some((layer) => layer.behavior === 'widget.rank')) return 'rank';
  if (scoped.some((layer) => layer.behavior === 'widget.allocate')) return 'allocate';
  return null;
}

export function resultsVisibleForPhase(phase: WidgetViewPhase): boolean {
  return phase === 'results' || phase === 'owner';
}

export function widgetViewPhase(input: {
  unlocked: boolean;
  viewerActorHash?: string | null;
  ownerPnHash: string;
  revealPolicy: WidgetRevealPolicy;
  closesAt: string | null;
  hasResponded: boolean;
  now?: number;
}): WidgetViewPhase {
  if (!input.unlocked) return 'locked';
  if (
    input.viewerActorHash &&
    input.ownerPnHash &&
    input.viewerActorHash === input.ownerPnHash
  ) {
    return 'owner';
  }
  if (!input.hasResponded) return 'ballot';
  if (input.revealPolicy === 'creator_only') return 'waiting';
  if (input.revealPolicy === 'at_close' && !pollIsClosed(input.closesAt, input.now)) {
    return 'waiting';
  }
  return 'results';
}

export type PollResultLine = {
  optionId: string;
  label: string;
  count: number;
  percent: number;
};

export type WidgetResultsPublic =
  | { kind: 'poll'; total: number; options: PollResultLine[] }
  | { kind: 'toggle'; onCount: number; total: number }
  | { kind: 'stamp'; count: number }
  | { kind: 'rank'; averages: Record<string, number> }
  | { kind: 'allocate'; totals: Record<string, number>; totalPoints: number }
  | { kind: 'submit'; message: string };

export type WidgetViewPayload = {
  widgetId: string;
  phase: WidgetViewPhase;
  revealPolicy: WidgetRevealPolicy;
  closesAt: string | null;
  structure?: PollStructure;
  myResponse?: Record<string, unknown>;
  results?: WidgetResultsPublic;
  ownerDetails?: Record<string, unknown>;
};

export function pollResultsFromCounts(
  structure: PollStructure,
  counts: PollCounts
): WidgetResultsPublic {
  const total = counts.total || 0;
  const options = structure.options.map((option) => {
    const count = counts.byOption[option.id] || 0;
    const percent = total > 0 ? Math.round((count / total) * 100) : 0;
    return { optionId: option.id, label: option.label, count, percent };
  });
  return { kind: 'poll', total, options };
}

export function formatPollOptionFace(
  label: string,
  line: PollResultLine | undefined,
  showTally: boolean
): string {
  if (!showTally || !line) return label;
  return `${label} ${line.count}`;
}

export function collectWidgetIds(docId: string, layers: PenPageLayer[]): string[] {
  const ids = new Set<string>();
  for (const layer of layers) {
    const id = trackingWidgetId(docId, layers, layer);
    if (id) ids.add(id);
  }
  return [...ids];
}

export function pollCountsFromWidgetView(view: WidgetViewPayload | undefined): PollCounts | null {
  if (!view?.results || view.results.kind !== 'poll') return null;
  const byOption: Record<string, number> = {};
  for (const line of view.results.options) {
    byOption[line.optionId] = line.count;
  }
  return { total: view.results.total, byOption };
}
