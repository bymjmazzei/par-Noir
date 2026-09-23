/** Helpers: exclude Pen templates from non-template social feeds. */

type WithPenTemplateMeta = {
  metadata?: { penTemplateKind?: string | null } | null;
};

export function isPenTemplateMetadata(meta: {
  penTemplateKind?: string | null;
  [key: string]: unknown;
} | null | undefined): boolean {
  return Boolean(meta?.penTemplateKind);
}

/** Drop template-flagged IndexedFiles from user feeds / Discover relevance / etc. */
export function excludePenTemplates<T extends WithPenTemplateMeta>(files: T[]): T[] {
  return files.filter((f) => !isPenTemplateMetadata(f.metadata as { penTemplateKind?: string }));
}

/** Keep only template-flagged items (pN templates feed / Discover Templates section). */
export function onlyPenTemplates<T extends WithPenTemplateMeta>(files: T[]): T[] {
  return files.filter((f) => isPenTemplateMetadata(f.metadata as { penTemplateKind?: string }));
}
