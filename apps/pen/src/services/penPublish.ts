/** Publish destinations: Social, personal/Library templates, finished Library docs. */

import {
  compileDocumentToNote,
  compileSetToNote,
  defaultPagePresentation,
  emptySection,
  getClass,
  hashPnIdentifier,
  pageTitleFor,
  templateForDoc,
  hashSectionContent,
  signGenesis,
  attachNotary,
  notaryHashForGenesis,
  snapshotPenEmbeds,
  normalizeLicensingRoot,
  shouldPublishAsMixedPages,
  shouldPublishAsSocialTocCollection,
  shouldPublishSocialAsCollection,
  sectionIsFeedPage,
  sectionHasVisibleVideoLayer,
  feedPagePlainText,
  audioPublishPlan,
  collectActionOverlays,
  buildActionStageHtml,
  stripPollSpreadsheet,
  stripPollSpreadsheetFromSection,
  type PenDocManifest,
  type PenEmbedResolveResult,
  type PenSectionContent,
  type ResolvePenEmbed
} from '@par-noir/pen-protocol';
import { composedMaster, type ComposePageVideoResult } from './composePageVideoEncode';
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
import {
  defaultCloudRequest,
  posterPreview,
  publishPublicCloudFile,
  renderNotePoster,
  type CloudRequest
} from './penPublicPublish';
import type { FeedPublishExtras } from './penFeedMetadata';
import { metadataFieldsFromPublishForm } from './penFeedMetadata';
import { isTemplatesCatalogClass } from './classFeedRailItems';
import { ensureShareFeedIds } from './penFeedTargets';
import { penFeedPageForSection, penPresentationFields } from './penFeedPagePublish';

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
  const tpl = templateForDoc(bundle.manifest, bundle.sections);
  const isSet = tpl.id === 'set.basic.v1' || tpl.docType === 'set' || bundle.manifest.docType === 'set';
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
        template: tpl,
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
    ...(() => {
      const licensed = audioPublishPlan(bundle.sections).licensedDocId || '';
      return licensed ? { musicPenDocId: licensed } : {};
    })()
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
  /** The page this video is. */
  slug: string;
  /** CDN variants at tier sizes; `composedMaster` is the canonical file. */
  previews: ComposePageVideoResult;
};

/** The editor mounts each page and flattens it; publish only orders and uploads the results. */
export type PageExport = {
  /** One image of the page's non-action layers. */
  flattenSection: (slug: string) => Promise<Blob>;
  /** One timeline video of the page's non-action layers, with its sound mixed in. */
  encodeSection: (
    slug: string,
    onProgress?: (pct: number) => void
  ) => Promise<ComposePageVideoResult>;
};

/**
 * A page publishes as one video when it shows any video (a video layer or the page
 * background video) or carries its own sound, which only a video file can hold.
 * Every other page publishes as one image.
 */
export function pagePublishesAsVideo(
  section: PenSectionContent,
  manifest: Pick<PenDocManifest, 'pagePresentation'>
): boolean {
  if (sectionHasVisibleVideoLayer(section)) return true;
  if (manifest.pagePresentation?.backgroundVideo?.trim()) return true;
  return audioPublishPlan([section]).own.length > 0;
}

/** The page a single-page post publishes: its first feed page in toc order. */
export function singlePublishSection(bundle: LocalDocBundle): PenSectionContent | undefined {
  const ordered = sectionsInTocOrder(bundle);
  return ordered.find((section) => sectionIsFeedPage(section)) || ordered[0];
}

/** A single-page post whose page publishes as video. */
export async function writeComposedVideoPublishHandoff(
  bundle: LocalDocBundle,
  opts: Pick<PageExport, 'encodeSection'> & {
    slug: string;
    onProgress?: (pct: number) => void;
    canPublishPublicTemplate?: boolean;
    connectReady?: boolean;
  }
): Promise<ComposedVideoPublish> {
  const encoded = await opts.encodeSection(opts.slug, opts.onProgress);
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
    slug: opts.slug,
    previews: encoded
  };
}

