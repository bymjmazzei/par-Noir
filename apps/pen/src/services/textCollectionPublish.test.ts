/**
 * A social post with more than one page publishes as a feed collection:
 * one flattened image per page, and a parent whose collection.collectionFileIds
 * the feed slideshow reads.
 */
import { describe, expect, it, vi } from 'vitest';
import { publishPostToOwnerCloud, writeTextCollectionHandoff, type PageExport } from './penPublish';
import type { LocalDocBundle } from './penLocalStore';

function prose(text: string) {
  return {
    type: 'doc' as const,
    content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] }]
  };
}

function bundle(): LocalDocBundle {
  return {
    manifest: {
      docId: 'doc-pages',
      title: 'Two pages',
      docType: 'note',
      classId: 'social.note',
      templateId: 'note.hot_take.v1',
      templateVersion: '1',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      toc: ['page-2', 'body'],
      ownerPnHash: 'owner'
    },
    sections: [
      { slug: 'body', doc: prose('First') },
      { slug: 'page-2', doc: prose('Second') }
    ],
    chain: { docId: 'doc-pages', genesis: { hash: 'g' }, links: [] }
  } as unknown as LocalDocBundle;
}

function pageExport(): PageExport {
  return {
    flattenSection: vi.fn(async (slug: string) => new Blob([slug], { type: 'image/jpeg' })),
    encodeSection: vi.fn(async () => {
      throw new Error('no video pages here');
    })
  };
}

function cloud() {
  let n = 0;
  const puts: Array<{ path: string; body: Record<string, unknown> }> = [];
  const deletes: string[] = [];
  let contentOverwrite = false;
  const request = async (method: string, path: string, body?: unknown) => {
    if (method === 'GET' && path.includes('/api/aggregator/metadata-index/prior-post')) {
      return new Response(
        JSON.stringify({
          metadata: {
            collection: { collectionFileIds: ['old-child-1', 'old-child-2'] },
            companionAudioFileIds: ['old-audio']
          }
        }),
        { status: 200 }
      );
    }
    if (method === 'DELETE' && path.includes('/api/aggregator/metadata-index/')) {
      deletes.push(path);
      return new Response('{}', { status: 200 });
    }
    if (method === 'PUT' && path.includes('/api/drive/files/prior-post/content')) {
      contentOverwrite = true;
      return new Response('{}', { status: 200 });
    }
    if (path === '/api/drive/files') {
      n += 1;
      return new Response(JSON.stringify({ id: `file-${n}` }), { status: 200 });
    }
    if (path.includes('/api/aggregator/feed-media/owner-upload')) {
      return new Response(JSON.stringify({ key: `preview-${n}` }), { status: 200 });
    }
    if (path.includes('/api/aggregator/feed-media/confirm-upload')) {
      return new Response('{}', { status: 200 });
    }
    if (path.includes('/ensure-public')) {
      const id = path.includes('prior-post') ? 'prior-post' : `file-${n}`;
      return new Response(
        JSON.stringify({
          publicContentRef: {
            objectId: id,
            publicUrl: `https://drive.google.com/uc?export=download&id=${id}`,
            backend: 'google_drive'
          }
        }),
        { status: 200 }
      );
    }
    if (method === 'PUT' && path.includes('/api/aggregator/metadata-index/')) {
      puts.push({ path, body: body as Record<string, unknown> });
      return new Response('{}', { status: 200 });
    }
    return new Response('unexpected', { status: 500 });
  };
  return { request, puts, deletes, overwritten: () => contentOverwrite };
}

