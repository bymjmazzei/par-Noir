/**
 * One press engine for published Pen buttons (browse feed, Pen preview).
 * Pure: returns the viewer's next local state plus one side effect for the host to run.
 */

import { trackingSpreadsheetId } from './actionPartition.js';
import {
  allocateColumnKeys,
  allocateTotal,
  buildWidgetActionRow,
  cellsForAmounts,
  cellsForInputs,
  cellsForRanks,
  formCollectsToSheet,
  inputColumnKeys,
  nextAllocatePress,
  nextRankPress,
  rankColumnKeys,
  secretPromptLayers,
  submitFields,
  type WidgetActionRow
} from './widgetElements.js';
import { checkLink, type LinkWarning } from './linkSafety.js';
import type { PenPageLayer, PenSectionContent } from './types.js';

export type PenViewerState = {
  /** Layer ids shown by Reveal presses. */
  revealed: string[];
  /** Input layer id → typed value. */
  inputs: Record<string, string>;
  /** Group keys this viewer has toggled on. */
  toggled: string[];
  /** Group key → button id → rank. */
  ranks: Record<string, Record<string, number>>;
  /** Group key → button id → amount. */
  amounts: Record<string, Record<string, number>>;
  /** Group key → voted option id. */
  voted: Record<string, string>;
};

export type PenActionEffect =
  | { kind: 'open'; url: string; host: string; warnings: LinkWarning[] }
  | { kind: 'mailto'; href: string; to: string }
  | { kind: 'messaging'; title: string; body: string; to: string }
  | { kind: 'vote'; layerId: string; optionId: string; spreadsheetId?: string }
  | { kind: 'widget_row'; spreadsheetId?: string; row: WidgetActionRow }
  | { kind: 'none' };

export function emptyPenViewerState(): PenViewerState {
  return { revealed: [], inputs: {}, toggled: [], ranks: {}, amounts: {}, voted: {} };
}

/** Group key used for per-group viewer state. */
export function penViewerGroupKey(layer: Pick<PenPageLayer, 'parentGroupId'>): string {
  return layer.parentGroupId || 'doc';
}

function newActionId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sectionOf(layers: PenPageLayer[]): PenSectionContent {
  return { slug: 'feed-action', doc: { type: 'doc', content: [] }, layers };
}

export function pressPenAction(input: {
  layers: PenPageLayer[];
  layerId: string;
  state: PenViewerState;
  actorId?: string;
  now?: string;
}): { state: PenViewerState; effect: PenActionEffect } {
  const { layers, state } = input;
  const none = { state, effect: { kind: 'none' } as PenActionEffect };
  const layer = layers.find((item) => item.id === input.layerId);
  if (!layer || layer.kind !== 'interactive' || !layer.behavior) return none;
  const groupId = layer.parentGroupId || null;
  const groupKey = penViewerGroupKey(layer);
  const section = sectionOf(layers);
  const spreadsheetId = trackingSpreadsheetId(layers, layer);
  const actorId = input.actorId || '';
  const sheetRow = (row: WidgetActionRow): PenActionEffect => ({
    kind: 'widget_row',
    ...(spreadsheetId ? { spreadsheetId } : {}),
    row
  });

  switch (layer.behavior) {
    case 'cta.open': {
      const link = checkLink(layer.openUrl, layer.label);
      if (!link.ok) return none;
      return {
        state,
        effect: { kind: 'open', url: link.url, host: link.host, warnings: link.warnings }
      };
    }
    case 'widget.reveal': {
      const target = layer.revealLayerId;
      if (!target || state.revealed.includes(target)) return none;
      return { state: { ...state, revealed: [...state.revealed, target] }, effect: { kind: 'none' } };
    }
    case 'poll.vote': {
      const optionId = layer.bindRowId || layer.id;
      return {
        state: { ...state, voted: { ...state.voted, [groupKey]: optionId } },
        effect: {
          kind: 'vote',
          layerId: layer.id,
          optionId,
          ...(spreadsheetId ? { spreadsheetId } : {})
        }
      };
    }
    case 'widget.submit': {
      if (secretPromptLayers(section, groupId).length) return none;
      const fields = submitFields(section, groupId, state.inputs);
      const body = Object.entries(fields)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
      const title = layer.label || 'Widget';
      const to = (layer.submitTo || '').trim();
      if (to.includes('@')) {
        const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
        return { state, effect: { kind: 'mailto', href, to } };
      }
      if (to || !formCollectsToSheet(section, groupId)) {
        return { state, effect: { kind: 'messaging', title, body, to } };
      }
      const built = buildWidgetActionRow({
        trigger: 'widget.submit',
        actorId,
        actionId: newActionId(),
        createdAt: input.now,
        headers: inputColumnKeys(section, groupId),
        cells: cellsForInputs(section, groupId, state.inputs),
        fields
      });
      return { state, effect: sheetRow(built.row) };
    }
    case 'widget.toggle': {
      const present = !state.toggled.includes(groupKey);
      const toggled = present
        ? [...state.toggled, groupKey]
        : state.toggled.filter((key) => key !== groupKey);
      const built = buildWidgetActionRow({
        trigger: 'widget.toggle',
        actorId,
        actionId: newActionId(),
        createdAt: input.now,
        present
      });
      return { state: { ...state, toggled }, effect: sheetRow(built.row) };
    }
    case 'widget.stamp': {
      const built = buildWidgetActionRow({
        trigger: 'widget.stamp',
        actorId,
        actionId: newActionId(),
        createdAt: input.now || new Date().toISOString()
      });
      return { state, effect: sheetRow(built.row) };
    }
    case 'widget.rank': {
      const next = nextRankPress(state.ranks[groupKey] || {}, layer.id);
      const built = buildWidgetActionRow({
        trigger: 'widget.rank',
        actorId,
        actionId: newActionId(),
        createdAt: input.now,
        headers: rankColumnKeys(section, groupId),
        cells: cellsForRanks(section, groupId, next)
      });
      return {
        state: { ...state, ranks: { ...state.ranks, [groupKey]: next } },
        effect: sheetRow(built.row)
      };
    }
    case 'widget.allocate': {
      const step = nextAllocatePress(
        state.amounts[groupKey] || {},
        layer.id,
        allocateTotal(section, groupId)
      );
      const nextState = { ...state, amounts: { ...state.amounts, [groupKey]: step.amounts } };
      if (!step.complete) return { state: nextState, effect: { kind: 'none' } };
      const built = buildWidgetActionRow({
        trigger: 'widget.allocate',
        actorId,
        actionId: newActionId(),
        createdAt: input.now,
        headers: allocateColumnKeys(section, groupId),
        cells: cellsForAmounts(section, groupId, step.amounts)
      });
      return { state: nextState, effect: sheetRow(built.row) };
    }
    default:
      return none;
  }
}

/** Live face for a button given viewer state (rank, amount, toggle). Empty = use the authored face. */
export function penViewerButtonFace(layer: PenPageLayer, state: PenViewerState): string {
  const key = penViewerGroupKey(layer);
  if (layer.behavior === 'widget.rank') {
    const rank = state.ranks[key]?.[layer.id];
    return rank ? `#${rank}` : '';
  }
  if (layer.behavior === 'widget.allocate') {
    const amount = state.amounts[key]?.[layer.id];
    return amount ? String(amount) : '';
  }
  if (layer.behavior === 'widget.toggle') {
    return state.toggled.includes(key) ? 'On' : '';
  }
  return '';
}
