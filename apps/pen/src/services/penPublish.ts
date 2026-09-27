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
import type { PenLicensingRoot } from '@par-noir/pen-protocol';
import {
  licensingForPublish,
  PUBLIC_TEMPLATE_REQUIRES_VERIFICATION
} from './penPublishGates';
import { publishPublicCloudFile, renderNotePoster, type CloudRequest } from './penPublicPublish';

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
  penClassId?: string;
  penCategoryId?: string;
  penDocId: string;
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
  const form = getClass(bundle.manifest.classId);
  const licensing = licensingForPublish(
    bundle.manifest.licensing,
    bundle.manifest.ownerPnHash,
    {
      membership: opts?.canPublishPublicTemplate === true,
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
    penClassId: bundle.manifest.classId,
    penCategoryId: form?.parentId,
    penDocId: bundle.manifest.docId,
    penIrRef: { objectId: bundle.manifest.docId },
    licensing,
    ...(bundle.manifest.audioSotDocId
      ? { musicPenDocId: bundle.manifest.audioSotDocId }
      : {})
  };
  return payload;
}

export type ComposedVideoPublish = {
  contentClass: 'media';
  fileType: 'video';
  title: string;
  docId: string;
  templateId?: string;
  headProof?: unknown;
  penClassId?: string;
  penCategoryId?: string;
  penDocId: string;
  penIrRef: { objectId: string };
  licensing: PenLicensingRoot;
  videoContentType: string;
  videoBlob: Blob;
  posterBlob: Blob;
};

/**
 * Encode the live page surface on the device.
 * Requires `[data-pen-compose-export-root]` in the DOM (EditablePagePreview sheet).
 */
export async function writeComposedVideoPublishHandoff(
  bundle: LocalDocBundle,
  opts?: {
    exportRoot?: HTMLElement | null;
    activateSection?: (slug: string) => void | Promise<void>;
    onProgress?: (pct: number) => void;
    canPublishPublicTemplate?: boolean;
    connectReady?: boolean;
  }
): Promise<ComposedVideoPublish> {
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
  const form = getClass(bundle.manifest.classId);
  const licensing = licensingForPublish(
    bundle.manifest.licensing,
    bundle.manifest.ownerPnHash,
    {
      membership: opts?.canPublishPublicTemplate === true,
      connectReady: opts?.connectReady,
      musicAsset: bundle.manifest.classId === 'library.music'
    }
  );

  return {
    contentClass: 'media',
    fileType: 'video',
    title: bundle.manifest.title || 'Untitled',
    docId: bundle.manifest.docId,
    templateId: bundle.manifest.templateId,
    headProof:
      bundle.chain.links[bundle.chain.links.length - 1] || bundle.chain.genesis,
    penClassId: bundle.manifest.classId,
    penCategoryId: form?.parentId,
    penDocId: bundle.manifest.docId,
    penIrRef: { objectId: bundle.manifest.docId },
    licensing,
    videoContentType: encoded.videoContentType,
    videoBlob: encoded.videoBlob,
    posterBlob: encoded.posterBlob
  };
}

function waitTwoFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export type MixedPublishPage =
  | { kind: 'note'; slug: string; content: string; style?: unknown; doc?: unknown }
  | { kind: 'video'; slug: string; videoIndex: number };

export type MixedPagesPublish = {
  contentClass: 'collection';
  title: string;
  docId: string;
  templateId?: string;
  headProof?: unknown;
  penClassId?: string;
  penCategoryId?: string;
  penDocId: string;
  penIrRef: { objectId: string };
  licensing: PenLicensingRoot;
  pages: MixedPublishPage[];
  videos: Array<{ slug: string; videoBlob: Blob; posterBlob: Blob; contentType: string }>;
};

/**
 * Mixed / multi-video: encode each video section, keep other sections as Note pages.
 */
