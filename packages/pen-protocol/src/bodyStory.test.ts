import { describe, expect, it } from 'vitest';
import {
  appendChapter,
  appendStoryFrame,
  applyStoryRanges,
  assignBlocksToFrames,
  ensureLayer0Stories,
  frameSlugForBlock,
  layer0DocForSection,
  layer0Flows,
  rangesForFrameCount,
  removeStoryFrame
} from './bodyStory.js';
import { compileDocumentToNote } from './compile.js';
import { docToPlainText, emptySection, emptyTipTapDoc } from './richDoc.js';
import type { PenSectionContent, PenTipTapNode } from './types.js';

function para(text: string): PenTipTapNode {
  return { type: 'paragraph', content: text ? [{ type: 'text', text }] : [] };
}

function doc(...nodes: PenTipTapNode[]): PenTipTapNode {
  return { type: 'doc', content: nodes };
}

function page(slug: string, text: string): PenSectionContent {
  return { ...emptySection(slug), doc: text ? doc(para(text)) : emptyTipTapDoc() };
}

describe('bodyStory', () => {
  it('flows letter and A4 except social cards', () => {
    expect(layer0Flows('library.book', 'letter')).toBe(true);
    expect(layer0Flows('custom.doc', 'a4')).toBe(true);
    expect(layer0Flows('library.book', 'flow')).toBe(false);
    expect(layer0Flows('social.note', 'letter')).toBe(false);
    expect(layer0Flows('social.collection', 'a4')).toBe(false);
    expect(layer0Flows('social', 'letter')).toBe(false);
  });

  it('joins legacy paper pages into one story and leaves social pages alone', () => {
    const sections = [page('body', 'Page one'), page('page-2', 'Page two')];
    const toc = ['body', 'page-2'];
    const social = ensureLayer0Stories(sections, toc, false);
    expect(social).toBe(sections);
    expect(social[0]?.storyId).toBeUndefined();

    const joined = ensureLayer0Stories(sections, toc, true);
    expect(joined[0]?.storyId).toBe('story:body');
    expect(joined[1]?.storyId).toBe('story:body');
    expect(docToPlainText(joined[0]?.doc)).toBe('Page one\nPage two');
    expect(docToPlainText(joined[1]?.doc)).toBe('');
    expect(ensureLayer0Stories(joined, toc, true)).toBe(joined);
  });

  it('moves a block that does not fit onto the next frame', () => {
    expect(assignBlocksToFrames([100, 100], 150)).toEqual([
      { startBlock: 0, endBlock: 1 },
      { startBlock: 1, endBlock: 2 }
    ]);
    expect(assignBlocksToFrames([40, 40, 40], 100)).toEqual([
      { startBlock: 0, endBlock: 2 },
      { startBlock: 2, endBlock: 3 }
    ]);
    expect(assignBlocksToFrames([200], 150)).toEqual([{ startBlock: 0, endBlock: 1 }]);
    expect(rangesForFrameCount([40, 40], 100, 3).ranges).toEqual([
      { startBlock: 0, endBlock: 2 },
      { startBlock: 2, endBlock: 2 },
      { startBlock: 2, endBlock: 2 }
    ]);
  });

  it('appends a same-story frame and keeps a new chapter empty', () => {
    const joined = ensureLayer0Stories([page('body', 'Once upon')], ['body'], true);
    const added = appendStoryFrame(joined, ['body'], joined[0]!.storyId!);
    expect(added?.toc).toEqual(['body', 'page-2']);
    expect(added?.sections[1]?.storyId).toBe(joined[0]?.storyId);
    expect(docToPlainText(added?.sections[0]?.doc)).toBe('Once upon');

    const ranged = applyStoryRanges(added!.sections, added!.toc, joined[0]!.storyId!, [
      { startBlock: 0, endBlock: 1 },
      { startBlock: 1, endBlock: 1 }
    ]);
    expect(layer0DocForSection(ranged, added!.toc, ranged[1]!).content).toEqual([
      { type: 'paragraph' }
    ]);

    const chapter = appendChapter(ranged, added!.toc);
    expect(chapter.storyId).not.toBe(joined[0]?.storyId);
    const fresh = chapter.sections.find((section) => section.slug === chapter.slug);
    expect(docToPlainText(fresh?.doc)).toBe('');
    expect(docToPlainText(chapter.sections[0]?.doc)).toBe('Once upon');
    expect(removeStoryFrame(chapter.sections, chapter.toc, chapter.slug)).toBeNull();
  });

  it('slices page 2 for compile and leaves a collection body on its own page', () => {
    const storyId = 'story:body';
    const anchor: PenSectionContent = {
      slug: 'body',
      storyId,
      storyRange: { startBlock: 0, endBlock: 1 },
      doc: doc(para('First'), para('Second'))
    };
    const frame: PenSectionContent = {
      slug: 'page-2',
      storyId,
      storyRange: { startBlock: 1, endBlock: 2 },
      doc: emptyTipTapDoc()
    };
    expect(frameSlugForBlock([anchor, frame], ['body', 'page-2'], storyId, 1)).toBe('page-2');
    expect(docToPlainText(layer0DocForSection([anchor, frame], ['body', 'page-2'], frame))).toBe(
      'Second'
    );

    const compiled = compileDocumentToNote({
      templateId: 'note.basic.portrait.v1',
      title: 'Letter',
      sections: [anchor, frame]
    });
    expect(compiled.pages.map((item) => item.content)).toEqual(['First', 'Second']);

    const collection = ensureLayer0Stories(
      [page('body', 'Card one'), page('page-2', 'Card two')],
      ['body', 'page-2'],
      layer0Flows('social.collection', 'letter')
    );
    expect(collection[0]?.storyId).toBeUndefined();
    expect(docToPlainText(collection[1]?.doc)).toBe('Card two');
  });
});
