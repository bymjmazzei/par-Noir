/**
 * Layer 0 on letter / A4 (except social cards) is one story threaded through
 * page frames. The story doc lives on the first frame. Later frames keep
 * their layers and an empty doc; storyRange says which blocks they show.
 */

import { categoryIdForClass } from './classes.js';
import { pageSheetDims } from './pageGeometry.js';
import { docToPlainText, emptySection, emptyTipTapDoc } from './richDoc.js';
import type {
  PenPageLayout,
  PenSectionContent,
  PenStoryRange,
  PenTipTapNode
} from './types.js';

export interface Layer0Story {
  storyId: string;
  anchorSlug: string;
  slugs: string[];
  label: string;
}

function nextPageSlug(sections: PenSectionContent[], toc: string[]): string {
  const used = new Set([...toc, ...sections.map((section) => section.slug)]);
  let n = Math.max(sections.length, toc.length) + 1;
  let slug = `page-${n}`;
  while (used.has(slug)) {
    n += 1;
    slug = `page-${n}`;
  }
  return slug;
}

function blockHasContent(node: PenTipTapNode): boolean {
  if (node.type === 'paragraph' || node.type === 'heading') {
    return docToPlainText(node).trim().length > 0;
  }
  return true;
}

function docHasContent(doc: PenTipTapNode | undefined): boolean {
  const content = doc?.type === 'doc' ? doc.content || [] : [];
  return content.some(blockHasContent);
}

function plainHeading(doc: PenTipTapNode | undefined): string {
  const heading = doc?.content?.find((node) => node.type === 'heading');
  return heading ? docToPlainText(heading).trim() : '';
}

function sectionBySlug(
  sections: PenSectionContent[],
  slug: string
): PenSectionContent | undefined {
  return sections.find((section) => section.slug === slug);
}

/** Paper pages share a layer-0 story. Social cards and open flow do not. */
export function layer0Flows(
  classId: string | undefined | null,
  pageLayout: PenPageLayout | undefined | null
): boolean {
  if (pageLayout !== 'letter' && pageLayout !== 'a4') return false;
  if (!classId) return true;
  if (classId === 'social') return false;
  return categoryIdForClass(classId) !== 'social';
}

export function paperContentHeightPx(
  layout: PenPageLayout | undefined,
  paddingPx: number,
  flow?: { widthPx?: number | null; heightPx?: number | null; sizeId?: string | null }
): number {
  const sheet = pageSheetDims(layout, flow);
  if (!sheet.paged || sheet.pageHeightPx == null) return 0;
  return Math.max(1, sheet.pageHeightPx - 2 * Math.max(0, paddingPx));
}

/**
 * Place whole top-level blocks onto frames. A block that does not fit the
 * space left on a frame moves to the next frame. A block is never split.
 * A block taller than a frame still occupies the frame it starts on.
 */
export function assignBlocksToFrames(
  blockHeights: number[],
  pageContentHeight: number
): PenStoryRange[] {
  if (!blockHeights.length) return [{ startBlock: 0, endBlock: 0 }];
  const limit = pageContentHeight > 0 ? pageContentHeight : Number.POSITIVE_INFINITY;
  const frames: PenStoryRange[] = [];
  let start = 0;
  let used = 0;
  for (let i = 0; i < blockHeights.length; i += 1) {
    const height = Math.max(0, blockHeights[i] || 0);
    if (used > 0 && used + height > limit) {
      frames.push({ startBlock: start, endBlock: i });
      start = i;
      used = 0;
    }
    used += height;
  }
  frames.push({ startBlock: start, endBlock: blockHeights.length });
  return frames;
}

/** Ranges for the frames a story already has. Extra frames stay empty. */
export function rangesForFrameCount(
  blockHeights: number[],
  pageContentHeight: number,
  frameCount: number
): { ranges: PenStoryRange[]; framesNeeded: number } {
  const packed = assignBlocksToFrames(blockHeights, pageContentHeight);
  const framesNeeded = Math.max(1, packed.length);
  const count = Math.max(framesNeeded, Math.max(0, frameCount));
  const ranges = packed.slice(0, count);
  const end = blockHeights.length;
  while (ranges.length < count) {
    ranges.push({ startBlock: end, endBlock: end });
  }
  return { ranges, framesNeeded };
}

export function sliceDocBlocks(
  doc: PenTipTapNode | undefined,
  range: PenStoryRange
): PenTipTapNode {
  const content = doc?.type === 'doc' ? doc.content || [] : [];
  const start = Math.max(0, range.startBlock);
  const end = Math.max(start, Math.min(content.length, range.endBlock));
  const slice = content.slice(start, end);
  return { type: 'doc', content: slice.length ? slice : [{ type: 'paragraph' }] };
}

