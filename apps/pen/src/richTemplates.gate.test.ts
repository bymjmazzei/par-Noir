/** Gallery / create wiring for rich platform starters. */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireTemplate } from '@par-noir/pen-protocol';
import { templatePreviewBundle } from './components/TemplateGalleryThumb';

vi.mock('./services/penApi', () => ({
  requestNotaryStamp: vi.fn(async () => null)
}));

describe('rich template preview + create chrome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('templatePreviewBundle carries seed presentation and layer media', () => {
    const image = requireTemplate('post.media.v1');
    expect(image.title).toBe('Image Post');
    const preview = templatePreviewBundle(undefined, 'post.media.v1');
    expect(preview?.manifest.pagePresentation?.backgroundImage).toBeTruthy();
    expect(
      preview?.sections.some((s) =>
        (s.layers || []).some((l) => l.kind === 'image' && l.imageSrc)
      )
    ).toBe(true);
  });

  it('video starter preview exposes video layer src', () => {
    const preview = templatePreviewBundle(undefined, 'post.video.v1');
    expect(preview?.title).toBe('Video Post');
    expect(
      preview?.sections.some((s) =>
        (s.layers || []).some((l) => l.kind === 'video' && l.videoSrc)
      )
    ).toBe(true);
  });
});
