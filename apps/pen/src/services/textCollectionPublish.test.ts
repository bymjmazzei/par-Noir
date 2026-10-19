/**
 * A social post with more than one page publishes as a feed collection:
 * one child file per page, and a parent whose collection.collectionFileIds
 * the feed slideshow reads.
 */
import { describe, expect, it } from 'vitest';
import { publishPostToOwnerCloud, writeTextCollectionHandoff } from './penPublish';
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

describe('text collection publish', () => {
  it('orders added pages by the toc and uploads collectionFileIds', async () => {
    const doc = bundle();
    const handoff = writeTextCollectionHandoff(doc, { canPublishPublicTemplate: false });
    expect(handoff.contentClass).toBe('collection');
    expect(handoff.pages.map((page) => (page.kind === 'note' ? page.content : page.slug))).toEqual([
      'Second',
      'First'
    ]);

    let n = 0;
    const puts: Array<{ path: string; body: Record<string, unknown> }> = [];
    const request = async (method: string, path: string, body?: unknown) => {
      if (path === '/api/drive/files') {
        n += 1;
        return new Response(JSON.stringify({ id: `file-${n}` }), { status: 200 });
      }
      if (path.includes('/ensure-public')) {
        const id = `file-${n}`;
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

    const result = await publishPostToOwnerCloud({
      bundle: doc,
      feedIds: ['public', 'collections'],
      pnIdentifier: 'pn',
      parentFolderId: 'public-folder',
      membership: false,
      request,
      mixed: handoff
    });

    expect(result.fileId).toBe('file-3');
    const parent = puts[puts.length - 1]?.body;
    const collection = parent?.collection as { collectionFileIds?: string[]; title?: string };
    expect(parent?.contentClass).toBe('collection');
    expect(parent?.fileType).toBe('collection');
    expect(collection.collectionFileIds).toEqual(['file-1', 'file-2']);
    expect(collection.title).toBe('Two pages');
    expect(puts.slice(0, 2).every((put) => put.body.isPartOfCollection === true)).toBe(true);
    expect(puts.slice(0, 2).map((put) => put.body.fileType)).toEqual([
      'note-collection-page',
      'note-collection-page'
    ]);
  });

  it('update keeps the same fileId, overwrites the envelope, and sends penPostUpdate', async () => {
    const doc = bundle();
    let n = 0;
    const deletes: string[] = [];
    const puts: Array<{ path: string; body: Record<string, unknown> }> = [];
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
      mixed: writeTextCollectionHandoff(withPrior, { canPublishPublicTemplate: false }),
      target: { kind: 'update', fileId: 'prior-post' }
    });

    expect(result.fileId).toBe('prior-post');
    expect(contentOverwrite).toBe(true);
    const parent = puts.find((p) => p.path.endsWith('/prior-post'))?.body;
    expect(parent?.penPostUpdate).toBe(true);
    expect(typeof parent?.penPostUpdatedAt).toBe('string');
    expect(parent?.uploadDate).toBeUndefined();
    expect(deletes.some((p) => p.includes('old-child-1'))).toBe(true);
    expect(deletes.some((p) => p.includes('old-child-2'))).toBe(true);
    expect(deletes.some((p) => p.includes('old-audio'))).toBe(true);
    expect(deletes.some((p) => p.endsWith('/prior-post'))).toBe(false);
  });

  it('a new post never deletes a prior publishedFileId on the source doc', async () => {
    const doc = bundle();
    let n = 0;
    const deletes: string[] = [];
    const request = async (method: string, path: string, body?: unknown) => {
      if (method === 'DELETE' && path.includes('/api/aggregator/metadata-index/')) {
        deletes.push(path);
        return new Response('{}', { status: 200 });
      }
      if (path === '/api/drive/files') {
        n += 1;
        return new Response(JSON.stringify({ id: `file-${n}` }), { status: 200 });
      }
      if (path.includes('/ensure-public')) {
        const id = `file-${n}`;
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
        return new Response('{}', { status: 200 });
      }
      return new Response('unexpected', { status: 500 });
    };

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
      mixed: writeTextCollectionHandoff(withPrior, { canPublishPublicTemplate: false }),
      target: { kind: 'new' }
    });

    expect(deletes).toEqual([]);
  });

  it('collection template still slide uploads image child and collections feedIds', async () => {
    const collectionDoc = {
      manifest: {
        docId: 'doc-coll',
        title: 'Coll',
        docType: 'collection',
        classId: 'social.collection',
        templateId: 'collection.basic.v1',
        templateVersion: '1',
        updatedAt: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        toc: ['slide-1', 'slide-2'],
        ownerPnHash: 'owner'
      },
      sections: [
        { slug: 'slide-1', doc: prose('Page one') },
        {
          slug: 'slide-2',
          doc: prose(''),
          layers: [
            {
              id: 'img',
              kind: 'image',
              x: 0,
              y: 0,
              w: 100,
              h: 100,
              zIndex: 1,
              imageSrc: 'https://example.com/slide2.jpg'
            }
          ]
        }
      ],
      chain: { docId: 'doc-coll', genesis: { hash: 'g' }, links: [] }
    } as unknown as LocalDocBundle;

    const handoff = writeTextCollectionHandoff(collectionDoc, { canPublishPublicTemplate: false });
    expect(handoff.pages).toHaveLength(2);
    expect(handoff.pages[0]?.kind).toBe('note');
    expect(handoff.pages[1]?.kind).toBe('still');

    let n = 0;
    const puts: Array<{ path: string; body: Record<string, unknown> }> = [];
    const request = async (method: string, path: string, body?: unknown) => {
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
        const id = `file-${n}`;
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

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(new Blob([1, 2, 3], { type: 'image/jpeg' }), { status: 200 });
    try {
      await publishPostToOwnerCloud({
        bundle: collectionDoc,
        feedIds: ['public', 'media'],
        pnIdentifier: 'pn',
        parentFolderId: 'public-folder',
        membership: false,
        request,
        mixed: handoff
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const parent = puts[puts.length - 1]?.body;
    expect(parent?.contentClass).toBe('collection');
    expect((parent?.feedIds as string[]) || []).toContain('collections');
    expect(puts[0]?.body.fileType).toBe('note-collection-page');
    expect(puts[1]?.body.fileType).toBe('image');
  });

  it('an article title and body stay a single note', () => {
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
    expect(() => writeTextCollectionHandoff(article, {})).toThrow('not_text_collection');
  });
});
