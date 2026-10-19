/** Shipped screenshot posters for curated widgets and platform post templates (see scripts/widget-posters.mjs). */

import { CURATED_WIDGET_IDS, PLATFORM_POST_TEMPLATE_IDS, getTemplate } from '@par-noir/pen-protocol';

export function curatedWidgetPosterSrc(templateId: string): string | null {
  return (CURATED_WIDGET_IDS as readonly string[]).includes(templateId)
    ? `/widget-posters/${templateId}.jpg`
    : null;
}

/** One poster per page, in page order; null for templates that render live. */
export function platformTemplatePagePosters(templateId: string): string[] | null {
  if (!PLATFORM_POST_TEMPLATE_IDS.includes(templateId)) return null;
  const slugs = getTemplate(templateId)?.seedSections?.map((section) => section.slug) ?? [];
  return slugs.length ? slugs.map((slug) => `/template-posters/${templateId}/${slug}.jpg`) : null;
}
