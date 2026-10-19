import type { PenPageLayer } from '../types.js';
import type { PenTemplate, PenTemplateSection } from '../templates.js';
import type { SeedBundle } from '../starterSeeds.js';
import { proseStarter, withSeedBundle } from '../curated/registerHelpers.js';
import { FRAMES, panelLayer, type Box, type Frame } from '../curated/kit.js';

export type PostAspect = keyof typeof FRAMES;

const GALLERY: Record<PostAspect, NonNullable<PenTemplate['seedGalleryAspect']>> = {
  portrait: '9/16',
  landscape: '16/9',
  square: '1/1'
};

/** Frame a template's pages were drawn at, from its gallery aspect. */
export function frameOf(template: Pick<PenTemplate, 'seedGalleryAspect'>): Frame {
  if (template.seedGalleryAspect === '16/9') return FRAMES.landscape;
  if (template.seedGalleryAspect === '1/1') return FRAMES.square;
  return FRAMES.portrait;
}

type PostForm = 'social.note' | 'social.post' | 'social.collection' | 'social.profile' | 'social.comparison';

const DOC_TYPE: Record<PostForm, string> = {
  'social.note': 'note',
  'social.post': 'post',
  'social.collection': 'collection',
  'social.profile': 'profile',
  'social.comparison': 'comparison'
};

export function postTemplate(input: {
  id: string;
  classId: PostForm;
  title: string;
  description: string;
  aspect: PostAspect;
  featured?: boolean;
  /** Agent brief: what this post is for and what to write where. */
  focus: string;
  /** Collections list one section per page; single posts default to `body`. */
  sections?: PenTemplateSection[];
  seed: SeedBundle;
}): PenTemplate {
  const collection = input.classId === 'social.collection';
  return withSeedBundle(
    {
      id: input.id,
      classId: input.classId,
      docType: DOC_TYPE[input.classId],
      version: '1',
      title: input.title,
      description: input.description,
      sections: input.sections ?? [{ slug: 'body', title: 'Body', required: true }],
      publishContentClass: collection ? 'collection' : 'note',
      ...(input.featured ? { browseFeatured: true } : {}),
      ...(collection ? { seedPageSwipeAxis: 'x' as const } : {}),
      seedGalleryAspect: GALLERY[input.aspect],
      agentStarter: proseStarter({ title: input.title, focus: input.focus })
    },
    input.seed
  );
}

/** Gradient shade that keeps copy readable over a photo or clip. */
export function scrimLayer(id: string, b: Box, gradient: string): PenPageLayer {
  return {
    id,
    kind: 'text',
    widgetElement: 'html',
    name: 'Scrim',
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
    zIndex: b.z,
    positionLocked: true,
    htmlSource: `<style>html,body{margin:0;height:100%}body{background:${gradient}}</style>`
  };
}

/** Editor text layers pad 8px around a 20px line, so a one-line label needs 36px. */
const CHIP_MIN_H = 36;

/** Small pill label: kickers, dates, status tags. Short boxes grow to one line, keeping their center. */
export function chipLayer(id: string, b: Box, text: string, fill: string, color: string, extra: Partial<PenPageLayer> = {}): PenPageLayer {
  const h = Math.max(b.h, CHIP_MIN_H);
  const y = Math.max(0, b.y - Math.round((h - b.h) / 2));
  return panelLayer(id, { ...b, y, h }, fill, text, { size: 11, color, bold: true, align: 'center' }, { name: 'Chip', cornerRadius: Math.round(h / 2), ...extra });
}
