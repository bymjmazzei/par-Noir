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

  it('templatePreviewBundle carries seed presentation for image post', () => {
    const image = requireTemplate('post.image.portrait.v1');
    expect(image.title).toContain('Image Post');
    const preview = templatePreviewBundle(undefined, 'post.image.portrait.v1');
    expect(preview?.manifest.pagePresentation).toBeTruthy();
    expect(preview?.manifest.galleryAspect).toBe('9/16');
    expect(
      preview?.sections.some((s) =>
        (s.layers || []).some((l) => l.kind === 'image' && l.imageSrc)
      )
    ).toBe(true);
  });

  it('video starter preview exposes video layer src', () => {
    const preview = templatePreviewBundle(undefined, 'post.video.portrait.v1');
    expect(preview?.title).toContain('Video Post');
    expect(
      preview?.sections.some((s) =>
        (s.layers || []).some((l) => l.kind === 'video' && l.videoSrc)
      )
    ).toBe(true);
  });

  it('community landing and site starters are retired from platform pack', () => {
    expect(() => requireTemplate('landing.basic.v1')).toThrow();
    expect(() => requireTemplate('site.basic.v1')).toThrow();
    expect(() => requireTemplate('feed.self_hosted.v1')).toThrow();
    expect(() => requireTemplate('feed.embed.v1')).toThrow();
  });

  it('social starters expose pre-baked gallery preview refs', () => {
    const preview = templatePreviewBundle(undefined, 'note.basic.portrait.v1');
    expect(preview?.manifest.galleryPreviewRef).toBeTruthy();
    expect(preview?.manifest.galleryPreviewKind).toBe('image');
  });

  it('basic note is text-first (optional chrome layers, no media-as-format)', () => {
    const preview = templatePreviewBundle(undefined, 'note.basic.portrait.v1');
    const layers = preview?.sections[0]?.layers || [];
    expect(layers.every((l) => l.kind === 'text')).toBe(true);
    expect(preview?.manifest.pagePresentation?.backgroundColor).toBeTruthy();
  });

  it('poll preview binds embed + interactive stickers to seed table placeholder', () => {
    const preview = templatePreviewBundle(undefined, 'poll.basic.v1');
    const layers = preview?.sections[0]?.layers || [];
    expect(layers.some((l) => l.kind === 'embed')).toBe(true);
    expect(layers.some((l) => l.kind === 'interactive' && l.behavior === 'poll.vote')).toBe(
      true
    );
  });
});
