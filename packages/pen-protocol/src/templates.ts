/** Pen template registry: social post templates, widgets, and kit primitives/records. */

import type { PenPageLayout, PenPagePresentation, PenSectionContent } from './types.js';
import type { PenLicensingRoot } from './licensing.js';
import { emptySection } from './richDoc.js';
import { curatedWidgetTemplates } from './curated/index.js';
import { proseStarter } from './curated/registerHelpers.js';
import { seedWebsiteDoc } from './curated/websiteDoc.js';
import { platformPostTemplates } from './templates/index.js';
import { seedAnimationPreset, seedTextPreset, seedTransitionPreset, seedWidget } from './widgetElements.js';
import {
  seedAssetKey,
  seedRegister,
  seedSetBasic,
  seedTablePrimitive,
  type SeedBundle
} from './starterSeeds.js';

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
  /** Default page chrome when creating / previewing from this template. */
  seedPagePresentation?: PenPagePresentation;
  /** Default page layout when creating / previewing from this template. */
  seedPageLayout?: PenPageLayout;
  /** Gallery thumb aspect (Social orientations). */
  seedGalleryAspect?: '9/16' | '16/9' | '1/1';
  /** Default multipage swipe axis (collections → x). */
  seedPageSwipeAxis?: 'x' | 'y';
  /** Featured in Pen Mini (~3 per form). */
  browseFeatured?: boolean;
  /** Curated widget picker category (widgets.widget starters). */
  widgetCategory?: string;
  /** Optional CDN-backed public template preview. */
  previewFileId?: string;
  /** Work license + open creator contracts (optional on platform starters). */
  licensing?: PenLicensingRoot;
}

/** Default author label for first-party / starter templates. */
export const PLATFORM_TEMPLATE_AUTHOR = 'par noir';


function withSeed(
  base: Omit<PenTemplate, 'seedSections' | 'seedPagePresentation' | 'seedPageLayout'>,
  seed: SeedBundle
): PenTemplate {
  return {
    ...base,
    seedSections: seed.seedSections,
    seedPagePresentation: seed.seedPagePresentation,
    seedPageLayout: seed.seedPageLayout
  };
}