export async function writeMixedPagesPublishHandoff(
  bundle: LocalDocBundle,
  opts: {
    activateSection: (slug: string) => void | Promise<void>;
    onProgress?: (pct: number) => void;
    canPublishPublicTemplate?: boolean;
    connectReady?: boolean;
  }
): Promise<MixedPagesPublish> {
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
  const pages: MixedPublishPage[] = [];
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

  const form = getClass(bundle.manifest.classId);
  const licensing = licensingForPublish(
    bundle.manifest.licensing,
    bundle.manifest.ownerPnHash,
    {
      membership: opts.canPublishPublicTemplate === true,
      connectReady: opts.connectReady,
      musicAsset: bundle.manifest.classId === 'library.music'
    }
  );

  opts.onProgress?.(100);
  return {
    contentClass: 'collection',
    title: bundle.manifest.title || 'Untitled',
    docId: bundle.manifest.docId,
    templateId: bundle.manifest.templateId,
    headProof:
      bundle.chain.links[bundle.chain.links.length - 1] || bundle.chain.genesis,
    penClassId: bundle.manifest.classId,
    penCategoryId: form?.parentId,
    penDocId: bundle.manifest.docId,
    penIrRef: { objectId: bundle.manifest.docId },
    licensing,
    pages,
    videos
  };
}

function provenanceFor(
  bundle: LocalDocBundle,
  licensing: PenLicensingRoot,
  feedIds: string[]
): Record<string, unknown> {
  const form = getClass(bundle.manifest.classId);
  return {
    feedIds,
    penClassId: bundle.manifest.classId,
    penCategoryId: form?.parentId,
    penDocId: bundle.manifest.docId,
    penIrRef: { objectId: bundle.manifest.docId },
    templateId: bundle.manifest.templateId,
    headProof: bundle.chain.links[bundle.chain.links.length - 1] || bundle.chain.genesis,
    licensing,
    ...(bundle.manifest.audioSotDocId ? { musicPenDocId: bundle.manifest.audioSotDocId } : {})
  };
}

/** Publish the compiled post to the owner cloud. No template flag. */
export async function publishPostToOwnerCloud(params: {
  bundle: LocalDocBundle;
  feedIds: string[];
  pnIdentifier: string;
  membership: boolean;
  connectReady?: boolean;
  request?: CloudRequest;
  video?: ComposedVideoPublish;
  mixed?: MixedPagesPublish;
}): Promise<{ fileId: string }> {
  if (!params.feedIds.length) throw new Error('feed_required');
  const licensing = licensingForPublish(params.bundle.manifest.licensing, params.bundle.manifest.ownerPnHash, {
    membership: params.membership,
    connectReady: params.connectReady,
    musicAsset: params.bundle.manifest.classId === 'library.music'
  });
  const base = provenanceFor(params.bundle, licensing, params.feedIds);

  if (params.video) {
    const bytes = new Uint8Array(await params.video.videoBlob.arrayBuffer());
    return publishPublicCloudFile({
      request: params.request,
      bytes,
      fileName: `pen-${params.bundle.manifest.docId}.video`,
      title: params.video.title,
      poster: params.video.posterBlob,
      videoForSd: params.video.videoBlob,
      videoContentType: params.video.videoContentType,
      metadata: {
        ...base,
        fileType: 'video',
        contentClass: 'media',
        description: params.video.title
      }
    });
  }

  if (params.mixed) {
    const childIds: string[] = [];
    for (const page of params.mixed.pages) {
      if (page.kind === 'video') {
        const video = params.mixed.videos[page.videoIndex];
        if (!video) throw new Error(`missing_video_${page.videoIndex}`);
        const uploaded = await publishPublicCloudFile({
          request: params.request,
          bytes: new Uint8Array(await video.videoBlob.arrayBuffer()),
          fileName: `pen-${params.bundle.manifest.docId}-${page.slug}.video`,
          title: `${params.mixed.title} — ${page.slug}`,
          poster: video.posterBlob,
          videoForSd: video.videoBlob,
          videoContentType: video.contentType,
          metadata: {
            ...provenanceFor(params.bundle, licensing, ['collection-part']),
            fileType: 'video',
            contentClass: 'media',
            isPartOfCollection: true
          }
        });
        childIds.push(uploaded.fileId);
      } else {
        const textPost = { content: page.content, style: page.style || {} };
        const uploaded = await publishPublicCloudFile({
          request: params.request,
          bytes: new TextEncoder().encode(JSON.stringify({ textPost, version: '1.0' })),
          fileName: `pen-${params.bundle.manifest.docId}-${page.slug}.json`,
          title: `${params.mixed.title} — ${page.slug}`,
          metadata: {
            ...provenanceFor(params.bundle, licensing, ['collection-part']),
            fileType: 'note-collection-page',
            contentClass: 'note',
            textPost,
            isPartOfCollection: true
          }
        });
        childIds.push(uploaded.fileId);
      }
    }
    const poster = params.mixed.videos[0]?.posterBlob;
    return publishPublicCloudFile({
      request: params.request,
      bytes: new TextEncoder().encode(
        JSON.stringify({ collectionFileIds: childIds, title: params.mixed.title })
      ),
      fileName: `pen-${params.bundle.manifest.docId}.collection.json`,
      title: params.mixed.title,
      poster,
      metadata: {
        ...base,
        fileType: 'collection',
        contentClass: 'collection',
        collection: { collectionFileIds: childIds, title: params.mixed.title }
      }
    });
  }

  const compiled = await writeSocialPublishHandoff(params.bundle, {
    pnIdentifier: params.pnIdentifier,
    canPublishPublicTemplate: params.membership,
    connectReady: params.connectReady
  });
  const page = compiled.pages[0];
  const textPost = {
    content: page?.content || compiled.title,
    style: page?.style || {}
  };
  const poster = await renderNotePoster(compiled.title, textPost.content);
  return publishPublicCloudFile({
    request: params.request,
    bytes: new TextEncoder().encode(
      JSON.stringify({ textPost, pages: compiled.pages, version: '1.0' })
    ),
    fileName: `pen-${params.bundle.manifest.docId}.json`,
    title: compiled.title,
    poster,
    metadata: {
      ...base,
      fileType: compiled.contentClass === 'collection' ? 'collection' : 'note',
      contentClass: compiled.contentClass,
      textPost,
      description: textPost.content
    }
  });
}

