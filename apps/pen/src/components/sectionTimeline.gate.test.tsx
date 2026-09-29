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
    expect(html).toContain('aria-label="Graph"');
    expect(html).toMatch(/aria-label="Graph"[^>]*disabled=""/);
    expect(html).not.toContain('data-keyframe-graphs');
    expect(html).toContain('data-keyframe="title:0"');
    const between = renderToStaticMarkup(
      <SectionTimeline
        section={section}
        activeLayerId="title"
        playheadSec={0.5}
        playing={false}
        onPlayhead={() => undefined}
        onPlaying={() => undefined}
        onSelectLayer={() => undefined}
        onSectionChange={() => undefined}
      />
    );
    expect(between).toContain('aria-label="Graph"');
    expect(between).not.toMatch(/aria-label="Graph"[^>]*disabled=""/);
    expect(between).not.toContain('data-keyframe-graphs');
    expect(html).toContain('data-track-row="title"');
    expect(html).toContain('data-sampled-x="80"');
    expect(html).toContain('data-audio-lane="voice"');
    expect(html).toContain('data-timeline-playhead');
    expect(html).toContain('data-timeline-scale');
    expect(html).toContain('aria-label="Zoom"');
    expect(html).toContain('aria-label="Zoom in"');
    expect(html).toContain('aria-label="Zoom out"');
    expect(html).toContain('data-tick="major"');
    expect(html).toContain('aria-label="Mute title"');
    expect(html).toContain('aria-label="Mute voice"');
    expect(html).toContain('aria-label="Trim start clip"');
    expect(html).toContain('aria-label="Split clip"');
    expect(html).toContain('aria-label="Mirror"');
    expect(html).toContain('aria-label="Reverse"');
    expect(html).toContain('aria-label="Delete clip"');
    expect(html).toContain('title="Playhead"');
    expect(html).toContain('title="Split clip"');
    expect(html).toContain('title="Mute"');
    expect(html).toContain('title="Unmute"');
    expect(html).toContain('data-clip-title="Title"');
    expect(html).toContain('border-blue-600');
    expect(html).toContain('bg-white');
    expect(sampleLayerAt(section.layers![0]!, 1).x).toBe(80);
    expect(section.layers![0]!.x).toBe(10);
  });

  it('puts a transition marker where two clips share a track', () => {
    const joined: PenSectionContent = {
      ...section,
      layers: [
        {
          id: 'a',
          kind: 'video',
          x: 0,
          y: 0,
          w: 80,
          h: 40,
          zIndex: 1,
          timelineTrackId: 'a',
          inSec: 0,
          outSec: 2,
          name: 'One'
        },
        {
          id: 'b',
          kind: 'video',
          x: 0,
          y: 0,
          w: 80,
          h: 40,
          zIndex: 2,
          timelineTrackId: 'a',
          inSec: 2,
          outSec: 4,
          name: 'Two'
        }
      ]
    };
    const html = renderToStaticMarkup(
      <SectionTimeline
        section={joined}
        activeLayerId="a"
        playheadSec={0}
        playing={false}
        onPlayhead={() => undefined}
        onPlaying={() => undefined}
        onSelectLayer={() => undefined}
        onSectionChange={() => undefined}
      />
    );
    expect(html).toContain('data-transition-join');
    expect(html).toContain('data-clip-title="One"');
    expect(html).toContain('aria-label="Mute a"');
  });
});
