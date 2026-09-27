/**
 * Poll widget custody: sheet 1 is the vote log, sheet 2 is the definition.
 * A reusable template must not carry the author's spreadsheet id.
 */

import { docToPlainText } from './richDoc.js';
import { getTextLayerDoc, setTextLayerDoc, upsertLayer } from './layers.js';
import type { PenPageLayer, PenSectionContent, PenTipTapNode } from './types.js';

export const POLL_WIDGET_TEMPLATE_ID = 'widget.v1';
export const POLL_DATA_SHEET = 'Data';
export const POLL_STRUCTURE_SHEET = 'Structure';
export const POLL_DATA_HEADERS = ['vote_id', 'option_id', 'created_at'] as const;
export const POLL_STRUCTURE_HEADERS = ['field', 'id', 'value'] as const;

export interface PollOption {
  id: string;
  label: string;
}

export interface PollStructure {
  question: string;
  options: PollOption[];
  closesAt: string | null;
}

export interface PollCounts {
  total: number;
  byOption: Record<string, number>;
}

export function pollIsClosed(closesAt: string | null | undefined, now = Date.now()): boolean {
  if (!closesAt) return false;
  const t = Date.parse(closesAt);
  if (Number.isNaN(t)) return false;
  return now >= t;
}

export function structureToSheetRows(structure: PollStructure): string[][] {
  const rows: string[][] = [['question', '', structure.question]];
  for (const option of structure.options) {
    rows.push(['option', option.id, option.label]);
  }
  rows.push(['closes_at', '', structure.closesAt || '']);
  return rows;
}

export function sheetRowsToStructure(rows: Array<Array<string | number | boolean | null>>): PollStructure {
  let question = '';
  const options: PollOption[] = [];
  let closesAt: string | null = null;
  for (const row of rows) {
    const field = String(row[0] ?? '');
    const id = String(row[1] ?? '');
    const value = String(row[2] ?? '');
    if (field === 'question') question = value;
    else if (field === 'option' && id) options.push({ id, label: value });
    else if (field === 'closes_at') closesAt = value.trim() || null;
  }
  return { question, options, closesAt };
}

export function emptyPollCounts(): PollCounts {
  return { total: 0, byOption: {} };
}

export function countsFromVoteRows(rows: Array<Array<string | number | boolean | null>>): PollCounts {
  const byOption: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    const optionId = String(row[1] ?? '').trim();
    if (!optionId) continue;
    byOption[optionId] = (byOption[optionId] || 0) + 1;
    total += 1;
  }
  return { total, byOption };
}

export function formatPollResults(structure: PollStructure, counts: PollCounts): string {
  if (!counts.total) return 'No votes yet';
  return structure.options
    .map((option) => `${option.label} ${counts.byOption[option.id] || 0}`)
    .join('\n');
}

function plainDoc(text: string): PenTipTapNode {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: text ? [{ type: 'text', text }] : []
      }
    ]
  };
}

export function pollLayers(section: PenSectionContent, groupId?: string | null): PenPageLayer[] {
  const layers = section.layers || [];
  if (!groupId) return layers;
  return layers.filter((layer) => layer.id === groupId || layer.parentGroupId === groupId);
}

export function isAnswerButton(layer: PenPageLayer): boolean {
  if (layer.widgetElement === 'button') return true;
  return layer.kind === 'interactive' && layer.behavior === 'poll.vote' && !layer.widgetElement;
}

export function structureFromLayers(section: PenSectionContent, groupId?: string | null): PollStructure {
  const scoped = pollLayers(section, groupId);
  const questionLayer =
    scoped.find((layer) => layer.widgetElement === 'text') ||
    scoped.find((layer) => layer.kind === 'text' && layer.name === 'Question');
  const question = questionLayer ? docToPlainText(getTextLayerDoc(questionLayer)).trim() : '';
  const options = scoped.filter(isAnswerButton).map((layer) => ({
    id: layer.bindRowId || layer.id,
    label: layer.label || layer.name || 'Option'
  }));
  const time = scoped.find((layer) => layer.widgetElement === 'time');
  return { question, options, closesAt: time?.closesAt ?? null };
}

export function pollSpreadsheetOnGroup(
  section: PenSectionContent,
  groupId?: string | null
): string | null {
  if (!groupId) return null;
  const group = (section.layers || []).find((layer) => layer.id === groupId);
  const id = group?.spreadsheetId?.trim();
  return id || null;
}

/** Drop the author's spreadsheet id so a copied or published template mints its own. */
export function stripPollSpreadsheet<T extends { spreadsheetId?: string; pollSpreadsheetId?: string }>(
  value: T
): T {
  const next = { ...value };
  delete next.spreadsheetId;
  delete next.pollSpreadsheetId;
  return next;
}

export function stripPollSpreadsheetFromSection(section: PenSectionContent): PenSectionContent {
  return {
    ...section,
    layers: (section.layers || []).map((layer) => {
      if (!layer.spreadsheetId) return layer;
      const next = { ...layer };
      delete next.spreadsheetId;
      return next;
    })
  };
}

export function syncPollLayers(
  section: PenSectionContent,
  groupId: string | null,
  structure: PollStructure,
  counts?: PollCounts
): PenSectionContent {
  let next = section;
  const scoped = () => pollLayers(next, groupId);
  const question =
    scoped().find((layer) => layer.widgetElement === 'text') ||
    scoped().find((layer) => layer.kind === 'text' && layer.name === 'Question');
  if (question) {
    next = setTextLayerDoc(next, question.id, plainDoc(structure.question), { syncDoc: false });
  }
  const time = scoped().find((layer) => layer.widgetElement === 'time');
  if (time) {
    next = upsertLayer(next, { ...time, closesAt: structure.closesAt });
  }
  if (counts && groupId) {
    const group = (next.layers || []).find((layer) => layer.id === groupId);
    if (group) next = upsertLayer(next, { ...group, widgetCounts: counts });
  }
  const results = scoped().find((layer) => layer.kind === 'text' && layer.name === 'Results');
  if (results && counts) {
    next = setTextLayerDoc(next, results.id, plainDoc(formatPollResults(structure, counts)), {
      syncDoc: false
    });
  }

  const existing = scoped().filter(isAnswerButton);
  const keep = new Set(structure.options.map((option) => option.id));
  const drop = new Set(
    existing.filter((layer) => !keep.has(layer.bindRowId || layer.id)).map((layer) => layer.id)
  );
  if (drop.size) {
    next = {
      ...next,
      layers: (next.layers || []).filter((layer) => !drop.has(layer.id))
    };
  }
  for (const option of structure.options) {
    const layer = pollLayers(next, groupId).find(
      (item) => isAnswerButton(item) && (item.bindRowId || item.id) === option.id
    );
    if (layer) {
      next = upsertLayer(next, { ...layer, label: option.label, name: option.label, bindRowId: option.id });
      continue;
    }
    const peers = pollLayers(next, groupId).filter(isAnswerButton);
    const last = peers[peers.length - 1];
    const y = last ? last.y + last.h + 8 : 152;
    next = upsertLayer(next, {
      id: `opt_${option.id}`,
      kind: 'interactive',
      name: option.label,
      x: last?.x ?? 28,
      y,
      w: last?.w ?? 256,
      h: last?.h ?? 40,
      zIndex: (last?.zIndex ?? 3) + 1,
      behavior: 'poll.vote',
      widgetElement: 'button',
      bindRowId: option.id,
      label: option.label,
      parentGroupId: groupId || undefined,
      positionLocked: false,
      backgroundColor: last?.backgroundColor || 'rgba(15,118,110,0.72)'
    });
  }
  return next;
}
