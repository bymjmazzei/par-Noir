/**
 * Ingredients from read manifests: credentialed media attached to a Pen layer keeps its signer,
 * creator and license so the published file can credit it.
 */

import type { PenIngredient } from '@par-noir/pen-protocol';
import type { ManifestSummary } from './manifestSummary.js';

export function ingredientFromSummary(input: {
  summary: ManifestSummary | null;
  title: string;
  format: string;
  relationship?: PenIngredient['relationship'];
  layerId?: string;
}): PenIngredient {
  const s = input.summary;
  return {
    ...(input.layerId ? { layerId: input.layerId } : {}),
    title: input.title,
    format: input.format,
    relationship: input.relationship ?? 'componentOf',
    ...(s ? { manifestLabel: s.label } : {}),
    trust: s ? s.trust : 'none',
    ...(s?.signer.commonName ? { signer: s.signer.commonName } : {}),
    ...(s?.creator ? { creator: s.creator } : {}),
    ...(s?.workLicense ? { workLicense: s.workLicense } : {}),
  };
}

/** Replace the ingredient for a layer (re-attaching media) and drop ones whose layer is gone. */
export function upsertIngredient(
  list: PenIngredient[] | undefined,
  next: PenIngredient,
  liveLayerIds?: ReadonlySet<string>
): PenIngredient[] {
  const kept = (list || []).filter(
    (i) => i.layerId !== next.layerId && (!liveLayerIds || !i.layerId || liveLayerIds.has(i.layerId))
  );
  return [...kept, next];
}

/**
 * C2PA ingredient JSON for `Builder.addIngredient`. The ingredient's own manifest comes from
 * its file, which the signer adds alongside this JSON.
 */
export function ingredientDefinition(i: Pick<PenIngredient, 'title' | 'format' | 'relationship'>): {
  title: string;
  format: string;
  relationship: PenIngredient['relationship'];
} {
  return { title: i.title, format: i.format, relationship: i.relationship };
}
