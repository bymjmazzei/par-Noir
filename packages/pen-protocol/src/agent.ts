/**
 * Pen AI agent contract — model-agnostic build / validate / materialize.
 * External agents (Cursor, Astra, …) emit PenAgentBuild; we validate and materialize IR.
 */

import type { PenTipTapNode } from './types.js';
import type { PenDocManifest, PenDraftManifest, PenSectionContent } from './types.js';
import {
  docManifestPath,
  draftDirPath,
  draftManifestPath,
  draftSectionPath,
  docRootPath,
  historyChainPath,
  currentDirPath,
  currentSectionPath
} from './paths.js';
import {
  getTemplate,
  requireTemplate,
  type PenRegisterColumn,
  type PenTemplate
} from './templates.js';
import { emptySection, emptyTipTapDoc, isTipTapDoc, docToPlainText } from './richDoc.js';

/** Placeholders supported in PenTemplate.agentStarter. */
export const AGENT_PROMPT_USER_INPUT = '{{user_input}}';
export const AGENT_PROMPT_TEMPLATE_ID = '{{template_id}}';
export const AGENT_PROMPT_SECTION_LIST = '{{section_list}}';

export interface PenAgentSectionBuild {
  slug: string;
  /** Preferred for agents — converted to TipTap on materialize. */
  plainText?: string;
  /** Optional TipTap doc when the agent already has rich JSON. */
  doc?: PenTipTapNode;
}

/** One register row: keys must match template.registerColumns ids. */
export type PenAgentRegisterRow = Record<string, string | number | boolean | null>;

/**
 * Stable agent output contract.
 * Prose templates use `sections`; register templates use `rows` (plus optional section overrides).
 */
export interface PenAgentBuild {
  templateId: string;
  title: string;
  sections?: PenAgentSectionBuild[];
  rows?: PenAgentRegisterRow[];
}

export type PenAgentBuildErrorCode =
  | 'unknown_template'
  | 'missing_title'
  | 'missing_required_section'
  | 'unknown_section'
  | 'empty_required_section'
  | 'missing_rows'
  | 'invalid_row'
  | 'unknown_column'
  | 'missing_required_column';

export interface PenAgentBuildError {
  code: PenAgentBuildErrorCode;
  message: string;
  path?: string;
}

export interface PenAgentValidateResult {
  ok: boolean;
  errors: PenAgentBuildError[];
  template?: PenTemplate;
}

export interface PenMaterializedFile {
  /** Path relative to pn root, e.g. par-noir-pen/{docId}/doc.json */
  path: string;
  content: string;
}

export interface PenMaterializeResult {
  docId: string;
  draftId: string;
  manifest: PenDocManifest;
  draft: PenDraftManifest;
  sections: PenSectionContent[];
  files: PenMaterializedFile[];
}

function sectionListForTemplate(template: PenTemplate): string {
  return template.sections
    .map((s) => `${s.slug}${s.required ? ' (required)' : ' (optional)'}`)
    .join(', ');
}

/** Fill template.agentStarter placeholders with user input and template metadata. */
export function composeAgentPrompt(templateId: string, userInput: string): string {
  const template = requireTemplate(templateId);
  const input = String(userInput ?? '').trim();
  return template.agentStarter
    .split(AGENT_PROMPT_TEMPLATE_ID)
    .join(template.id)
    .split(AGENT_PROMPT_SECTION_LIST)
    .join(sectionListForTemplate(template))
    .split(AGENT_PROMPT_USER_INPUT)
    .join(input || '(no user input provided)');
}

/** Plain text → minimal TipTap doc (paragraphs split on blank lines). */
export function plainTextToTipTapDoc(text: string): PenTipTapNode {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return emptyTipTapDoc();
  const paragraphs = trimmed.split(/\n{2,}/);
  return {
    type: 'doc',
    content: paragraphs.map((p) => ({
      type: 'paragraph',
      content: p
        ? p.split('\n').flatMap((line, i, arr) => {
            const nodes: PenTipTapNode[] = [{ type: 'text', text: line }];
            if (i < arr.length - 1) nodes.push({ type: 'hardBreak' });
            return nodes;
          })
        : []
    }))
  };
}

function sectionHasContent(section: PenAgentSectionBuild): boolean {
  if (isTipTapDoc(section.doc) && docToPlainText(section.doc).trim()) return true;
  if (typeof section.plainText === 'string' && section.plainText.trim()) return true;
  return false;
}