/**
 * Second step: verified author publishes the raw doc for reuse under its own license.
 * Requires the monetized post to exist first.
 */
export async function publishTemplateToOwnerCloud(params: {
  bundle: LocalDocBundle;
  templateLicensing: PenLicensingRoot;
  verified: boolean;
  pnIdentifier: string;
  connectReady?: boolean;
  request?: CloudRequest;
}): Promise<{ fileId: string }> {
  if (!params.verified) throw new Error(PUBLIC_TEMPLATE_REQUIRES_VERIFICATION);
  const postFileId = params.bundle.manifest.publishedFileId;
  if (!postFileId) throw new Error('post_required_before_template');
  const licensing = licensingForPublish(params.templateLicensing, params.bundle.manifest.ownerPnHash, {
    membership: true,
    connectReady: params.connectReady,
    musicAsset: params.bundle.manifest.classId === 'library.music'
  });
  const compiled = await writeSocialPublishHandoff(params.bundle, {
    pnIdentifier: params.pnIdentifier,
    canPublishPublicTemplate: true,
    connectReady: params.connectReady
  });
  const page = compiled.pages[0];
  const textPost = { content: page?.content || compiled.title, style: page?.style || {} };
  const ir = {
    manifest: params.bundle.manifest,
    sections: params.bundle.sections,
    licensing
  };
  const poster = await renderNotePoster(compiled.title, textPost.content);
  const kind = params.bundle.manifest.basedOnTemplateId ? 'remix' : 'template';
  return publishPublicCloudFile({
    request: params.request,
    bytes: new TextEncoder().encode(JSON.stringify(ir)),
    fileName: `pen-template-${params.bundle.manifest.docId}.json`,
    title: compiled.title,
    poster,
    metadata: {
      ...provenanceFor(params.bundle, licensing, ['pen-templates']),
      fileType: 'note',
      contentClass: compiled.contentClass === 'media' ? 'note' : compiled.contentClass,
      textPost,
      description: textPost.content,
      penTemplateKind: kind,
      basedOnFileId: postFileId,
      basedOnTemplateId: params.bundle.manifest.basedOnTemplateId || params.bundle.manifest.templateId
    }
  });
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
