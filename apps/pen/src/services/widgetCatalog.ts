/** Public widget templates on the pen-templates index, resolved from published layers. */

import { getTemplate, type PenSectionContent, type PenTemplate } from '@par-noir/pen-protocol';
import type { CentralIndexEntry } from '@par-noir/aggregator-domain';

export type PublicWidgetCatalog = {
  templates: PenTemplate[];
  /** Public listing id → basedOnTemplateId from the index row. */
  sources: Map<string, string>;
};

export function publicWidgetCatalog(
  entries: CentralIndexEntry[],
  publishedSections?: ReadonlyMap<string, PenSectionContent[]>
): PublicWidgetCatalog {
  const templates: PenTemplate[] = [];
  const sources = new Map<string, string>();
  for (const entry of entries) {
    const meta = entry.metadata;
    if (
      (meta?.penClassId !== 'widgets.widget' && meta?.penClassId !== 'widgets.sticker') ||
      !meta.penTemplateKind
    ) {
      continue;
    }
    const id = `pubwidget_${entry.fileId}`;
    const basedOn = meta.basedOnTemplateId?.trim();
    const source = basedOn ? getTemplate(basedOn) : undefined;
    const published = publishedSections?.get(entry.fileId);
    const seedSections = published?.length
      ? published.map((section) => ({
          ...section,
          layers: section.layers?.map((layer) => ({ ...layer }))
        }))
      : undefined;
    templates.push({
      id,
      classId: meta.penClassId,
      docType: source?.docType || (meta.penClassId === 'widgets.sticker' ? 'sticker' : 'widget'),
      version: '1',
      title: meta.title?.trim() || source?.title || 'Widget',
      description: 'Public template',
      sections: seedSections?.length
        ? seedSections.map((section) => ({
            slug: section.slug,
            title: section.slug,
            required: true
          }))
        : source?.sections?.map((s) => ({ ...s })) || [
            { slug: 'card', title: 'Card', required: true }
          ],
      agentStarter: source?.agentStarter || '',
      seedSections,
      seedPagePresentation: source?.seedPagePresentation
        ? { ...source.seedPagePresentation }
        : undefined,
      seedPageLayout: source?.seedPageLayout,
      seedGalleryAspect: source?.seedGalleryAspect
    });
    if (basedOn) sources.set(id, basedOn);
  }
  return { templates, sources };
}