describe('text collection publish', () => {
  it('flattens every page in toc order and uploads collectionFileIds', async () => {
    const doc = bundle();
    const exportFns = pageExport();
    const handoff = await writeTextCollectionHandoff(doc, {
      ...exportFns,
      canPublishPublicTemplate: false
    });
    expect(handoff.contentClass).toBe('collection');
    expect(handoff.pages.map((page) => page.kind)).toEqual(['raster', 'raster']);
    expect(
      handoff.pages.map((page) => (page.kind === 'raster' ? page.description : page.slug))
    ).toEqual(['Second', 'First']);
    expect(exportFns.flattenSection).toHaveBeenCalledTimes(2);
    expect(exportFns.encodeSection).not.toHaveBeenCalled();

    const { request, puts } = cloud();
    const result = await publishPostToOwnerCloud({
      bundle: doc,
      feedIds: ['public', 'collections'],
      pnIdentifier: 'pn',
      parentFolderId: 'public-folder',
      membership: false,
      request,
      mixed: handoff
    });

    const idOf = (put: { path: string }) => put.path.split('/').pop();
    const parentPut = puts[puts.length - 1]!;
    expect(result.fileId).toBe(idOf(parentPut));
    const parent = parentPut.body;
    const collection = parent.collection as { collectionFileIds?: string[]; title?: string };
    expect(parent.contentClass).toBe('collection');
    expect(parent.fileType).toBe('collection');
    expect(collection.title).toBe('Two pages');
    const children = puts.filter((put) => put.body.isPartOfCollection === true);
    expect(collection.collectionFileIds).toEqual(children.map(idOf));
    expect(children.map((put) => put.body.fileType)).toEqual(['image', 'image']);
    expect(children.map((put) => put.body.description)).toEqual(['Second', 'First']);
    expect(children.every((put) => put.body.penFeedPage)).toBe(true);
  });

  it('update keeps the same fileId, overwrites the envelope, and drops old companion audio', async () => {
    const doc = bundle();
    const { request, puts, deletes, overwritten } = cloud();
    const withPrior = {
      ...doc,
      manifest: { ...doc.manifest, publishedFileId: 'prior-post' }
    } as typeof doc;

    const result = await publishPostToOwnerCloud({
      bundle: withPrior,
      feedIds: ['public', 'collections'],
      pnIdentifier: 'pn',
      parentFolderId: 'public-folder',
      membership: false,
      request,
      mixed: await writeTextCollectionHandoff(withPrior, {
        ...pageExport(),
        canPublishPublicTemplate: false
      }),
      target: { kind: 'update', fileId: 'prior-post' }
    });

    expect(result.fileId).toBe('prior-post');
    expect(overwritten()).toBe(true);
    const parent = puts.find((p) => p.path.endsWith('/prior-post'))?.body;
    expect(parent?.penPostUpdate).toBe(true);
    expect(typeof parent?.penPostUpdatedAt).toBe('string');
    expect(parent?.uploadDate).toBeUndefined();
    expect(parent?.companionAudioFileIds).toBeUndefined();
    expect(deletes.some((p) => p.includes('old-child-1'))).toBe(true);
    expect(deletes.some((p) => p.includes('old-child-2'))).toBe(true);
    expect(deletes.some((p) => p.includes('old-audio'))).toBe(true);
    expect(deletes.some((p) => p.endsWith('/prior-post'))).toBe(false);
  });

  it('a new post never deletes a prior publishedFileId on the source doc', async () => {
    const doc = bundle();
    const { request, deletes } = cloud();
    const withPrior = {
      ...doc,
      manifest: { ...doc.manifest, publishedFileId: 'prior-post' }
    } as typeof doc;

    await publishPostToOwnerCloud({
      bundle: withPrior,
      feedIds: ['public', 'collections'],
      pnIdentifier: 'pn',
      parentFolderId: 'public-folder',
      membership: false,
      request,
      mixed: await writeTextCollectionHandoff(withPrior, {
        ...pageExport(),
        canPublishPublicTemplate: false
      }),
      target: { kind: 'new' }
    });

    expect(deletes).toEqual([]);
  });

  it('a collection shared to the media feed still lands in collections', async () => {
    const doc = bundle();
    const { request, puts } = cloud();
    await publishPostToOwnerCloud({
      bundle: doc,
      feedIds: ['public', 'media'],
      pnIdentifier: 'pn',
      parentFolderId: 'public-folder',
      membership: false,
      request,
      mixed: await writeTextCollectionHandoff(doc, pageExport())
    });
    const parent = puts[puts.length - 1]?.body;
    expect(parent?.contentClass).toBe('collection');
    expect((parent?.feedIds as string[]) || []).toContain('collections');
  });

  it('an article title and body stay a single page', async () => {
    const article = {
      manifest: {
        docId: 'doc-article',
        title: 'Article',
        docType: 'note',
        classId: 'social.note',
        templateId: 'note.article.v1',
        templateVersion: '1',
        updatedAt: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        toc: ['title', 'body']
      },
      sections: [
        { slug: 'title', doc: prose('Title') },
        { slug: 'body', doc: prose('Body') }
      ],
      chain: { docId: 'doc-article', genesis: { hash: 'g' }, links: [] }
    } as unknown as LocalDocBundle;
    await expect(writeTextCollectionHandoff(article, pageExport())).rejects.toThrow(
      'not_text_collection'
    );
  });
});
