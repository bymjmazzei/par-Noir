/** Video layout still while the edit proxy encodes; player after proxy exists. */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LayerMediaContent } from './LayerMediaContent';

describe('layer media without a proxy', () => {
  it('shows a layout still (no shared player) while the proxy is pending', () => {
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
    expect(html).not.toContain('data-pen-media-key');
  });

  it('uses the shared player when editProxySrc is set', () => {
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
          videoSrc: 'https://example.com/clip.mp4',
          editProxySrc: 'https://example.com/proxy.mp4'
        }}
      />
    );
    expect(html).toContain('data-pen-media-key="pen-layer:clip"');
  });
});
