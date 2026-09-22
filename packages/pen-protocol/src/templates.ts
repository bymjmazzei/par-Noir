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
