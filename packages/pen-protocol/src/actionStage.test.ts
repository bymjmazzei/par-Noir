import { describe, expect, it } from 'vitest';
import { buildActionStageDocument, buildActionStageHtml } from './actionStage.js';
import type { PenSectionContent } from './types.js';

const sections: PenSectionContent[] = [
  {
    slug: 'body',
    doc: { type: 'doc', content: [] },
    layers: [
      {
        id: 'vid',
        kind: 'video',
        x: 0,
        y: 0,
        w: 360,
        h: 640,
        zIndex: 1,
        videoSrc: 'https://cdn.example/clip.mp4'
      },
      {
        id: 'yes',
        kind: 'interactive',
        widgetElement: 'button',
        behavior: 'poll.vote',
        bindRowId: 'yes',
        label: 'Yes',
        x: 24,
        y: 400,
        w: 120,
        h: 40,
        zIndex: 2
      }
    ]
  }
];

describe('buildActionStageHtml', () => {
  it('includes each action layer and omits inert media', () => {
    const html = buildActionStageHtml(sections);
    expect(html).toContain('data-pen-behavior="poll.vote"');
    expect(html).toContain('Yes');
    expect(html).not.toContain('clip.mp4');
  });
});

describe('buildActionStageDocument', () => {
  it('puts the media url behind the overlay html', () => {
    const doc = buildActionStageDocument({
      mediaSrc: 'https://cdn.example/clip.mp4',
      mediaKind: 'video',
      overlayHtml: buildActionStageHtml(sections)
    });
    const mediaAt = doc.indexOf('clip.mp4');
    const overlayAt = doc.indexOf('poll.vote');
    expect(mediaAt).toBeGreaterThan(-1);
    expect(overlayAt).toBeGreaterThan(mediaAt);
    expect(doc).toContain('class="bg"');
    expect(doc).toContain('class="overlay"');
  });
});
