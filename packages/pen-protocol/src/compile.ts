import type { PenPagePresentation, PenSectionContent, PenTipTapNode } from './types.js';
import type { PenTemplate } from './templates.js';
import { requireTemplate } from './templates.js';
import {
  docToPlainText,
  emptySection,
  emptyTipTapDoc,
  inferPageTextStyle,
  normalizeSection
} from './richDoc.js';
import { defaultPagePresentation, mergePagePresentation } from './presentation.js';

export interface CompiledNotePage {
  content: string;
  style: PenPagePresentation;
  /** TipTap JSON when available for richer browse later */
  doc?: PenTipTapNode;
}

export interface CompileToNoteResult {
  contentClass: 'note';
  title: string;
  pages: CompiledNotePage[];
  templateId: string;
  docId?: string;
}

function pageStyleForSection(
  section: PenSectionContent,
  presentation?: PenPagePresentation | null
): PenPagePresentation {
  const base = mergePagePresentation(presentation);
  const textStyle = inferPageTextStyle(section.doc);
  return { ...base, textStyle };
}

/** Compile current section map → Note pages per template order. */
export function compileDocumentToNote(input: {
  templateId: string;
  title: string;
  sections: PenSectionContent[];
  template?: PenTemplate;
  pagePresentation?: PenPagePresentation | null;
  docId?: string;
}): CompileToNoteResult {
  const template = input.template ?? requireTemplate(input.templateId);
  const bySlug = new Map(
    input.sections.map((s) => {
      const n = normalizeSection(s);
      return [n.slug, n] as const;
    })
  );
  const pages: CompiledNotePage[] = [];
  for (const sec of template.sections) {
    const body = bySlug.get(sec.slug);
    const normalized = body || emptySection(sec.slug);
    const text = docToPlainText(normalized.doc);
    if (!text && sec.required) {
      throw new Error(`missing_required_section:${sec.slug}`);
    }
    if (text) {
      pages.push({
        content: text,
        style: pageStyleForSection(normalized, input.pagePresentation),
        doc: normalized.doc
      });
    }
  }
  if (pages.length === 0) {
    pages.push({
      content: '',
      style: mergePagePresentation(input.pagePresentation),
      doc: emptyTipTapDoc()
    });
  }
  return {
    contentClass: 'note',
    title: input.title,
    pages,
    templateId: template.id,
    docId: input.docId
  };
}

export { emptySection, defaultPagePresentation, mergePagePresentation };
