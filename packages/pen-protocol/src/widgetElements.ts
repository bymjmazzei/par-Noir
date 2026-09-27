/**
 * A widget is a template. Layers sit where the user dragged them.
 * A button has no trigger until one is set. Vote is the only trigger
 * that writes the poll sheet.
 */

import { PEN_WIDGET_ACTION_KIND } from './outbox.js';
import { docToPlainText } from './richDoc.js';
import { upsertLayer } from './layers.js';
import {
  pollIsClosed,
  pollLayers,
  structureFromLayers,
  type PollCounts
} from './pollSheet.js';
import { socialPresentation, type SeedBundle } from './starterSeeds.js';
import type {
  PenInteractiveBehavior,
  PenPageLayer,
  PenSectionContent,
  PenTipTapNode,
  PenWidgetElement
} from './types.js';

export const WIDGET_TEMPLATE_ID = 'widget.v1';

export const DEFAULT_WIDGET_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" preserveAspectRatio="none"><rect width="120" height="80" rx="8" fill="#101418"/></svg>`;

const SHEET_TRIGGERS = [
  'widget.submit',
  'widget.toggle',
  'widget.stamp',
  'widget.rank',
  'widget.allocate'
] as const;

export type WidgetSheetTrigger = (typeof SHEET_TRIGGERS)[number];

export type WidgetActionRow = {
  actionId: string;
  trigger: WidgetSheetTrigger;
  actorId: string;
  createdAt: string;
  fields?: Record<string, string>;
  present?: boolean;
  order?: string[];
  split?: Record<string, number>;
};

function elementId(): string {
  return `el_${Math.random().toString(36).slice(2, 10)}`;
}

function plainDoc(text: string): PenTipTapNode {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }]
  };
}

export function sanitizeWidgetMarkup(source: string): string {
  return source
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '');
}

export function formatCountdown(closesAt: string, now = Date.now()): string {
  if (pollIsClosed(closesAt, now)) return '00:00:00';
  const remain = Math.max(0, Date.parse(closesAt) - now);
  const total = Math.floor(remain / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}

/** Empty template. Nothing is pre-arranged and no button is a vote. */
export function seedWidget(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: 'transparent',
      backgroundGradient: undefined,
      backgroundImage: undefined,
      fontSize: 16,
      textAlign: 'left',
      textColor: '#141414',
      padding: 0,
      dropShadowBlur: 0,
      dropShadowOffsetX: 0,
      dropShadowOffsetY: 0
    }),
    seedSections: [{ slug: 'card', doc: plainDoc(''), layers: [] }]
  };
}

export function placeWidgetLayer(
  section: PenSectionContent,
  groupId: string | null,
  element: PenWidgetElement | 'image'
): { section: PenSectionContent; layerId: string } {
  const peers = section.layers || [];
  const n = peers.length;
  const id = elementId();
  const shared = {
    id,
    x: 24 + (n % 4) * 20,
    y: 24 + (n % 6) * 12,
    zIndex: peers.reduce((m, layer) => Math.max(m, layer.zIndex), 0) + 1,
    parentGroupId: groupId || undefined,
    positionLocked: false
  };
  let layer: PenPageLayer;
  if (element === 'image') {
    layer = { ...shared, kind: 'image', name: 'Image', w: 160, h: 120 };
  } else if (element === 'button') {
    layer = {
      ...shared,
      kind: 'interactive',
      widgetElement: 'button',
      name: 'Button',
      label: 'Button',
      w: 120,
      h: 40,
      backgroundColor: 'rgba(15,118,110,0.85)'
    };
  } else if (element === 'text') {
    layer = {
      ...shared,
      kind: 'text',
      widgetElement: 'text',
      name: 'Text',
      w: 200,
      h: 40,
      textDoc: plainDoc('')
    };
  } else if (element === 'time') {
    layer = {
      ...shared,
      kind: 'text',
      widgetElement: 'time',
      name: 'Time',
      w: 160,
      h: 32,
      closesAt: null
    };
  } else if (element === 'html') {
    layer = {
      ...shared,
      kind: 'text',
      widgetElement: 'html',
      name: 'Snippet',
      w: 200,
      h: 80,
      htmlSource: ''
    };
  } else {
    layer = {
      ...shared,
      kind: 'text',
      widgetElement: 'svg',
      name: 'SVG',
      w: 120,
      h: 80,
      svgSrc: DEFAULT_WIDGET_SVG
    };
  }
  return { section: upsertLayer(section, layer), layerId: id };
}

