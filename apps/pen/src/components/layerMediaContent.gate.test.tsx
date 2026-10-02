/** A video with no edit proxy still paints from the original file. */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LayerMediaContent } from './LayerMediaContent';

describe('layer media without a proxy', () => {
  it('paints the original video when the proxy is absent', () => {
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
    expect(html).toContain('<canvas');
  });
});
