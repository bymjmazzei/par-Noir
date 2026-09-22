/**
 * Bridge Pen section.doc (TipTap JSON SoT) ↔ TipTap editor.
 */

import type { JSONContent } from '@tiptap/core';
import {
  emptyTipTapDoc,
  normalizeSection,
  type PenSectionContent,
  type PenTipTapNode
} from '@par-noir/pen-protocol';

export function sectionToTipTapDoc(section: PenSectionContent): JSONContent {
  const normalized = normalizeSection(section);
  return (normalized.doc as JSONContent) || (emptyTipTapDoc() as JSONContent);
}

export function tipTapDocToSection(slug: string, doc: JSONContent): PenSectionContent {
  const tipTap = (doc?.type === 'doc' ? doc : emptyTipTapDoc()) as PenTipTapNode;
  return { slug, doc: tipTap };
}
