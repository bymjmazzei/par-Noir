/**
 * TipTap JSON section SoT: empty docs, legacy block migrate, plain text extract.
 */

import type { PenFlowBlock, PenSectionContent, PenTipTapMark, PenTipTapNode } from './types.js';

export function emptyTipTapDoc(): PenTipTapNode {
  return {
    type: 'doc',
    content: [{ type: 'paragraph' }]
  };
}

export function emptySection(slug: string): PenSectionContent {
  return { slug, doc: emptyTipTapDoc() };
}

export function isTipTapDoc(value: unknown): value is PenTipTapNode {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as PenTipTapNode).type === 'doc' &&
    Array.isArray((value as PenTipTapNode).content)
  );
}

function textNode(text: string, marks?: PenTipTapMark[]): PenTipTapNode {
  const node: PenTipTapNode = { type: 'text', text };
  if (marks?.length) node.marks = marks;
  return node;
}

/** Parse light markdown marks from legacy plain text into TipTap text nodes. */
function inlineFromPlain(text: string): PenTipTapNode[] {
  if (!text) return [];
  const parts: PenTipTapNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(textNode(text.slice(last, m.index)));
    const raw = m[0]!;
    if (raw.startsWith('**')) {
      parts.push(textNode(raw.slice(2, -2), [{ type: 'bold' }]));
    } else {
      parts.push(textNode(raw.slice(1, -1), [{ type: 'italic' }]));
    }
    last = m.index + raw.length;
  }
  if (last < text.length) parts.push(textNode(text.slice(last)));
  return parts.length ? parts : [];
}

/** Convert legacy PenFlowBlock[] → TipTap doc (one-shot migrate). */
export function blocksToTipTapDoc(blocks: PenFlowBlock[]): PenTipTapNode {
  const list = blocks?.length ? blocks : [];
  const content: PenTipTapNode[] = [];

  for (const b of list) {
    if (b.type === 'image' && b.ref) {
      content.push({
        type: 'image',
        attrs: { src: b.ref, alt: b.text || '' }
      });
      continue;
    }
    if (b.type === 'heading') {
      content.push({
        type: 'heading',
        attrs: { level: b.level === 2 ? 2 : b.level === 3 ? 3 : 1 },
        content: inlineFromPlain(b.text || '')
      });
      continue;
    }
    if (b.type === 'quote') {
      content.push({
        type: 'blockquote',
        content: [{ type: 'paragraph', content: inlineFromPlain(b.text || '') }]
      });
      continue;
    }
    if (b.type === 'list') {
      const lines = (b.children?.length
        ? b.children.map((c) => c.text || '')
        : (b.text || '').split('\n')
      ).filter(Boolean);
      content.push({
        type: 'bulletList',
        content: lines.map((line) => ({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: inlineFromPlain(line.replace(/^•\s*/, ''))
            }
          ]
        }))
      });
      continue;
    }
    content.push({
      type: 'paragraph',
      content: inlineFromPlain(b.text || '')
    });
  }

  if (!content.length) content.push({ type: 'paragraph' });
  return { type: 'doc', content };
}

type LegacySection = {
  slug: string;
  doc?: PenTipTapNode;
  blocks?: PenFlowBlock[];
};

/** Normalize any stored section to TipTap-doc SoT. */
export function normalizeSection(raw: LegacySection | PenSectionContent): PenSectionContent {
  if (raw && isTipTapDoc((raw as PenSectionContent).doc)) {
    return { slug: raw.slug, doc: (raw as PenSectionContent).doc };
  }
  const legacy = raw as LegacySection;
  if (Array.isArray(legacy.blocks)) {
    return { slug: legacy.slug, doc: blocksToTipTapDoc(legacy.blocks) };
  }
  return emptySection(raw?.slug || 'body');
}

export function normalizeSections(
  sections: Array<LegacySection | PenSectionContent>
): PenSectionContent[] {
  return (sections || []).map(normalizeSection);
}

function walkText(node: PenTipTapNode | undefined, out: string[]): void {
  if (!node) return;
  if (node.type === 'text' && node.text) {
    out.push(node.text);
    return;
  }
  if (node.type === 'hardBreak') {
    out.push('\n');
    return;
  }
  for (const c of node.content || []) walkText(c, out);
  if (
    node.type === 'paragraph' ||
    node.type === 'heading' ||
    node.type === 'blockquote' ||
    node.type === 'listItem' ||
    node.type === 'horizontalRule'
  ) {
    out.push('\n');
  }
}

/** Plain text for PNG / Mini content field (no markdown markers). */
export function docToPlainText(doc: PenTipTapNode | undefined): string {
  if (!doc) return '';
  const parts: string[] = [];
  walkText(doc, parts);
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim();
}

export function sectionPlainText(section: PenSectionContent): string {
  return docToPlainText(normalizeSection(section).doc);
}

/** Best-effort page textStyle from first strong mark in doc. */
export function inferPageTextStyle(
  doc: PenTipTapNode
): 'plain' | 'bold' | 'italic' | 'strikethrough' {
  let sawBold = false;
  let sawItalic = false;
  let sawStrike = false;
  const walk = (n: PenTipTapNode) => {
    if (n.marks) {
      for (const m of n.marks) {
        if (m.type === 'bold') sawBold = true;
        if (m.type === 'italic') sawItalic = true;
        if (m.type === 'strike') sawStrike = true;
      }
    }
    for (const c of n.content || []) walk(c);
  };
  walk(doc);
  if (sawStrike) return 'strikethrough';
  if (sawBold) return 'bold';
  if (sawItalic) return 'italic';
  return 'plain';
}
