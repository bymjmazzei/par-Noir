/** Pen category / form registry — templates attach via classId (form). */

import type { PenTemplate } from './templates.js';
import { listStarterTemplates } from './templates.js';

export type PenClassKind = 'authored' | 'register' | 'dossier';

export type PenClassEntitlement = 'self-hosted';

/** consumer = Pen New…; kit = L5 / agent only (hidden from end-user picker). */
export type PenClassAudience = 'consumer' | 'kit';

export interface PenClass {
  id: string;
  title: string;
  description: string;
  kind: PenClassKind;
  audience: PenClassAudience;
  /** Forms point at a category; categories omit parentId. */
  parentId?: string;
  /** When set, create/list may require matching storage tier. */
  entitlement?: PenClassEntitlement;
}

const CLASSES: PenClass[] = [
  {
    id: 'social',
    title: 'Social',
    description: 'Notes, posts, collections, and sets for browse',
    kind: 'authored',
    audience: 'consumer'
  },
  {
    id: 'social.note',
    title: 'Notes',
    description: 'Flow Notes for browse',
    kind: 'authored',
    audience: 'consumer',
    parentId: 'social'
  },
  {
    id: 'social.post',
    title: 'Posts',
    description: 'Caption and media posts',
    kind: 'authored',
    audience: 'consumer',
    parentId: 'social'
  },
  {
    id: 'social.collection',
    title: 'Collections',
    description: 'Same-type multipage workspace (swipe between pages)',
    kind: 'authored',
    audience: 'consumer',
    parentId: 'social'
  },
  {
    id: 'social.set',
    title: 'Sets',
    description:
      'Multi-media assembly — refs to different templates/posts (not same-type multipage)',
    kind: 'authored',
    audience: 'consumer',
    parentId: 'social'
  },
  {
    id: 'social.quote',
    title: 'Quote',
    description: 'Highlight / soundbite card',
    kind: 'authored',
    audience: 'consumer',
    parentId: 'social'
  },
  {
    id: 'social.link',
    title: 'Link',
    description: 'Bookmark / OpenGraph summary card',
    kind: 'authored',
    audience: 'consumer',
    parentId: 'social'
  },
  {
    id: 'social.poll',
    title: 'Poll',
    description: 'Survey widget embedding a cloud table + vote stickers',
    kind: 'authored',
    audience: 'consumer',
    parentId: 'social'
  },
  {
    id: 'social.metric',
    title: 'Metric',
    description: 'KPI / big-number callout',
    kind: 'authored',
    audience: 'consumer',
    parentId: 'social'
  },
  {
    id: 'social.code',
    title: 'Code',
    description: 'Syntax snippet card',
    kind: 'authored',
    audience: 'consumer',
    parentId: 'social'
  },
  {
    id: 'social.profile',
    title: 'Profile',
    description: 'Member badge card (profile landing uses isTopPost, not this form)',
    kind: 'authored',
    audience: 'consumer',
    parentId: 'social'
  },
  {
    id: 'social.audio',
    title: 'Audio',
    description: 'Voice note / audiogram card',
    kind: 'authored',
    audience: 'consumer',
    parentId: 'social'
  },
  {
    id: 'social.frame',
    title: 'Frame',
    description: 'Interactive frame hosting embed + stickers',
    kind: 'authored',
    audience: 'consumer',
    parentId: 'social'
  },
  {
    id: 'community',
    title: 'Community',
    description: 'Feeds, landing pages, community homes, and multipage sites',
    kind: 'authored',
    audience: 'consumer'
  },
  {
    id: 'community.feed',
    title: 'Feeds',
    description: 'Self-hosted and curated feed configs',
    kind: 'authored',
    audience: 'consumer',
    parentId: 'community',
    entitlement: 'self-hosted'
  },
  {
    id: 'community.feed_embed',
    title: 'Feed embed',
    description: 'Framed configurable stream chrome',
    kind: 'authored',
    audience: 'consumer',
    parentId: 'community'
  },
  {
    id: 'community.landing',
    title: 'Landing',
    description: 'Arrival page — hero, value, CTA',
    kind: 'authored',
    audience: 'consumer',
    parentId: 'community'
  },
  {
    id: 'community.home',
    title: 'Community home',
    description: 'Hub — banner, nav, feed_embed slot, announcements',
    kind: 'authored',
    audience: 'consumer',
    parentId: 'community'
  },
  {
    id: 'community.site',
    title: 'Site',
    description: 'Multipage feed of pages (aggregator/compiler)',
    kind: 'authored',
    audience: 'consumer',
    parentId: 'community'
  },
  {
    id: 'projects',
    title: 'Projects',
    description: 'Active work — journals, lists, letters, notes',
    kind: 'authored',
    audience: 'consumer'
  },
  {
    id: 'projects.journal',
    title: 'Journal',
    description: 'Dated entries and logs',
    kind: 'authored',
    audience: 'consumer',
    parentId: 'projects'
  },
  {
    id: 'projects.list',
    title: 'List',
    description: 'Checklists, shopping, running lists',
    kind: 'authored',
    audience: 'consumer',
    parentId: 'projects'
  },
  {
    id: 'projects.letter',
    title: 'Letter',
    description: 'Correspondence letter (DM delivery later)',
    kind: 'authored',
    audience: 'consumer',
    parentId: 'projects'
  },
  {
    id: 'projects.note',
    title: 'Note',
    description: 'Short correspondence note (DM delivery later)',
    kind: 'authored',
    audience: 'consumer',
    parentId: 'projects'
  },
  {
    id: 'library',
    title: 'Library',
    description: 'Durable published works (books, articles, music)',
    kind: 'authored',
    audience: 'consumer'
  },
  {
    id: 'library.book',
    title: 'Book',
    description: 'Multi-section longform',
    kind: 'authored',
    audience: 'consumer',
    parentId: 'library'
  },
  {
    id: 'library.article',
    title: 'Article',
    description: 'Shorter durable article',
    kind: 'authored',
    audience: 'consumer',
    parentId: 'library'
  },
  {
    id: 'library.music',
    title: 'Music',
    description: 'Track / audio asset with licensing',
    kind: 'authored',
    audience: 'consumer',
    parentId: 'library'
  },
  {
    id: 'knowledge',
    title: 'Knowledge',
    description: 'Claims bound to standard data points + ZKP refs (never raw PII)',
    kind: 'authored',
    audience: 'consumer'
  },
  {
    id: 'knowledge.claim',
    title: 'Claim',
    description: 'Structured claim atom with optional geo proof attachments',
    kind: 'authored',
    audience: 'consumer',
    parentId: 'knowledge'
  },
  {
    id: 'time',
    title: 'Time',
    description: 'Calendars, events, and schedules',
    kind: 'authored',
    audience: 'consumer'
  },
  {
    id: 'time.calendar',
    title: 'Calendar',
    description: 'Ongoing calendar',
    kind: 'authored',
    audience: 'consumer',
    parentId: 'time'
  },
  {
    id: 'time.event',
    title: 'Event',
    description: 'Single dated occurrence',
    kind: 'authored',
    audience: 'consumer',
    parentId: 'time'
  },
  {
    id: 'time.schedule',
    title: 'Schedule',
    description: 'Ordered agenda or run-of-show',
    kind: 'authored',
    audience: 'consumer',
    parentId: 'time'
  },
  {
    id: 'custom',
    title: 'Custom',
    description: 'Freeform authored pages',
    kind: 'authored',
    audience: 'consumer'
  },
  {
    id: 'custom.doc',
    title: 'Document',
    description: 'Blank freeform page',
    kind: 'authored',
    audience: 'consumer',
    parentId: 'custom'
  },
  {
    id: 'records',
    title: 'Records',
    description: 'Typed structured data for kit / agents',
    kind: 'register',
    audience: 'kit'
  },
  {
    id: 'records.register',
    title: 'Register',
    description: 'Tabular register rows',
    kind: 'register',
    audience: 'kit',
    parentId: 'records'
  },
  {
    id: 'records.asset_key',
    title: 'Asset key',
    description: 'License-key receipt after paid unconditional purchase',
    kind: 'dossier',
    audience: 'kit',
    parentId: 'records'
  },
  {
    id: 'primitives',
    title: 'Primitives',
    description: 'Cloud reference objects (tables, …) for templates to embed',
    kind: 'register',
    audience: 'kit'
  },
  {
    id: 'primitives.table',
    title: 'Table',
    description: 'Structured cloud grid — poll tallies, comparison matrices',
    kind: 'register',
    audience: 'kit',
    parentId: 'primitives'
  }
];

