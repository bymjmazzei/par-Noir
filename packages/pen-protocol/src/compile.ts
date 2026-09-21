import type { PenFlowBlock, PenSectionContent } from './types.js';
import type { PenTemplate } from './templates.js';
import { requireTemplate } from './templates.js';

export interface CompiledNotePage {
  content: string;
  style?: Record<string, unknown>;
}

export interface CompileToNoteResult {
  contentClass: 'note';
  title: string;
  pages: CompiledNotePage[];
  templateId: string;
}

function blocksToText(blocks: PenFlowBlock[]): string {
  const lines: string[] = [];
  for (const b of blocks) {
    if (b.type === 'heading') {
      lines.push(`${'#'.repeat(b.level || 1)} ${b.text || ''}`.trim());
    } else if (b.type === 'image' || b.type === 'attachment') {
      lines.push(`[${b.type}:${b.ref || ''}]`);
    } else if (b.type === 'quote') {
      lines.push(`> ${b.text || ''}`);
    } else if (b.type === 'list' && b.children?.length) {
      for (const c of b.children) lines.push(`- ${c.text || ''}`);
    } else {
      lines.push(b.text || '');
    }
  }
  return lines.join('\n\n').trim();
}

/** Compile current section map → Note pages per template order. */
export function compileDocumentToNote(input: {
  templateId: string;
  title: string;
  sections: PenSectionContent[];
  template?: PenTemplate;
}): CompileToNoteResult {
  const template = input.template ?? requireTemplate(input.templateId);
  const bySlug = new Map(input.sections.map((s) => [s.slug, s]));
  const pages: CompiledNotePage[] = [];
  for (const sec of template.sections) {
    const body = bySlug.get(sec.slug);
    const text = body ? blocksToText(body.blocks) : '';
    if (!text && sec.required) {
      throw new Error(`missing_required_section:${sec.slug}`);
    }
    if (text) pages.push({ content: text });
  }
  if (pages.length === 0) {
    pages.push({ content: '' });
  }
  return {
    contentClass: 'note',
    title: input.title,
    pages,
    templateId: template.id
  };
}

export function emptySection(slug: string): PenSectionContent {
  return {
    slug,
    blocks: [{ id: `${slug}-p1`, type: 'paragraph', text: '' }]
  };
}
