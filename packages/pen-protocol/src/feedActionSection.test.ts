import { describe, expect, it } from 'vitest';
import {
  buildActionOverlayAtTime,
  exportActionSectionForFeed
} from './feedActionSection.js';
import type { PenPageLayer, PenSectionContent } from './types.js';

describe('exportActionSectionForFeed', () => {
  it('keeps action layers and parent group', () => {
    const section: PenSectionContent = {
      slug: 'p1',
      doc: { type: 'doc', content: [] },
      layers: [
        {
          id: 'g',
          kind: 'group',
          x: 0,
          y: 0,
          w: 100,
          h: 80,
          zIndex: 1
        },
        {
          id: 'b',
          kind: 'interactive',
          parentGroupId: 'g',
          behavior: 'widget.toggle',
          x: 8,
          y: 8,
          w: 48,
          h: 24,
          zIndex: 2,
          label: 'On',
          motion: {
            keys: [
              { t: 0, x: 8 },
              { t: 1, x: 40, ease: 'linear' }
            ]
          }
        },
        {
          id: 'v',
          kind: 'video',
          x: 0,
          y: 0,
          w: 200,
          h: 120,
          zIndex: 0,
          videoSrc: 'blob:x'
        }
      ]
    };
    const exported = exportActionSectionForFeed(section);
    expect(exported.layers.map((l) => l.id).sort()).toEqual(['b', 'g']);
    const at0 = buildActionOverlayAtTime(exported, 0).find((l) => l.id === 'b');
    const at1 = buildActionOverlayAtTime(exported, 1).find((l) => l.id === 'b');
    expect(at0?.x).toBe(8);
    expect(at1?.x).toBe(40);
  });
});

describe('action layers on a page lengthened by baked keyframes', () => {
  const layer = (id: string, extra: Partial<PenPageLayer> = {}): PenPageLayer => ({
    id,
    kind: 'text',
    x: 0,
    y: 0,
    w: 100,
    h: 40,
    zIndex: 1,
    ...extra
  });
  const page = (action: PenPageLayer): PenSectionContent => ({
    slug: 'p1',
    doc: { type: 'doc', content: [] },
    layers: [
      layer('baked', {
        motion: {
          keys: [
            { t: 0, x: 0 },
            { t: 8, x: 50 }
          ]
        }
      }),
      action
    ]
  });
  const button = (extra: Partial<PenPageLayer> = {}) =>
    layer('cta', { kind: 'interactive', behavior: 'cta.open', zIndex: 2, ...extra });

  it('runs on the whole page clock', () => {
    expect(exportActionSectionForFeed(page(button())).timelineDurationSec).toBe(8);
  });

  it('keeps an unkeyed button on screen for the whole page', () => {
    const exported = exportActionSectionForFeed(page(button()));
    expect(buildActionOverlayAtTime(exported, 6).map((l) => l.id)).toContain('cta');
  });

  it('holds a short keyframed action at its end pose', () => {
    const exported = exportActionSectionForFeed(
      page(
        button({
          motion: {
            keys: [
              { t: 0, x: 0 },
              { t: 1, x: 40, ease: 'linear' }
            ]
          }
        })
      )
    );
    const at6 = buildActionOverlayAtTime(exported, 6).find((l) => l.id === 'cta');
    expect(at6?.x).toBe(40);
  });

  it('plays an out animation at the end of the page, not at 5 seconds', () => {
    const exported = exportActionSectionForFeed(
      page(button({ motion: { keys: [], animation: { out: 'fade' } } }))
    );
    const at5 = buildActionOverlayAtTime(exported, 5).find((l) => l.id === 'cta');
    const nearEnd = buildActionOverlayAtTime(exported, 7.99).find((l) => l.id === 'cta');
    expect(at5?.opacity).toBe(100);
    expect(nearEnd?.opacity).toBeLessThan(5);
  });
});
