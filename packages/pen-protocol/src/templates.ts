/** Pen template registry + starter pack. */

import type { PenSectionContent } from './types.js';
import { emptySection } from './richDoc.js';

export type PenDocType = 'note' | 'post' | 'collection' | 'self_hosted_feed' | string;

export interface PenTemplateSection {
  slug: string;
  title: string;
  required?: boolean;
}

/** Column schema for kit Registers (relational stub — not a query engine). */
export type PenRegisterColumnType = 'string' | 'number' | 'boolean' | 'date';

export interface PenRegisterColumn {
  id: string;
  title: string;
  type: PenRegisterColumnType;
  required?: boolean;
}

export interface PenTemplate {
  id: string;
  /** Form class id (e.g. social.note), never a category. */
  classId: string;
  docType: PenDocType;
  version: string;
  title: string;
  description: string;
  sections: PenTemplateSection[];
  /** Social compile target */
  publishContentClass?: 'note' | 'media' | 'collection';
  /**
   * Public display name for “authored by …”.
   * Platform starters omit this and resolve to {@link PLATFORM_TEMPLATE_AUTHOR}.
   */
  authorDisplayName?: string;
  /**
   * Agent starter brief. Placeholders: {{user_input}}, {{template_id}}, {{section_list}}.
   * External agents compose this with the user ask — no per-model plugins.
   */
  agentStarter: string;
  /** Present on register templates — agents emit `rows` matching these columns. */
  registerColumns?: PenRegisterColumn[];
  /** Demo TipTap sections for preview / create-from-template. */
  seedSections?: PenSectionContent[];
  /** Featured in Pen Mini (~3 per form). */
  browseFeatured?: boolean;
  /** Optional CDN-backed public template preview. */
  previewFileId?: string;
}

/** Default author label for first-party / starter templates. */
export const PLATFORM_TEMPLATE_AUTHOR = 'par noir';

function seedPlain(slug: string, text: string): PenSectionContent {
  return {
    slug,
    doc: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: text ? [{ type: 'text', text }] : []
        }
      ]
    }
  };
}

export function templateAuthorLabel(
  template: Pick<PenTemplate, 'authorDisplayName'> | null | undefined
): string {
  const name = template?.authorDisplayName?.trim();
  return name || PLATFORM_TEMPLATE_AUTHOR;
}

/** Build a short imperative agentStarter for a prose/flow template. */
function proseStarter(input: {
  title: string;
  focus: string;
}): string {
  return [
    `You are authoring a Pen document with template {{template_id}} ("${input.title}").`,
    input.focus,
    'Sections for this template: {{section_list}}.',
    'Emit ONLY a PenAgentBuild JSON object: { "templateId", "title", "sections": [{ "slug", "plainText" }] }.',
    'Use only the section slugs listed. Do not invent folder paths, file layouts, or parallel formats.',
    'Never include secrets, pn name, passcodes, tokens, or raw account identifiers.',
    'User request:',
    '{{user_input}}'
  ].join('\n');
}

function registerStarter(input: {
  title: string;
  columns: PenRegisterColumn[];
}): string {
  const cols = input.columns
    .map((c) => `${c.id}:${c.type}${c.required ? '*' : ''}`)
    .join(', ');
  return [
    `You are authoring a Pen Register with template {{template_id}} ("${input.title}").`,
    `Columns ( *=required ): ${cols}.`,
    'Emit ONLY a PenAgentBuild JSON object: { "templateId", "title", "rows": [ { columnId: value, ... } ] }.',
    'Do not use freeform TipTap sections for row data. Do not invent folder paths or extra columns.',
    'Never include secrets, pn name, passcodes, tokens, or raw account identifiers.',
    'User request:',
    '{{user_input}}'
  ].join('\n');
}

const DEFAULT_REGISTER_COLUMNS: PenRegisterColumn[] = [
  { id: 'id', title: 'Id', type: 'string', required: true },
  { id: 'label', title: 'Label', type: 'string', required: true },
  { id: 'notes', title: 'Notes', type: 'string', required: false }
];

