/** Publish destinations: Social, personal/Library templates, finished Library docs. */

import {
  compileDocumentToNote,
  defaultPagePresentation,
  emptySection,
  getClass,
  hashSectionContent,
  signGenesis,
  attachNotary,
  notaryHashForGenesis,
  requireTemplate,
  type PenDocManifest,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import type { PenSession } from '../App';
import { createDocFromTemplate } from './createDocFromTemplate';
import type { LocalDocBundle } from './penLocalStore';
import { saveLocalDoc } from './penLocalStore';
import {
  loadPersonalTemplate,
  isPersonalTemplateId,
  savePersonalTemplateFromDoc
} from './penPersonalTemplates';
import { resolveSigningKeys } from './penKeys';
import { requestNotaryStamp } from './penApi';
import { generateChatKey, generateGroupId } from '@par-noir/dm-crypto';

export const PEN_PUBLISH_PREFIX = 'pen_publish:';
/** Legacy browse handoff key — still written alongside for one release. */
export const PEN_PUBLISH_NOTE_PREFIX = 'pen_publish_note:';

export function isProjectDoc(manifest: PenDocManifest): boolean {
  const form = getClass(manifest.classId);
  return form?.parentId === 'projects';
}

function libraryStarterForProject(classId: string): 'book.basic.v1' | 'article.basic.v1' {
  return classId === 'projects.journal' ? 'book.basic.v1' : 'article.basic.v1';
}

function mapProjectSectionsToLibrary(
  bundle: LocalDocBundle,
  libraryTemplateId: string
): { sections: PenSectionContent[]; toc: string[] } {
  const libraryTemplate = requireTemplate(libraryTemplateId);
  const seedByIndex = bundle.sections;
  const sections = libraryTemplate.sections.map((s, i) => {
    const src = seedByIndex[i];
    if (src) return { ...src, slug: s.slug };
    return emptySection(s.slug);
  });
  const srcBody =
    bundle.sections.find((s) => s.slug === 'body') ||
    bundle.sections.find((s) => s.slug === 'entries') ||
    bundle.sections[0];
  const bodyIdx = sections.findIndex((s) => s.slug === 'body');
  if (srcBody && bodyIdx >= 0) {
    sections[bodyIdx] = { ...srcBody, slug: 'body' };
  }
  return { sections, toc: libraryTemplate.sections.map((s) => s.slug) };
}

export function writeSocialPublishHandoff(bundle: LocalDocBundle): void {
  const compiled = compileDocumentToNote({
    templateId: bundle.manifest.templateId,
    title: bundle.manifest.title,
    sections: bundle.sections,
    pagePresentation: bundle.manifest.pagePresentation || defaultPagePresentation(),
    docId: bundle.manifest.docId
  });
  const payload = {
    contentClass: 'note' as const,
    title: compiled.title,
    pages: compiled.pages,
    templateId: compiled.templateId,
    docId: bundle.manifest.docId,
    headProof:
      bundle.chain.links[bundle.chain.links.length - 1] || bundle.chain.genesis
  };
  const json = JSON.stringify(payload);
  sessionStorage.setItem(`${PEN_PUBLISH_PREFIX}${bundle.manifest.docId}`, json);
  sessionStorage.setItem(`${PEN_PUBLISH_NOTE_PREFIX}${bundle.manifest.docId}`, json);
}

export function saveAsPersonalTemplate(
  pn: string,
  bundle: LocalDocBundle,
  title?: string
): { templateId: string; title: string } {
  const tpl = savePersonalTemplateFromDoc(pn, bundle, { title });
  return { templateId: tpl.id, title: tpl.title };
}

/**
 * Project → reusable Library template (Book/Article class) under Yours.
 * Does not create a document — Library remains a template/form space.
 */
export function saveProjectAsLibraryTemplate(
  pn: string,
  bundle: LocalDocBundle
): { templateId: string; title: string } {
  if (!isProjectDoc(bundle.manifest)) {
    throw new Error('only_projects_can_save_library_template');
  }
  const libraryTemplateId = libraryStarterForProject(bundle.manifest.classId);
  const libraryTemplate = requireTemplate(libraryTemplateId);
  const mapped = mapProjectSectionsToLibrary(bundle, libraryTemplateId);
  const tpl = savePersonalTemplateFromDoc(pn, bundle, {
    title: `${bundle.manifest.title || 'Untitled'} (Library)`,
    classId: libraryTemplate.classId,
    docType: libraryTemplate.docType,
    basedOnTemplateId: libraryTemplate.id,
    sections: libraryTemplate.sections.map((s) => ({
      slug: s.slug,
      title: s.title,
      required: s.required !== false
    })),
    seedSections: mapped.sections
  });
  return { templateId: tpl.id, title: tpl.title };
}

function randomDocId(): string {
  return `pen_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

/**
 * Project → finished Library *document* (durable long-form; not a social feed tile).
 */
export async function promoteProjectToFinishedLibraryDoc(input: {
  session: PenSession;
  bundle: LocalDocBundle;
}): Promise<LocalDocBundle> {
  const { session, bundle } = input;
  if (!isProjectDoc(bundle.manifest)) {
    throw new Error('only_projects_can_publish_finished_library_work');
  }
  const libraryTemplateId = libraryStarterForProject(bundle.manifest.classId);
  const libraryTemplate = requireTemplate(libraryTemplateId);
  const docId = randomDocId();
  const now = new Date().toISOString();
  const mapped = mapProjectSectionsToLibrary(bundle, libraryTemplateId);

  const commitment = hashSectionContent(
    new TextEncoder().encode(JSON.stringify(mapped.sections))
  );
  const keys = resolveSigningKeys(session);
  let genesis = signGenesis({
    docId,
    templateId: libraryTemplate.id,
    authorPn: session.pnIdentifier,
    clientCreatedAt: now,
    contentCommitment: commitment,
    secretKey: keys.secretKey,
    publicKey: keys.publicKey
  });
  try {
    const notary = await requestNotaryStamp(session.accessToken, notaryHashForGenesis(genesis));
    attachNotary(genesis, notary);
  } catch {
    /* optional */
  }

  const groupId = generateGroupId();
  sessionStorage.setItem(`pen_doc_key:${docId}`, generateChatKey());
  sessionStorage.setItem(`pen_group_id:${docId}`, groupId);

  const next: LocalDocBundle = {
    manifest: {
      docId,
      title: bundle.manifest.title || `Untitled ${libraryTemplate.title}`,
      docType: libraryTemplate.docType,
      classId: libraryTemplate.classId,
      templateId: libraryTemplate.id,
      templateVersion: libraryTemplate.version,
      groupId,
      toc: mapped.toc,
      createdAt: now,
      updatedAt: now,
      genesisProof: genesis,
      pageLayout: bundle.manifest.pageLayout || 'letter',
      pagePresentation: bundle.manifest.pagePresentation || defaultPagePresentation()
    },
    sections: mapped.sections,
    chain: { docId, genesis, links: [] }
  };
  saveLocalDoc(session.pnIdentifier, next);
  return next;
}

/** Create a doc from a personal template id (used by New… picker). */
export async function createDocFromPersonalOrStarter(input: {
  session: PenSession;
  templateId: string;
}): Promise<LocalDocBundle> {
  if (!isPersonalTemplateId(input.templateId)) {
    return createDocFromTemplate(input);
  }
  const personal = loadPersonalTemplate(input.session.pnIdentifier, input.templateId);
  if (!personal) throw new Error('personal_template_missing');
  const bundle = await createDocFromTemplate({
    session: input.session,
    templateId: personal.basedOnTemplateId
  });
  const bySlug = new Map(personal.seedSections.map((s) => [s.slug, s]));
  const sections = bundle.sections.map((s) => {
    const seed = bySlug.get(s.slug);
    return seed ? { ...seed, slug: s.slug } : s;
  });
  for (const seed of personal.seedSections) {
    if (!sections.some((s) => s.slug === seed.slug)) sections.push({ ...seed });
  }
  const next: LocalDocBundle = {
    ...bundle,
    sections,
    manifest: {
      ...bundle.manifest,
      title: personal.title.replace(/\s*template$/i, '').trim() || bundle.manifest.title,
      classId: personal.classId,
      docType: personal.docType,
      toc: sections.map((s) => s.slug),
      updatedAt: new Date().toISOString()
    }
  };
  saveLocalDoc(input.session.pnIdentifier, next);
  return next;
}

/**
 * Create a Projects journal that ports selected My Library docs in as live penEmbed refs.
 */
export async function createProjectFromLibrary(input: {
  session: PenSession;
  sourceDocs: Array<{ docId: string; title: string }>;
  title?: string;
}): Promise<LocalDocBundle> {
  if (!input.sourceDocs.length) throw new Error('library_sources_required');
  const bundle = await createDocFromTemplate({
    session: input.session,
    templateId: 'journal.basic.v1'
  });
  const embeds = input.sourceDocs.map((d) => ({
    type: 'penEmbed',
    attrs: {
      docId: d.docId,
      sectionSlug: null,
      title: d.title || 'Untitled'
    }
  }));
  const entriesDoc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Library sources'
          }
        ]
      },
      ...embeds
    ]
  };
  const sections = bundle.sections.map((s) =>
    s.slug === 'entries' ? { ...s, doc: entriesDoc as typeof s.doc } : s
  );
  const title =
    input.title?.trim() ||
    (input.sourceDocs.length === 1
      ? `Project · ${input.sourceDocs[0]!.title || 'Untitled'}`
      : `Project · ${input.sourceDocs.length} sources`);
  const next: LocalDocBundle = {
    ...bundle,
    sections,
    manifest: {
      ...bundle.manifest,
      title,
      updatedAt: new Date().toISOString()
    }
  };
  saveLocalDoc(input.session.pnIdentifier, next);
  return next;
}
