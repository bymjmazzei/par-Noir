/**
 * Per-object parts outline — layout/compile order of a TipTap doc (Body or text layer).
 * Parts are top-level blocks; reorderable like a mini compiler TOC.
 */

import { emptyTipTapDoc } from './richDoc.js';
import type { PenTipTapNode } from './types.js';

export type LayerPartKind = 'body' | 'heading' | 'blockquote' | 'paragraph';

export interface LayerPart {
  id: string;
  kind: LayerPartKind;
  /** Heading level 1–3 when kind === 'heading'. */
  level?: number;
  label: string;
  /** Index into doc.content (top-level blocks). */
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
 * Outline of a TipTap doc for the parts ▾ menu (mini compiler order).
 * One row per top-level block — paragraphs, headings, blockquotes.
 */
export function listLayerParts(doc: PenTipTapNode | undefined): LayerPart[] {
  const root = doc && doc.type === 'doc' ? doc : emptyTipTapDoc();
  const children = root.content || [];
  if (!children.length) {
    return [{ id: 'block:0', kind: 'body', label: 'Body', index: 0 }];
  }

  return children.map((node, index) => {
    if (node.type === 'heading') {
      const level = Number(node.attrs?.level) || 1;
      return {
        id: `block:${index}`,
        kind: 'heading' as const,
        level,
        label: truncateLabel(nodePlainText(node), `Heading ${level}`),
        index
      };
    }
    if (node.type === 'blockquote') {
      return {
        id: `block:${index}`,
        kind: 'blockquote' as const,
        label: truncateLabel(nodePlainText(node), 'Quote'),
        index
      };
    }
    // First top-level block reads as Body; later prose as Paragraph.
    return {
      id: `block:${index}`,
      kind: index === 0 ? 'body' : 'paragraph',
      label: truncateLabel(
        nodePlainText(node),
        index === 0 ? 'Body' : 'Paragraph'
      ),
      index
    };
  });
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

/**
 * Reorder top-level blocks (mini compiler drag). `fromIndex` / `toIndex` are
 * positions in doc.content; Body/parts list uses the same indices.
 */
export function reorderLayerParts(
  doc: PenTipTapNode | undefined,
  fromIndex: number,
  toIndex: number
): PenTipTapNode {
  const root =
    doc && doc.type === 'doc'
      ? { ...doc, content: [...(doc.content || [])] }
      : emptyTipTapDoc();
  const content = [...(root.content || [])];
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= content.length ||
    toIndex >= content.length ||
    fromIndex === toIndex
  ) {
    return { type: 'doc', content };
  }
  const [moved] = content.splice(fromIndex, 1);
  if (!moved) return { type: 'doc', content };
  content.splice(toIndex, 0, moved);
  return { type: 'doc', content };
}

/** Resolve which part contains a top-level content index (for caret sync). */
export function partIdAtContentIndex(
  doc: PenTipTapNode | undefined,
  contentIndex: number
): string {
  const parts = listLayerParts(doc);
  const hit = parts.find((p) => p.index === contentIndex);
  return hit?.id || parts[0]?.id || 'block:0';
}
