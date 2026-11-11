/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { inlineBlobUrls, svgImageUrl } from './rasterizePagePoster';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('raster SVG urls', () => {
  it('encodes the SVG as a data: url', () => {
    const url = svgImageUrl('<svg xmlns="http://www.w3.org/2000/svg"><text>#a & b</text></svg>');
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(url.slice(url.indexOf(',') + 1))).toContain('#a & b');
  });

  it('swaps blob: images and backgrounds for data: urls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === 'blob:http://x/missing'
          ? Promise.reject(new Error('revoked'))
          : { blob: async () => new Blob(['png'], { type: 'image/png' }) }
      )
    );
    const root = document.createElement('div');
    root.innerHTML =
      '<img src="blob:http://x/photo"><img src="blob:http://x/missing"><img src="data:image/png;base64,AA==">' +
      '<div style="background-image: url(&quot;blob:http://x/bg&quot;)"></div>';
    await inlineBlobUrls(root);
    const [photo, missing, kept] = Array.from(root.querySelectorAll('img'));
    expect(photo!.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    expect(missing!.hasAttribute('src')).toBe(false);
    expect(kept!.getAttribute('src')).toBe('data:image/png;base64,AA==');
    const bg = (root.querySelector('div') as HTMLElement).style.backgroundImage;
    expect(bg).toMatch(/data:image\/png;base64,/);
    expect(bg).not.toMatch(/blob:/);
  });
});
