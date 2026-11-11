/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  inlineBlobUrls,
  inlineSafeComputedStyles,
  placeCloneRootAtOrigin,
  svgImageUrl
} from './rasterizePagePoster';

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

  it('keeps hidden nodes hidden and clips scroll areas without bars', () => {
    const live = document.createElement('div');
    live.innerHTML =
      '<div style="display: none">hidden</div><div style="overflow: auto">scroll</div><div style="overflow: visible">open</div>';
    document.body.appendChild(live);
    const clone = live.cloneNode(true) as HTMLElement;
    inlineSafeComputedStyles(live, clone);
    const [hidden, scroll, open] = Array.from(clone.children) as HTMLElement[];
    expect(hidden!.style.display).toBe('none');
    expect(scroll!.style.overflow).toBe('hidden');
    expect(open!.style.overflow).toBe('visible');
    live.remove();
  });

  it('copies zero borders and margins so browser defaults do not come back in the SVG', () => {
    const live = document.createElement('div');
    live.innerHTML = '<p style="margin: 0px; border-style: solid; border-width: 0px">x</p>';
    document.body.appendChild(live);
    const clone = live.cloneNode(true) as HTMLElement;
    inlineSafeComputedStyles(live, clone);
    const p = clone.firstElementChild as HTMLElement;
    expect(p.style.marginTop).toBe('0px');
    expect(p.style.borderTopStyle).toBe('solid');
    expect(p.style.borderTopWidth).toBe('0px');
    live.remove();
  });

  it('bakes the page from its own top-left, not where the editor placed it', () => {
    const clone = document.createElement('div');
    clone.style.cssText =
      'position:absolute;margin:0 120px;left:18px;top:18px;transform:translate(4px, 4px);width:500px';
    placeCloneRootAtOrigin(clone, 360, 640);
    expect(clone.style.margin).toBe('0px');
    expect(clone.style.position).toBe('relative');
    expect(clone.style.left).toBe('0px');
    expect(clone.style.top).toBe('0px');
    expect(clone.style.transform).toBe('none');
    expect(clone.style.width).toBe('360px');
    expect(clone.style.height).toBe('640px');
    expect(clone.style.overflow).toBe('hidden');
  });
});