function resolveSectionDoc(section: PenAgentSectionBuild): PenTipTapNode {
  if (isTipTapDoc(section.doc)) return section.doc;
  if (typeof section.plainText === 'string') return plainTextToTipTapDoc(section.plainText);
  return emptyTipTapDoc();
}

function validateRegisterRows(
  template: PenTemplate,
  rows: PenAgentRegisterRow[] | undefined,
  errors: PenAgentBuildError[]
): void {
  const columns = template.registerColumns || [];
  if (!columns.length) return;
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    errors.push({
      code: 'missing_rows',
      message: `template ${template.id} requires rows matching registerColumns`,
      path: 'rows'
    });
    return;
  }
  const colIds = new Set(columns.map((c) => c.id));
  rows.forEach((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      errors.push({
        code: 'invalid_row',
        message: `rows[${index}] must be an object`,
        path: `rows[${index}]`
      });
      return;
    }
    for (const key of Object.keys(row)) {
      if (!colIds.has(key)) {
        errors.push({
          code: 'unknown_column',
          message: `unknown column "${key}"`,
          path: `rows[${index}].${key}`
        });
      }
    }
    for (const col of columns) {
      if (!col.required) continue;
      const v = row[col.id];
      if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) {
        errors.push({
          code: 'missing_required_column',
          message: `rows[${index}] missing required column "${col.id}"`,
          path: `rows[${index}].${col.id}`
        });
      }
    }
  });
}

/** Validate an agent build against the starter template registry. */
export function validatePenAgentBuild(build: unknown): PenAgentValidateResult {
  const errors: PenAgentBuildError[] = [];
  if (!build || typeof build !== 'object') {
    return {
      ok: false,
      errors: [{ code: 'unknown_template', message: 'build must be an object' }]
    };
  }
  const b = build as PenAgentBuild;
  const templateId = typeof b.templateId === 'string' ? b.templateId.trim() : '';
  const template = getTemplate(templateId);
  if (!template) {
    return {
      ok: false,
      errors: [
        {
          code: 'unknown_template',
          message: `unknown_pen_template:${templateId || '(empty)'}`,
          path: 'templateId'
        }
      ]
    };
  }

  if (typeof b.title !== 'string' || !b.title.trim()) {
    errors.push({ code: 'missing_title', message: 'title is required', path: 'title' });
  }

  const sectionMap = new Map<string, PenAgentSectionBuild>();
  for (const s of b.sections || []) {
    if (!s || typeof s.slug !== 'string') continue;
    sectionMap.set(s.slug, s);
  }

  const knownSlugs = new Set(template.sections.map((s) => s.slug));
  for (const slug of sectionMap.keys()) {
    if (!knownSlugs.has(slug)) {
      errors.push({
        code: 'unknown_section',
        message: `section "${slug}" is not in template ${template.id}`,
        path: `sections.${slug}`
      });
    }
  }

  if (template.registerColumns?.length) {
    validateRegisterRows(template, b.rows, errors);
  } else {
    for (const sec of template.sections) {
      if (!sec.required) continue;
      const provided = sectionMap.get(sec.slug);
      if (!provided) {
        errors.push({
          code: 'missing_required_section',
          message: `missing required section "${sec.slug}"`,
          path: `sections.${sec.slug}`
        });
        continue;
      }
      if (!sectionHasContent(provided)) {
        errors.push({
          code: 'empty_required_section',
          message: `required section "${sec.slug}" is empty`,
          path: `sections.${sec.slug}`
        });
      }
    }
  }

  return { ok: errors.length === 0, errors, template };
}

function rowsToSection(rows: PenAgentRegisterRow[]): PenSectionContent {
  const json = JSON.stringify(rows, null, 2);
  return {
    slug: 'rows',
    doc: {
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'json' },
          content: [{ type: 'text', text: json }]
        }
      ]
    }
  };
}

function seedLayersForSlug(
  template: PenTemplate,
  slug: string
): PenSectionContent['layers'] | undefined {
  const seed = template.seedSections?.find((s) => s.slug === slug);
  if (!seed?.layers?.length) return undefined;
  return seed.layers.map((l) => ({ ...l }));
}

