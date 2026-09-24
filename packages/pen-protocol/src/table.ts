/** Cloud table primitive — structured grid SoT (not TipTap). */

import type { PenSectionContent, PenTipTapNode } from './types.js';

function tipTapParagraphs(...paras: string[]): PenTipTapNode {
  return {
    type: 'doc',
    content: paras.map((text) => ({
      type: 'paragraph',
      content: text ? [{ type: 'text', text }] : []
    }))
  };
}

export const TABLE_PAYLOAD_VERSION = 'table.v1' as const;

export type PenTableColumnType = 'string' | 'number' | 'boolean';

export interface PenTableColumn {
  id: string;
  title: string;
  type: PenTableColumnType;
}

/** One data row — keys are column ids. `id` is stable for sticker bindRowId. */
export interface PenTableRow {
  id: string;
  cells: Record<string, string | number | boolean | null>;
}

export interface PenTablePayload {
  version: typeof TABLE_PAYLOAD_VERSION;
  columns: PenTableColumn[];
  rows: PenTableRow[];
}

/** Default poll-shaped table: label + tally columns. */
export function emptyPollTable(options: Array<{ id: string; label: string; tally?: number }> = [
  { id: 'opt_a', label: 'Option A', tally: 0 },
  { id: 'opt_b', label: 'Option B', tally: 0 }
]): PenTablePayload {
  return {
    version: TABLE_PAYLOAD_VERSION,
    columns: [
      { id: 'label', title: 'Label', type: 'string' },
      { id: 'tally', title: 'Tally', type: 'number' }
    ],
    rows: options.map((o) => ({
      id: o.id,
      cells: { label: o.label, tally: o.tally ?? 0 }
    }))
  };
}

export function emptyComparisonTable(): PenTablePayload {
  return {
    version: TABLE_PAYLOAD_VERSION,
    columns: [
      { id: 'feature', title: 'Feature', type: 'string' },
      { id: 'a', title: 'A', type: 'string' },
      { id: 'b', title: 'B', type: 'string' }
    ],
    rows: [
      { id: 'row_1', cells: { feature: 'Speed', a: 'Fast', b: 'Faster' } },
      { id: 'row_2', cells: { feature: 'Cost', a: 'Low', b: 'Lower' } }
    ]
  };
}

/** Encode table payload as a TipTap doc with a single codeBlock JSON body (section.doc SoT). */
export function tablePayloadToTipTap(payload: PenTablePayload): PenTipTapNode {
  return {
    type: 'doc',
    content: [
      {
        type: 'codeBlock',
        attrs: { language: 'application/vnd.par-noir.table+json' },
        content: [{ type: 'text', text: JSON.stringify(payload) }]
      }
    ]
  };
}

export function parseTablePayloadFromTipTap(doc: PenTipTapNode | null | undefined): PenTablePayload | null {
  if (!doc?.content?.length) return null;
  for (const node of doc.content) {
    if (node.type !== 'codeBlock') continue;
    const lang = String(node.attrs?.language || '');
    if (lang !== 'application/vnd.par-noir.table+json' && lang !== 'json') continue;
    const text = (node.content || []).map((c) => c.text || '').join('');
    if (!text.trim()) continue;
    try {
      const parsed = JSON.parse(text) as PenTablePayload;
      if (parsed?.version === TABLE_PAYLOAD_VERSION && Array.isArray(parsed.columns) && Array.isArray(parsed.rows)) {
        return parsed;
      }
    } catch {
      return null;
    }
  }
  return null;
}

export function tableSectionFromPayload(
  slug: string,
  payload: PenTablePayload
): PenSectionContent {
  return {
    slug,
    doc: tablePayloadToTipTap(payload),
    layerGeom: 'px'
  };
}

/** Human-readable preview lines from a table (for embed chrome / gallery). */
export function tablePreviewLines(payload: PenTablePayload, maxRows = 6): string[] {
  const header = payload.columns.map((c) => c.title).join(' · ');
  const lines = [header];
  for (const row of payload.rows.slice(0, maxRows)) {
    lines.push(payload.columns.map((c) => String(row.cells[c.id] ?? '')).join(' · '));
  }
  return lines;
}

/** Seed placeholder prose when a host needs a readable fallback without resolving the table. */
export function tableFallbackProse(payload: PenTablePayload): PenTipTapNode {
  return tipTapParagraphs(...tablePreviewLines(payload));
}

export function validateTablePayload(payload: unknown): payload is PenTablePayload {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as PenTablePayload;
  if (p.version !== TABLE_PAYLOAD_VERSION) return false;
  if (!Array.isArray(p.columns) || !Array.isArray(p.rows)) return false;
  for (const col of p.columns) {
    if (!col?.id || !col.title || !['string', 'number', 'boolean'].includes(col.type)) return false;
  }
  for (const row of p.rows) {
    if (!row?.id || typeof row.cells !== 'object' || row.cells == null) return false;
  }
  return true;
}
