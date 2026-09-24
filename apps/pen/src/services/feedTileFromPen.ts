/** Build FeedTileViewModel from Pen template / section bundle. */

import {
  defaultPagePresentation,
  docToHtml,
  docToPlainText,
  emptySection,
  mergePagePresentation,
  normalizeSection,
  type PenDocManifest,
  type PenPageLayer,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import type { FeedTilePage, FeedTileViewModel } from '@par-noir/feed-tile';

function primaryMediaLayer(layers: PenPageLayer[] | undefined): PenPageLayer | null {
  const visible = (layers || []).filter((l) => l.visible !== false);
  const video = visible.find((l) => l.kind === 'video' && l.videoSrc);
  if (video) return video;
  const image = visible.find((l) => l.kind === 'image' && l.imageSrc);
  return image || null;
}

export function sectionsToFeedPages(
  sections: PenSectionContent[],
  titleFallback: string,
  pagePresentation?: PenDocManifest['pagePresentation']
): FeedTilePage[] {
  const pres = mergePagePresentation(defaultPagePresentation(), pagePresentation || undefined);
  return sections.map((raw) => {
    const s = normalizeSection(raw);
    const plain = docToPlainText(s.doc).trim();
    const media = primaryMediaLayer(s.layers);
    const page: FeedTilePage = {
      title: plain.slice(0, 80) || titleFallback,
      bodyHtml: docToHtml(s.doc),
      backgroundColor: pres.backgroundColor,
      textColor: pres.textColor
    };
    if (media?.kind === 'video' && media.videoSrc) {
      page.mediaSrc = media.videoSrc;
      page.mediaKind = 'video';
    } else if (media?.kind === 'image' && media.imageSrc) {
      page.mediaSrc = media.imageSrc;
      page.mediaKind = 'image';
    } else if (pres.backgroundVideo) {
      page.mediaSrc = pres.backgroundVideo;
      page.mediaKind = 'video';
    } else if (pres.backgroundImage) {
      page.mediaSrc = pres.backgroundImage;
      page.mediaKind = 'image';
    }
    return page;
  });
}

export function bundleToFeedTileModel(input: {
  title: string;
  sections: PenSectionContent[];
  pagePresentation?: PenDocManifest['pagePresentation'];
  posterUrl?: string;
  fileId?: string;
  contentClass?: string;
  caption?: string;
  /** Prefer committed composed gallery preview when set. */
  galleryPreviewRef?: string;
  galleryPreviewKind?: 'image' | 'video';
  galleryPreviewPosterRef?: string;
}): FeedTileViewModel {
  const pages = sectionsToFeedPages(input.sections, input.title, input.pagePresentation);
  if (input.galleryPreviewRef && pages[0]) {
    pages[0] = {
      ...pages[0],
      mediaSrc: input.galleryPreviewRef,
      mediaKind: input.galleryPreviewKind === 'video' ? 'video' : 'image'
    };
  } else if (input.posterUrl && pages[0] && !pages[0].mediaSrc) {
    pages[0] = { ...pages[0], mediaSrc: input.posterUrl, mediaKind: 'image' };
  }
  return {
    title: input.title,
    caption: input.caption || input.title,
    pages,
    posterUrl: input.galleryPreviewPosterRef || input.posterUrl,
    fileId: input.fileId,
    contentClass: input.contentClass
  };
}

export function seedOrEmptySections(
  slugs: string[],
  seedSections?: PenSectionContent[]
): PenSectionContent[] {
  if (seedSections?.length) return seedSections.map((s) => normalizeSection(s));
  return slugs.map((slug) => emptySection(slug));
}
