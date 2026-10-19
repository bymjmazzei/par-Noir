/** Public templates on the pen-templates index, resolved from published layers. */

import {
  getTemplate,
  normalizeLicensingRoot,
  type PenSectionContent,
  type PenTemplate
} from '@par-noir/pen-protocol';
import type { CentralIndexEntry } from '@par-noir/aggregator-domain';
import { isTemplatesCatalogClass } from './classFeedRailItems';

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
    const classId = meta?.penClassId;
    if (!classId || !meta.penTemplateKind || !isTemplatesCatalogClass(classId)) {
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
      classId,
      docType: source?.docType || docTypeForClass(classId),
      version: '1',
      title: meta.title?.trim() || source?.title || 'Template',
      licensing: normalizeLicensingRoot(meta.licensing),
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

function docTypeForClass(classId: string): string {
  if (classId === 'widgets.sticker') return 'sticker';
  if (classId === 'widgets.animation') return 'animation';
  if (classId === 'widgets.transition') return 'transition';
  if (classId === 'widgets.text_preset') return 'text_preset';
  if (classId === 'widgets.widget') return 'widget';
  return classId.split('.').pop() || 'note';
}
