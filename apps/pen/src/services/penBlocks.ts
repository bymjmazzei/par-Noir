/**
 * Bridge Pen protocol blocks ↔ TipTap JSON document.
 */

import type { JSONContent } from '@tiptap/core';
import type { PenFlowBlock, PenSectionContent } from '@par-noir/pen-protocol';

function textNode(text: string, marks?: { type: string }[]): JSONContent {
  const node: JSONContent = { type: 'text', text };
  if (marks?.length) node.marks = marks;
  return node;
}

/** Parse light markdown marks in stored plain text into TipTap text nodes. */
function inlineFromPlain(text: string): JSONContent[] {
  if (!text) return [];
  const parts: JSONContent[] = [];
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

function plainFromInline(nodes: JSONContent[] | undefined): string {
  if (!nodes?.length) return '';
  return nodes
    .map((n) => {
      if (n.type !== 'text') return '';
      let t = n.text || '';
      const marks = (n.marks || []).map((m) => m.type);
      if (marks.includes('bold')) t = `**${t}**`;
      else if (marks.includes('italic')) t = `*${t}*`;
      return t;
    })
    .join('');
}

export function sectionToTipTapDoc(section: PenSectionContent): JSONContent {
  const blocks = section.blocks.length
    ? section.blocks
    : [{ id: 'empty', type: 'paragraph' as const, text: '' }];

  const content: JSONContent[] = [];
  for (const b of blocks) {
    if (b.type === 'image' && b.ref) {
      content.push({ type: 'image', attrs: { src: b.ref, alt: b.text || '' } });
      continue;
    }
    if (b.type === 'heading') {
      content.push({
        type: 'heading',
        attrs: { level: b.level === 2 ? 2 : 1 },
        content: inlineFromPlain(b.text || '')
      });
      continue;
    }
    if (b.type === 'quote') {
      content.push({
        type: 'blockquote',
        content: [
          {
            type: 'paragraph',
            content: inlineFromPlain(b.text || '')
          }
        ]
      });
      continue;
    }
    if (b.type === 'list') {
      content.push({
        type: 'bulletList',
        content: (b.text || '')
          .split('\n')
          .filter(Boolean)
          .map((line) => ({
            type: 'listItem',
            content: [{ type: 'paragraph', content: inlineFromPlain(line.replace(/^•\s*/, '')) }]
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

export function tipTapDocToSection(slug: string, doc: JSONContent): PenSectionContent {
  const blocks: PenFlowBlock[] = [];
  const nodes = doc.content || [];

  for (const n of nodes) {
    const id = `b_${Math.random().toString(16).slice(2, 10)}`;
    if (n.type === 'image') {
      blocks.push({
        id,
        type: 'image',
        ref: String(n.attrs?.src || ''),
        text: String(n.attrs?.alt || '')
      });
      continue;
    }
    if (n.type === 'heading') {
      blocks.push({
        id,
        type: 'heading',
        level: Number(n.attrs?.level) === 2 ? 2 : 1,
        text: plainFromInline(n.content)
      });
      continue;
    }
    if (n.type === 'blockquote') {
      const inner = n.content?.[0];
      blocks.push({
        id,
        type: 'quote',
        text: plainFromInline(inner?.content)
      });
      continue;
    }
    if (n.type === 'bulletList' || n.type === 'orderedList') {
      const lines = (n.content || []).map((li) => {
        const p = li.content?.[0];
        return plainFromInline(p?.content);
      });
      blocks.push({ id, type: 'list', text: lines.join('\n') });
      continue;
    }
    if (n.type === 'paragraph') {
      blocks.push({ id, type: 'paragraph', text: plainFromInline(n.content) });
    }
  }

  if (!blocks.length) blocks.push({ id: `b_${Date.now()}`, type: 'paragraph', text: '' });
  return { slug, blocks };
}
