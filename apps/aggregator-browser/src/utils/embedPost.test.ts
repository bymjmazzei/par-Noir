import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadMemberFeedMeta = vi.fn(async (_id: string): Promise<Record<string, unknown> | null> => null);
const resolvePublicMediaObjectUrl = vi.fn(async (id: string, variant: string) => `blob:${id}:${variant}`);

vi.mock('../services/feedMemberMeta', async () => {
  const actual = await vi.importActual<typeof import('../services/feedMemberMeta')>('../services/feedMemberMeta');
  return { ...actual, loadMemberFeedMeta: (id: string) => loadMemberFeedMeta(id) };
});
vi.mock('../services/feedPreviewPlayback', async () => {
  const actual = await vi.importActual<typeof import('../services/feedPreviewPlayback')>(
    '../services/feedPreviewPlayback'
  );
  return {
    ...actual,
    resolvePublicFeedObjectUrl: async (id: string, meta: never, opts?: { variant?: string }) =>
      resolvePublicMediaObjectUrl(id, actual.feedPlaybackVariant(meta, opts?.variant as never))
  };
});

import { loadEmbedPost } from '../hooks/useEmbedPost';
import { embedPostAspect, embedPostRefusal } from './embedPost';

const penVideo = {
  penDocId: 'doc-1',
  isPublic: true,
  fileType: 'video',
  feedPoster: { ref: 'p' },
  feedPreviewSd: { ref: 's', contentType: 'video/mp4' },
  galleryAspect: '9/16',
  penFeedPage: { actionSection: { slug: 'body', doc: { type: 'doc', content: [] }, layers: [] } }
};

beforeEach(() => {
  loadMemberFeedMeta.mockReset();
  resolvePublicMediaObjectUrl.mockClear();
});

describe('embedPostRefusal', () => {
  it('embeds a public Pen post with public media', () => {
    expect(embedPostRefusal(penVideo)).toBeNull();
  });

  it('refuses missing, private, non-Pen and template posts', () => {
    expect(embedPostRefusal(null)).toBe('not_found');
    expect(embedPostRefusal({ ...penVideo, isPublic: false })).toBe('private');
    expect(embedPostRefusal({ ...penVideo, isPublic: 'false' })).toBe('private');
    expect(embedPostRefusal({ ...penVideo, penDocId: undefined })).toBe('not_pen');
    expect(embedPostRefusal({ ...penVideo, penTemplateKind: 'template' })).toBe('not_pen');
  });

  it('refuses a single post with no public feed media', () => {
    expect(embedPostRefusal({ ...penVideo, feedPoster: undefined, feedPreviewSd: undefined })).toBe('private');
  });

  it('reads the gallery aspect, defaulting to portrait', () => {
    expect(embedPostAspect({ galleryAspect: '1/1' })).toBe('1/1');
    expect(embedPostAspect({})).toBe('9/16');
  });
});

describe('loadEmbedPost', () => {
  it('builds the feed tile from the public video and poster', async () => {
    loadMemberFeedMeta.mockResolvedValueOnce(penVideo);
    const state = await loadEmbedPost('abc', 'pn-creator');
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(state.file.metadata.fileId).toBe('abc');
    expect(state.file.pnIdentifier).toBe('pn-creator');
    expect(state.model.penDocId).toBe('doc-1');
    expect(resolvePublicMediaObjectUrl).toHaveBeenCalledWith('abc', 'poster');
    expect(resolvePublicMediaObjectUrl).toHaveBeenCalledWith('abc', 'sd');
  });

  it('never loads media for a post it refuses', async () => {
    loadMemberFeedMeta.mockResolvedValueOnce({ ...penVideo, isPublic: false });
    await expect(loadEmbedPost('abc')).resolves.toEqual({ status: 'refused', reason: 'private' });
    expect(resolvePublicMediaObjectUrl).not.toHaveBeenCalled();
  });

  it('plays a collection through its public members only', async () => {
    const member = { ...penVideo, penDocId: undefined, penPageSlug: 'cover' };
    loadMemberFeedMeta.mockImplementation(async (id) => {
      if (id === 'col') return { penDocId: 'doc-2', isPublic: true, collection: { collectionFileIds: ['m1', 'm2'] } };
      if (id === 'm1') return member;
      return { ...member, isPublic: false };
    });
    const state = await loadEmbedPost('col');
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(state.model.pages.map((p) => p.slug)).toEqual(['cover']);
    expect(resolvePublicMediaObjectUrl).not.toHaveBeenCalledWith('m2', expect.anything());
  });
});
