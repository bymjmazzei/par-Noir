/** Build ClassFeedRail items from library docs or public template class ids. */

import { getClass, getTemplate } from '@par-noir/pen-protocol';
import type { ClassFeedRailItem } from '../components/ClassFeedRail';

/**
 * Social building-block forms for the Templates surface (all densities).
 * Fixed order — not derived from dataset presence.
 */
export const SOCIAL_TEMPLATE_RAIL_FORMS = [
  'social.note',
  'social.metric',
  'social.audio',
  'social.post',
  'social.collection',
  'social.set'
] as const;

export type SocialTemplateRailFormId = (typeof SOCIAL_TEMPLATE_RAIL_FORMS)[number];

const SOCIAL_TEMPLATE_RAIL_LABELS: Record<SocialTemplateRailFormId, string> = {
  'social.note': 'note',
  'social.metric': 'metric',
  'social.audio': 'audio',
  'social.post': 'post',
  'social.collection': 'collection',
  'social.set': 'set'
};

const SOCIAL_TEMPLATE_RAIL_SET = new Set<string>(SOCIAL_TEMPLATE_RAIL_FORMS);

export function isSocialTemplateRailClass(classId: string | undefined): boolean {
  return Boolean(classId && SOCIAL_TEMPLATE_RAIL_SET.has(classId));
}

/** ALL + fixed Social atom chips (Templates list / gallery / feed). */
export function buildSocialTemplateRailItems(): ClassFeedRailItem[] {
  return [
    { id: 'all', label: 'ALL' },
    ...SOCIAL_TEMPLATE_RAIL_FORMS.map((id) => ({
      id,
      label: SOCIAL_TEMPLATE_RAIL_LABELS[id]
    }))
  ];
}

export function resolveSummaryClassId(d: {
  classId?: string;
  templateId?: string;
}): string | undefined {
  if (d.classId) return d.classId;
  if (d.templateId) return getTemplate(d.templateId)?.classId;
  return undefined;
}

/** ALL + forms present in `classIds`, titles uppercased, sorted by title. */
export function buildClassFeedRailItems(classIds: Iterable<string>): ClassFeedRailItem[] {
  const unique = [...new Set([...classIds].filter(Boolean))];
  const forms = unique
    .map((id) => {
      const form = getClass(id);
      if (!form?.parentId) return null;
      return { id, label: (form.title || id).toUpperCase() };
    })
    .filter((x): x is ClassFeedRailItem => Boolean(x))
    .sort((a, b) => a.label.localeCompare(b.label));

  return [{ id: 'all', label: 'ALL' }, ...forms];
}

export function contentClassFallbackLabel(contentClass: string | undefined): string {
  if (contentClass === 'note') return 'NOTES';
  if (contentClass === 'collection') return 'COLLECTIONS';
  if (contentClass === 'media') return 'MEDIA';
  return (contentClass || 'OTHER').toUpperCase();
}
