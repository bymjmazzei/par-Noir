import { describe, expect, it } from 'vitest';
import {
  buildActionOverlayAtTime,
  exportActionSectionForFeed
} from './feedActionSection.js';
import type { PenSectionContent } from './types.js';

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
