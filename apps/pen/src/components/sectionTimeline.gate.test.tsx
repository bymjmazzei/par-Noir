/** Section timeline lists every layer, and a later key moves the sampled rect. */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { emptySection, sampleLayerAt, type PenSectionContent } from '@par-noir/pen-protocol';
import { SectionTimeline } from './SectionTimeline';

const section: PenSectionContent = {
  ...emptySection('body'),
  layers: [
    {
      id: 'title',
      kind: 'text',
      x: 10,
      y: 0,
      w: 80,
      h: 24,
      zIndex: 1,
      name: 'Title',
      motion: {
        keys: [
          { t: 0, x: 10 },
          { t: 1, x: 80 }
        ]
      }
    },
    {
      id: 'clip',
      kind: 'video',
      x: 0,
      y: 40,
      w: 120,
      h: 80,
      zIndex: 2,
      videoSrc: 'https://example.com/a.mp4',
      audioTracks: [{ id: 'voice', src: 'https://example.com/voice.mp3' }]
    }
  ]
};

describe('section timeline', () => {
  it('lists a text layer as a track and samples a later key into the row', () => {
    const html = renderToStaticMarkup(
      <SectionTimeline
        section={section}
        activeLayerId="title"
        playheadSec={1}
        playing={false}
        onPlayhead={() => undefined}
        onPlaying={() => undefined}
        onSelectLayer={() => undefined}
        onSectionChange={() => undefined}
      />
    );
    expect(html).toContain('aria-label="Keyframe"');
    expect(html).toContain('Keyframe');
    expect(html).toContain('data-track-row="title"');
    expect(html).toContain('data-sampled-x="80"');
    expect(html).toContain('data-audio-lane="voice"');
    expect(sampleLayerAt(section.layers![0]!, 1).x).toBe(80);
    expect(section.layers![0]!.x).toBe(10);
  });
});
