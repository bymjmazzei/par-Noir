/**
 * Per-object parts outline — layout of a TipTap doc (Body or text layer).
 * Parts are derived from the doc; not nested PenSectionContent.
 */

import { emptyTipTapDoc } from './richDoc.js';
import type { PenTipTapNode } from './types.js';

export type LayerPartKind = 'body' | 'heading' | 'blockquote';

export interface LayerPart {
  id: string;
  kind: LayerPartKind;
  /** Heading level 1–3 when kind === 'heading'. */
  level?: number;
  label: string;
  /** Index into doc.content (top-level blocks). Body uses 0. */
  index: number;
}

function nodePlainText(node: PenTipTapNode | undefined): string {
  if (!node) return '';
  if (node.type === 'text' && node.text) return node.text;
  const parts: string[] = [];
  for (const c of node.content || []) {
    const t = nodePlainText(c);
    if (t) parts.push(t);
  }
  return parts.join('');
}

function truncateLabel(text: string, fallback: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return fallback;
  return t.length > 48 ? `${t.slice(0, 45)}…` : t;
}

/**
 * Outline of a TipTap doc for the parts ▾ menu.
 * Always includes a synthetic Body entry; then each heading and blockquote.
 */
export function listLayerParts(doc: PenTipTapNode | undefined): LayerPart[] {
  const root = doc && doc.type === 'doc' ? doc : emptyTipTapDoc();
  const children = root.content || [];
  const parts: LayerPart[] = [
    { id: 'body', kind: 'body', label: 'Body', index: 0 }
  ];

  children.forEach((node, index) => {
    if (node.type === 'heading') {
      const level = Number(node.attrs?.level) || 1;
      parts.push({
        id: `heading:${index}`,
        kind: 'heading',
        level,
        label: truncateLabel(nodePlainText(node), `Heading ${level}`),
        index
      });
      return;
    }
    if (node.type === 'blockquote') {
      parts.push({
        id: `blockquote:${index}`,
        kind: 'blockquote',
        label: truncateLabel(nodePlainText(node), 'Quote'),
        index
      });
    }
  });

  return parts;
}

export type InsertLayerPartKind = 'heading' | 'blockquote' | 'paragraph';

/** Append a part block to the TipTap doc (used by Parts ▾ +). */
export function insertLayerPart(
  doc: PenTipTapNode | undefined,
  kind: InsertLayerPartKind = 'heading'
): PenTipTapNode {
  const root =
    doc && doc.type === 'doc'
      ? { ...doc, content: [...(doc.content || [])] }
      : emptyTipTapDoc();
  const content = [...(root.content || [])];

  if (kind === 'blockquote') {
    content.push({
      type: 'blockquote',
      content: [{ type: 'paragraph' }]
    });
  } else if (kind === 'paragraph') {
    content.push({ type: 'paragraph' });
  } else {
    content.push({
      type: 'heading',
      attrs: { level: 2 },
      content: []
    });
  }

  return { type: 'doc', content };
}

/** Resolve which part contains a top-level content index (for caret sync). */
export function partIdAtContentIndex(
  doc: PenTipTapNode | undefined,
  contentIndex: number
): string {
  const parts = listLayerParts(doc);
  const hit = [...parts].reverse().find((p) => p.kind !== 'body' && p.index === contentIndex);
  if (hit) return hit.id;
  return 'body';
}
