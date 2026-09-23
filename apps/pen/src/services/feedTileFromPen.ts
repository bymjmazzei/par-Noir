/** Build FeedTileViewModel from Pen template / section bundle. */

import {
  defaultPagePresentation,
  docToHtml,
  docToPlainText,
  emptySection,
  mergePagePresentation,
  normalizeSection,
  type PenDocManifest,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import type { FeedTilePage, FeedTileViewModel } from '@par-noir/feed-tile';

export function sectionsToFeedPages(
  sections: PenSectionContent[],
  titleFallback: string,
  pagePresentation?: PenDocManifest['pagePresentation']
): FeedTilePage[] {
  const pres = mergePagePresentation(defaultPagePresentation(), pagePresentation || undefined);
  return sections.map((raw) => {
    const s = normalizeSection(raw);
    const plain = docToPlainText(s.doc).trim();
    return {
      title: plain.slice(0, 80) || titleFallback,
      bodyHtml: docToHtml(s.doc),
      backgroundColor: pres.backgroundColor,
      textColor: pres.textColor
    };
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
}): FeedTileViewModel {
  const pages = sectionsToFeedPages(input.sections, input.title, input.pagePresentation);
  if (input.posterUrl && pages[0]) {
    pages[0] = { ...pages[0], mediaSrc: input.posterUrl };
  }
  return {
    title: input.title,
    caption: input.caption || input.title,
    pages,
    posterUrl: input.posterUrl,
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