export function templateAuthorLabel(
  template: Pick<PenTemplate, 'authorDisplayName'> | null | undefined
): string {
  const name = template?.authorDisplayName?.trim();
  return name || PLATFORM_TEMPLATE_AUTHOR;
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

function widgetStarter(
  id: string,
  title: string,
  description: string,
  focus: string,
  seed: SeedBundle
): PenTemplate {
  return withSeed(
    {
      id,
      classId: 'widgets.widget',
      docType: 'widget',
      version: '1',
      title,
      description,
      sections: [{ slug: 'card', title: 'Card', required: true }],
      seedGalleryAspect: '1/1',
      agentStarter: proseStarter({ title, focus })
    },
    seed
  );
}

function widgetStarters(): PenTemplate[] {
  return [
    widgetStarter(
      'widget.v1',
      'Widget',
      'Empty template. Place layers on the preview and set a trigger on a button.',
      'Arrange layers by dragging them. A button does nothing until its trigger is set.',
      seedWidget()
    ),
    ...curatedWidgetTemplates(),
    withSeed(
      {
        id: 'sticker.v1',
        classId: 'widgets.sticker',
        docType: 'sticker',
        version: '1',
        title: 'Sticker',
        description: 'Empty sticker. Place SVG, image, or text. No button and no trigger.',
        sections: [{ slug: 'card', title: 'Card', required: true }],
        seedGalleryAspect: '1/1',
        agentStarter: proseStarter({
          title: 'Sticker',
          focus: 'Place art on the card. Do not add a button or a trigger.'
        })
      },
      seedWidget()
    ),
    withSeed(
      {
        id: 'animation.v1',
        classId: 'widgets.animation',
        docType: 'animation',
        version: '1',
        title: 'Animation',
        description: 'One layer that rises in. Replace the motion to publish your own.',
        sections: [{ slug: 'card', title: 'Card', required: true }],
        seedGalleryAspect: '1/1',
        agentStarter: proseStarter({
          title: 'Animation',
          focus: 'Keep a single layer. Set its intro motion. Do not add a button or a trigger.'
        })
      },
      seedAnimationPreset()
    ),
    withSeed(
      {
        id: 'transition.v1',
        classId: 'widgets.transition',
        docType: 'transition',
        version: '1',
        title: 'Transition',
        description: 'Two clips on one track. The second fades in from the first.',
        sections: [{ slug: 'card', title: 'Card', required: true }],
        seedGalleryAspect: '1/1',
        agentStarter: proseStarter({
          title: 'Transition',
          focus: 'Keep two clips on one track and set the join on the incoming clip.'
        })
      },
      seedTransitionPreset()
    ),
    withSeed(
      {
        id: 'textpreset.v1',
        classId: 'widgets.text_preset',
        docType: 'text_preset',
        version: '1',
        title: 'Text preset',
        description: 'One text sample with family, size, color, stroke, and shadow.',
        sections: [{ slug: 'card', title: 'Card', required: true }],
        seedGalleryAspect: '1/1',
        agentStarter: proseStarter({
          title: 'Text preset',
          focus: 'Keep one text layer. Set family, size, color, stroke, and shadow.'
        })
      },
      seedTextPreset()
    )
  ];
}

const PLATFORM_POSTS = platformPostTemplates();

/** The social post templates; each ships a screenshot poster in the Pen app. */
export const PLATFORM_POST_TEMPLATE_IDS: readonly string[] = PLATFORM_POSTS.map((t) => t.id);

export { frameOf } from './templates/index.js';

const STARTER: PenTemplate[] = [
  ...PLATFORM_POSTS,
  withSeed(
      {
        id: 'website.v1',
        classId: 'social.note',
        docType: 'note',
        version: '1',
        title: 'Website',
        description: 'Home, About, and Contact pages with a nav bar (vertical swipe).',
        sections: [
          { slug: 'home', title: 'Home', required: true },
          { slug: 'about', title: 'About', required: true },
          { slug: 'contact', title: 'Contact', required: true }
        ],
        publishContentClass: 'note',
        browseFeatured: true,
        seedPageSwipeAxis: 'y',
        seedGalleryAspect: '9/16',
        agentStarter: proseStarter({
          title: 'Website',
          focus:
            'Fill home, about, and contact. Keep the nav buttons on each page pointed at page:0, page:1, and page:2.'
        })
      },
      seedWebsiteDoc()
    ),
  withSeed(
      {
        id: 'set.basic.v1',
        classId: 'social.set',
        docType: 'set',
        version: '1',
        title: 'Set',
        description:
          'Multi-media refs — mix different templates/posts (not same-type multipage)',
        sections: [
          { slug: 'primary', title: 'Primary', required: true },
          { slug: 'sources', title: 'Sources', required: false }
        ],
        publishContentClass: 'note',
        seedGalleryAspect: '9/16',
        agentStarter: proseStarter({
          title: 'Set',
          focus:
            'Describe the primary item; list penEmbed source refs in sources when provided. Mix media types.'
        })
      },
      seedSetBasic()
    ),
  ...widgetStarters(),
  withSeed(
    {
      id: 'table.basic.v1',
      classId: 'primitives.table',
      docType: 'table',
      version: '1',
      title: 'Cloud Table',
      description: 'Kit cloud grid reference object',
      sections: [{ slug: 'grid', title: 'Grid', required: true }],
      agentStarter: proseStarter({
        title: 'Cloud Table',
        focus: 'Do not invent TipTap tables for tallies — structured table.v1 rows only via tooling.'
      })
    },
    seedTablePrimitive()
  ),
  withSeed(
    {
      id: 'register.basic.v1',
      classId: 'records.register',
      docType: 'register',
      version: '1',
      title: 'Register',
      description: 'Typed register rows (kit)',
      sections: [{ slug: 'rows', title: 'Rows', required: true }],
      registerColumns: DEFAULT_REGISTER_COLUMNS,
      agentStarter: registerStarter({
        title: 'Register',
        columns: DEFAULT_REGISTER_COLUMNS
      })
    },
    seedRegister()
  ),
  withSeed(
    {
      id: 'asset_key.basic.v1',
      classId: 'records.asset_key',
      docType: 'asset_key',
      version: '1',
      title: 'Asset Key',
      description: 'Paid license receipt (kit) — asset ref, scope, price, ZKP',
      sections: [
        { slug: 'grant', title: 'Grant', required: true },
        { slug: 'proof', title: 'Proof', required: true }
      ],
      agentStarter: proseStarter({
        title: 'Asset Key',
        focus: 'Record asset id, scope, price, and license-key proof after purchase.'
      })
    },
    seedAssetKey()
  )
];

const byId = new Map(STARTER.map((t) => [t.id, t]));

export function listStarterTemplates(): PenTemplate[] {
  return [...STARTER];
}

export function getTemplate(templateId: string): PenTemplate | undefined {
  const direct = byId.get(templateId);
  if (direct) return direct;
  return resolveBlankTemplateId(templateId) || undefined;
}

/**
 * Template for an existing doc. When its template was retired, the doc's own pages
 * stand in and its form's starters supply the publish class.
 */
export function templateForDoc(
  manifest: { templateId: string; classId: string; docType?: string },
  sections: Array<{ slug: string }>
): PenTemplate {
  const found = getTemplate(manifest.templateId);
  if (found) return found;
  const sample = STARTER.find((t) => t.classId === manifest.classId);
  return {
    id: manifest.templateId,
    classId: manifest.classId,
    docType: manifest.docType || sample?.docType || 'note',
    version: '1',
    title: sample?.title || 'Document',
    description: '',
    sections: sections.map((s) => ({ slug: s.slug, title: s.slug })),
    publishContentClass: sample?.publishContentClass,
    agentStarter: proseStarter({ title: 'Document', focus: 'Fill the sections listed.' })
  };
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

/**
 * Synthetic blank template for a form (empty sections matching a starter of that class).
 * Id is `blank.${classId}` (also accepts legacy `blank.${classId}.v1` via getTemplate).
 */
export function blankTemplateForClass(classId: string): PenTemplate | null {
  const sample = listStarterTemplates().find((t) => t.classId === classId);
  if (!sample) return null;
  return {
    id: `blank.${classId}`,
    classId,
    docType: sample.docType,
    version: '1',
    title: 'Blank',
    description: 'Empty document',
    sections: sample.sections.map((s) => ({ ...s })),
    browseFeatured: false,
    seedSections: sample.sections.map((s) => emptySection(s.slug)),
    agentStarter: proseStarter({
      title: 'Blank',
      focus: 'Fill the sections listed for this blank form.'
    })
  };
}

/** Custom blank (no class starter) — used by Pen New → Blank → Custom. */
function blankCustomTemplate(): PenTemplate {
  return {
    id: 'blank.custom',
    classId: 'custom.doc',
    docType: 'custom',
    version: '1',
    title: 'Blank',
    description: 'Empty custom document',
    sections: [{ slug: 'body', title: 'Body', required: true }],
    browseFeatured: false,
    seedSections: [emptySection('body')],
    agentStarter: proseStarter({
      title: 'Blank',
      focus: 'Freeform custom document.'
    })
  };
}

/**
 * Resolve `blank.${classId}` / `blank.${classId}.v1` / `blank.custom(.v1)`.
 * CreateBlank historically appended `.v1`; catalog id does not.
 */
function resolveBlankTemplateId(templateId: string): PenTemplate | null {
  const id = String(templateId || '').trim();
  if (!id.startsWith('blank.')) return null;
  const body = id.endsWith('.v1') ? id.slice(0, -3) : id;
  if (body === 'blank.custom') return blankCustomTemplate();
  const classId = body.slice('blank.'.length);
  if (!classId || classId.includes('..')) return null;
  return blankTemplateForClass(classId);
}
