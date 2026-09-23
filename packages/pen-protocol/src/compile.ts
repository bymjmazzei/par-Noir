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

/** Result of resolving a live penEmbed reference for snapshot / set compile. */
export type PenEmbedResolveResult = {
  title?: string;
  sections?: PenSectionContent[];
  doc?: PenTipTapNode;
};

export type ResolvePenEmbed = (
  ref: { docId: string; sectionSlug?: string | null }
) => Promise<PenEmbedResolveResult | null> | PenEmbedResolveResult | null;

function pageStyleForSection(
  section: PenSectionContent,
  presentation?: PenPagePresentation | null
): PenPagePresentation {
  const base = mergePagePresentation(presentation);
  const textStyle = inferPageTextStyle(section.doc);
  return { ...base, textStyle };
}

function pageFromDoc(
  doc: PenTipTapNode,
  presentation?: PenPagePresentation | null,
  fallbackTitle?: string
): CompiledNotePage | null {
  const text = docToPlainText(doc);
  if (!text && !fallbackTitle) return null;
  const style = mergePagePresentation(presentation);
  const textStyle = inferPageTextStyle(doc);
  return {
    content: text || fallbackTitle || '',
    style: { ...style, textStyle },
    doc
  };
}

function pagesFromResolved(
  resolved: PenEmbedResolveResult,
  presentation?: PenPagePresentation | null
): CompiledNotePage[] {
  const pages: CompiledNotePage[] = [];
  if (resolved.doc) {
    const p = pageFromDoc(resolved.doc, presentation, resolved.title);
    if (p) pages.push(p);
    return pages;
  }
  if (resolved.sections?.length) {
    for (const raw of resolved.sections) {
      const sec = normalizeSection(raw);
      const p = pageFromDoc(sec.doc, presentation, resolved.title);
      if (p) pages.push(p);
    }
    return pages;
  }
  if (resolved.title) {
    pages.push({
      content: resolved.title,
      style: mergePagePresentation(presentation),
      doc: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: resolved.title }]
          }
        ]
      }
    });
  }
  return pages;
}

/** Collect penEmbed attrs in document order (depth-first). */
export function collectPenEmbedRefs(
  doc: PenTipTapNode | undefined
): Array<{ docId: string; sectionSlug: string | null; title: string | null }> {
  const out: Array<{ docId: string; sectionSlug: string | null; title: string | null }> = [];
  const walk = (node: PenTipTapNode | undefined) => {
    if (!node) return;
    if (node.type === 'penEmbed') {
      const docId = String(node.attrs?.docId || '');
      if (docId) {
        out.push({
          docId,
          sectionSlug: node.attrs?.sectionSlug != null ? String(node.attrs.sectionSlug) : null,
          title: node.attrs?.title != null ? String(node.attrs.title) : null
        });
      }
      return;
    }
    for (const c of node.content || []) walk(c);
  };
  walk(doc);
  return out;
}

async function inlineResolvedEmbed(
  attrs: { docId?: unknown; sectionSlug?: unknown; title?: unknown },
  resolveDoc: ResolvePenEmbed
): Promise<PenTipTapNode[]> {
  const docId = String(attrs.docId || '');
  const sectionSlug =
    attrs.sectionSlug != null && String(attrs.sectionSlug) ? String(attrs.sectionSlug) : null;
  const fallbackTitle = String(attrs.title || 'Embedded document');
  if (!docId) {
    return [{ type: 'paragraph', content: [{ type: 'text', text: `[missing embed]` }] }];
  }
  const resolved = await Promise.resolve(resolveDoc({ docId, sectionSlug }));
  if (!resolved) {
    return [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: `[unavailable: ${fallbackTitle}]` }]
      }
    ];
  }
  const nodes: PenTipTapNode[] = [];
  const title = resolved.title || fallbackTitle;
  if (title) {
    nodes.push({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: title }]
    });
  }
  if (resolved.doc) {
    nodes.push(...(resolved.doc.content || []));
  } else if (resolved.sections?.length) {
    for (const raw of resolved.sections) {
      const sec = normalizeSection(raw);
      if ((resolved.sections?.length || 0) > 1) {
        nodes.push({
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: sec.slug }]
        });
      }
      nodes.push(...(sec.doc.content || []));
    }
  } else if (!title) {
    nodes.push({ type: 'paragraph' });
  }
  return nodes.length ? nodes : [{ type: 'paragraph' }];
}

