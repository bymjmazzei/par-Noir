import { describe, expect, it } from 'vitest';
import type { PenPageLayer, PenSectionContent } from '@par-noir/pen-protocol';
import {
  editorVideoNeedsProxy,
  editorVideoPlayable,
  sectionBlocksPlayback,
  sectionEncodingBlocksPlayback
} from './editorVideoReady';

describe('editorVideoReady', () => {
  const videoLayer: PenPageLayer = {
    id: 'v',
    kind: 'video',
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    zIndex: 1,
    videoSrc: 'penlocal:clip'
  };

  it('needs proxy until editProxySrc is set', () => {
    expect(editorVideoNeedsProxy(videoLayer)).toBe(true);
    expect(
      editorVideoPlayable({ ...videoLayer, editProxySrc: 'penlocal:p' }, { resolvedPlayUrl: 'blob:x' })
    ).toBe(true);
    expect(editorVideoPlayable(videoLayer, { resolvedPlayUrl: 'blob:x' })).toBe(false);
  });

  it('blocks section playback while proxy is pending', () => {
    const section: PenSectionContent = { slug: 'p', layers: [videoLayer] };
    expect(sectionBlocksPlayback(section, null, () => false)).toBe(true);
    expect(sectionBlocksPlayback(section, null, () => true)).toBe(false);
  });

  it('blocks Play only during encode, not while resolving proxy URL', () => {
    const section: PenSectionContent = { slug: 'p', layers: [videoLayer] };
    expect(sectionEncodingBlocksPlayback(section, null)).toBe(true);
    const withProxy: PenSectionContent = {
      slug: 'p',
      layers: [{ ...videoLayer, editProxySrc: 'penlocal:p' }]
    };
    expect(sectionEncodingBlocksPlayback(withProxy, null)).toBe(false);
    expect(sectionBlocksPlayback(withProxy, null, () => false)).toBe(false);
  });
});
