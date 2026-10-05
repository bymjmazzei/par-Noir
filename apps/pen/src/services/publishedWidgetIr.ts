/** Read a published widget template's layers. Never substitutes the empty starter. */

import {
  decryptPublicIndexedMedia,
  type CentralIndexEntry
} from '@par-noir/aggregator-domain';
import {
  sectionsFromPublishedTemplate,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { API_ENDPOINT } from '../config/api';

export async function loadPublishedWidgetSections(
  entries: CentralIndexEntry[]
): Promise<Map<string, PenSectionContent[]>> {
  const out = new Map<string, PenSectionContent[]>();
  await Promise.all(
    entries.map(async (entry) => {
      const meta = entry.metadata;
      if (
        (meta?.penClassId !== 'widgets.widget' && meta?.penClassId !== 'widgets.sticker') ||
        !meta.penTemplateKind
      ) {
        return;
      }
      if (meta.publicToken == null) return;
      try {
        const blob = await decryptPublicIndexedMedia({
          fileId: entry.fileId,
          publicToken: meta.publicToken,
          apiBase: API_ENDPOINT,
          titleHint: meta.title
        });
        const sections = sectionsFromPublishedTemplate(JSON.parse(await blob.text()));
        if (sections.length) out.set(entry.fileId, sections);
      } catch {
        /* Leave the row without layers. Do not copy widget.v1. */
      }
    })
  );
  return out;
}
