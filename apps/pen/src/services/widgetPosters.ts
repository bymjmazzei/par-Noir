/** Shipped screenshot posters for curated widgets and platform post templates (see scripts/widget-posters.mjs). */

import { CURATED_WIDGET_IDS, PLATFORM_POST_TEMPLATE_IDS } from '@par-noir/pen-protocol';

export function curatedWidgetPosterSrc(templateId: string): string | null {
  return (CURATED_WIDGET_IDS as readonly string[]).includes(templateId)
    ? `/widget-posters/${templateId}.jpg`
    : null;
}

export function platformTemplatePosterSrc(templateId: string): string | null {
  return PLATFORM_POST_TEMPLATE_IDS.includes(templateId) ? `/template-posters/${templateId}.jpg` : null;
}

/** Catalog rows that show a shipped poster instead of a live render. */
export function catalogPosterSrc(templateId: string): string | null {
  return curatedWidgetPosterSrc(templateId) || platformTemplatePosterSrc(templateId);
}
