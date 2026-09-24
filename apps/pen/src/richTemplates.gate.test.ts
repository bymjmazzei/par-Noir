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
    const image = requireTemplate('post.media.v1');
    expect(image.title).toBe('Image Post');
    const preview = templatePreviewBundle(undefined, 'post.media.v1');
    expect(preview?.manifest.pagePresentation).toBeTruthy();
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

  it('community landing and site appear in preview catalog', () => {
    const landing = templatePreviewBundle(undefined, 'landing.basic.v1');
    expect(landing?.manifest.classId).toBe('community.landing');
    expect(landing?.sections.map((s) => s.slug)).toEqual(['hero', 'value', 'cta']);
    const site = templatePreviewBundle(undefined, 'site.basic.v1');
    expect(site?.manifest.classId).toBe('community.site');
    const feed = templatePreviewBundle(undefined, 'feed.self_hosted.v1');
    expect(feed?.manifest.classId).toBe('community.feed');
  });

  it('basic note is text-first without obligatory media layers', () => {
    const preview = templatePreviewBundle(undefined, 'note.basic.v1');
    expect(preview?.sections[0]?.layers?.length ?? 0).toBe(0);
    expect(preview?.manifest.pagePresentation?.backgroundColor).toBeTruthy();
  });
});