export function duplicateButton(section: PenSectionContent, buttonId: string): PenSectionContent {
  const button = (section.layers || []).find(
    (layer) => layer.id === buttonId && layer.kind === 'interactive'
  );
  if (!button) return section;
  const id = elementId();
  const clone: PenPageLayer = {
    ...button,
    id,
    y: button.y + button.h + 8,
    zIndex: button.zIndex + 1,
    correct: undefined
  };
  if (button.behavior === 'poll.vote') clone.bindRowId = id;
  return upsertLayer(section, clone);
}

export function setButtonTrigger(
  section: PenSectionContent,
  layerId: string,
  behavior: PenInteractiveBehavior | null
): PenSectionContent {
  const layer = (section.layers || []).find((item) => item.id === layerId);
  if (!layer || layer.kind !== 'interactive') return section;
  const next: PenPageLayer = { ...layer, widgetElement: 'button' };
  if (!behavior) {
    delete next.behavior;
    delete next.bindRowId;
    delete next.correct;
    return upsertLayer(section, next);
  }
  next.behavior = behavior;
  if (behavior === 'poll.vote') {
    next.bindRowId = layer.bindRowId || layer.id;
  } else {
    delete next.bindRowId;
    delete next.correct;
  }
  return upsertLayer(section, next);
}

/** One correct option in the group. Clearing it returns the result to a tally. */
export function setVoteCorrect(
  section: PenSectionContent,
  layerId: string,
  correct: boolean
): PenSectionContent {
  const layer = (section.layers || []).find((item) => item.id === layerId);
  if (!layer || layer.behavior !== 'poll.vote') return section;
  const groupId = layer.parentGroupId || null;
  let next = section;
  for (const peer of pollLayers(section, groupId)) {
    if (peer.behavior !== 'poll.vote') continue;
    const on = correct && peer.id === layerId;
    next = upsertLayer(next, { ...peer, correct: on || undefined });
  }
  return next;
}

export function setWidgetHtml(
  section: PenSectionContent,
  layerId: string,
  html: string
): PenSectionContent {
  const layer = (section.layers || []).find((item) => item.id === layerId);
  if (!layer) return section;
  return upsertLayer(section, { ...layer, htmlSource: html });
}

export function setWidgetSvgOnLayer(
  section: PenSectionContent,
  layerId: string,
  svg: string
): PenSectionContent {
  const layer = (section.layers || []).find((item) => item.id === layerId);
  if (!layer) return section;
  return upsertLayer(section, { ...layer, svgSrc: sanitizeWidgetMarkup(svg) });
}

export function setWidgetClosesAt(
  section: PenSectionContent,
  layerId: string,
  closesAt: string | null
): PenSectionContent {
  const layer = (section.layers || []).find((item) => item.id === layerId);
  if (!layer) return section;
  return upsertLayer(section, { ...layer, closesAt });
}

export type VoteFace =
  | { kind: 'countdown'; text: string }
  | { kind: 'passfail'; text: 'Correct' | 'Incorrect' }
  | { kind: 'tally'; text: string }
  | { kind: 'label'; text: string };

/** Countdown hides every result. A correct mark is pass/fail. Otherwise the tally. */
export function voteFace(input: {
  optionId: string;
  label: string;
  counts: PollCounts | null;
  correctOptionId: string | null;
  closesAt: string | null;
  votedOptionId: string | null;
  now?: number;
}): VoteFace {
  if (input.closesAt && !pollIsClosed(input.closesAt, input.now)) {
    return { kind: 'countdown', text: formatCountdown(input.closesAt, input.now) };
  }
  if (!input.votedOptionId) return { kind: 'label', text: input.label };
  if (input.correctOptionId) {
    if (input.optionId !== input.votedOptionId) return { kind: 'label', text: input.label };
    return {
      kind: 'passfail',
      text: input.votedOptionId === input.correctOptionId ? 'Correct' : 'Incorrect'
    };
  }
  const n = input.counts?.byOption[input.optionId] || 0;
  return { kind: 'tally', text: `${input.label} ${n}` };
}

