/**
 * Which action layers draw in the feed given viewer state (reveal, tabs, frames).
 */

import type { PenPageLayer } from './types.js';

export type PenViewerState = {
  revealed: string[];
  hidden: string[];
  inputs: Record<string, string>;
  toggled: string[];
  ranks: Record<string, Record<string, number>>;
  amounts: Record<string, Record<string, number>>;
  voted: Record<string, string>;
  steps: Record<string, number>;
  answers: Record<string, string>;
};

export function penViewerGroupKey(layer: Pick<PenPageLayer, 'parentGroupId'>): string {
  return layer.parentGroupId || 'doc';
}

export function revealTargetIds(layers: PenPageLayer[]): Set<string> {
  const ids = new Set<string>();
  for (const layer of layers) {
    if (layer.revealLayerId) ids.add(layer.revealLayerId);
  }
  return ids;
}

/** Highest frame index + 1 for a widget group. */
export function frameCountForGroup(layers: PenPageLayer[], groupId: string | null): number {
  let max = 0;
  for (const layer of layers) {
    if ((layer.parentGroupId || null) !== groupId) continue;
    if (layer.stepFrame != null && layer.stepFrame >= max) max = layer.stepFrame + 1;
  }
  return Math.max(1, max);
}

export function currentFrame(state: PenViewerState, groupKey: string): number {
  return state.steps[groupKey] ?? 0;
}

export function frameKey(groupKey: string, frame: number): string {
  return `${groupKey}:${frame}`;
}

export function layerVisibleInViewer(
  layer: PenPageLayer,
  layers: PenPageLayer[],
  state: PenViewerState
): boolean {
  if (layer.kind === 'group') return false;
  if (layer.visible === false && !state.revealed.includes(layer.id)) {
    const targets = revealTargetIds(layers);
    if (targets.has(layer.id)) {
      if (state.hidden.includes(layer.id)) return false;
      return state.revealed.includes(layer.id);
    }
    return false;
  }
  if (state.hidden.includes(layer.id)) return false;

  const groupKey = penViewerGroupKey(layer);
  const groupId = layer.parentGroupId || null;
  if (layer.stepFrame != null) {
    return layer.stepFrame === currentFrame(state, groupKey);
  }
  if (groupId && frameCountForGroup(layers, groupId) > 1) {
    const siblings = layers.filter((l) => (l.parentGroupId || null) === groupId && l.stepFrame != null);
    if (siblings.length > 0) {
      return false;
    }
  }
  return true;
}

export function viewerScore(
  layers: PenPageLayer[],
  state: PenViewerState,
  groupId: string | null
): { correct: number; total: number } {
  const scoped = layers.filter((l) => (l.parentGroupId || null) === groupId);
  const correctByFrame = new Map<number, string>();
  for (const layer of scoped) {
    if (layer.behavior !== 'quiz.answer' || !layer.correct) continue;
    correctByFrame.set(layer.stepFrame ?? 0, layer.id);
  }
  let correct = 0;
  for (const [frame, answerId] of correctByFrame) {
    const key = frameKey(penViewerGroupKey({ parentGroupId: groupId }), frame);
    if (state.answers[key] === answerId) correct += 1;
  }
  return { correct, total: correctByFrame.size };
}

export function scoreCaption(layers: PenPageLayer[], state: PenViewerState, groupId: string | null): string {
  const { correct, total } = viewerScore(layers, state, groupId);
  if (!total) return '';
  return `${correct} / ${total}`;
}
