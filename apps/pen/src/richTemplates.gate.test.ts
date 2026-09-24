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

  it('community landing and site appear in preview catalog', () => {
    const landing = templatePreviewBundle(undefined, 'landing.basic.v1');
    expect(landing?.manifest.classId).toBe('community.landing');
    expect(landing?.sections.map((s) => s.slug)).toEqual(['hero', 'value', 'cta']);
    const site = templatePreviewBundle(undefined, 'site.basic.v1');
    expect(site?.manifest.classId).toBe('community.site');
    const feed = templatePreviewBundle(undefined, 'feed.self_hosted.v1');
    expect(feed?.manifest.classId).toBe('community.feed');
    const embed = templatePreviewBundle(undefined, 'feed.embed.v1');
    expect(embed?.manifest.classId).toBe('community.feed_embed');
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
