import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalDocBundle } from './penLocalStore';

const media = vi.hoisted(() => ({
  attached: [] as string[],
  download: vi.fn(async () => new Blob([1, 2, 3], { type: 'image/jpeg' }))
}));

vi.mock('@par-noir/pen-media', async () => {
  const actual = await vi.importActual<typeof import('@par-noir/pen-media')>('@par-noir/pen-media');
  return {
    ...actual,
    downloadPenMedia: media.download,
    attachMediaFile: vi.fn(async (params: { docId: string }) => {
      const ref = `penmedia:fork-${params.docId}-${media.attached.length + 1}`;
      media.attached.push(ref);
      return { ref, mediaId: ref, blobUrl: 'blob:x', mime: 'image/jpeg' };
    }),
    resolvePenMediaSrc: vi.fn(async () => null)
  };
});

vi.mock('./createDocFromTemplate', async () => {
  const actual = await vi.importActual<typeof import('./createDocFromTemplate')>(
    './createDocFromTemplate'
  );
  return {
    ...actual,
    bootstrapDocBundle: vi.fn(async (input: {
      docId: string;
      sections: LocalDocBundle['sections'];
      forkedFromDocId?: string;
      title?: string;
      pagePresentation?: LocalDocBundle['manifest']['pagePresentation'];
    }) => {
      return {
        manifest: {
          docId: input.docId,
          title: input.title || 'Fork',
          docType: 'note',
          classId: 'social.note',
          templateId: 'note.hot_take.v1',
          templateVersion: '1',
          toc: input.sections.map((s) => s.slug),
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          forkedFromDocId: input.forkedFromDocId,
          pagePresentation: input.pagePresentation
        },
        sections: input.sections,
        chain: { docId: input.docId, genesis: { hash: 'g' }, links: [] }
      } as unknown as LocalDocBundle;
    })
  };
});

vi.mock('./penLocalStore', () => ({
  saveLocalDoc: vi.fn()
}));

import { forkDocForNewPost } from './forkDocForNewPost';

function sourceBundle(): LocalDocBundle {
  return {
    manifest: {
      docId: 'doc-source',
      title: 'Source',
      docType: 'note',
      classId: 'social.note',
      templateId: 'note.hot_take.v1',
      templateVersion: '1',
      toc: ['body'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      publishedFileId: 'post-1',
      pagePresentation: { backgroundImage: 'penmedia:bg-src' }
    },
    sections: [
      {
        slug: 'body',
        doc: { type: 'doc', content: [] },
        layers: [
          {
            id: 'img',
            kind: 'image',
            x: 0,
            y: 0,
            w: 100,
            h: 100,
            zIndex: 1,
            imageSrc: 'penmedia:img-src',
            spreadsheetId: 'poll-sheet'
          }
        ]
      }
    ],
    chain: { docId: 'doc-source', genesis: { hash: 'g' }, links: [] }
  } as unknown as LocalDocBundle;
}

describe('forkDocForNewPost', () => {
  beforeEach(() => {
    media.attached.length = 0;
    media.download.mockClear();
  });

  it('creates a new docId without publishedFileId and remaps penmedia refs', async () => {
    const fork = await forkDocForNewPost({
      session: {
        pnIdentifier: 'pn-test',
        accessToken: 'tok',
        unlockToken: 'u'
      } as never,
      source: sourceBundle()
    });

    expect(fork.manifest.docId).not.toBe('doc-source');
    expect(fork.manifest.docId.startsWith('pen_')).toBe(true);
    expect(fork.manifest.publishedFileId).toBeUndefined();
    expect(fork.manifest.forkedFromDocId).toBe('doc-source');
    const layer = fork.sections[0]?.layers?.[0] as { imageSrc?: string; spreadsheetId?: string };
    expect(layer.imageSrc).toMatch(/^penmedia:fork-/);
    expect(layer.imageSrc).not.toBe('penmedia:img-src');
    expect(layer.spreadsheetId).toBeUndefined();
    expect(fork.manifest.pagePresentation?.backgroundImage).toMatch(/^penmedia:fork-/);
    expect(fork.manifest.pagePresentation?.backgroundImage).not.toBe('penmedia:bg-src');
  });
});
