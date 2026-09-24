/** Rewrite seed placeholder table refs to a minted docId. */

import type { PenSectionContent } from './types.js';

/** Placeholder docId rewritten to a minted table primitive on create. */
export const SEED_TABLE_DOC_PLACEHOLDER = '__pen_seed_table__';

export function rewriteSeedTablePlaceholders(
  sections: PenSectionContent[],
  tableDocId: string,
  placeholder = SEED_TABLE_DOC_PLACEHOLDER
): PenSectionContent[] {
  return sections.map((sec) => ({
    ...sec,
    layers: (sec.layers || []).map((layer) => {
      const next = { ...layer };
      if (next.refDocId === placeholder) next.refDocId = tableDocId;
      if (next.bindDocId === placeholder) next.bindDocId = tableDocId;
      return next;
    })
  }));
}

export function sectionNeedsSeedTable(
  sections: PenSectionContent[],
  placeholder = SEED_TABLE_DOC_PLACEHOLDER
): boolean {
  for (const sec of sections) {
    for (const layer of sec.layers || []) {
      if (layer.refDocId === placeholder || layer.bindDocId === placeholder) return true;
    }
  }
  return false;
}