/** Stories in table-of-contents order. The anchor is the first frame of each. */
export function listLayer0Stories(
  sections: PenSectionContent[],
  toc: string[]
): Layer0Story[] {
  const stories: Layer0Story[] = [];
  for (const slug of toc) {
    const section = sectionBySlug(sections, slug);
    if (!section?.storyId) continue;
    const existing = stories.find((story) => story.storyId === section.storyId);
    if (existing) {
      existing.slugs.push(slug);
      continue;
    }
    stories.push({
      storyId: section.storyId,
      anchorSlug: slug,
      slugs: [slug],
      label: ''
    });
  }
  return stories.map((story, index) => {
    const anchor = sectionBySlug(sections, story.anchorSlug);
    const heading = plainHeading(anchor?.doc);
    return { ...story, label: heading || `Chapter ${index + 1}` };
  });
}

export function storyForSlug(
  sections: PenSectionContent[],
  toc: string[],
  slug: string
): Layer0Story | undefined {
  const section = sectionBySlug(sections, slug);
  if (!section?.storyId) return undefined;
  return listLayer0Stories(sections, toc).find((story) => story.storyId === section.storyId);
}

function sameStoryPage(a: PenSectionContent, b: PenSectionContent): boolean {
  return (
    a.storyId === b.storyId &&
    JSON.stringify(a.doc) === JSON.stringify(b.doc) &&
    JSON.stringify(a.storyRange ?? null) === JSON.stringify(b.storyRange ?? null)
  );
}

