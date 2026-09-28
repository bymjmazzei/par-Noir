/**
 * A still with audio stays a note. Own lanes become companion files.
 * A licensed lane sets musicPenDocId and is not uploaded.
 */
import { describe, expect, it } from 'vitest';
import { publishPostToOwnerCloud } from './penPublish';
import type { LocalDocBundle } from './penLocalStore';

function prose(text: string) {
  return {
    type: 'doc' as const,
    content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] }]
  };
}

function bundle(): LocalDocBundle {
  const voice = `data:audio/mpeg;base64,${btoa('voice')}`;
  return {
    manifest: {
      docId: 'doc-still',
      title: 'Still',
      docType: 'note',
      classId: 'social.note',
      templateId: 'note.basic.portrait.v1',
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
            audioTracks: [
              { id: 'voice', src: voice, offsetSec: 2, gain: 70 },
              { id: 'song', licensedDocId: 'music-doc-9' }
            ]
          }
        ]
      }
    ],
    chain: { docId: 'doc-still', genesis: { hash: 'g' }, links: [] }
  } as unknown as LocalDocBundle;
}

describe('companion audio publish', () => {
  it('uploads own audio beside the still and points at the licensed doc', async () => {
    let n = 0;
    const puts: Array<Record<string, unknown>> = [];
    const uploaded: string[] = [];
    const request = async (method: string, path: string, body?: unknown) => {
      if (path === '/api/drive/files') {
        n += 1;
        return new Response(JSON.stringify({ id: `file-${n}` }), { status: 200 });
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
      bundle: bundle(),
      feedIds: ['public'],
      pnIdentifier: 'pn',
      membership: false,
      request,
      uploadCompanionAudio: async (_bytes, index) => {
        uploaded.push(`lane-${index}`);
        return `audio-${index}`;
      }
    });

    expect(result.fileId).toBeTruthy();
    expect(uploaded).toEqual(['lane-0']);
    const post = puts[puts.length - 1];
    expect(post?.fileType).toBe('note');
    expect(post?.fileType).not.toBe('video');
    expect(post?.companionAudioFileIds).toEqual(['audio-0']);
    expect(post?.companionAudioOffsetsSec).toEqual([2]);
    expect(post?.companionAudioGains).toEqual([70]);
    expect(post?.musicPenDocId).toBe('music-doc-9');
  });
});