export type MixedPublishPage =
  | { kind: 'video'; slug: string; videoIndex: number }
  | { kind: 'raster'; slug: string; posterBlob: Blob; description?: string };

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
  videos: Array<{ slug: string; previews: ComposePageVideoResult }>;
};

/** Flatten each page in order: video pages encode, every other page becomes one image. */
async function exportPages(
  bundle: LocalDocBundle,
  sections: PenSectionContent[],
  opts: PageExport & { onProgress?: (pct: number) => void }
): Promise<Pick<MixedPagesPublish, 'pages' | 'videos'>> {
  const pages: MixedPublishPage[] = [];
  const videos: MixedPagesPublish['videos'] = [];
  const total = Math.max(sections.length, 1);
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    const slug = section.slug;
    const base = (i / total) * 95;
    opts.onProgress?.(Math.round(base));
    if (pagePublishesAsVideo(section, bundle.manifest)) {
      const previews = await opts.encodeSection(slug, (p) =>
        opts.onProgress?.(Math.round(base + (p / 100) * (95 / total)))
      );
      videos.push({ slug, previews });
      pages.push({ kind: 'video', slug, videoIndex: videos.length - 1 });
    } else {
      const description = feedPagePlainText(section);
      pages.push({
        kind: 'raster',
        slug,
        posterBlob: await opts.flattenSection(slug),
        ...(description ? { description } : {})
      });
    }
  }
  return { pages, videos };
}

