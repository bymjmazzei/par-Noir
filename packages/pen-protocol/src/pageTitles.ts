/** Page titles: author title, then template section title, then `Page N`. */

import type { PenTemplate } from './templates.js';
import type { PenDocManifest } from './types.js';

export function pageTitleFor(
  manifest: Pick<PenDocManifest, 'pageTitles'> | null | undefined,
  template: Pick<PenTemplate, 'sections'> | null | undefined,
  slug: string,
  index: number
): string {
  const own = manifest?.pageTitles?.[slug]?.trim();
  if (own) return own;
  const fromTemplate = template?.sections.find((section) => section.slug === slug)?.title?.trim();
  if (fromTemplate && fromTemplate !== 'Body') return fromTemplate;
  return `Page ${index + 1}`;
}

/** Template section titles keyed by slug, for seeding a new doc. */
export function seedPageTitles(
  template: Pick<PenTemplate, 'sections'>,
  toc: string[]
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const slug of toc) {
    const title = template.sections.find((section) => section.slug === slug)?.title?.trim();
    if (title && title !== 'Body') out[slug] = title;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Set or clear one page title. Empty text clears it so the fallback shows. */
export function withPageTitle(
  pageTitles: Record<string, string> | undefined,
  slug: string,
  title: string
): Record<string, string> | undefined {
  const next = { ...(pageTitles || {}) };
  const trimmed = title.trim();
  if (trimmed) next[slug] = trimmed;
  else delete next[slug];
  return Object.keys(next).length ? next : undefined;
}
