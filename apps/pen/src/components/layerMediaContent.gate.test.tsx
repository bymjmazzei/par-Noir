/** Editor layer video mounts PenMediaPlayer from master refs without edit-proxy gating. */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LayerMediaContent } from './LayerMediaContent';

describe('layer media preview', () => {
  it('uses the shared player for a video layer with only videoSrc', () => {
    const html = renderToStaticMarkup(
      <LayerMediaContent
        layer={{
          id: 'clip',
          kind: 'video',
          x: 0,
          y: 0,
          w: 160,
          h: 90,
          zIndex: 1,
          videoSrc: 'https://example.com/clip.mp4'
        }}
      />
    );
    expect(html).toContain('data-pen-playback="edit"');
    expect(html).toContain('data-pen-media-key="pen-layer:clip"');
  });

  it('shows a loading placeholder for unresolved penmedia refs', () => {
    const html = renderToStaticMarkup(
      <LayerMediaContent
        layer={{
          id: 'clip',
          kind: 'video',
          x: 0,
          y: 0,
          w: 160,
          h: 90,
          zIndex: 1,
          videoSrc: 'penmedia:file123'
        }}
      />
    );
    expect(html).toContain('data-pen-playback="edit"');
    expect(html).toContain('bg-neutral-200/80');
    expect(html).not.toContain('data-pen-media-key');
  });
});
