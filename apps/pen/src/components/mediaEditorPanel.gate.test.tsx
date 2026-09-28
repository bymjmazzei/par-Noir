/** Media and widget side panes keep sliders inside icons. */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { emptySection } from '@par-noir/pen-protocol';
import type { PenPageLayer, PenSectionContent } from '@par-noir/pen-protocol';
import { MediaEditorPanel } from './MediaEditorPanel';
import { WidgetEditorPanel } from './WidgetEditorPanel';

const section: PenSectionContent = {
  ...emptySection('card'),
  layers: []
};

const portrait: PenPageLayer = {
  id: 'still',
  kind: 'image',
  x: 0,
  y: 0,
  w: 90,
  h: 160,
  zIndex: 1,
  imageSrc: 'https://example.com/tall.jpg'
};

const video: PenPageLayer = {
  id: 'clip',
  kind: 'video',
  x: 0,
  y: 0,
  w: 1080,
  h: 1920,
  zIndex: 1,
  videoSrc: 'https://example.com/tall.mp4',
  audioTracks: [
    { id: 'voice', src: 'https://example.com/voice.mp3' },
    { id: 'song', licensedDocId: 'music-doc-1' }
  ]
};

describe('media and widget panels', () => {
  it('hides sliders until a value icon is opened', () => {
    const media = renderToStaticMarkup(
      <MediaEditorPanel layer={portrait} section={section} onSectionChange={() => undefined} />
    );
    expect(media).not.toContain('type="range"');
    expect(media).not.toContain('aspect-video');
    expect(media).toContain('aspect-ratio:90 / 160');
    const widget = renderToStaticMarkup(
      <WidgetEditorPanel
        layer={{ ...portrait, kind: 'interactive', label: 'Yes' }}
        section={section}
        onSectionChange={() => undefined}
      />
    );
    expect(widget).not.toContain('type="range"');
    expect(widget).toContain('>Fill<');
    expect(widget).toContain('#0f766e');
    expect(widget).toContain('>Trigger<');
  });

  it('renders a timeline lane for each audio track on a video', () => {
    const html = renderToStaticMarkup(
      <MediaEditorPanel layer={video} section={section} onSectionChange={() => undefined} />
    );
    expect(html).toContain('data-media-timeline');
    expect(html).toContain('data-audio-lane="voice"');
    expect(html).toContain('data-audio-lane="song"');
    expect(html).not.toContain('aspect-video');
  });
});
