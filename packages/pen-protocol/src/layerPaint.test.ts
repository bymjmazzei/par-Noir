import { describe, expect, it } from 'vitest';
import { collectFontFamiliesFromLayers } from './fonts.js';
import {
  DEFAULT_LAYER_FILL,
  isDirectImageSrc,
  layerChromeStyle,
  layerMediaSource,
  layerPaintStyle
} from './layerPaint.js';
import type { PenPageLayer } from './types.js';

const box = { x: 0, y: 0, w: 100, h: 40, zIndex: 1 };

function layer(patch: Partial<PenPageLayer>): PenPageLayer {
  return { ...box, id: 'l', kind: 'interactive', ...patch } as PenPageLayer;
}

describe('layerPaintStyle', () => {
  it('fills a bare button with the default face and scales its corners', () => {
    expect(layerPaintStyle(layer({ cornerRadius: 8, textColor: '#111' }), { scale: 0.5 })).toEqual({
      borderRadius: '4px',
      color: '#111',
      backgroundColor: DEFAULT_LAYER_FILL
    });
  });

  it('gradient wins over image and color', () => {
    const paint = layerPaintStyle(
      layer({ backgroundGradient: 'linear-gradient(red, blue)', backgroundColor: '#000' })
    );
    expect(paint.backgroundImage).toBe('linear-gradient(red, blue)');
    expect(paint.backgroundColor).toBeUndefined();
  });

  it('uses a resolved address for a Pen media background image', () => {
    const own = layerPaintStyle(layer({ backgroundImage: 'penmedia:x' }));
    expect(own.backgroundImage).toBeUndefined();
    const resolved = layerPaintStyle(layer({ backgroundImage: 'penmedia:x' }), {
      backgroundImageSrc: 'blob:poster'
    });
    expect(resolved.backgroundImage).toBe('url(blob:poster)');
  });

  it('leaves text color to the text document and media layers transparent', () => {
    expect(layerPaintStyle(layer({ kind: 'text', textColor: '#f00' })).color).toBeUndefined();
    expect(layerPaintStyle(layer({ kind: 'image', imageSrc: 'https://x/y.png' }))).toEqual({
      backgroundColor: 'transparent'
    });
  });
});

describe('layerChromeStyle', () => {
  it('draws no outline on an unstroked group; the outline is editor chrome', () => {
    expect(layerChromeStyle(layer({ kind: 'group' })).border).toBeUndefined();
  });
});

describe('layerMediaSource', () => {
  it('finds the image, video, or background a layer paints', () => {
    expect(layerMediaSource(layer({ kind: 'image', imageSrc: 'penmedia:a' }))).toEqual({
      src: 'penmedia:a',
      kind: 'image'
    });
    expect(layerMediaSource(layer({ kind: 'video', videoSrc: 'penmedia:v' }))).toEqual({
      src: 'penmedia:v',
      kind: 'video'
    });
    expect(layerMediaSource(layer({ backgroundImage: 'https://x/bg.png' }))?.kind).toBe('image');
    expect(layerMediaSource(layer({ kind: 'group' }))).toBeNull();
  });

  it('treats Pen media refs as needing a resolve', () => {
    expect(isDirectImageSrc('penlocal:a')).toBe(false);
    expect(isDirectImageSrc('penmedia:a')).toBe(false);
    expect(isDirectImageSrc('https://x/y.png')).toBe(true);
  });
});

describe('collectFontFamiliesFromLayers', () => {
  it('collects layer text fonts plus the doc default', () => {
    const textDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Go', marks: [{ type: 'textStyle', attrs: { fontFamily: 'Bebas Neue' } }] }
          ]
        }
      ]
    };
    expect(collectFontFamiliesFromLayers([{ textDoc }, {}], 'Roboto')).toEqual(['Roboto', 'Bebas Neue']);
  });
});
