/**
 * Pen publish fields stored on the public metadata row.
 * The PUT route otherwise drops anything it does not destructure.
 */

const PEN_INDEX_KEYS = [
  'feedIds',
  'penClassId',
  'penCategoryId',
  'penTemplateKind',
  'basedOnFileId',
  'basedOnTemplateId',
  'penIrRef',
  'penDocId',
  'licensing',
  'musicPenDocId',
  'musicLicensing',
  'headProof',
  'templateId',
  'contentClass'
] as const;

export function penIndexFields(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') return {};
  const src = body as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of PEN_INDEX_KEYS) {
    if (src[key] !== undefined) out[key] = src[key];
  }
  if (Array.isArray(out.feedIds)) {
    out.feedIds = out.feedIds.filter((id) => typeof id === 'string' && id.length > 0);
  } else {
    delete out.feedIds;
  }
  if (out.penTemplateKind !== 'template' && out.penTemplateKind !== 'remix') {
    delete out.penTemplateKind;
  }
  return out;
}
