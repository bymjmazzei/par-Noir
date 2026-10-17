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
  shouldPublishAsSocialTocCollection,
  shouldPublishSocialAsCollection,
  sectionIsFeedPage,
  sectionNeedsRasterSnapshot,
  sectionHasVisibleVideoLayer,
  feedPagePlainText,
  primaryVisibleImageSrc,
  partitionSectionsForPublish,
  resolveTimelineDuration,
  audioPublishPlan,
  mergePagePresentation,
  docToPlainText,
  collectActionOverlays,
  buildActionStageHtml,
  stripPollSpreadsheet,
  stripPollSpreadsheetFromSection,
  inferPageTextStyle,
  normalizeSection,
  type PenDocManifest,
  type PenEmbedResolveResult,
  type PenSectionContent,
  type ResolvePenEmbed
} from '@par-noir/pen-protocol';
import {
  composedMaster,
  composePageToVideo,
  type ComposePageVideoResult
} from './composePageVideoEncode';
import { findComposeExportRoot, waitForUntaintedComposeVideos } from './penGalleryPreview';
import { setPlaybackMode } from './playbackMode';
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
import { resolvePenMediaSrc } from '@par-noir/pen-media';
import { isTemplatesCatalogClass } from './classFeedRailItems';
import { ensureShareFeedIds } from './penFeedTargets';
import {
  composePageVideoWithoutActions,
  composeTimelineEncodeOpts,
  penFeedPageForSection,
  penPresentationFields
} from './penFeedPagePublish';

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
    ...(() => {
      const licensed =
        audioPublishPlan(bundle.sections).licensedDocId || bundle.manifest.audioSotDocId || '';
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
  /** CDN variants at tier sizes; `composedMaster` is the canonical file. */
  previews: ComposePageVideoResult;
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
  setPlaybackMode('publish');
  let encoded: Awaited<ReturnType<typeof composePageToVideo>>;
  try {
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
    encoded = await composePageVideoWithoutActions(root, bundle.sections, {
      onProgress: opts?.onProgress,
      ...composeClock(videoSections[0], bundle.manifest)
    });
  } finally {
    setPlaybackMode('edit');
  }
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
    previews: encoded
  };
}

function composeClock(
  section: PenSectionContent | undefined,
  manifest: PenDocManifest
) {
  if (!section) return {};
  return composeTimelineEncodeOpts(section, manifest);
}

function waitTwoFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export type MixedPublishPage =
  | { kind: 'note'; slug: string; content: string; style?: unknown; doc?: unknown }
  | { kind: 'video'; slug: string; videoIndex: number }
  | { kind: 'still'; slug: string; imageSrc: string }
  | { kind: 'raster'; slug: string; posterBlob: Blob }
  | { kind: 'overlay'; slug: string; posterBlob: Blob };

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
  const videos: MixedPagesPublish['videos'] = [];

  setPlaybackMode('publish');
  try {
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
      const encoded = await composePageVideoWithoutActions(root, bundle.sections, {
        ...composeClock(sec, bundle.manifest),
        onProgress: (p) => {
          const base = (i / videoSections.length) * 80;
          opts.onProgress?.(Math.round(base + (p / 100) * (80 / videoSections.length)));
        }
      });
      videos.push({ slug: sec.slug, previews: encoded });
    }
  } finally {
    setPlaybackMode('edit');
  }

  const videoIndexBySlug = new Map(videos.map((v, i) => [v.slug, i]));
  const pages: MixedPublishPage[] = [];
  for (const raw of sectionsInTocOrder(bundle)) {
    const slug = raw.slug;
    if (videoIndexBySlug.has(slug)) {
      pages.push({ kind: 'video', slug, videoIndex: videoIndexBySlug.get(slug)! });
      continue;
    }
    if (!sectionIsFeedPage(raw)) continue;
    const sec = normalizeSection(raw);
    const imageSrc = primaryVisibleImageSrc(sec);
    if (imageSrc && !sectionHasVisibleVideoLayer(sec)) {
      pages.push({ kind: 'still', slug, imageSrc });
      continue;
    }
    const base = mergePagePresentation(presentation);
    pages.push({
      kind: 'note',
      slug,
      content: feedPagePlainText(sec),
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

/**
 * Social toggle + 2+ TOC pages: one collection child per TOC section (incl. raster action pages).
 */
export async function writeSocialTocCollectionHandoff(
  bundle: LocalDocBundle,
  opts: {
    activateSection: (slug: string) => void | Promise<void>;
    resolveExportRoot: (slug: string) => Promise<HTMLElement>;
    /** @deprecated Action-only pages use overlay still + penFeedPage. */
    rasterizeSection?: (slug: string) => Promise<Blob>;
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
  const ordered = sectionsInTocOrder(bundle);
  const inertEncodeSections = ordered.filter(
    (section) => sectionHasVisibleVideoLayer(section) || sectionNeedsRasterSnapshot(section)
  );
  const presentation = manifest.pagePresentation || defaultPagePresentation();
  const videos: MixedPagesPublish['videos'] = [];

  setPlaybackMode('publish');
  try {
    for (let i = 0; i < inertEncodeSections.length; i++) {
      const sec = inertEncodeSections[i]!;
      opts.onProgress?.(Math.round((i / Math.max(inertEncodeSections.length, 1)) * 95));
      await opts.activateSection(sec.slug);
      await waitTwoFrames();
      await new Promise((r) => setTimeout(r, 200));
      const root0 = await opts.resolveExportRoot(sec.slug);
      if (!root0) throw new Error('compose_export_root_missing');
      const root = sectionHasVisibleVideoLayer(sec)
        ? await waitForUntaintedComposeVideos(root0)
        : root0;
      const encoded = await composePageVideoWithoutActions(root, bundle.sections, {
        ...composeClock(sec, bundle.manifest),
        onProgress: (p) => {
          const base = (i / inertEncodeSections.length) * 95;
          opts.onProgress?.(Math.round(base + (p / 100) * (95 / inertEncodeSections.length)));
        }
      });
      videos.push({ slug: sec.slug, previews: encoded });
    }
  } finally {
    setPlaybackMode('edit');
  }

  const videoIndexBySlug = new Map(videos.map((v, i) => [v.slug, i]));
  const pages: MixedPublishPage[] = [];

  for (const raw of ordered) {
    const slug = raw.slug;
    if (videoIndexBySlug.has(slug)) {
      pages.push({ kind: 'video', slug, videoIndex: videoIndexBySlug.get(slug)! });
      continue;
    }
    if (sectionIsFeedPage(raw)) {
      const sec = normalizeSection(raw);
      const imageSrc = primaryVisibleImageSrc(sec);
      if (imageSrc && !sectionHasVisibleVideoLayer(sec)) {
        pages.push({ kind: 'still', slug, imageSrc });
        continue;
      }
      const base = mergePagePresentation(presentation);
      pages.push({
        kind: 'note',
        slug,
        content: feedPagePlainText(sec),
        style: { ...base, textStyle: inferPageTextStyle(sec.doc) },
        doc: raw.doc
      });
      continue;
    }
  }

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
 * Text and still pages of a multipage social post, in toc order.
 * The cloud writer uploads each page, then a parent with collectionFileIds.
 */
export function writeTextCollectionHandoff(
  bundle: LocalDocBundle,
  opts: {
    canPublishPublicTemplate?: boolean;
    connectReady?: boolean;
  }
): MixedPagesPublish {
  const template = getTemplate(bundle.manifest.templateId);
  if (
    !shouldPublishSocialAsCollection({
      classId: bundle.manifest.classId,
      isSocial: bundle.manifest.isSocial,
      toc: bundle.manifest.toc,
      publishContentClass: template?.publishContentClass,
      templateSectionSlugs: template?.sections.map((section) => section.slug),
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
  const presentation = bundle.manifest.pagePresentation || defaultPagePresentation();
  const pages: MixedPublishPage[] = [];
  for (const raw of sectionsInTocOrder(bundle)) {
    if (!sectionIsFeedPage(raw)) continue;
    const sec = normalizeSection(raw);
    const imageSrc = primaryVisibleImageSrc(sec);
    if (imageSrc && !sectionHasVisibleVideoLayer(sec)) {
      pages.push({ kind: 'still', slug: raw.slug, imageSrc });
      continue;
    }
    const base = mergePagePresentation(presentation);
    pages.push({
      kind: 'note',
      slug: raw.slug,
      content: feedPagePlainText(sec),
      style: { ...base, textStyle: inferPageTextStyle(sec.doc) },
      doc: raw.doc
    });
  }
  if (pages.length < 2) throw new Error('not_text_collection');
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
    videos: []
  };
}

function provenanceFor(
  bundle: LocalDocBundle,
  licensing: PenLicensingRoot,
  feedIds: string[]
): Record<string, unknown> {
  const form = getClass(bundle.manifest.classId);
  const licensed =
    audioPublishPlan(bundle.sections).licensedDocId || bundle.manifest.audioSotDocId || '';
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

async function readOwnAudioBytes(src: string): Promise<Uint8Array | null> {
  try {
    const url = (await resolvePenMediaSrc(src)) || src;
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Upload each poster-owned lane. Licensed lanes are not copied. */
async function publicFolderFor(
  pnIdentifier: string,
  docId: string,
  explicit?: string
): Promise<string> {
  if (explicit) return explicit;
  const { ensureDocChildFolder, penSessionDrive } = await import('./penDriveLibrary');
  const drive = await penSessionDrive(pnIdentifier);
  return ensureDocChildFolder(drive.accessToken, drive.index.pnFolderId, docId, 'public');
}

export async function uploadCompanionAudioFiles(params: {
  bundle: LocalDocBundle;
  request?: CloudRequest;
  parentFolderId?: string;
  uploadCompanionAudio?: (bytes: Uint8Array, index: number, mime: string) => Promise<string>;
}): Promise<{ fileIds: string[]; offsetsSec: number[]; gains: number[] }> {
  const plan = audioPublishPlan(params.bundle.sections);
  const fileIds: string[] = [];
  const offsetsSec: number[] = [];
  const gains: number[] = [];
  const docId = params.bundle.manifest.docId;
  const title = params.bundle.manifest.title || 'Untitled';
  for (let i = 0; i < plan.own.length; i++) {
    const lane = plan.own[i];
    const bytes = await readOwnAudioBytes(lane.src);
    if (!bytes?.byteLength) continue;
    const mime = 'audio/mpeg';
    if (!params.uploadCompanionAudio && !params.parentFolderId) {
      throw new Error('public_folder_required');
    }
    const fileId = params.uploadCompanionAudio
      ? await params.uploadCompanionAudio(bytes, i, mime)
      : (
          await publishPublicCloudFile({
            request: params.request,
            parentFolderId: params.parentFolderId!,
            bytes,
            fileName: `pen-${docId}-audio-${i}.mp3`,
            title: `${title} audio ${i + 1}`,
            previews: { sd: { blob: new Blob([bytes], { type: mime }), contentType: mime } },
            metadata: {
              fileType: 'audio',
              contentClass: 'media',
              isCompanionAudio: true,
              penDocId: docId
            }
          })
        ).fileId;
    fileIds.push(fileId);
    offsetsSec.push(lane.offsetSec);
    gains.push(lane.gain);
  }
  return { fileIds, offsetsSec, gains };
}

/** Clickable overlay specs for a post. Includes the tracking spreadsheet when the group has one. */
export function actionOverlaysForPost(
  sections: LocalDocBundle['sections']
): ReturnType<typeof collectActionOverlays> {
  return collectActionOverlays(sections);
}

/** Overlay HTML stored beside actionOverlays. Inert media is not in this string. */
export function actionStageHtmlForPost(sections: LocalDocBundle['sections']): string {
  return buildActionStageHtml(sections);
}

/** Remove prior feed row before re-share so the doc does not accumulate duplicate fileIds. */
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

async function loadStillBytesForPublish(
  imageSrc: string
): Promise<{ bytes: Uint8Array; mime: string; blob: Blob }> {
  const url = (await resolvePenMediaSrc(imageSrc)) || imageSrc;
  const res = await fetch(url);
  if (!res.ok) throw new Error('publish_still_fetch_failed');
  const blob = await res.blob();
  const mime = blob.type || 'image/jpeg';
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime, blob };
}

/** Publish the compiled post to the owner cloud. No template flag. */
export async function publishPostToOwnerCloud(params: {
  bundle: LocalDocBundle;
  feedIds: string[];
  pnIdentifier: string;
  membership: boolean;
  connectReady?: boolean;
  request?: CloudRequest;
  /** par-noir-pen/{docId}/public/. Resolved when omitted. */
  parentFolderId?: string;
  video?: ComposedVideoPublish;
  mixed?: MixedPagesPublish;
  /** Test hook. Production uploads each own lane as its own audio file. */
  uploadCompanionAudio?: (bytes: Uint8Array, index: number, mime: string) => Promise<string>;
  feedPublish?: FeedPublishExtras;
}): Promise<{
  fileId: string;
  penFeedMediaBySlug?: PenDocManifest['penFeedMediaBySlug'];
}> {
  if (!params.feedIds.length) throw new Error('feed_required');
  const penFeedMediaBySlug: NonNullable<PenDocManifest['penFeedMediaBySlug']> = {};
  await supersedePriorPublishedPost(
    params.request,
    params.bundle.manifest.publishedFileId
  );
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
  const licensing = licensingForPublish(params.bundle.manifest.licensing, params.bundle.manifest.ownerPnHash, {
    membership: params.membership,
    connectReady: params.connectReady,
    musicAsset: params.bundle.manifest.classId === 'library.music'
  });
  const effectiveFeedIds =
    params.mixed != null
      ? ensureShareFeedIds(params.feedIds, 'collection')
      : params.video != null
        ? ensureShareFeedIds(params.feedIds, 'media')
        : params.feedIds;
  const companion = await uploadCompanionAudioFiles({ ...params, parentFolderId });
  const base = {
    ...provenanceFor(params.bundle, licensing, effectiveFeedIds),
    ...(companion.fileIds.length
      ? {
          companionAudioFileIds: companion.fileIds,
          companionAudioOffsetsSec: companion.offsetsSec,
          companionAudioGains: companion.gains
        }
      : {})
  };
  const actionOverlays = actionOverlaysForPost(params.bundle.sections);
  const actionStageHtml = actionStageHtmlForPost(params.bundle.sections);
  const overlayMeta = {
    ...(actionOverlays.length ? { actionOverlays } : {}),
    ...(actionStageHtml ? { actionStageHtml } : {})
  };
  const caption =
    typeof publishMeta.description === 'string' ? publishMeta.description : undefined;

  if (params.video) {
    const bytes = new Uint8Array(await composedMaster(params.video.previews).blob.arrayBuffer());
    const videoSlug = partitionSectionsForPublish(params.bundle.sections).videoSections[0]?.slug;
    const videoPageMeta =
      videoSlug && sectionBySlug(params.bundle, videoSlug)
        ? {
            penFeedPage: penFeedPageForSection(
              sectionBySlug(params.bundle, videoSlug)!,
              params.bundle.manifest
            )
          }
        : {};
    const uploaded = await publishPublicCloudFile({
      request: params.request,
      parentFolderId,
      bytes,
      fileName: `pen-${params.bundle.manifest.docId}.video`,
      title: publishTitle,
      previews: params.video.previews,
      indexingPermissions,
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
    if (videoSlug) {
      penFeedMediaBySlug[videoSlug] = { ref: `penmedia:${uploaded.fileId}`, kind: 'video' };
    }
    return {
      fileId: uploaded.fileId,
      penFeedMediaBySlug: Object.keys(penFeedMediaBySlug).length ? penFeedMediaBySlug : undefined
    };
  }

  if (params.mixed) {
    const childIds: string[] = [];
    let parentPoster: Blob | undefined;
    const docId = params.bundle.manifest.docId;
    for (const page of params.mixed.pages) {
      if (page.kind === 'video') {
        const video = params.mixed.videos[page.videoIndex];
        if (!video) throw new Error(`missing_video_${page.videoIndex}`);
        const uploaded = await publishPublicCloudFile({
          request: params.request,
          parentFolderId,
          bytes: new Uint8Array(await composedMaster(video.previews).blob.arrayBuffer()),
          fileName: `pen-${docId}-${page.slug}.video`,
          title: `${publishTitle} — ${page.slug}`,
          previews: video.previews,
          indexingPermissions,
          metadata: {
            ...publishMeta,
            ...provenanceFor(params.bundle, licensing, ['collection-part']),
            ...(sectionBySlug(params.bundle, page.slug)
              ? {
                  penFeedPage: penFeedPageForSection(
                    sectionBySlug(params.bundle, page.slug)!,
                    params.bundle.manifest
                  )
                }
              : {}),
            fileType: 'video',
            contentClass: 'media',
            isPartOfCollection: true
          }
        });
        if (!parentPoster) parentPoster = video.previews.poster.blob;
        childIds.push(uploaded.fileId);
        penFeedMediaBySlug[page.slug] = { ref: `penmedia:${uploaded.fileId}`, kind: 'video' };
      } else if (page.kind === 'still') {
        const still = await loadStillBytesForPublish(page.imageSrc);
        const uploaded = await publishPublicCloudFile({
          request: params.request,
          parentFolderId,
          bytes: still.bytes,
          fileName: `pen-${docId}-${page.slug}.jpg`,
          title: `${publishTitle} — ${page.slug}`,
          previews: posterPreview(still.blob, still.mime),
          indexingPermissions,
          metadata: {
            ...publishMeta,
            ...provenanceFor(params.bundle, licensing, ['collection-part']),
            ...(sectionBySlug(params.bundle, page.slug)
              ? {
                  penFeedPage: penFeedPageForSection(
                    sectionBySlug(params.bundle, page.slug)!,
                    params.bundle.manifest
                  )
                }
              : {}),
            fileType: 'image',
            contentClass: 'media',
            isPartOfCollection: true
          }
        });
        if (!parentPoster) parentPoster = still.blob;
        childIds.push(uploaded.fileId);
        penFeedMediaBySlug[page.slug] = { ref: `penmedia:${uploaded.fileId}`, kind: 'image' };
      } else if (page.kind === 'raster' || page.kind === 'overlay') {
        const uploaded = await publishPublicCloudFile({
          request: params.request,
          parentFolderId,
          bytes: new Uint8Array(await page.posterBlob.arrayBuffer()),
          fileName: `pen-${docId}-${page.slug}.jpg`,
          title: `${publishTitle} — ${page.slug}`,
          previews: posterPreview(
            page.posterBlob,
            page.kind === 'raster' ? 'image/png' : 'image/jpeg'
          ),
          indexingPermissions,
          metadata: {
            ...publishMeta,
            ...provenanceFor(params.bundle, licensing, ['collection-part']),
            ...(sectionBySlug(params.bundle, page.slug)
              ? {
                  penFeedPage: penFeedPageForSection(
                    sectionBySlug(params.bundle, page.slug)!,
                    params.bundle.manifest
                  )
                }
              : {}),
            fileType: 'image',
            contentClass: 'media',
            isPartOfCollection: true
          }
        });
        if (!parentPoster) parentPoster = page.posterBlob;
        childIds.push(uploaded.fileId);
        penFeedMediaBySlug[page.slug] = { ref: `penmedia:${uploaded.fileId}`, kind: 'image' };
      } else {
        const textPost = { content: page.content, style: page.style || {} };
        const notePoster = await renderNotePoster(`${publishTitle} — ${page.slug}`, textPost.content);
        const uploaded = await publishPublicCloudFile({
          request: params.request,
          parentFolderId,
          bytes: new TextEncoder().encode(JSON.stringify({ textPost, version: '1.0' })),
          fileName: `pen-${docId}-${page.slug}.json`,
          title: `${publishTitle} — ${page.slug}`,
          previews: posterPreview(notePoster),
          indexingPermissions,
          metadata: {
            ...publishMeta,
            ...provenanceFor(params.bundle, licensing, ['collection-part']),
            ...(sectionBySlug(params.bundle, page.slug)
              ? {
                  penFeedPage: penFeedPageForSection(
                    sectionBySlug(params.bundle, page.slug)!,
                    params.bundle.manifest
                  )
                }
              : {}),
            fileType: 'note-collection-page',
            contentClass: 'note',
            textPost,
            isPartOfCollection: true
          }
        });
        if (!parentPoster && notePoster) parentPoster = notePoster;
        childIds.push(uploaded.fileId);
      }
    }
    const poster = parentPoster ?? params.mixed.videos[0]?.previews.poster.blob;
    const uploaded = await publishPublicCloudFile({
      request: params.request,
      parentFolderId,
      bytes: new TextEncoder().encode(
        JSON.stringify({ collectionFileIds: childIds, title: publishTitle })
      ),
      fileName: `pen-${params.bundle.manifest.docId}.collection.json`,
      title: publishTitle,
      previews: posterPreview(poster),
      indexingPermissions,
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
    return {
      fileId: uploaded.fileId,
      penFeedMediaBySlug: Object.keys(penFeedMediaBySlug).length ? penFeedMediaBySlug : undefined
    };
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
  const uploaded = await publishPublicCloudFile({
    request: params.request,
    parentFolderId,
    bytes: new TextEncoder().encode(
      JSON.stringify({ textPost, pages: compiled.pages, version: '1.0' })
    ),
    fileName: `pen-${params.bundle.manifest.docId}.json`,
    title: publishTitle,
    previews: posterPreview(poster),
    indexingPermissions,
    metadata: {
      ...publishMeta,
      ...base,
      ...overlayMeta,
      fileType: compiled.contentClass === 'collection' ? 'collection' : 'note',
      contentClass: compiled.contentClass,
      textPost,
      description: caption || textPost.content
    }
  });
  return { fileId: uploaded.fileId };
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
  const poster = await renderNotePoster(compiled.title, textPost.content);
  const kind = params.bundle.manifest.basedOnTemplateId ? 'remix' : 'template';
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
