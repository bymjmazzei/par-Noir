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
export const POLL_DATA_HEADERS = ['user'] as const;

/** Data columns: the person, then one column per option label. */
export function voteDataHeaders(options: Array<{ label: string }>): string[] {
  return ['user', ...options.map((option) => option.label || 'Option')];
}

export function voteMatrixRow(input: {
  user: string;
  options: Array<{ id: string; label: string }>;
  optionId: string;
}): string[] {
  return [
    input.user,
    ...input.options.map((option) => (option.id === input.optionId ? '1' : ''))
  ];
}

/** One row per person. A second vote from the same person replaces their row. */
export function upsertUserRow(rows: string[][], row: string[]): string[][] {
  const user = row[0] || '';
  const index = rows.findIndex((existing) => String(existing[0] ?? '') === user);
  if (index < 0) return [...rows, row];
  const next = rows.slice();
  next[index] = row;
  return next;
}

export function remapVoteRows(oldHeaders: string[], rows: string[][], newHeaders: string[]): string[][] {
  return rows.map((row) =>
    newHeaders.map((header) => {
      const index = oldHeaders.indexOf(header);
      return index >= 0 ? String(row[index] ?? '') : '';
    })
  );
}

export function countsFromVoteMatrix(
  options: Array<{ id: string; label: string }>,
  rows: Array<Array<string | number | boolean | null>>
): PollCounts {
  const byOption: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    let voted = false;
    options.forEach((option, index) => {
      if (String(row[index + 1] ?? '').trim() !== '1') return;
      byOption[option.id] = (byOption[option.id] || 0) + 1;
      voted = true;
    });
    if (voted) total += 1;
  }
  return { total, byOption };
}
export const POLL_STRUCTURE_HEADERS = ['field', 'id', 'value'] as const;

export interface PollOption {
  id: string;
  label: string;
}

export interface PollStructure {
  question: string;
  options: PollOption[];
  closesAt: string | null;
  /** Vote option that is the right answer. Absent means the result is a tally. */
  correctOptionId?: string | null;
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
  if (structure.correctOptionId) rows.push(['correct', structure.correctOptionId, '']);
  return rows;
}

export function sheetRowsToStructure(rows: Array<Array<string | number | boolean | null>>): PollStructure {
  let question = '';
  const options: PollOption[] = [];
  let closesAt: string | null = null;
  let correctOptionId: string | null = null;
  for (const row of rows) {
    const field = String(row[0] ?? '');
    const id = String(row[1] ?? '');
    const value = String(row[2] ?? '');
    if (field === 'question') question = value;
    else if (field === 'option' && id) options.push({ id, label: value });
    else if (field === 'closes_at') closesAt = value.trim() || null;
    else if (field === 'correct' && id) correctOptionId = id;
  }
  return { question, options, closesAt, correctOptionId };
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
  return layer.kind === 'interactive' && layer.behavior === 'poll.vote';
}

export function sectionHasVoteButton(
  section: PenSectionContent,
  groupId?: string | null
): boolean {
  return pollLayers(section, groupId).some(isAnswerButton);
}

export function structureFromLayers(section: PenSectionContent, groupId?: string | null): PollStructure {
  const scoped = pollLayers(section, groupId);
  const questionLayer = scoped.find(
    (layer) => layer.kind === 'text' && layer.widgetElement !== 'time' && layer.name !== 'Results'
  );
  const question = questionLayer ? docToPlainText(getTextLayerDoc(questionLayer)).trim() : '';
  const options = scoped.filter(isAnswerButton).map((layer) => ({
    id: layer.bindRowId || layer.id,
    label: layer.label || layer.name || 'Option'
  }));
  const correct = scoped.find((layer) => isAnswerButton(layer) && layer.correct);
  const time = scoped.find((layer) => layer.widgetElement === 'time');
  return {
    question,
    options,
    closesAt: time?.closesAt ?? null,
    correctOptionId: correct ? correct.bindRowId || correct.id : null
  };
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

/** Layers from a published template file. The author's spreadsheet id is dropped. */
export function sectionsFromPublishedTemplate(value: unknown): PenSectionContent[] {
  if (!value || typeof value !== 'object') return [];
  const sections = (value as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) return [];
  return sections
    .filter((section): section is PenSectionContent => {
      if (!section || typeof section !== 'object') return false;
      return typeof (section as PenSectionContent).slug === 'string';
    })
    .map((section) => stripPollSpreadsheetFromSection(section));
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
  const question = scoped().find(
    (layer) => layer.kind === 'text' && layer.widgetElement !== 'time' && layer.name !== 'Results'
  );
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
