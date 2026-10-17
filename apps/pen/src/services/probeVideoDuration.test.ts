import { describe, expect, it } from 'vitest';
import { sectionNeedsPlayheadDrive } from '@par-noir/pen-protocol';
import { emptySection } from '@par-noir/pen-protocol';

describe('preview playhead drive', () => {
  it('video-only sections do not need playhead drive', () => {
    const section = {
      ...emptySection('body'),
      layers: [
        {
          id: 'v',
          kind: 'video' as const,
          x: 0,
          y: 0,
          w: 100,
          h: 100,
          zIndex: 1,
          videoSrc: 'penmedia:test'
        }
      ]
    };
    expect(sectionNeedsPlayheadDrive(section)).toBe(false);
  });
});