function foldGroup(
  group: PenSectionContent[],
  storyId: string
): { pages: PenSectionContent[]; changed: boolean } {
  const textPages = group.filter((page) => docHasContent(page.doc));
  let anchorDoc: PenTipTapNode =
    group[0]?.doc?.type === 'doc' ? group[0].doc : emptyTipTapDoc();
  let foldedText = false;
  if (textPages.length > 1) {
    const content = textPages.flatMap((page) => page.doc.content || []);
    anchorDoc = { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
    foldedText = true;
  } else if (textPages.length === 1 && textPages[0] !== group[0]) {
    anchorDoc = textPages[0]!.doc;
    foldedText = true;
  } else if (textPages.length === 1) {
    anchorDoc = textPages[0]!.doc;
  }

  const pages = group.map((page, index) => {
    const nextDoc = index === 0 ? anchorDoc : emptyTipTapDoc();
    const next: PenSectionContent = { ...page, storyId, doc: nextDoc };
    if (foldedText) delete next.storyRange;
    else if (page.storyRange) next.storyRange = page.storyRange;
    else delete next.storyRange;
    return sameStoryPage(page, next) ? page : next;
  });
  return { pages, changed: pages.some((page, index) => page !== group[index]) };
}

/**
 * Give a flowing document one story id per chapter and fold text that was
 * stored on later pages into the anchor. Returns the same array when nothing
 * changes. No-op when `flows` is false (social and open flow).
 */
export function ensureLayer0Stories(
  sections: PenSectionContent[],
  toc: string[],
  flows: boolean
): PenSectionContent[] {
  if (!flows) return sections;
  const ordered = toc
    .map((slug) => sectionBySlug(sections, slug))
    .filter((section): section is PenSectionContent => Boolean(section));
  const unassigned: PenSectionContent[] = [];
  const byStory = new Map<string, PenSectionContent[]>();
  const storyOrder: string[] = [];
  for (const page of ordered) {
    if (!page.storyId) {
      unassigned.push(page);
      continue;
    }
    const list = byStory.get(page.storyId);
    if (list) list.push(page);
    else {
      storyOrder.push(page.storyId);
      byStory.set(page.storyId, [page]);
    }
  }

  const groups: Array<{ id: string; pages: PenSectionContent[] }> = [];
  if (byStory.size === 0) {
    if (ordered.length) groups.push({ id: `story:${ordered[0]!.slug}`, pages: ordered });
  } else {
    for (const id of storyOrder) {
      const pages = byStory.get(id);
      if (pages?.length) groups.push({ id, pages });
    }
    if (unassigned.length) {
      groups.push({ id: `story:${unassigned[0]!.slug}`, pages: unassigned });
    }
  }

  const replacements = new Map<string, PenSectionContent>();
  let changed = false;
  for (const group of groups) {
    const folded = foldGroup(group.pages, group.id);
    if (!folded.changed) continue;
    changed = true;
    for (const page of folded.pages) {
      if (page !== group.pages.find((item) => item.slug === page.slug)) {
        replacements.set(page.slug, page);
      }
    }
  }
  if (!changed) return sections;
  return sections.map((section) => replacements.get(section.slug) || section);
}

export function applyStoryRanges(
  sections: PenSectionContent[],
  toc: string[],
  storyId: string,
  ranges: PenStoryRange[]
): PenSectionContent[] {
  const slugs = toc.filter((slug) => sectionBySlug(sections, slug)?.storyId === storyId);
  let changed = false;
  const next = sections.map((section) => {
    const index = slugs.indexOf(section.slug);
    if (index < 0) return section;
    const range = ranges[index] || { startBlock: 0, endBlock: 0 };
    if (
      section.storyRange &&
      section.storyRange.startBlock === range.startBlock &&
      section.storyRange.endBlock === range.endBlock
    ) {
      return section;
    }
    changed = true;
    return { ...section, storyRange: range };
  });
  return changed ? next : sections;
}

/** Append a blank frame to an existing story, after that story's last frame. */
export function appendStoryFrame(
  sections: PenSectionContent[],
  toc: string[],
  storyId: string
): { sections: PenSectionContent[]; toc: string[]; slug: string } | null {
  const slugs = toc.filter((slug) => sectionBySlug(sections, slug)?.storyId === storyId);
  if (!slugs.length) return null;
  const last = slugs[slugs.length - 1]!;
  const insertAt = toc.indexOf(last) + 1;
  const slug = nextPageSlug(sections, toc);
  const frame: PenSectionContent = { ...emptySection(slug), storyId };
  const nextToc = [...toc.slice(0, insertAt), slug, ...toc.slice(insertAt)];
  return { sections: [...sections, frame], toc: nextToc, slug };
}

/** Start a new layer-0 story. Its text does not continue the previous chapter. */
export function appendChapter(
  sections: PenSectionContent[],
  toc: string[]
): { sections: PenSectionContent[]; toc: string[]; slug: string; storyId: string } {
  const slug = nextPageSlug(sections, toc);
  const storyId = `story:${slug}`;
  const frame: PenSectionContent = { ...emptySection(slug), storyId };
  return {
    sections: [...sections, frame],
    toc: [...toc, slug],
    slug,
    storyId
  };
}

/**
 * Drop one frame and reflow. The last frame of a story stays.
 * Deleting the anchor moves the story doc onto the next frame.
 */
export function removeStoryFrame(
  sections: PenSectionContent[],
  toc: string[],
  slug: string
): { sections: PenSectionContent[]; toc: string[]; slug: string } | null {
  if (toc.length <= 1) return null;
  const section = sectionBySlug(sections, slug);
  if (!section) return null;
  if (!section.storyId) {
    const nextToc = toc.filter((item) => item !== slug);
    const index = toc.indexOf(slug);
    return {
      sections: sections.filter((item) => item.slug !== slug),
      toc: nextToc,
      slug: nextToc[Math.min(index, nextToc.length - 1)] || nextToc[0] || slug
    };
  }
  const storySlugs = toc.filter((item) => sectionBySlug(sections, item)?.storyId === section.storyId);
  if (storySlugs.length <= 1) return null;
  const anchorSlug = storySlugs[0]!;
  let nextSections = sections.filter((item) => item.slug !== slug);
  if (slug === anchorSlug) {
    const heir = storySlugs[1]!;
    nextSections = nextSections.map((item) => {
      if (item.slug === heir) {
        const heirNext: PenSectionContent = { ...item, doc: section.doc };
        delete heirNext.storyRange;
        return heirNext;
      }
      if (item.storyId === section.storyId) {
        const cleared: PenSectionContent = { ...item };
        delete cleared.storyRange;
        return cleared;
      }
      return item;
    });
  } else {
    nextSections = nextSections.map((item) => {
      if (item.storyId !== section.storyId) return item;
      const cleared: PenSectionContent = { ...item };
      delete cleared.storyRange;
      return cleared;
    });
  }
  const nextToc = toc.filter((item) => item !== slug);
  const index = toc.indexOf(slug);
  return {
    sections: nextSections,
    toc: nextToc,
    slug: nextToc[Math.min(index, nextToc.length - 1)] || nextToc[0] || slug
  };
}

export function frameSlugForBlock(
  sections: PenSectionContent[],
  toc: string[],
  storyId: string,
  blockIndex: number
): string | undefined {
  const slugs = toc.filter((slug) => sectionBySlug(sections, slug)?.storyId === storyId);
  for (const slug of slugs) {
    const range = sectionBySlug(sections, slug)?.storyRange;
    if (!range) continue;
    if (blockIndex >= range.startBlock && blockIndex < range.endBlock) return slug;
  }
  return slugs[0];
}

/** Doc a frame should render. Non-story sections return their own doc. */
export function layer0DocForSection(
  sections: PenSectionContent[],
  toc: string[],
  section: PenSectionContent
): PenTipTapNode {
  if (!section.storyId) return section.doc;
  const story = listLayer0Stories(sections, toc).find((item) => item.storyId === section.storyId);
  if (!story) return section.doc;
  const anchor = sectionBySlug(sections, story.anchorSlug);
  const doc = anchor?.doc || section.doc;
  if (!section.storyRange) {
    if (section.slug === story.anchorSlug) return doc;
    return emptyTipTapDoc();
  }
  return sliceDocBlocks(doc, section.storyRange);
}