const STARTER: PenTemplate[] = [
  {
    id: 'note.basic.v1',
    classId: 'social.note',
    docType: 'note',
    version: '1',
    title: 'Basic Note',
    description: 'Single-body flow Note for browse',
    sections: [{ slug: 'body', title: 'Body', required: true }],
    publishContentClass: 'note',
    browseFeatured: true,
    seedSections: [seedPlain('body', 'Your note goes here — short and clear for browse.')],
    agentStarter: proseStarter({
      title: 'Basic Note',
      focus: 'Fill the required body with clear prose suitable for a browse Note.',
    })
  },
  {
    id: 'note.article.v1',
    classId: 'social.note',
    docType: 'note',
    version: '1',
    title: 'Article Note',
    description: 'Title + body Note',
    sections: [
      { slug: 'title', title: 'Title', required: true },
      { slug: 'body', title: 'Body', required: true }
    ],
    publishContentClass: 'note',
    browseFeatured: true,
    seedSections: [
      seedPlain('title', 'Article title'),
      seedPlain('body', 'Lead with the point. Keep paragraphs short.')
    ],
    agentStarter: proseStarter({
      title: 'Article Note',
      focus: 'Provide a short title section and a full body. Title section is display title text, not only the JSON title field.',
    })
  },
  {
    id: 'post.caption.v1',
    classId: 'social.post',
    docType: 'post',
    version: '1',
    title: 'Caption Post',
    description: 'Caption/body with media attachments',
    sections: [
      { slug: 'caption', title: 'Caption', required: true },
      { slug: 'attachments', title: 'Attachments', required: false }
    ],
    publishContentClass: 'note',
    browseFeatured: true,
    seedSections: [seedPlain('caption', 'A short caption for your post.')],
    agentStarter: proseStarter({
      title: 'Caption Post',
      focus: 'Write the caption. Mention attachment refs in attachments only if the user provided media identifiers; otherwise omit attachments.',
    })
  },
  {
    id: 'post.media.v1',
    classId: 'social.post',
    docType: 'post',
    version: '1',
    title: 'Media-forward Post',
    description: 'Media first with optional caption',
    sections: [
      { slug: 'attachments', title: 'Media', required: true },
      { slug: 'caption', title: 'Caption', required: false }
    ],
    publishContentClass: 'note',
    browseFeatured: true,
    seedSections: [seedPlain('caption', 'Optional caption under media.')],
    agentStarter: proseStarter({
      title: 'Media-forward Post',
      focus: 'Describe media attachments the user named; add an optional short caption.',
    })
  },
  {
    id: 'collection.basic.v1',
    classId: 'social.collection',
    docType: 'collection',
    version: '1',
    title: 'Basic Collection',
    description: 'Ordered pages / slides',
    sections: [
      { slug: 'slide-1', title: 'Slide 1', required: true },
      { slug: 'slide-2', title: 'Slide 2', required: false }
    ],
    publishContentClass: 'collection',
    browseFeatured: true,
    seedSections: [
      seedPlain('slide-1', 'First page'),
      seedPlain('slide-2', 'Second page — swipe to see')
    ],
    agentStarter: proseStarter({
      title: 'Basic Collection',
      focus: 'Write slide-1 content; add slide-2 only if the user needs a second page.',
    })
  },
  {
    id: 'collection.story.v1',
    classId: 'social.collection',
    docType: 'collection',
    version: '1',
    title: 'Story Collection',
    description: 'Short vertical story pages',
    sections: [
      { slug: 'cover', title: 'Cover', required: true },
      { slug: 'pages', title: 'Pages', required: true }
    ],
    publishContentClass: 'collection',
    browseFeatured: true,
    seedSections: [
      seedPlain('cover', 'Cover line'),
      seedPlain('pages', 'Story continues…')
    ],
    agentStarter: proseStarter({
      title: 'Story Collection',
      focus: 'Write a cover line and story pages body.',
    })
  },
  {
    id: 'set.basic.v1',
    classId: 'social.set',
    docType: 'set',
    version: '1',
    title: 'Basic Set',
    description: 'Primary embed plus source references (refs later)',
    sections: [
      { slug: 'primary', title: 'Primary', required: true },
      { slug: 'sources', title: 'Sources', required: false }
    ],
    agentStarter: proseStarter({
      title: 'Basic Set',
      focus: 'Describe the primary item; list source refs in sources when provided.',
    })
  },
  {
    id: 'feed.self_hosted.v1',
    classId: 'social.feed',
    docType: 'self_hosted_feed',
    version: '1',
    title: 'Self-hosted Feed',
    description: 'Feed config + membership rules',
    sections: [
      { slug: 'meta', title: 'Feed meta', required: true },
      { slug: 'rules', title: 'Rules', required: false }
    ],
    publishContentClass: 'note',
    agentStarter: proseStarter({
      title: 'Self-hosted Feed',
      focus: 'Fill feed meta (name/purpose). Add membership rules only if the user specified them.',
    })
  },
  {
    id: 'feed.curated.v1',
    classId: 'social.feed',
    docType: 'self_hosted_feed',
    version: '1',
    title: 'Curated Feed',
    description: 'Curated index description',
    sections: [
      { slug: 'meta', title: 'Feed meta', required: true },
      { slug: 'index', title: 'Index', required: false }
    ],
    publishContentClass: 'note',
    agentStarter: proseStarter({
      title: 'Curated Feed',
      focus: 'Fill feed meta; optionally describe the curated index.',
    })
  },
  {
    id: 'journal.basic.v1',
    classId: 'projects.journal',
    docType: 'journal',
    version: '1',
    title: 'Basic Journal',
    description: 'Dated entries and logs',
    sections: [{ slug: 'entries', title: 'Entries', required: true }],
    agentStarter: proseStarter({
      title: 'Basic Journal',
      focus: 'Write dated journal entries in the entries section.',
    })
  },
  {
    id: 'list.basic.v1',
    classId: 'projects.list',
    docType: 'list',
    version: '1',
    title: 'Basic List',
    description: 'Checklist or shopping list',
    sections: [{ slug: 'items', title: 'Items', required: true }],
    agentStarter: proseStarter({
      title: 'Basic List',
      focus: 'Write checklist or shopping items, one per line when possible.',
    })
  },
  {
    id: 'letter.basic.v1',
    classId: 'projects.letter',
    docType: 'letter',
    version: '1',
    title: 'Basic Letter',
    description: 'Correspondence letter',
    sections: [{ slug: 'body', title: 'Body', required: true }],
    agentStarter: proseStarter({
      title: 'Basic Letter',
      focus: 'Write the letter body (greeting, content, closing) in body.',
    })
  },
  {
    id: 'note.card.v1',
    classId: 'projects.note',
    docType: 'project_note',
    version: '1',
    title: 'Card Note',
    description: 'Short correspondence note',
    sections: [{ slug: 'body', title: 'Body', required: true }],
    agentStarter: proseStarter({
      title: 'Card Note',
      focus: 'Write a short correspondence note in body.',
    })
  },
  {
    id: 'book.basic.v1',
    classId: 'library.book',
    docType: 'book',
    version: '1',
    title: 'Basic Book',
    description: 'Front matter + body',
    sections: [
      { slug: 'front', title: 'Front', required: false },
      { slug: 'body', title: 'Body', required: true }
    ],
    agentStarter: proseStarter({
      title: 'Basic Book',
      focus: 'Write the book body; optional front matter (title page / preface).',
    })
  },
  {
    id: 'article.basic.v1',
    classId: 'library.article',
    docType: 'article',
    version: '1',
    title: 'Basic Article',
    description: 'Durable article body',
    sections: [{ slug: 'body', title: 'Body', required: true }],
    agentStarter: proseStarter({
      title: 'Basic Article',
      focus: 'Write a durable article body.',
    })
  },
  {
    id: 'calendar.basic.v1',
    classId: 'time.calendar',
    docType: 'calendar',
    version: '1',
    title: 'Basic Calendar',
    description: 'Calendar meta and events',
    sections: [
      { slug: 'meta', title: 'Meta', required: true },
      { slug: 'events', title: 'Events', required: false }
    ],
    agentStarter: proseStarter({
      title: 'Basic Calendar',
      focus: 'Fill calendar meta; list events when provided.',
    })
  },
  {
    id: 'event.basic.v1',
    classId: 'time.event',
    docType: 'event',
    version: '1',
    title: 'Basic Event',
    description: 'Single dated event',
    sections: [{ slug: 'details', title: 'Details', required: true }],
    agentStarter: proseStarter({
      title: 'Basic Event',
      focus: 'Write event details including when/where if the user gave them.',
    })
  },
  {
    id: 'schedule.basic.v1',
    classId: 'time.schedule',
    docType: 'schedule',
    version: '1',
    title: 'Basic Schedule',
    description: 'Ordered agenda',
    sections: [{ slug: 'agenda', title: 'Agenda', required: true }],
    agentStarter: proseStarter({
      title: 'Basic Schedule',
      focus: 'Write an ordered agenda in agenda.',
    })
  },
  {
    id: 'register.basic.v1',
    classId: 'records.register',
    docType: 'register',
    version: '1',
    title: 'Basic Register',
    description: 'Typed register rows (kit)',
    sections: [{ slug: 'rows', title: 'Rows', required: true }],
    registerColumns: DEFAULT_REGISTER_COLUMNS,
    agentStarter: registerStarter({
      title: 'Basic Register',
      columns: DEFAULT_REGISTER_COLUMNS
    })
  }
];

