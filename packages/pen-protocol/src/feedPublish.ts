/**
 * Infer aggregator content class from Pen doc sections (feed rails).
 */

import { compileDocumentToNote } from './compile.js';
import { defaultPagePresentation } from './presentation.js';
import {
  shouldPublishAsMixedPages,
  shouldPublishAsSingleComposedVideoForFeed,
  shouldPublishAsSocialTocCollection,
  shouldPublishSocialAsCollection
} from './composeVideo.js';
import { getTemplate } from './templates.js';
import type { PenSectionContent } from './types.js';

export type FeedContentClass = 'note' | 'media' | 'collection';

export function inferFeedContentClass(input: {
  sections: PenSectionContent[];
  classId?: string;
  isSocial?: boolean;
  toc?: string[];
  templateId?: string;
  title?: string;
  pagePresentation?: ReturnType<typeof defaultPagePresentation>;
}): FeedContentClass {
  const sections = input.sections || [];
  const manifest = {
    classId: input.classId,
    isSocial: input.isSocial,
    toc: input.toc
  };
  if (shouldPublishAsSocialTocCollection({ ...manifest, sections })) return 'collection';
  if (shouldPublishAsSingleComposedVideoForFeed(sections, manifest)) return 'media';
  if (shouldPublishAsMixedPages(sections)) return 'collection';
  const template = getTemplate(input.templateId || '');
  if (
    shouldPublishSocialAsCollection({
      classId: input.classId,
      isSocial: input.isSocial,
      toc: input.toc,
      publishContentClass: template?.publishContentClass,
      templateSectionSlugs: template?.sections.map((s) => s.slug),
      sections
    })
  ) {
    return 'collection';
  }
  try {
    const compiled = compileDocumentToNote({
      templateId: input.templateId || template?.id || 'blank.social.note',
      title: input.title || 'Untitled',
      sections,
      pagePresentation: input.pagePresentation || defaultPagePresentation(),
      docId: 'infer'
    });
    const cc = compiled.contentClass;
    if (cc === 'media' || cc === 'collection' || cc === 'note') return cc;
  } catch {
    /* fall through */
  }
  return 'note';
}
