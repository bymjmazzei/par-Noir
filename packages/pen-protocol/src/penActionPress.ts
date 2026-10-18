/**
 * One press engine for published Pen buttons (browse feed, Pen preview).
 * Pure: returns the viewer's next local state plus one side effect for the host to run.
 */

import { trackingSpreadsheetId } from './actionPartition.js';
import { icsForEvent } from './icsForEvent.js';
import {
  frameCountForGroup,
  frameKey,
  penViewerGroupKey,
  type PenViewerState
} from './penViewerOverlay.js';
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
import { normalizeWriteIn } from './pollSheet.js';
import { docToPlainText } from './richDoc.js';
import type { PenGoTo, PenPageLayer, PenSectionContent } from './types.js';

export type { PenViewerState } from './penViewerOverlay.js';
export { penViewerGroupKey } from './penViewerOverlay.js';

export type PenActionEffect =
  | { kind: 'open'; url: string; host: string; warnings: LinkWarning[] }
  | { kind: 'mailto'; href: string; to: string }
  | { kind: 'messaging'; title: string; body: string; to: string }
  | { kind: 'vote'; layerId: string; optionId: string; spreadsheetId?: string; writeIn?: string }
  | { kind: 'widget_row'; spreadsheetId?: string; row: WidgetActionRow }
  | { kind: 'navigate'; goTo: PenGoTo }
  | { kind: 'calendar'; ics: string; filename: string }
  | { kind: 'none' };

export function emptyPenViewerState(): PenViewerState {
  return {
    revealed: [],
    hidden: [],
    inputs: {},
    toggled: [],
    ranks: {},
    amounts: {},
    voted: {},
    steps: {},
    answers: {}
  };
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
      const face = `${docToPlainText(layer.textDoc)} ${layer.label || ''}`;
      const link = checkLink(layer.openUrl, face);
      if (!link.ok) return none;
      return {
        state,
        effect: { kind: 'open', url: link.url, host: link.host, warnings: link.warnings }
      };
    }
    case 'page.go': {
      const goTo = layer.goTo;
      if (!goTo) return none;
      return { state, effect: { kind: 'navigate', goTo } };
    }
    case 'cta.calendar': {
      const time = layers.find(
        (item) => (item.parentGroupId || null) === groupId && item.widgetElement === 'time'
      );
      const startIso = (layer.eventStart || '').trim() || (time?.closesAt || '').trim();
      if (!startIso) return none;
      const title =
        (layer.eventTitle || '').trim() ||
        docToPlainText(layer.textDoc).trim() ||
        layer.label ||
        'Event';
      const { ics, filename } = icsForEvent({
        title,
        location: layer.eventLocation,
        startIso,
        durationMin: layer.eventDurationMin
      });
      return { state, effect: { kind: 'calendar', ics, filename } };
    }
    case 'widget.reveal': {
      const target = layer.revealLayerId;
      if (!target) return none;
      const mode = layer.revealMode || 'show';
      let revealed = [...state.revealed];
      let hidden = [...state.hidden];
      if (mode === 'toggle') {
        if (revealed.includes(target) && !hidden.includes(target)) {
          hidden = [...hidden, target];
        } else {
          if (!revealed.includes(target)) revealed = [...revealed, target];
          hidden = hidden.filter((id) => id !== target);
        }
      } else if (mode === 'tab') {
        const tabTargets = layers
          .filter(
            (item) =>
              (item.parentGroupId || null) === groupId &&
              item.behavior === 'widget.reveal' &&
              item.revealLayerId
          )
          .map((item) => item.revealLayerId!);
        for (const id of tabTargets) {
          if (id === target) {
            if (!revealed.includes(id)) revealed = [...revealed, id];
            hidden = hidden.filter((h) => h !== id);
          } else if (!hidden.includes(id)) {
            hidden = [...hidden, id];
          }
        }
      } else {
        if (revealed.includes(target)) return none;
        revealed = [...revealed, target];
        hidden = hidden.filter((id) => id !== target);
      }
      return { state: { ...state, revealed, hidden }, effect: { kind: 'none' } };
    }
    case 'widget.step': {
      const count = frameCountForGroup(layers, groupId);
      let frame = state.steps[groupKey] ?? 0;
      const dir = layer.stepDir || 'next';
      if (dir === 'restart') frame = 0;
      else if (dir === 'prev') frame = Math.max(0, frame - 1);
      else frame = Math.min(count - 1, frame + 1);
      return { state: { ...state, steps: { ...state.steps, [groupKey]: frame } }, effect: { kind: 'none' } };
    }
    case 'quiz.answer': {
      const frame = layer.stepFrame ?? 0;
      const key = frameKey(groupKey, frame);
      if (state.answers[key]) return none;
      return {
        state: { ...state, answers: { ...state.answers, [key]: layer.id } },
        effect: { kind: 'none' }
      };
    }
    case 'poll.vote': {
      const optionId = layer.bindRowId || layer.id;
      let writeIn = '';
      if (layer.writeIn) {
        const field = layers.find(
          (item) => item.widgetElement === 'input' && (item.parentGroupId || null) === groupId
        );
        writeIn = normalizeWriteIn(field ? state.inputs[field.id] : '');
        if (!writeIn) return none;
      }
      return {
        state: { ...state, voted: { ...state.voted, [groupKey]: optionId } },
        effect: {
          kind: 'vote',
          layerId: layer.id,
          optionId,
          ...(spreadsheetId ? { spreadsheetId } : {}),
          ...(writeIn ? { writeIn } : {})
        }
      };
    }
    case 'widget.submit': {
      if (secretPromptLayers(section, groupId).length) return none;
      const fields = submitFields(section, groupId, state.inputs, layers, state);
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
  if (layer.behavior === 'quiz.answer') {
    const frame = layer.stepFrame ?? 0;
    const answerKey = frameKey(key, frame);
    if (state.answers[answerKey] !== layer.id) return '';
    return layer.correct ? 'Correct' : 'Incorrect';
  }
  return '';
}
