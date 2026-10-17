import { describe, expect, it } from 'vitest';
import { publishPlaybackSrc } from './playbackSrc.js';

describe('publishPlaybackSrc', () => {
  it('prefers the layer video, then the page background video', () => {
    expect(publishPlaybackSrc({ videoSrc: 'penmedia:clip', backgroundVideo: 'penmedia:bg' })).toBe('penmedia:clip');
    expect(publishPlaybackSrc({ backgroundVideo: 'penmedia:bg' })).toBe('penmedia:bg');
    expect(publishPlaybackSrc({ videoSrc: '  ' })).toBeUndefined();
    expect(publishPlaybackSrc(null)).toBeUndefined();
  });
});
