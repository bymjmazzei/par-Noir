/** Publish destinations: Social, personal/Library templates, finished Library docs. */

import {
  compileDocumentToNote,
  compileSetToNote,
  defaultPagePresentation,
  emptySection,
  getClass,
  getTemplate,
  hashPnIdentifier,
  hashSectionContent,
  signGenesis,
  attachNotary,
  notaryHashForGenesis,
  snapshotPenEmbeds,
  normalizeLicensingRoot,
  shouldPublishAsSingleComposedVideo,
  shouldPublishAsMixedPages,
  partitionSectionsForPublish,
  mergePagePresentation,
  docToPlainText,
  inferPageTextStyle,
  normalizeSection,
  type PenDocManifest,
  type PenEmbedResolveResult,
  type PenSectionContent,
  type ResolvePenEmbed
} from '@par-noir/pen-protocol';
import { composePageToVideo } from './composePageVideoEncode';
import { findComposeExportRoot, waitForUntaintedComposeVideos } from './penGalleryPreview';
import type { PenSession } from '../App';
import { createDocFromTemplate } from './createDocFromTemplate';
import type { LocalDocBundle } from './penLocalStore';
import { loadLocalDoc, saveLocalDoc } from './penLocalStore';
import {
  loadPersonalTemplate,
  isPersonalTemplateId,
  savePersonalTemplateFromDoc
} from './penPersonalTemplates';
import { resolveSigningKeys } from './penKeys';
import { requestNotaryStamp } from './penApi';
import { generateChatKey, generateGroupId } from '@par-noir/dm-crypto';
import { schedulePrefsCloudPush } from './penPrefsCloud';
import {
  openBrowseWithComposedMediaHandoff,
  openBrowseWithMixedPagesHandoff,
  type PenComposedMediaHandoffMeta,
  type PenMixedPageHandoffMeta
} from './penBrowseHandoff';
import {
  assertAggregatorTargetsAllowed,
  licensingForPublish
} from './penPublishGates';

export const PEN_PUBLISH_PREFIX = 'pen_publish:';
/** Legacy browse handoff key — still written alongside for one release. */
export const PEN_PUBLISH_NOTE_PREFIX = 'pen_publish_note:';

export function isProjectDoc(manifest: PenDocManifest): boolean {
  const form = getClass(manifest.classId);
  return form?.parentId === 'projects';
}

/** Library section shapes without platform starters (Projects/Library deferred). */
const LIBRARY_BOOK_SECTIONS = [
  { slug: 'front', title: 'Front', required: false },
  { slug: 'body', title: 'Body', required: true }
] as const;

const LIBRARY_ARTICLE_SECTIONS = [
  { slug: 'body', title: 'Body', required: true }
] as const;

function libraryShapeForProject(classId: string): {
  classId: 'library.book' | 'library.article';
  docType: string;
  sections: ReadonlyArray<{ slug: string; title: string; required?: boolean }>;
} {
  if (classId === 'projects.journal') {
    return {
      classId: 'library.book',
      docType: 'book',
      sections: LIBRARY_BOOK_SECTIONS
    };
  }
  return {
    classId: 'library.article',
    docType: 'article',
    sections: LIBRARY_ARTICLE_SECTIONS
  };
}

