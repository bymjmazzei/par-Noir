/** Build ClassFeedRail items from library docs or public template class ids. */

import { getClass, getTemplate } from '@par-noir/pen-protocol';
import type { ClassFeedRailItem } from '../components/ClassFeedRail';

/**
 * Social building-block forms for the Templates surface (all densities).
 * Fixed order — not derived from dataset presence.
 * Metric / action stay editor/backend surfaces, not rail chips.
 */
export const SOCIAL_TEMPLATE_RAIL_FORMS = [
  'social.note',
  'social.audio',
  'social.post',
  'social.collection',
  'social.set'
] as const;

export type SocialTemplateRailFormId = (typeof SOCIAL_TEMPLATE_RAIL_FORMS)[number];

export const SOCIAL_TEMPLATE_RAIL_LABELS: Record<SocialTemplateRailFormId, string> = {
  'social.note': 'note',
  'social.audio': 'audio',
  'social.post': 'media',
  'social.collection': 'collection',
  'social.set': 'set'
};

const SOCIAL_TEMPLATE_RAIL_SET = new Set<string>(SOCIAL_TEMPLATE_RAIL_FORMS);

/** @deprecated Projects starters retired — kept for library doc filters. */
export function isProjectsRailClass(classId: string | undefined): boolean {
  if (!classId) return false;
  if (classId === 'projects' || classId.startsWith('projects.')) return true;
  return getClass(classId)?.parentId === 'projects';
}

/** Any Social category form (Templates catalog / ALL chip). */
export function isSocialCategoryClass(classId: string | undefined): boolean {
  if (!classId) return false;
  if (classId === 'social' || classId.startsWith('social.')) return true;
  return getClass(classId)?.parentId === 'social';
}

/** Templates rail chip allowlist (note/audio/post/collection/set). */
export function isSocialTemplateRailClass(classId: string | undefined): boolean {
  if (!classId) return false;
  return SOCIAL_TEMPLATE_RAIL_SET.has(classId);
}

/** Whether a template belongs under the active rail chip. */
export function templateMatchesRailSelection(
  classId: string | undefined,
  activeId: string
): boolean {
  if (!classId || !isSocialCategoryClass(classId)) return false;
  if (activeId === 'all') return true;
  return classId === activeId;
}

/** Whether a library doc belongs under the active rail chip.
 * ALL = every doc; chips use the Social template rail filter.
 */
export function libraryDocMatchesRailSelection(
  classId: string | undefined,
  activeId: string
): boolean {
  if (activeId === 'all') return true;
  return templateMatchesRailSelection(classId, activeId);
}

/** ALL + Social atoms (Templates list / gallery / feed). */
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
