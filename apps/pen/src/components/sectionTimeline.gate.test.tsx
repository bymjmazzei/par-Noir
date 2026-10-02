/** Section timeline lists every layer, and a later key moves the sampled rect. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { emptySection, sampleLayerAt, type PenSectionContent } from '@par-noir/pen-protocol';
import { SectionTimeline, shouldSeekTimelineVideo, timelineTracksMaxPx } from './SectionTimeline';

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
  it('lets a forward clip play on its own clock', () => {
    expect(shouldSeekTimelineVideo('tick', false)).toBe(false);
    expect(shouldSeekTimelineVideo('play', false)).toBe(true);
    expect(shouldSeekTimelineVideo('seek', false)).toBe(true);
    expect(shouldSeekTimelineVideo('pause', false)).toBe(false);
    expect(shouldSeekTimelineVideo('tick', true)).toBe(true);
  });

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
    expect(html).toContain('data-track-row="clip"');
    expect(html).not.toContain('aria-label="Trim start clip"');
    expect(html).toContain('data-timeline-toolbar');
    expect(html).toContain('grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]');
    expect(html).not.toContain('flex-wrap items-center gap-2');
    expect(html).toContain('aria-label="Split clip"');
    expect(html.indexOf('aria-label="Mirror"')).toBeLessThan(html.indexOf('aria-label="Reverse"'));
    expect(html.indexOf('aria-label="Reverse"')).toBeLessThan(html.indexOf('aria-label="Split clip"'));
    expect(html.indexOf('aria-label="Split clip"')).toBeLessThan(html.indexOf('aria-label="Keyframe"'));
    expect(html.indexOf('aria-label="Keyframe"')).toBeLessThan(html.indexOf('aria-label="Graph"'));
    expect(html.indexOf('aria-label="Graph"')).toBeLessThan(html.indexOf('aria-label="Play"'));
    expect(html.indexOf('aria-label="Play"')).toBeLessThan(html.indexOf('aria-label="Zoom"'));
    expect(html.indexOf('aria-label="Zoom"')).toBeLessThan(html.indexOf('aria-label="Delete clip"'));
    expect(html).toContain('aria-label="Mirror"');
    expect(html).toContain('aria-label="Reverse"');
    expect(html).toContain('aria-label="Delete clip"');
    expect(html).toContain('title="Playhead"');
    expect(html).toContain('title="Split clip"');
    expect(html).toContain('title="Mute"');
    expect(html).toContain('title="Unmute"');
    expect(html).toContain('data-clip-title="Title"');
    expect(html).toContain('data-clip-preview="title"');
    const rowAt = html.indexOf('data-clip-preview="title"');
    const textRow = html.slice(Math.max(0, rowAt - 400), rowAt + 80);
    expect(textRow.indexOf('data-clip-title="Title"')).toBeGreaterThan(-1);
    expect(textRow.indexOf('data-clip-preview="title"')).toBeGreaterThan(
      textRow.indexOf('data-clip-title="Title"')
    );
    expect(textRow).toContain('flex items-center gap-2');
    expect(textRow).not.toContain('absolute left-3');
    expect(html).toContain('data-timeline-tracks');
    expect(html).toContain('data-timeline-resize');
    expect(html).toContain('aria-label="Resize timeline"');
    expect(html).not.toContain('h-[6.5rem]');
    expect(html).not.toContain('max-height');
    expect(timelineTracksMaxPx(1)).toBeNull();
    expect(timelineTracksMaxPx(3)).toBeNull();
    expect(timelineTracksMaxPx(4)).toBe(104);
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

  it('gives a widget group one track and a solo layer its own', () => {
    const widget: PenSectionContent = {
      ...emptySection('card'),
      layers: [
        {
          id: 'box',
          kind: 'group',
          x: 0,
          y: 0,
          w: 100,
          h: 80,
          zIndex: 1,
          name: 'Box',
          durationSec: 4
        },
        {
          id: 'yes',
          kind: 'interactive',
          parentGroupId: 'box',
          x: 0,
          y: 0,
          w: 40,
          h: 20,
          zIndex: 1,
          name: 'Yes',
          motion: { keys: [{ t: 0, x: 0 }, { t: 1, x: 10 }] }
        },
        {
          id: 'no',
          kind: 'interactive',
          parentGroupId: 'box',
          x: 50,
          y: 0,
          w: 40,
          h: 20,
          zIndex: 2,
          name: 'No'
        },
        {
          id: 'solo',
          kind: 'text',
          x: 0,
          y: 90,
          w: 40,
          h: 20,
          zIndex: 2,
          name: 'Solo'
        }
      ]
    };
    const html = renderToStaticMarkup(
      <SectionTimeline
        mode="widget"
        section={widget}
        activeLayerId="yes"
        playheadSec={0.5}
        playing={false}
        onPlayhead={() => undefined}
        onPlaying={() => undefined}
        onSelectLayer={() => undefined}
        onSectionChange={() => undefined}
      />
    );
    expect(html.match(/data-track-row="/g)).toHaveLength(2);
    expect(html).toContain('data-track-row="box"');
    expect(html).toContain('data-track-row="solo"');
    expect(html).not.toContain('data-track-row="yes"');
    expect(html).not.toContain('data-track-row="no"');
    expect(html).toContain('data-keyframe="yes:0"');
    expect(html).toContain('aria-label="Keyframe"');
    expect(html).toContain('aria-label="Graph"');
    expect(html).not.toContain('aria-label="Split clip"');
    expect(html).not.toContain('aria-label="Mirror"');
    expect(html).not.toContain('aria-label="Reverse"');
    expect(html).toContain('aria-label="Delete clip"');
  });

  it('keeps a widget keyframe on the playhead instead of the last frame', () => {
    const widget: PenSectionContent = {
      ...emptySection('card'),
      layers: [
        {
          id: 'solo',
          kind: 'text',
          x: 0,
          y: 0,
          w: 40,
          h: 20,
          zIndex: 1,
          name: 'Solo',
          motion: { keys: [{ t: 1, x: 4 }] }
        }
      ]
    };
    const html = renderToStaticMarkup(
      <SectionTimeline
        mode="widget"
        section={widget}
        activeLayerId="solo"
        playheadSec={1}
        playing={false}
        onPlayhead={() => undefined}
        onPlaying={() => undefined}
        onSelectLayer={() => undefined}
        onSectionChange={() => undefined}
      />
    );
    expect(html).toContain('data-keyframe="solo:1"');
    expect(html).toContain('left:20%');
    expect(html).toContain('calc(5.25rem + (100% - 5.25rem) * 0.2)');
    expect(html).not.toContain('left:100%');
  });

  it('caps the track list at three rows once a fourth track exists', () => {
    const many: PenSectionContent = {
      ...emptySection('body'),
      layers: [1, 2, 3, 4].map((n) => ({
        id: `row-${n}`,
        kind: 'text' as const,
        x: 0,
        y: 0,
        w: 40,
        h: 20,
        zIndex: n,
        name: `Row ${n}`
      }))
    };
    const html = renderToStaticMarkup(
      <SectionTimeline
        section={many}
        activeLayerId="row-1"
        playheadSec={0}
        playing={false}
        onPlayhead={() => undefined}
        onPlaying={() => undefined}
        onSelectLayer={() => undefined}
        onSectionChange={() => undefined}
      />
    );
    expect(html).toContain('data-timeline-track-cap="3"');
    expect(html).toContain('max-height:104px');
    expect(html).toContain('data-track-row="row-4"');
    expect(html).toContain('overflow-y-auto');
  });

  it('selects one track and offers an eye and a grabber', () => {
    const html = renderToStaticMarkup(
      <SectionTimeline
        section={section}
        activeLayerId="title"
        playheadSec={0}
        playing={false}
        onPlayhead={() => undefined}
        onPlaying={() => undefined}
        onSelectLayer={() => undefined}
        onSectionChange={() => undefined}
      />
    );
    expect(html).toContain('data-track-selected="true"');
    expect(html).toContain('data-track-selected="false"');
    expect(html).toContain('aria-label="Hide title"');
    expect(html).toContain('aria-label="Reorder title"');
    expect(html.match(/border-blue-600/g)?.length).toBeLessThan(html.match(/border-stone-300/g)?.length || 0);
  });

  it('shows a group as one track until the timeline is inside that group', () => {
    const widget: PenSectionContent = {
      ...emptySection('card'),
      layers: [
        { id: 'box', kind: 'group', x: 0, y: 0, w: 80, h: 40, zIndex: 2, name: 'Box' },
        {
          id: 'yes',
          kind: 'text',
          parentGroupId: 'box',
          x: 0,
          y: 0,
          w: 40,
          h: 20,
          zIndex: 1,
          name: 'Yes'
        },
        { id: 'solo', kind: 'text', x: 0, y: 0, w: 40, h: 20, zIndex: 1, name: 'Solo' }
      ]
    };
    const page = renderToStaticMarkup(
      <SectionTimeline
        section={widget}
        activeLayerId="box"
        playheadSec={0}
        playing={false}
        onPlayhead={() => undefined}
        onPlaying={() => undefined}
        onSelectLayer={() => undefined}
        onSectionChange={() => undefined}
      />
    );
    expect(page).toContain('data-track-row="box"');
    expect(page).not.toContain('data-track-row="yes"');
    const inside = renderToStaticMarkup(
      <SectionTimeline
        section={widget}
        scopeGroupId="box"
        activeLayerId="yes"
        playheadSec={0}
        playing={false}
        onPlayhead={() => undefined}
        onPlaying={() => undefined}
        onSelectLayer={() => undefined}
        onSectionChange={() => undefined}
      />
    );
    expect(inside).toContain('data-track-row="yes"');
    expect(inside).toContain('aria-label="Leave group"');
    expect(inside).not.toContain('data-track-row="solo"');
  });

  it('mounts the timeline under the text editor', () => {
    const page = readFileSync(resolve(__dirname, '../pages/DocEditorPage.tsx'), 'utf8');
    const writing = page.indexOf('writingEnabled && canvasSection && section');
    const timeline = page.indexOf('<SectionTimeline', writing);
    const fallback = page.indexOf('Select Body or a text layer to write.', writing);
    expect(writing).toBeGreaterThan(-1);
    expect(timeline).toBeGreaterThan(writing);
    expect(fallback).toBeGreaterThan(timeline);
  });
});