function mapProjectSectionsToLibrary(
  bundle: LocalDocBundle,
  librarySections: ReadonlyArray<{ slug: string; title: string; required?: boolean }>
): { sections: PenSectionContent[]; toc: string[] } {
  const seedByIndex = bundle.sections;
  const sections = librarySections.map((s, i) => {
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
  return { sections, toc: librarySections.map((s) => s.slug) };
}

/** Resolve a penEmbed against the local doc store for the given pn. */
export function resolvePenEmbedFromLocal(pn: string): ResolvePenEmbed {
  return (ref): PenEmbedResolveResult | null => {
    const src = loadLocalDoc(pn, ref.docId);
    if (!src) return null;
    if (ref.sectionSlug) {
      const sec = src.sections.find((s) => s.slug === ref.sectionSlug);
      if (!sec) return { title: src.manifest.title, sections: [] };
      return { title: src.manifest.title, doc: sec.doc, sections: [sec] };
    }
    return { title: src.manifest.title, sections: src.sections };
  };
}

export async function writeSocialPublishHandoff(
  bundle: LocalDocBundle,
  opts?: {
    pnIdentifier?: string;
    resolveDoc?: ResolvePenEmbed;
    aggregatorTargets?: string[];
    /** Verified author — required for pen-templates; coerces licensing when false. */
    canPublishPublicTemplate?: boolean;
    connectReady?: boolean;
  }
): Promise<{
  contentClass: 'note' | 'media' | 'collection';
  title: string;
  pages: ReturnType<typeof compileDocumentToNote>['pages'];
  templateId: string;
  docId: string;
  headProof: unknown;
  aggregatorTargets: string[];
  penClassId?: string;
  penCategoryId?: string;
  penTemplateKind?: 'template' | 'remix';
  basedOnTemplateId?: string;
  penIrRef?: { objectId?: string; publicUrl?: string };
  licensing?: ReturnType<typeof licensingForPublish>;
  musicPenDocId?: string;
}> {
  const resolveDoc =
    opts?.resolveDoc ||
    (opts?.pnIdentifier ? resolvePenEmbedFromLocal(opts.pnIdentifier) : async () => null);
  const presentation = bundle.manifest.pagePresentation || defaultPagePresentation();
  const tpl = getTemplate(bundle.manifest.templateId);
  const isSet = tpl?.id === 'set.basic.v1' || tpl?.docType === 'set' || bundle.manifest.docType === 'set';
  const canTemplate = opts?.canPublishPublicTemplate === true;
  const targets = assertAggregatorTargetsAllowed(
    opts?.aggregatorTargets?.length ? opts.aggregatorTargets : ['browse'],
    canTemplate
  );
  const asTemplate = targets.includes('pen-templates');
  const form = getClass(bundle.manifest.classId);
  const lineageId =
    bundle.manifest.basedOnTemplateId || bundle.manifest.templateId;
  const licensing = licensingForPublish(
    bundle.manifest.licensing,
    bundle.manifest.ownerPnHash,
    {
      membership: canTemplate,
      connectReady: opts?.connectReady,
      musicAsset: bundle.manifest.classId === 'library.music'
    }
  );

  const compiled = isSet
    ? await compileSetToNote({
        title: bundle.manifest.title,
        sections: bundle.sections,
        pagePresentation: presentation,
        docId: bundle.manifest.docId,
        resolveDoc,
        templateId: bundle.manifest.templateId
      })
    : compileDocumentToNote({
        templateId: bundle.manifest.templateId,
        title: bundle.manifest.title,
        sections: await snapshotPenEmbeds(bundle.sections, resolveDoc),
        pagePresentation: presentation,
        docId: bundle.manifest.docId
      });

  const payload = {
    contentClass: (compiled.contentClass || 'note') as 'note' | 'media' | 'collection',
    title: compiled.title,
    pages: compiled.pages,
    templateId: compiled.templateId,
    docId: bundle.manifest.docId,
    headProof:
      bundle.chain.links[bundle.chain.links.length - 1] || bundle.chain.genesis,
    aggregatorTargets: targets,
    penClassId: bundle.manifest.classId,
    penCategoryId: form?.parentId,
    /** IR fetch pointer for Use template (doc id until public IR object lands). */
    penIrRef: { objectId: bundle.manifest.docId },
    licensing,
    ...(bundle.manifest.audioSotDocId
      ? { musicPenDocId: bundle.manifest.audioSotDocId }
      : {}),
    ...(asTemplate
      ? {
          penTemplateKind: (bundle.manifest.basedOnTemplateId
            ? 'remix'
            : 'template') as 'template' | 'remix',
          basedOnTemplateId: lineageId
        }
      : {})
  };
  const json = JSON.stringify(payload);
  sessionStorage.setItem(`${PEN_PUBLISH_PREFIX}${bundle.manifest.docId}`, json);
  sessionStorage.setItem(`${PEN_PUBLISH_NOTE_PREFIX}${bundle.manifest.docId}`, json);
  return payload;
}

/**
 * Encode the live page surface and open Browse as a media/video handoff.
 * Requires `[data-pen-compose-export-root]` in the DOM (EditablePagePreview sheet).
 */
export async function writeComposedVideoPublishHandoff(
  bundle: LocalDocBundle,
  opts?: {
    aggregatorTargets?: string[];
    exportRoot?: HTMLElement | null;
    activateSection?: (slug: string) => void | Promise<void>;
    onProgress?: (pct: number) => void;
    canPublishPublicTemplate?: boolean;
    connectReady?: boolean;
  }
): Promise<PenComposedMediaHandoffMeta> {
  if (!shouldPublishAsSingleComposedVideo(bundle.sections)) {
    throw new Error('not_single_composed_video_doc');
  }
  const { videoSections } = partitionSectionsForPublish(bundle.sections);
  const videoSlug = videoSections[0]?.slug;
  if (videoSlug && opts?.activateSection) {
    await opts.activateSection(videoSlug);
    await waitTwoFrames();
    await new Promise((r) => setTimeout(r, 200));
  }
  const root0 =
    opts?.exportRoot ||
    findComposeExportRoot();
  if (!root0) {
    throw new Error('compose_export_root_missing');
  }
  const root = await waitForUntaintedComposeVideos(root0);

  const encoded = await composePageToVideo(root, { onProgress: opts?.onProgress });
  const canTemplate = opts?.canPublishPublicTemplate === true;
  const targets = assertAggregatorTargetsAllowed(
    opts?.aggregatorTargets?.length ? opts.aggregatorTargets : ['browse'],
    canTemplate
  );
  const asTemplate = targets.includes('pen-templates');
  const form = getClass(bundle.manifest.classId);
  const lineageId =
    bundle.manifest.basedOnTemplateId || bundle.manifest.templateId;
  const licensing = licensingForPublish(
    bundle.manifest.licensing,
    bundle.manifest.ownerPnHash,
    {
      membership: canTemplate,
      connectReady: opts?.connectReady,
      musicAsset: bundle.manifest.classId === 'library.music'
    }
  );

  const meta: PenComposedMediaHandoffMeta = {
    contentClass: 'media',
    fileType: 'video',
    title: bundle.manifest.title || 'Untitled',
    docId: bundle.manifest.docId,
    templateId: bundle.manifest.templateId,
    headProof:
      bundle.chain.links[bundle.chain.links.length - 1] || bundle.chain.genesis,
    aggregatorTargets: targets,
    penClassId: bundle.manifest.classId,
    penCategoryId: form?.parentId,
    penIrRef: { objectId: bundle.manifest.docId },
    licensing,
    awaitingComposedBlobs: true,
    videoContentType: encoded.videoContentType,
    durationMs: encoded.durationMs,
    width: encoded.width,
    height: encoded.height,
    ...(asTemplate
      ? {
          penTemplateKind: (bundle.manifest.basedOnTemplateId
            ? 'remix'
            : 'template') as 'template' | 'remix',
          basedOnTemplateId: lineageId
        }
      : {})
  };

  const json = JSON.stringify(meta);
  sessionStorage.setItem(`${PEN_PUBLISH_PREFIX}${bundle.manifest.docId}`, json);

  openBrowseWithComposedMediaHandoff(meta, {
    videoBlob: encoded.videoBlob,
    posterBlob: encoded.posterBlob
  });
  return meta;
}

function waitTwoFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/**
 * Mixed / multi-video: encode each video section (activate in the editor), keep
 * other sections as Note pages, hand off as a collection in page order.
 */
export async function writeMixedPagesPublishHandoff(
  bundle: LocalDocBundle,
  opts: {
    aggregatorTargets?: string[];
    activateSection: (slug: string) => void | Promise<void>;
    onProgress?: (pct: number) => void;
    canPublishPublicTemplate?: boolean;
    connectReady?: boolean;
  }
): Promise<PenMixedPageHandoffMeta> {
  if (!shouldPublishAsMixedPages(bundle.sections)) {
    throw new Error('not_mixed_pages_doc');
  }
  const { videoSections } = partitionSectionsForPublish(bundle.sections);
  const presentation = bundle.manifest.pagePresentation || defaultPagePresentation();
  const videos: Array<{
    slug: string;
    videoBlob: Blob;
    posterBlob: Blob;
    contentType: string;
  }> = [];

  for (let i = 0; i < videoSections.length; i++) {
    const sec = videoSections[i]!;
    opts.onProgress?.(Math.round((i / Math.max(videoSections.length, 1)) * 80));
    await opts.activateSection(sec.slug);
    await waitTwoFrames();
    // Allow video elements to attach
    await new Promise((r) => setTimeout(r, 200));
    const root0 = findComposeExportRoot();
    if (!root0) throw new Error('compose_export_root_missing');
    const root = await waitForUntaintedComposeVideos(root0);
    const encoded = await composePageToVideo(root, {
      onProgress: (p) => {
        const base = (i / videoSections.length) * 80;
        opts.onProgress?.(Math.round(base + (p / 100) * (80 / videoSections.length)));
      }
    });
    videos.push({
      slug: sec.slug,
      videoBlob: encoded.videoBlob,
      posterBlob: encoded.posterBlob,
      contentType: encoded.videoContentType
    });
  }

  const videoIndexBySlug = new Map(videos.map((v, i) => [v.slug, i]));
  const pages: PenMixedPageHandoffMeta['pages'] = [];
  for (const raw of bundle.sections) {
    const slug = raw.slug;
    if (videoIndexBySlug.has(slug)) {
      pages.push({ kind: 'video', slug, videoIndex: videoIndexBySlug.get(slug)! });
      continue;
    }
    const text = docToPlainText(raw.doc).trim();
    if (!text) continue;
    const sec = normalizeSection(raw);
    const base = mergePagePresentation(presentation);
    pages.push({
      kind: 'note',
      slug,
      content: text,
      style: { ...base, textStyle: inferPageTextStyle(sec.doc) },
      doc: raw.doc
    });
  }

  const canTemplate = opts.canPublishPublicTemplate === true;
  const targets = assertAggregatorTargetsAllowed(
    opts.aggregatorTargets?.length ? opts.aggregatorTargets : ['browse'],
    canTemplate
  );
  const asTemplate = targets.includes('pen-templates');
  const form = getClass(bundle.manifest.classId);
  const lineageId =
    bundle.manifest.basedOnTemplateId || bundle.manifest.templateId;
  const licensing = licensingForPublish(
    bundle.manifest.licensing,
    bundle.manifest.ownerPnHash,
    {
      membership: canTemplate,
      connectReady: opts.connectReady,
      musicAsset: bundle.manifest.classId === 'library.music'
    }
  );

  const meta: PenMixedPageHandoffMeta = {
    contentClass: 'collection',
    title: bundle.manifest.title || 'Untitled',
    docId: bundle.manifest.docId,
    templateId: bundle.manifest.templateId,
    headProof:
      bundle.chain.links[bundle.chain.links.length - 1] || bundle.chain.genesis,
    aggregatorTargets: targets,
    penClassId: bundle.manifest.classId,
    penCategoryId: form?.parentId,
    penIrRef: { objectId: bundle.manifest.docId },
    licensing,
    awaitingComposedBlobs: true,
    pages,
    videoCount: videos.length,
    ...(asTemplate
      ? {
          penTemplateKind: (bundle.manifest.basedOnTemplateId
            ? 'remix'
            : 'template') as 'template' | 'remix',
          basedOnTemplateId: lineageId
        }
      : {})
  };

  sessionStorage.setItem(
    `${PEN_PUBLISH_PREFIX}${bundle.manifest.docId}`,
    JSON.stringify(meta)
  );
  opts.onProgress?.(100);
  openBrowseWithMixedPagesHandoff(
    meta,
    videos.map((v) => ({
      videoBlob: v.videoBlob,
      posterBlob: v.posterBlob,
      contentType: v.contentType
    }))
  );
  return meta;
}

export function saveAsPersonalTemplate(
  pn: string,
  bundle: LocalDocBundle,
  title?: string
): { templateId: string; title: string } {
  const tpl = savePersonalTemplateFromDoc(pn, bundle, { title });
  schedulePrefsCloudPush(pn);
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
  const shape = libraryShapeForProject(bundle.manifest.classId);
  const mapped = mapProjectSectionsToLibrary(bundle, shape.sections);
  const tpl = savePersonalTemplateFromDoc(pn, bundle, {
    title: `${bundle.manifest.title || 'Untitled'} (Library)`,
    classId: shape.classId,
    docType: shape.docType,
    basedOnTemplateId: bundle.manifest.templateId,
    sections: shape.sections.map((s) => ({
      slug: s.slug,
      title: s.title,
      required: s.required !== false
    })),
    seedSections: mapped.sections
  });
  schedulePrefsCloudPush(pn);
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
  const shape = libraryShapeForProject(bundle.manifest.classId);
  const docId = randomDocId();
  const now = new Date().toISOString();
  const mapped = mapProjectSectionsToLibrary(bundle, shape.sections);

  const commitment = hashSectionContent(
    new TextEncoder().encode(JSON.stringify(mapped.sections))
  );
  const keys = resolveSigningKeys(session);
  let genesis = signGenesis({
    docId,
    templateId: `blank.${shape.classId}`,
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
      title: bundle.manifest.title || `Untitled ${shape.classId}`,
      docType: shape.docType,
      classId: shape.classId,
      templateId: `blank.${shape.classId}`,
      templateVersion: '1',
      groupId,
      toc: mapped.toc,
      createdAt: now,
      updatedAt: now,
      genesisProof: genesis,
      pageLayout: bundle.manifest.pageLayout || 'letter',
      pagePresentation: bundle.manifest.pagePresentation || defaultPagePresentation(),
      lifecycle: 'published',
      ownerPnHash: hashPnIdentifier(session.pnIdentifier),
      licensing: normalizeLicensingRoot(
        bundle.manifest.licensing,
        hashPnIdentifier(session.pnIdentifier)
      )
    },
    sections: mapped.sections,
    chain: { docId, genesis, links: [] }
  };
  saveLocalDoc(session.pnIdentifier, next);
  try {
    const { bootstrapDocCloud } = await import('./penCloudStore');
    const draftId = `draft_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    await bootstrapDocCloud({
      userPnIdentifier: session.pnIdentifier,
      bundle: next,
      draft: {
        draftId,
        docId,
        authorPnHash: hashPnIdentifier(session.pnIdentifier),
        createdAt: now,
        updatedAt: now,
        status: 'unfinished',
        toc: mapped.toc
      }
    });
    await publishDocCloudFinished(session.pnIdentifier, next);
  } catch {
    /* offline — local buffer; sync queue later */
  }
  return next;
}

async function publishDocCloudFinished(
  userPnIdentifier: string,
  bundle: LocalDocBundle
): Promise<void> {
  const { publishDocCloud } = await import('./penCloudStore');
  await publishDocCloud({
    userPnIdentifier,
    manifest: bundle.manifest,
    sections: bundle.sections
  });
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
      basedOnTemplateId: personal.basedOnTemplateId || personal.id,
      toc: sections.map((s) => s.slug),
      updatedAt: new Date().toISOString()
    }
  };
  saveLocalDoc(input.session.pnIdentifier, next);
  return next;
}

/**
 * Create a Social Set that ports selected My Library docs in as live penEmbed refs.
 * (Projects journal starters retired — Set is the Social multi-ref container.)
 */
export async function createProjectFromLibrary(input: {
  session: PenSession;
  sourceDocs: Array<{ docId: string; title: string }>;
  title?: string;
}): Promise<LocalDocBundle> {
  if (!input.sourceDocs.length) throw new Error('library_sources_required');
  const bundle = await createDocFromTemplate({
    session: input.session,
    templateId: 'set.basic.v1'
  });
  const embeds = input.sourceDocs.map((d) => ({
    type: 'penEmbed',
    attrs: {
      docId: d.docId,
      sectionSlug: null,
      title: d.title || 'Untitled'
    }
  }));
  const sourcesDoc = {
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
    s.slug === 'sources' ? { ...s, doc: sourcesDoc as typeof s.doc } : s
  );
  const title =
    input.title?.trim() ||
    (input.sourceDocs.length === 1
      ? `Set · ${input.sourceDocs[0]!.title || 'Untitled'}`
      : `Set · ${input.sourceDocs.length} sources`);
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
