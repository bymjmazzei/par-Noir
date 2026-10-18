/** Shipped screenshot posters for curated starter widgets (see scripts/widget-posters.mjs). */

import { CURATED_WIDGET_IDS } from '@par-noir/pen-protocol';

export function curatedWidgetPosterSrc(templateId: string): string | null {
  return (CURATED_WIDGET_IDS as readonly string[]).includes(templateId)
    ? `/widget-posters/${templateId}.jpg`
    : null;
}