function buildSectionsFromAgent(
  template: PenTemplate,
  build: PenAgentBuild
): PenSectionContent[] {
  const bySlug = new Map<string, PenAgentSectionBuild>();
  for (const s of build.sections || []) {
    if (s?.slug) bySlug.set(s.slug, s);
  }

  return template.sections.map((sec) => {
    if (sec.slug === 'rows' && template.registerColumns?.length && build.rows?.length) {
      return rowsToSection(build.rows);
    }
    const provided = bySlug.get(sec.slug);
    const layers = seedLayersForSlug(template, sec.slug);
    if (!provided) {
      const empty = emptySection(sec.slug);
      return layers?.length ? { ...empty, layers } : empty;
    }
    const out: PenSectionContent = {
      slug: sec.slug,
      doc: resolveSectionDoc(provided)
    };
    if (layers?.length) out.layers = layers;
    return out;
  });
}

function randomId(prefix: string): string {
  const hex =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${hex.slice(0, 16)}`;
}

export interface MaterializePenAgentBuildOpts {
  docId?: string;
  draftId?: string;
  /** When true, write sections under current/ instead of drafts/ (published snapshot). */
  asCurrent?: boolean;
  now?: string;
}

/**
 * Materialize a validated agent build into canonical path + file contents.
 * Does not touch Drive — pure IR. Callers may write `files` to disk or feed bootstrap.
 */
export function materializePenAgentBuild(
  build: PenAgentBuild,
  opts: MaterializePenAgentBuildOpts = {}
): PenMaterializeResult {
  const validated = validatePenAgentBuild(build);
  if (!validated.ok || !validated.template) {
    const msg = validated.errors.map((e) => e.message).join('; ') || 'invalid_build';
    throw new Error(`pen_agent_build_invalid:${msg}`);
  }
  const template = validated.template;
  const docId = opts.docId || randomId('pen');
  const draftId = opts.draftId || randomId('draft');
  const now = opts.now || new Date().toISOString();
  const sections = buildSectionsFromAgent(template, build);
  const toc = template.sections.map((s) => s.slug);

  const manifest: PenDocManifest = {
    docId,
    title: build.title.trim(),
    docType: template.docType,
    classId: template.classId,
    templateId: template.id,
    templateVersion: template.version,
    toc,
    createdAt: now,
    updatedAt: now,
    pageLayout: template.seedPageLayout || 'flow',
    pagePresentation: template.seedPagePresentation,
    lifecycle: opts.asCurrent ? 'published' : 'draft',
    activeDraftId: opts.asCurrent ? undefined : draftId
  };

  const draft: PenDraftManifest = {
    draftId,
    docId,
    authorPnHash: '',
    createdAt: now,
    updatedAt: now,
    status: 'unfinished',
    toc
  };

  const files: PenMaterializedFile[] = [
    {
      path: docManifestPath(docId),
      content: JSON.stringify(manifest, null, 2)
    },
    {
      path: historyChainPath(docId),
      content: JSON.stringify({ docId, genesis: null, links: [] }, null, 2)
    }
  ];

  if (opts.asCurrent) {
    for (const section of sections) {
      files.push({
        path: currentSectionPath(docId, section.slug),
        content: JSON.stringify(section, null, 2)
      });
    }
    // Ensure directory markers exist as empty placeholders for tooling that lists dirs
    void currentDirPath(docId);
  } else {
    files.push({
      path: draftManifestPath(docId, draftId),
      content: JSON.stringify(draft, null, 2)
    });
    for (const section of sections) {
      files.push({
        path: draftSectionPath(docId, draftId, section.slug),
        content: JSON.stringify(section, null, 2)
      });
    }
    void draftDirPath(docId, draftId);
  }

  void docRootPath(docId);

  return { docId, draftId, manifest, draft, sections, files };
}

/** JSON Schema-ish description for curriculum export (not a full draft-07 validator). */
export function penAgentBuildJsonSchema(): Record<string, unknown> {
  return {
    $id: 'https://parnoir.com/schemas/pen-agent-build.v0.json',
    title: 'PenAgentBuild',
    type: 'object',
    required: ['templateId', 'title'],
    additionalProperties: false,
    properties: {
      templateId: { type: 'string', description: 'Starter template id, e.g. note.basic.v1' },
      title: { type: 'string', minLength: 1 },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          required: ['slug'],
          properties: {
            slug: { type: 'string' },
            plainText: { type: 'string' },
            doc: { type: 'object', description: 'TipTap JSON doc' }
          }
        }
      },
      rows: {
        type: 'array',
        description: 'Register rows when template has registerColumns',
        items: { type: 'object', additionalProperties: true }
      }
    }
  };
}

export function listRegisterColumns(templateId: string): PenRegisterColumn[] {
  return getTemplate(templateId)?.registerColumns?.slice() || [];
}