export function voteFaceForLayer(
  section: PenSectionContent,
  layer: PenPageLayer,
  votedOptionId: string | null,
  counts: PollCounts | null,
  now?: number
): VoteFace {
  const structure = structureFromLayers(section, layer.parentGroupId || null);
  return voteFace({
    optionId: layer.bindRowId || layer.id,
    label: layer.label || 'Button',
    counts,
    correctOptionId: structure.correctOptionId || null,
    closesAt: structure.closesAt,
    votedOptionId,
    now
  });
}

export function revealSibling(section: PenSectionContent, layerId: string): PenSectionContent {
  const layer = (section.layers || []).find((item) => item.id === layerId);
  if (!layer) return section;
  const hidden = (section.layers || []).find(
    (item) =>
      item.id !== layer.id &&
      item.visible === false &&
      (item.parentGroupId || null) === (layer.parentGroupId || null)
  );
  if (!hidden) return section;
  return upsertLayer(section, { ...hidden, visible: true });
}

export function isSheetTrigger(behavior: string | undefined): behavior is WidgetSheetTrigger {
  return SHEET_TRIGGERS.includes(behavior as WidgetSheetTrigger);
}

export function submitFields(
  section: PenSectionContent,
  groupId: string | null
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const layer of pollLayers(section, groupId)) {
    if (layer.kind !== 'text' || layer.widgetElement === 'time') continue;
    const key = layer.name || layer.id;
    fields[key] = docToPlainText(layer.textDoc || { type: 'doc', content: [] }).trim();
  }
  return fields;
}

export function buildWidgetActionRow(input: {
  trigger: WidgetSheetTrigger;
  actorId: string;
  actionId: string;
  createdAt?: string;
  fields?: Record<string, string>;
  present?: boolean;
  order?: string[];
  split?: Record<string, number>;
}): { kind: typeof PEN_WIDGET_ACTION_KIND; row: WidgetActionRow } {
  const row: WidgetActionRow = {
    actionId: input.actionId,
    trigger: input.trigger,
    actorId: input.actorId,
    createdAt: input.createdAt || new Date().toISOString()
  };
  if (input.fields) row.fields = input.fields;
  if (input.present != null) row.present = input.present;
  if (input.order) row.order = input.order;
  if (input.split) row.split = input.split;
  return { kind: PEN_WIDGET_ACTION_KIND, row };
}

/** Second press drops this person. The result is who is currently on. */
export function applyToggle(
  rows: WidgetActionRow[],
  actorId: string,
  actionId: string,
  createdAt: string
): WidgetActionRow[] {
  const on = rows.some(
    (row) => row.trigger === 'widget.toggle' && row.actorId === actorId && row.present !== false
  );
  if (on) {
    return rows.filter((row) => !(row.trigger === 'widget.toggle' && row.actorId === actorId));
  }
  return [
    ...rows,
    buildWidgetActionRow({
      trigger: 'widget.toggle',
      actorId,
      actionId,
      createdAt,
      present: true
    }).row
  ];
}

export function rankOrder(section: PenSectionContent, groupId: string | null): string[] {
  return pollLayers(section, groupId)
    .filter((layer) => layer.behavior === 'widget.rank')
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((layer) => layer.id);
}

export function allocateSplit(
  section: PenSectionContent,
  groupId: string | null,
  amount = 100
): Record<string, number> {
  const buttons = pollLayers(section, groupId).filter((layer) => layer.behavior === 'widget.allocate');
  if (!buttons.length) return {};
  const each = Math.floor(amount / buttons.length);
  const split: Record<string, number> = {};
  buttons.forEach((layer, index) => {
    const remainder = index === buttons.length - 1 ? amount - each * (buttons.length - 1) : each;
    split[layer.id] = remainder;
  });
  return split;
}
