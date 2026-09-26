/** Public widget templates on the pen-templates index, resolved to a local seed. */

import { getTemplate, type PenTemplate } from '@par-noir/pen-protocol';
import type { CentralIndexEntry } from '@par-noir/aggregator-domain';

export type PublicWidgetCatalog = {
  templates: PenTemplate[];
  /** Public listing id → starter template id whose seed can be copied. */
  sources: Map<string, string>;
};

export function publicWidgetCatalog(entries: CentralIndexEntry[]): PublicWidgetCatalog {
  const templates: PenTemplate[] = [];
  const sources = new Map<string, string>();
  for (const entry of entries) {
    const meta = entry.metadata;
    if (meta?.penClassId !== 'widgets.widget' || !meta.penTemplateKind) continue;
    const id = `pubwidget_${entry.fileId}`;
    const basedOn = meta.basedOnTemplateId?.trim();
    const source = basedOn ? getTemplate(basedOn) : undefined;
    templates.push({
      id,
      classId: 'widgets.widget',
      docType: source?.docType || 'widget',
      version: '1',
      title: meta.title?.trim() || source?.title || 'Widget',
      description: 'Public template',
      sections: source?.sections?.map((s) => ({ ...s })) || [
        { slug: 'card', title: 'Card', required: true }
      ],
      agentStarter: source?.agentStarter || '',
      seedSections: source?.seedSections?.map((s) => ({
        ...s,
        layers: s.layers?.map((layer) => ({ ...layer }))
      })),
      seedPagePresentation: source?.seedPagePresentation
        ? { ...source.seedPagePresentation }
        : undefined,
      seedPageLayout: source?.seedPageLayout,
      seedGalleryAspect: source?.seedGalleryAspect
    });
    if (source) sources.set(id, source.id);
  }
  return { templates, sources };
}
