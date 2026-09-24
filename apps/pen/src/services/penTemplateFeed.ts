/** Keep only template-flagged central-index entries (pN templates feed). */

export function isPenTemplateMetadata(meta: {
  penTemplateKind?: string | null;
  [key: string]: unknown;
} | null | undefined): boolean {
  return Boolean(meta?.penTemplateKind);
}

export function onlyPenTemplates<T extends { metadata?: { penTemplateKind?: string | null } | null }>(
  files: T[]
): T[] {
  return files.filter((f) => isPenTemplateMetadata(f.metadata));
}
