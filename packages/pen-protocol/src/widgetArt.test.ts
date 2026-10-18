import { describe, expect, it } from 'vitest';
import { artLayer } from './curated/kit.js';
import {
  applyWidgetArtMedia,
  switchWidgetArtFillMode,
  widgetArtFillMode,
  widgetArtUsesHtmlSnippet
} from './widgetArt.js';

describe('widgetArt', () => {
  const section = { slug: 'card', doc: { type: 'doc', content: [] }, layers: [artLayer('a', '<b>x</b>')] };

  it('prefers html when only htmlSource is set', () => {
    const layer = section.layers![0]!;
    expect(widgetArtFillMode(layer)).toBe('html');
    expect(widgetArtUsesHtmlSnippet(layer)).toBe(true);
  });

  it('prefers structured fill over htmlSource', () => {
    const layer = { ...section.layers![0]!, backgroundColor: '#112233', htmlSource: '<i>art</i>' };
    expect(widgetArtFillMode(layer)).toBe('color');
    expect(widgetArtUsesHtmlSnippet(layer)).toBe(false);
  });

  it('switches to color and clears snippet', () => {
    const next = switchWidgetArtFillMode(section, 'a', 'color');
    const layer = next.layers!.find((item) => item.id === 'a')!;
    expect(layer.backgroundColor).toBe('#f5f5f5');
    expect(layer.htmlSource).toBeUndefined();
    expect(widgetArtFillMode(layer)).toBe('color');
  });

  it('applies image media on art layer', () => {
    const next = applyWidgetArtMedia(section, 'a', { kind: 'image', src: 'penmedia:img1' });
    const layer = next.layers!.find((item) => item.id === 'a')!;
    expect(layer.backgroundImage).toBe('penmedia:img1');
    expect(layer.htmlSource).toBeUndefined();
    expect(widgetArtFillMode(layer)).toBe('image');
  });
});