/** Video pages beside other feed pages, in toc order. */
export async function writeMixedPagesPublishHandoff(
  bundle: LocalDocBundle,
  opts: PageExport & {
    onProgress?: (pct: number) => void;
    canPublishPublicTemplate?: boolean;
    connectReady?: boolean;
  }
): Promise<MixedPagesPublish> {
  if (!shouldPublishAsMixedPages(bundle.sections)) {
    throw new Error('not_mixed_pages_doc');
  }
  const { pages, videos } = await exportPages(
    bundle,
    sectionsInTocOrder(bundle).filter((section) => sectionIsFeedPage(section)),
    opts
  );

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

/**
 * Social toggle + 2+ TOC pages: one collection child per TOC section, including
 * pages that only hold action layers.
 */
export async function writeSocialTocCollectionHandoff(
  bundle: LocalDocBundle,
  opts: PageExport & {
    onProgress?: (pct: number) => void;
    canPublishPublicTemplate?: boolean;
    connectReady?: boolean;
  }
): Promise<MixedPagesPublish> {
  const manifest = bundle.manifest;
  if (
    !shouldPublishAsSocialTocCollection({
      classId: manifest.classId,
      isSocial: manifest.isSocial,
      toc: manifest.toc,
      sections: bundle.sections
    })
  ) {
    throw new Error('not_social_toc_collection');
  }
  const { pages, videos } = await exportPages(bundle, sectionsInTocOrder(bundle), opts);

  if (pages.length < 2) throw new Error('not_social_toc_collection');

  const form = getClass(manifest.classId);
  const licensing = licensingForPublish(manifest.licensing, manifest.ownerPnHash, {
    membership: opts.canPublishPublicTemplate === true,
    connectReady: opts.connectReady,
    musicAsset: manifest.classId === 'library.music'
  });

  opts.onProgress?.(100);
  return {
    contentClass: 'collection',
    title: manifest.title || 'Untitled',
    docId: manifest.docId,
    templateId: manifest.templateId,
    headProof: bundle.chain.links[bundle.chain.links.length - 1] || bundle.chain.genesis,
    penClassId: manifest.classId,
    penCategoryId: form?.parentId,
    penDocId: manifest.docId,
    penIrRef: { objectId: manifest.docId },
    licensing,
    pages,
    videos
  };
}

function sectionBySlug(
  bundle: LocalDocBundle,
  slug: string
): PenSectionContent | undefined {
  return bundle.sections.find((section) => section.slug === slug);
}

/** Per-page metadata on a collection part: action overlay, slug for `slug:` jumps, and the page title. */
function collectionPartPageMeta(bundle: LocalDocBundle, slug: string): Record<string, unknown> {
  const section = sectionBySlug(bundle, slug);
  const index = Math.max(0, bundle.manifest.toc.indexOf(slug));
  return {
    ...(section ? { penFeedPage: penFeedPageForSection(section, bundle.manifest) } : {}),
    penPageSlug: slug,
    penPageTitle: pageTitleFor(
      bundle.manifest,
      templateForDoc(bundle.manifest, bundle.sections),
      slug,
      index
    )
  };
}

function sectionsInTocOrder(bundle: LocalDocBundle): PenSectionContent[] {
  const bySlug = new Map(bundle.sections.map((section) => [section.slug, section]));
  const toc = bundle.manifest.toc || [];
  const ordered: PenSectionContent[] = [];
  for (const slug of toc) {
    const section = bySlug.get(slug);
    if (section) ordered.push(section);
  }
  for (const section of bundle.sections) {
    if (!toc.includes(section.slug)) ordered.push(section);
  }
  return ordered;
}

/**
 * Pages of a multipage social post with no video layers, in toc order.
 * The cloud writer uploads each page, then a parent with collectionFileIds.
 */
export async function writeTextCollectionHandoff(
  bundle: LocalDocBundle,
  opts: PageExport & {
    onProgress?: (pct: number) => void;
    canPublishPublicTemplate?: boolean;
    connectReady?: boolean;
  }
): Promise<MixedPagesPublish> {
  const template = templateForDoc(bundle.manifest, bundle.sections);
  if (
    !shouldPublishSocialAsCollection({
      classId: bundle.manifest.classId,
      isSocial: bundle.manifest.isSocial,
      toc: bundle.manifest.toc,
      publishContentClass: template.publishContentClass,
      templateSectionSlugs: template.sections.map((section) => section.slug),
      sections: bundle.sections
    }) ||
    shouldPublishAsSocialTocCollection({
      classId: bundle.manifest.classId,
      isSocial: bundle.manifest.isSocial,
      toc: bundle.manifest.toc,
      sections: bundle.sections
    }) ||
    shouldPublishAsMixedPages(bundle.sections)
  ) {
    throw new Error('not_text_collection');
  }
  const feedPages = sectionsInTocOrder(bundle).filter((section) => sectionIsFeedPage(section));
  if (feedPages.length < 2) throw new Error('not_text_collection');
  const { pages, videos } = await exportPages(bundle, feedPages, opts);
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
  return {
    contentClass: 'collection',
    title: bundle.manifest.title || 'Untitled',
    docId: bundle.manifest.docId,
    templateId: bundle.manifest.templateId,
    headProof: bundle.chain.links[bundle.chain.links.length - 1] || bundle.chain.genesis,
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
  const licensed = audioPublishPlan(bundle.sections).licensedDocId || '';
  return {
    feedIds,
    penClassId: bundle.manifest.classId,
    penCategoryId: form?.parentId,
    penDocId: bundle.manifest.docId,
    penIrRef: { objectId: bundle.manifest.docId },
    templateId: bundle.manifest.templateId,
    headProof: bundle.chain.links[bundle.chain.links.length - 1] || bundle.chain.genesis,
    licensing,
    ...(licensed ? { musicPenDocId: licensed } : {})
  };
}

async function publicFolderFor(
  pnIdentifier: string,
  docId: string,
  explicit?: string
): Promise<string> {
  if (explicit) return explicit;
  const [{ ensureDocChildFolder }, { penSessionDrive }] = await Promise.all([
    import('@par-noir/device-cloud-credentials'),
    import('./penDriveLibrary')
  ]);
  const drive = await penSessionDrive(pnIdentifier);
  return ensureDocChildFolder(drive.accessToken, drive.index.pnFolderId, docId, 'public');
}

/** Clickable overlay specs for a post. Includes the tracking spreadsheet when the group has one. */
export function actionOverlaysForPost(
  sections: LocalDocBundle['sections'],
  docId?: string
): ReturnType<typeof collectActionOverlays> {
  return collectActionOverlays(sections, docId);
}

/** Overlay HTML stored beside actionOverlays. Inert media is not in this string. */
export function actionStageHtmlForPost(sections: LocalDocBundle['sections']): string {
  return buildActionStageHtml(sections);
}

export type PublishPostTarget =
  | { kind: 'new' }
  | { kind: 'update'; fileId: string };

type PriorPublishedRow = {
  collectionFileIds: string[];
  companionAudioFileIds: string[];
};

async function loadPriorPublishedRow(
  request: CloudRequest | undefined,
  fileId: string
): Promise<PriorPublishedRow> {
  const req = request || defaultCloudRequest();
  const res = await req(
    'GET',
    `/api/aggregator/metadata-index/${encodeURIComponent(fileId)}`
  );
  if (!res.ok) return { collectionFileIds: [], companionAudioFileIds: [] };
  const data = (await res.json()) as { metadata?: Record<string, unknown> };
  const meta = data.metadata || {};
  const collection =
    meta.collection && typeof meta.collection === 'object'
      ? (meta.collection as { collectionFileIds?: unknown })
      : null;
  const collectionFileIds = Array.isArray(collection?.collectionFileIds)
    ? collection!.collectionFileIds!.filter((id): id is string => typeof id === 'string' && !!id)
    : [];
  const companionAudioFileIds = Array.isArray(meta.companionAudioFileIds)
    ? meta.companionAudioFileIds.filter((id): id is string => typeof id === 'string' && !!id)
    : [];
  return { collectionFileIds, companionAudioFileIds };
}

/** Delete superseded collection children / companion audio after an in-place post update. */
async function deleteSupersededIndexRows(
  request: CloudRequest | undefined,
  fileIds: string[]
): Promise<void> {
  if (!fileIds.length) return;
  const req = request || defaultCloudRequest();
  for (const id of fileIds) {
    const res = await req(
      'DELETE',
      `/api/aggregator/metadata-index/${encodeURIComponent(id)}`
    );
    if (res.ok || res.status === 404) continue;
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`cleanup_prior_child_${res.status} ${text}`);
  }
}

/** Template publish still supersedes the prior template row (separate from social posts). */
async function supersedePriorPublishedPost(
  request: CloudRequest | undefined,
  priorFileId: string | undefined
): Promise<void> {
  const trimmed = priorFileId?.trim();
  if (!trimmed) return;
  const req = request || defaultCloudRequest();
  const res = await req(
    'DELETE',
    `/api/aggregator/metadata-index/${encodeURIComponent(trimmed)}`
  );
  if (res.ok || res.status === 404) return;
  const text = await res.text().catch(() => res.statusText);
  throw new Error(`supersede_prior_publish_${res.status} ${text}`);
}

/** Publish the compiled post to the owner cloud. No template flag. */
export async function refreshPublishedPostLicensing(params: {
  fileId: string;
  bundle: LocalDocBundle;
  membership: boolean;
  connectReady?: boolean;
  request?: CloudRequest;
  session?: PenSession;
}): Promise<void> {
  const req = params.request ?? defaultCloudRequest();
  let licensing = licensingForPublish(
    params.bundle.manifest.licensing,
    params.bundle.manifest.ownerPnHash,
    {
      membership: params.membership,
      connectReady: params.connectReady,
      musicAsset: params.bundle.manifest.classId === 'library.music'
    }
  );
  if (params.session) {
    const { attachImpliedContractProofs } = await import('./openContractProofs');
    licensing = await attachImpliedContractProofs(
      params.session,
      licensing,
      params.bundle.manifest.docId,
      params.bundle.manifest.ownerPnHash || ''
    );
  }
  const put = await req(
    'PUT',
    `/api/aggregator/metadata-index/${encodeURIComponent(params.fileId)}`,
    { licensing }
  );
  if (!put.ok) {
    const text = await put.text().catch(() => put.statusText);
    throw new Error(`licensing_snapshot_refresh_${put.status} ${text}`);
  }
}

export async function publishPostToOwnerCloud(params: {
  bundle: LocalDocBundle;
  feedIds: string[];
  pnIdentifier: string;
  membership: boolean;
  connectReady?: boolean;
  session?: PenSession;
  request?: CloudRequest;
  /** par-noir-pen/{docId}/public/. Resolved when omitted. */
  parentFolderId?: string;
  video?: ComposedVideoPublish;
  mixed?: MixedPagesPublish;
  /** Single-page post whose page flattens to one image. */
  image?: { slug: string; posterBlob: Blob };
  feedPublish?: FeedPublishExtras;
  /** Default new. Update keeps the same fileId so engagement is preserved. */
  target?: PublishPostTarget;
}): Promise<{
  fileId: string;
  penFeedMediaBySlug?: PenDocManifest['penFeedMediaBySlug'];
}> {
  if (!params.feedIds.length) throw new Error('feed_required');
  const penFeedMediaBySlug: NonNullable<PenDocManifest['penFeedMediaBySlug']> = {};
  const target: PublishPostTarget = params.target || { kind: 'new' };
  const replaceFileId =
    target.kind === 'update' ? target.fileId.trim() || undefined : undefined;
  if (target.kind === 'update' && !replaceFileId) {
    throw new Error('update_requires_file_id');
  }
  const prior =
    replaceFileId
      ? await loadPriorPublishedRow(params.request, replaceFileId)
      : { collectionFileIds: [] as string[], companionAudioFileIds: [] as string[] };
  const publishMeta = params.feedPublish
    ? metadataFieldsFromPublishForm(params.feedPublish.metadata)
    : {};
  const publishTitle =
    (typeof publishMeta.title === 'string' && publishMeta.title) ||
    params.bundle.manifest.title ||
    'Untitled';
  const indexingPermissions = params.feedPublish?.indexingPermissions;
  const parentFolderId = await publicFolderFor(
    params.pnIdentifier,
    params.bundle.manifest.docId,
    params.parentFolderId
  );
  let licensing = licensingForPublish(params.bundle.manifest.licensing, params.bundle.manifest.ownerPnHash, {
    membership: params.membership,
    connectReady: params.connectReady,
    musicAsset: params.bundle.manifest.classId === 'library.music'
  });
  if (params.session) {
    const { attachImpliedContractProofs } = await import('./openContractProofs');
    licensing = await attachImpliedContractProofs(
      params.session,
      licensing,
      params.bundle.manifest.docId,
      params.bundle.manifest.ownerPnHash || ''
    );
  }
  if (!params.video && !params.mixed && !params.image) throw new Error('publish_page_required');
  const effectiveFeedIds = ensureShareFeedIds(
    params.feedIds,
    params.mixed != null ? 'collection' : 'media'
  );
  const base = provenanceFor(params.bundle, licensing, effectiveFeedIds);
  const actionOverlays = actionOverlaysForPost(params.bundle.sections, params.bundle.manifest.docId);
  const actionStageHtml = actionStageHtmlForPost(params.bundle.sections);
  const overlayMeta = {
    ...(actionOverlays.length ? { actionOverlays } : {}),
    ...(actionStageHtml ? { actionStageHtml } : {})
  };
  const caption =
    typeof publishMeta.description === 'string' ? publishMeta.description : undefined;

  if (params.image) {
    const { slug, posterBlob } = params.image;
    const section = sectionBySlug(params.bundle, slug);
    const uploaded = await publishPublicCloudFile({
      request: params.request,
      parentFolderId,
      bytes: new Uint8Array(await posterBlob.arrayBuffer()),
      fileName: `pen-${params.bundle.manifest.docId}.${posterBlob.type === 'image/png' ? 'png' : 'jpg'}`,
      title: publishTitle,
      previews: posterPreview(posterBlob, posterBlob.type || 'image/jpeg'),
      indexingPermissions,
      replaceFileId,
      metadata: {
        ...publishMeta,
        ...base,
        ...overlayMeta,
        ...penPresentationFields(params.bundle.manifest),
        ...(section
          ? { penFeedPage: penFeedPageForSection(section, params.bundle.manifest) }
          : {}),
        fileType: 'image',
        contentClass: 'media',
        description: caption || (section ? feedPagePlainText(section) : '') || publishTitle
      }
    });
    penFeedMediaBySlug[slug] = { ref: `penmedia:${uploaded.fileId}`, kind: 'image' };
    await cleanupAfterUpdate({ request: params.request, prior, keepChildren: [] });
    return { fileId: uploaded.fileId, penFeedMediaBySlug };
  }

  if (params.video) {
    const bytes = new Uint8Array(await composedMaster(params.video.previews).blob.arrayBuffer());
    const videoSlug = params.video.slug;
    const videoSection = sectionBySlug(params.bundle, videoSlug);
    const videoPageMeta = videoSection
      ? { penFeedPage: penFeedPageForSection(videoSection, params.bundle.manifest) }
      : {};
    const uploaded = await publishPublicCloudFile({
      request: params.request,
      parentFolderId,
      bytes,
      fileName: `pen-${params.bundle.manifest.docId}.video`,
      title: publishTitle,
      previews: params.video.previews,
      indexingPermissions,
      replaceFileId,
      metadata: {
        ...publishMeta,
        ...base,
        ...overlayMeta,
        ...penPresentationFields(params.bundle.manifest),
        ...videoPageMeta,
        fileType: 'video',
        contentClass: 'media',
        description: caption || params.video.title
      }
    });
    penFeedMediaBySlug[videoSlug] = { ref: `penmedia:${uploaded.fileId}`, kind: 'video' };
    await cleanupAfterUpdate({ request: params.request, prior, keepChildren: [] });
    return { fileId: uploaded.fileId, penFeedMediaBySlug };
  }

  const mixed = params.mixed!;
  const childIds: string[] = [];
  let parentPoster: Blob | undefined;
  const docId = params.bundle.manifest.docId;
  for (const page of mixed.pages) {
    const partMeta = {
      ...publishMeta,
      ...provenanceFor(params.bundle, licensing, ['collection-part']),
      ...collectionPartPageMeta(params.bundle, page.slug),
      contentClass: 'media',
      isPartOfCollection: true
    };
    if (page.kind === 'video') {
      const video = mixed.videos[page.videoIndex];
      if (!video) throw new Error(`missing_video_${page.videoIndex}`);
      const uploaded = await publishPublicCloudFile({
        request: params.request,
        parentFolderId,
        bytes: new Uint8Array(await composedMaster(video.previews).blob.arrayBuffer()),
        fileName: `pen-${docId}-${page.slug}.video`,
        title: `${publishTitle} — ${page.slug}`,
        previews: video.previews,
        indexingPermissions,
        metadata: { ...partMeta, fileType: 'video' }
      });
      if (!parentPoster) parentPoster = video.previews.poster.blob;
      childIds.push(uploaded.fileId);
      penFeedMediaBySlug[page.slug] = { ref: `penmedia:${uploaded.fileId}`, kind: 'video' };
    } else {
      const mime = page.posterBlob.type || 'image/jpeg';
      const uploaded = await publishPublicCloudFile({
        request: params.request,
        parentFolderId,
        bytes: new Uint8Array(await page.posterBlob.arrayBuffer()),
        fileName: `pen-${docId}-${page.slug}.${mime === 'image/png' ? 'png' : 'jpg'}`,
        title: `${publishTitle} — ${page.slug}`,
        previews: posterPreview(page.posterBlob, mime),
        indexingPermissions,
        metadata: {
          ...partMeta,
          fileType: 'image',
          ...(page.description ? { description: page.description } : {})
        }
      });
      if (!parentPoster) parentPoster = page.posterBlob;
      childIds.push(uploaded.fileId);
      penFeedMediaBySlug[page.slug] = { ref: `penmedia:${uploaded.fileId}`, kind: 'image' };
    }
  }
  const uploaded = await publishPublicCloudFile({
    request: params.request,
    parentFolderId,
    bytes: new TextEncoder().encode(
      JSON.stringify({ collectionFileIds: childIds, title: publishTitle })
    ),
    fileName: `pen-${docId}.collection.json`,
    title: publishTitle,
    previews: posterPreview(parentPoster, parentPoster?.type || 'image/jpeg'),
    indexingPermissions,
    replaceFileId,
    metadata: {
      ...publishMeta,
      ...base,
      ...overlayMeta,
      ...penPresentationFields(params.bundle.manifest),
      fileType: 'collection',
      contentClass: 'collection',
      collection: { collectionFileIds: childIds, title: publishTitle },
      description: caption
    }
  });
  await cleanupAfterUpdate({ request: params.request, prior, keepChildren: childIds });
  return { fileId: uploaded.fileId, penFeedMediaBySlug };
}

/** Superseded collection children and companion audio from before audio lived in the file. */
async function cleanupAfterUpdate(params: {
  request?: CloudRequest;
  prior: PriorPublishedRow;
  keepChildren: string[];
}): Promise<void> {
  const keep = new Set(params.keepChildren);
  const stale = [
    ...params.prior.collectionFileIds,
    ...params.prior.companionAudioFileIds
  ].filter((id) => id && !keep.has(id));
  await deleteSupersededIndexRows(params.request, [...new Set(stale)]);
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
  parentFolderId?: string;
  /** Raster of the template page. Falls back to a title card when absent. */
  posterBlob?: Blob | null;
}): Promise<{ fileId: string }> {
  if (!params.verified) throw new Error(PUBLIC_TEMPLATE_REQUIRES_VERIFICATION);
  const classId = params.bundle.manifest.classId || '';
  const widgetCatalogOnly =
    classId.startsWith('widgets.') && isTemplatesCatalogClass(classId);
  const postFileId = params.bundle.manifest.publishedFileId;
  if (!widgetCatalogOnly && !postFileId) throw new Error('post_required_before_template');
  const licensing = licensingForPublish(params.templateLicensing, params.bundle.manifest.ownerPnHash, {
    membership: true,
    connectReady: params.connectReady,
    musicAsset: params.bundle.manifest.classId === 'library.music'
  });
  const parentFolderId = await publicFolderFor(
    params.pnIdentifier,
    params.bundle.manifest.docId,
    params.parentFolderId
  );
  const compiled = await writeSocialPublishHandoff(params.bundle, {
    pnIdentifier: params.pnIdentifier,
    canPublishPublicTemplate: true,
    connectReady: params.connectReady
  });
  const page = compiled.pages[0];
  const textPost = { content: page?.content || compiled.title, style: page?.style || {} };
  const ir = {
    manifest: stripPollSpreadsheet(params.bundle.manifest),
    sections: params.bundle.sections.map(stripPollSpreadsheetFromSection),
    licensing
  };
  const poster =
    params.posterBlob && params.posterBlob.size > 0
      ? params.posterBlob
      : await renderNotePoster(compiled.title, textPost.content);
  const kind = params.bundle.manifest.basedOnTemplateId ? 'remix' : 'template';
  await supersedePriorPublishedPost(params.request, params.bundle.manifest.templatePublishedFileId);
  return publishPublicCloudFile({
    request: params.request,
    parentFolderId,
    bytes: new TextEncoder().encode(JSON.stringify(ir)),
    fileName: `pen-template-${params.bundle.manifest.docId}.json`,
    title: compiled.title,
    previews: posterPreview(poster),
    metadata: {
      ...provenanceFor(params.bundle, licensing, ['pen-templates']),
      fileType: 'note',
      contentClass: compiled.contentClass === 'media' ? 'note' : compiled.contentClass,
      textPost,
      description: textPost.content,
      penTemplateKind: kind,
      ...(postFileId ? { basedOnFileId: postFileId } : {}),
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
