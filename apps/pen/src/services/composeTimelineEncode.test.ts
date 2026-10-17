import { describe, expect, it } from 'vitest';
import { resolveTimelineDuration } from '@par-noir/pen-protocol';
import { composeTimelineEncodeOpts } from './penFeedPagePublish';

describe('composeTimelineEncodeOpts', () => {
  it('always sets section clock without motion keys', () => {
    const section = {
      slug: 'page-1',
      doc: { type: 'doc', content: [] },
      layers: [
        {
          id: 'clip',
          kind: 'video',
          x: 0,
          y: 0,
          w: 100,
          h: 100,
          zIndex: 1,
          videoSrc: 'blob:test',
          inSec: 0,
          outSec: 3
        }
      ]
    };
    const opts = composeTimelineEncodeOpts(section);
    expect(opts.clockDurationSec).toBe(resolveTimelineDuration(section));
    expect(opts.section.slug).toBe('page-1');
    expect(opts.allowInertOnly).toBe(true);
    expect(typeof opts.onSample).toBe('function');
  });

  it('uses zero clock when the section has no timeline content', () => {
    const section = {
      slug: 'page-1',
      doc: { type: 'doc', content: [] },
      layers: []
    };
    const opts = composeTimelineEncodeOpts(section);
    expect(opts.clockDurationSec).toBe(0);
  });

  it('includes page background video in the clock', () => {
    const section = {
      slug: 'page-1',
      doc: { type: 'doc', content: [] },
      layers: [],
      timelineDurationSec: 8
    };
    const opts = composeTimelineEncodeOpts(section, {
      pagePresentation: { backgroundVideo: 'penmedia:bg' }
    });
    expect(opts.clockDurationSec).toBe(8);
  });
});