/** Replace penEmbed nodes with inlined snapshot content for public compile. */
export async function snapshotPenEmbeds(
  sections: PenSectionContent[],
  resolveDoc: ResolvePenEmbed
): Promise<PenSectionContent[]> {
  const mapNode = async (node: PenTipTapNode): Promise<PenTipTapNode[]> => {
    if (node.type === 'penEmbed') {
      return inlineResolvedEmbed(node.attrs || {}, resolveDoc);
    }
    if (node.content?.length) {
      const next: PenTipTapNode[] = [];
      for (const child of node.content) {
        next.push(...(await mapNode(child)));
      }
      return [{ ...node, content: next }];
    }
    return [node];
  };

  const out: PenSectionContent[] = [];
  for (const raw of sections) {
    const sec = normalizeSection(raw);
    const mapped = await mapNode(sec.doc);
    const doc = mapped[0] && mapped[0].type === 'doc' ? mapped[0] : { type: 'doc' as const, content: mapped };
    out.push({ ...sec, doc });
  }
  return out;
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

/** Strip penEmbed nodes so leftover prose can be measured. */
function stripPenEmbeds(doc: PenTipTapNode): PenTipTapNode {
  const map = (node: PenTipTapNode): PenTipTapNode[] => {
    if (node.type === 'penEmbed') return [];
    if (node.content?.length) {
      const content: PenTipTapNode[] = [];
      for (const c of node.content) content.push(...map(c));
      return [{ ...node, content }];
    }
    return [node];
  };
  const mapped = map(doc);
  return mapped[0]?.type === 'doc' ? mapped[0]! : { type: 'doc', content: mapped };
}

/**
 * Compile `set.basic.v1` → Note pages by resolving penEmbed refs in `primary` + `sources`
 * into snapshot pages (each referenced doc/section becomes page(s)).
 */
export async function compileSetToNote(input: {
  title: string;
  sections: PenSectionContent[];
  pagePresentation?: PenPagePresentation | null;
  docId?: string;
  resolveDoc: ResolvePenEmbed;
  templateId?: string;
}): Promise<CompileToNoteResult> {
  const templateId = input.templateId || 'set.basic.v1';
  const template = requireTemplate(templateId);
  if (template.id !== 'set.basic.v1' && template.docType !== 'set') {
    throw new Error(`not_a_set_template:${template.id}`);
  }
  const bySlug = new Map(
    input.sections.map((s) => {
      const n = normalizeSection(s);
      return [n.slug, n] as const;
    })
  );
  const pages: CompiledNotePage[] = [];
  const seen = new Set<string>();

  for (const slug of ['primary', 'sources'] as const) {
    const sec = bySlug.get(slug) || emptySection(slug);
    const embeds = collectPenEmbedRefs(sec.doc);

    // Non-embed prose in this section becomes its own page (before embeds).
    const proseDoc = stripPenEmbeds(sec.doc);
    const proseText = docToPlainText(proseDoc);
    if (proseText) {
      pages.push({
        content: proseText,
        style: pageStyleForSection({ slug: sec.slug, doc: proseDoc }, input.pagePresentation),
        doc: proseDoc
      });
    }

    for (const emb of embeds) {
      const key = `${emb.docId}:${emb.sectionSlug || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const resolved = await Promise.resolve(
        input.resolveDoc({ docId: emb.docId, sectionSlug: emb.sectionSlug })
      );
      if (!resolved) {
        pages.push({
          content: emb.title || emb.docId,
          style: mergePagePresentation(input.pagePresentation),
          doc: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: `[unavailable: ${emb.title || emb.docId}]` }]
              }
            ]
          }
        });
        continue;
      }
      const withTitle =
        resolved.title || emb.title
          ? { ...resolved, title: resolved.title || emb.title || undefined }
          : resolved;
      pages.push(...pagesFromResolved(withTitle, input.pagePresentation));
    }
  }

  if (pages.length === 0) {
    throw new Error('missing_required_section:primary');
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