const byId = new Map(CLASSES.map((c) => [c.id, c]));

export function listClasses(): PenClass[] {
  return [...CLASSES];
}

export function listConsumerClasses(): PenClass[] {
  return CLASSES.filter((c) => c.audience === 'consumer');
}

export function listCategories(): PenClass[] {
  return CLASSES.filter((c) => !c.parentId);
}

export function listConsumerCategories(): PenClass[] {
  return CLASSES.filter((c) => !c.parentId && c.audience === 'consumer');
}

export function listForms(categoryId: string): PenClass[] {
  return CLASSES.filter((c) => c.parentId === categoryId);
}

export function getClass(classId: string): PenClass | undefined {
  return byId.get(classId);
}

export function requireClass(classId: string): PenClass {
  const c = getClass(classId);
  if (!c) throw new Error(`unknown_pen_class:${classId}`);
  return c;
}

export function isPenForm(classId: string): boolean {
  const c = getClass(classId);
  return Boolean(c?.parentId);
}

export function isPenCategory(classId: string): boolean {
  const c = getClass(classId);
  return Boolean(c && !c.parentId);
}

/** Category id for a form classId; undefined if unknown / not a form. */
export function categoryIdForClass(classId: string): string | undefined {
  const form = getClass(classId);
  return form?.parentId;
}