const byId = new Map(STARTER.map((t) => [t.id, t]));

export function listStarterTemplates(): PenTemplate[] {
  return [...STARTER];
}

export function getTemplate(templateId: string): PenTemplate | undefined {
  return byId.get(templateId);
}

export function requireTemplate(templateId: string): PenTemplate {
  const t = getTemplate(templateId);
  if (!t) throw new Error(`unknown_pen_template:${templateId}`);
  return t;
}

/** Pen Mini: featured platform templates for a form (cap applied by caller). */
export function listBrowseFeaturedTemplates(classId?: string): PenTemplate[] {
  return listStarterTemplates().filter(
    (t) => t.browseFeatured && (!classId || t.classId === classId)
  );
}

/** Synthetic blank template for a form (empty sections matching a starter of that class). */
export function blankTemplateForClass(classId: string): PenTemplate | null {
  const sample = listStarterTemplates().find((t) => t.classId === classId);
  if (!sample) return null;
  return {
    ...sample,
    id: `blank.${classId}`,
    title: `Blank ${sample.title.replace(/^(Basic|Article|Caption|Media-forward|Story)\s+/i, '')}`.trim() ||
      `Blank`,
    description: 'Empty document for this form',
    browseFeatured: false,
    seedSections: sample.sections.map((s) => emptySection(s.slug)),
    agentStarter: proseStarter({
      title: 'Blank',
      focus: 'Start from an empty document for this form.'
    })
  };
}
