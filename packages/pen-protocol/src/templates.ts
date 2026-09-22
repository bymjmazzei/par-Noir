/** Pen template registry + starter pack. */

export type PenDocType = 'note' | 'post' | 'collection' | 'self_hosted_feed' | string;

export interface PenTemplateSection {
  slug: string;
  title: string;
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
}

const STARTER: PenTemplate[] = [
  {
    id: 'note.basic.v1',
    classId: 'social.note',
    docType: 'note',
    version: '1',
    title: 'Basic Note',
    description: 'Single-body flow Note for browse',
    sections: [{ slug: 'body', title: 'Body', required: true }],
    publishContentClass: 'note'
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
    publishContentClass: 'note'
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
    publishContentClass: 'note'
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
    publishContentClass: 'note'
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
    publishContentClass: 'collection'
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
    publishContentClass: 'collection'
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
    ]
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
    publishContentClass: 'note'
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
    publishContentClass: 'note'
  },
  {
    id: 'journal.basic.v1',
    classId: 'projects.journal',
    docType: 'journal',
    version: '1',
    title: 'Basic Journal',
    description: 'Dated entries and logs',
    sections: [{ slug: 'entries', title: 'Entries', required: true }]
  },
  {
    id: 'list.basic.v1',
    classId: 'projects.list',
    docType: 'list',
    version: '1',
    title: 'Basic List',
    description: 'Checklist or shopping list',
    sections: [{ slug: 'items', title: 'Items', required: true }]
  },
  {
    id: 'letter.basic.v1',
    classId: 'projects.letter',
    docType: 'letter',
    version: '1',
    title: 'Basic Letter',
    description: 'Correspondence letter',
    sections: [{ slug: 'body', title: 'Body', required: true }]
  },
  {
    id: 'note.card.v1',
    classId: 'projects.note',
    docType: 'project_note',
    version: '1',
    title: 'Card Note',
    description: 'Short correspondence note',
    sections: [{ slug: 'body', title: 'Body', required: true }]
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
    ]
  },
  {
    id: 'article.basic.v1',
    classId: 'library.article',
    docType: 'article',
    version: '1',
    title: 'Basic Article',
    description: 'Durable article body',
    sections: [{ slug: 'body', title: 'Body', required: true }]
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
    ]
  },
  {
    id: 'event.basic.v1',
    classId: 'time.event',
    docType: 'event',
    version: '1',
    title: 'Basic Event',
    description: 'Single dated event',
    sections: [{ slug: 'details', title: 'Details', required: true }]
  },
  {
    id: 'schedule.basic.v1',
    classId: 'time.schedule',
    docType: 'schedule',
    version: '1',
    title: 'Basic Schedule',
    description: 'Ordered agenda',
    sections: [{ slug: 'agenda', title: 'Agenda', required: true }]
  },
  {
    id: 'register.basic.v1',
    classId: 'records.register',
    docType: 'register',
    version: '1',
    title: 'Basic Register',
    description: 'Typed register rows (kit)',
    sections: [{ slug: 'rows', title: 'Rows', required: true }]
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