export function listTemplatesByClass(
  classId: string,
  templates: PenTemplate[] = listStarterTemplates()
): PenTemplate[] {
  return templates.filter((t) => t.classId === classId);
}

export interface PenCategoryGroup {
  category: PenClass;
  forms: Array<{ form: PenClass; templates: PenTemplate[] }>;
}

export function listTemplatesGroupedByCategory(
  templates: PenTemplate[] = listStarterTemplates(),
  categories: PenClass[] = listCategories()
): PenCategoryGroup[] {
  return categories.map((category) => ({
    category,
    forms: listForms(category.id).map((form) => ({
      form,
      templates: listTemplatesByClass(form.id, templates)
    }))
  }));
}

export interface PenCatalogSearchHit {
  categories: PenClass[];
  forms: PenClass[];
  templates: PenTemplate[];
}

function matchesQuery(hay: string, q: string): boolean {
  return hay.toLowerCase().includes(q);
}

/** Empty query → empty results. */
export function searchPenCatalog(
  query: string,
  input: {
    classes?: PenClass[];
    templates?: PenTemplate[];
    audience?: PenClassAudience;
  } = {}
): PenCatalogSearchHit {
  const q = query.trim().toLowerCase();
  if (!q) return { categories: [], forms: [], templates: [] };

  let classes = input.classes ?? listClasses();
  if (input.audience) {
    classes = classes.filter((c) => c.audience === input.audience);
  }
  const allowedClassIds = new Set(classes.map((c) => c.id));
  const templates = (input.templates ?? listStarterTemplates()).filter((t) => {
    if (!input.audience) return true;
    const form = getClass(t.classId);
    return form?.audience === input.audience;
  });

  const categories: PenClass[] = [];
  const forms: PenClass[] = [];
  for (const c of classes) {
    const hit = matchesQuery(c.title, q) || matchesQuery(c.description, q);
    if (!hit) continue;
    if (c.parentId) forms.push(c);
    else categories.push(c);
  }

  const templateHits = templates.filter((t) => {
    if (input.audience && !allowedClassIds.has(t.classId)) {
      const form = getClass(t.classId);
      if (!form || form.audience !== input.audience) return false;
    }
    return matchesQuery(t.title, q) || matchesQuery(t.description, q) || matchesQuery(t.id, q);
  });

  return { categories, forms, templates: templateHits };
}

/**
 * Assert every template classId is a known form under a known category.
 * Throws on violation (used by tests; call at module load in tests only).
 */
export function assertTemplateClassInvariants(templates: PenTemplate[]): void {
  for (const t of templates) {
    if (!t.classId) throw new Error(`missing_classId:${t.id}`);
    const form = getClass(t.classId);
    if (!form) throw new Error(`unknown_classId:${t.id}:${t.classId}`);
    if (!form.parentId) throw new Error(`classId_must_be_form:${t.id}:${t.classId}`);
    const parent = getClass(form.parentId);
    if (!parent || parent.parentId) {
      throw new Error(`form_parent_must_be_category:${t.classId}:${form.parentId}`);
    }
    if (form.audience !== parent.audience) {
      throw new Error(`form_audience_mismatch:${t.classId}`);
    }
  }
}
