/**
 * Valid demo slugs and mapping to template type.
 * Phase 1: no real template components yet; DemoPage shows placeholder.
 */

export const VALID_SLUGS = [
  'link-bio-1',
  'link-bio-2',
  'link-bio-3',
  'one-page-1',
  'one-page-2',
  'one-page-3',
] as const;

export type DemoSlug = (typeof VALID_SLUGS)[number];

export function isValidSlug(slug: string): slug is DemoSlug {
  return VALID_SLUGS.includes(slug as DemoSlug);
}
