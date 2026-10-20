/**
 * Page audio lives inside the published file. A still page with its own audio
 * publishes as video; a licensed lane only sets musicPenDocId and is never uploaded.
 */
import { describe, expect, it } from 'vitest';
import { pagePublishesAsVideo, publishPostToOwnerCloud } from './penPublish';
import type { LocalDocBundle } from './penLocalStore';

function prose(text: string) {
  return {
    type: 'doc' as const,
    content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] }]
  };
}

function bundle(audioTracks: unknown[]): LocalDocBundle {
  return {
    manifest: {
      docId: 'doc-still',
      title: 'Still',
      docType: 'note',
      classId: 'social.note',
      templateId: 'note.hot_take.v1',
      templateVersion: '1',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      toc: ['body'],
      ownerPnHash: 'owner'
    },
    sections: [
      {
        slug: 'body',
        doc: prose('Hello'),
        layers: [
          {
            id: 'img',
            kind: 'image',
            x: 0,
            y: 0,
            w: 90,
            h: 160,
            zIndex: 1,
            imageSrc: 'penlocal:still',
            audioTracks
          }
        ]
      }
    ],
    chain: { docId: 'doc-still', genesis: { hash: 'g' }, links: [] }
  } as unknown as LocalDocBundle;
}

const voice = { id: 'voice', src: `data:audio/mpeg;base64,${btoa('voice')}`, offsetSec: 2, gain: 70 };
const song = { id: 'song', licensedDocId: 'music-doc-9' };

describe('page audio publish', () => {
  it('a still page with its own audio publishes as video so the sound is in the file', () => {
    const doc = bundle([voice, song]);
    expect(pagePublishesAsVideo(doc.sections[0]!, doc.manifest)).toBe(true);
  });

  it('a still page with only licensed audio is one image pointing at the licensed doc', async () => {
    const doc = bundle([song]);
    expect(pagePublishesAsVideo(doc.sections[0]!, doc.manifest)).toBe(false);

    let n = 0;
    const puts: Array<Record<string, unknown>> = [];
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
        return new Response(
          JSON.stringify({
            publicContentRef: {
              objectId: `file-${n}`,
              publicUrl: `https://drive.google.com/uc?export=download&id=file-${n}`,
              backend: 'google_drive'
            }
          }),
          { status: 200 }
        );
      }
      if (method === 'PUT' && path.includes('/api/aggregator/metadata-index/')) {
        puts.push(body as Record<string, unknown>);
        return new Response('{}', { status: 200 });
      }
      return new Response('unexpected', { status: 500 });
    };

    const result = await publishPostToOwnerCloud({
      bundle: doc,
      feedIds: ['public'],
      pnIdentifier: 'pn',
      membership: false,
      parentFolderId: 'public-folder',
      request,
      image: { slug: 'body', posterBlob: new Blob([1, 2, 3], { type: 'image/jpeg' }) }
    });

    expect(result.fileId).toBe('file-1');
    expect(puts).toHaveLength(1);
    const post = puts[0];
    expect(post?.fileType).toBe('image');
    expect(post?.penFeedPage).toBeTruthy();
    expect(post?.musicPenDocId).toBe('music-doc-9');
    expect(post?.companionAudioFileIds).toBeUndefined();
  });
});
