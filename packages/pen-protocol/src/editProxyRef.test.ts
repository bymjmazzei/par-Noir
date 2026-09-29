import { describe, expect, it } from 'vitest';
import { editorPlaybackSrc, publishPlaybackSrc } from './editProxyRef.js';

describe('edit proxy refs', () => {
  it('plays the proxy in the editor and the original on publish', () => {
    const layer = {
      videoSrc: 'penmedia:original',
      editProxySrc: 'penmedia:proxy'
    };
    expect(editorPlaybackSrc(layer)).toBe('penmedia:proxy');
    expect(publishPlaybackSrc(layer)).toBe('penmedia:original');
  });

  it('does not select the original while the proxy is missing', () => {
    const layer = { videoSrc: 'penmedia:original', backgroundVideo: 'penmedia:bg' };
    expect(editorPlaybackSrc(layer)).toBeUndefined();
    expect(publishPlaybackSrc(layer)).toBe('penmedia:original');
    expect(publishPlaybackSrc({ backgroundVideo: 'penmedia:bg' })).toBe('penmedia:bg');
  });

  it('plays the reversed proxy in the editor and the original on publish', () => {
    const layer = {
      videoSrc: 'penmedia:original',
      editProxySrc: 'penmedia:proxy',
      mediaReversed: true,
      reverseProxySrc: 'penmedia:reverse'
    };
    expect(editorPlaybackSrc(layer)).toBe('penmedia:reverse');
    expect(publishPlaybackSrc(layer)).toBe('penmedia:original');
  });

  it('keeps a small file by pointing the proxy at the original ref', () => {
    const layer = { videoSrc: 'penlocal:clip', editProxySrc: 'penlocal:clip' };
    expect(editorPlaybackSrc(layer)).toBe('penlocal:clip');
    expect(publishPlaybackSrc(layer)).toBe('penlocal:clip');
  });
});
