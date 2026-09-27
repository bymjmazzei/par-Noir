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
      templateId: 'note.basic.portrait.v1',
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
