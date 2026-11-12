/**
 * Published media carries Content Credentials: the flattened page or composed master
 * is the signed original, other renditions are signed derivatives of it, and a
 * signing failure never blocks the publish.
 */
import { describe, expect, it } from 'vitest';
import { FEED_PREVIEW_POSTER_MAX_BYTES } from '@par-noir/aggregator-domain';
import type { PenIngredient } from '@par-noir/pen-protocol';
import { credentialVideo, type PenMediaSigner } from './penC2pa';
import type { ComposePageVideoResult } from './composePageVideoEncode';
import { publishPostToOwnerCloud } from './penPublish';
import type { LocalDocBundle } from './penLocalStore';

const doc = {
  manifest: {
    docId: 'doc-1',
    title: 'Page',
    docType: 'note',
    classId: 'social.note',
    templateId: 'note.hot_take.v1',
    templateVersion: '1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    toc: ['body'],
    ownerPnHash: 'owner'
  },
  sections: [{ slug: 'body', doc: { type: 'doc', content: [] }, layers: [] }],
  chain: { docId: 'doc-1', genesis: { hash: 'g' }, links: [] }
} as unknown as LocalDocBundle;

const attached: PenIngredient = {
  title: 'Attached image',
  format: 'image/jpeg',
  relationship: 'componentOf',
  trust: 'trusted',
  signer: 'Adobe',
  creator: { kind: 'cawg', display: 'Ana' }
};

type Call = { kind: 'original' | 'derivative'; input: string; parent?: string; action?: string };

function fakeSigner(opts: { fail?: boolean; pad?: number } = {}) {
  const calls: Call[] = [];
  const signer: PenMediaSigner = {
    async original(blob) {
      if (opts.fail) throw new Error('sign_failed');
      calls.push({ kind: 'original', input: await blob.text() });
      return new Blob([`signed(${await blob.text()})`], { type: blob.type });
    },
    async derivative(blob, parent, { action }) {
      calls.push({ kind: 'derivative', input: await blob.text(), parent: await parent.text(), action });
      return new Blob([`signed(${await blob.text()})`, 'x'.repeat(opts.pad ?? 0)], { type: blob.type });
    },
    ingredients: () => (opts.fail ? [] : [attached])
  };
  return { signer, calls };
}

function cloud() {
  let n = 0;
  const previews: string[] = [];
  const request = async (method: string, path: string, body?: unknown) => {
    if (path === '/api/drive/files') {
      n += 1;
      return new Response(JSON.stringify({ id: `file-${n}` }), { status: 200 });
    }
    if (path.includes('/api/aggregator/feed-media/owner-upload')) {
      previews.push(await (body as Blob).text());
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
      return new Response('{}', { status: 200 });
    }
    return new Response('unexpected', { status: 500 });
  };
  return { request, previews };
}

function publishImage(mediaSigner: PenMediaSigner | null, request: ReturnType<typeof cloud>['request']) {
  return publishPostToOwnerCloud({
    bundle: doc,
    feedIds: ['public'],
    pnIdentifier: 'pn',
    membership: false,
    parentFolderId: 'public-folder',
    request,
    mediaSigner,
    image: { slug: 'body', posterBlob: new Blob(['page'], { type: 'image/jpeg' }) }
  });
}

function preview(text: string, contentType: string) {
  const blob = new Blob([text], { type: contentType });
  return { variant: 'sd', blob, contentType, byteSize: blob.size } as ComposePageVideoResult['sd'];
}

describe('content credentials on publish', () => {
  it('an image page publishes its signed original and records credentialed ingredients', async () => {
    const { signer, calls } = fakeSigner();
    const { request, previews } = cloud();
    const result = await publishImage(signer, request);

    expect(calls).toEqual([{ kind: 'original', input: 'page' }]);
    expect(previews).toEqual(['signed(page)']);
    expect(result.ingredients).toEqual([attached]);
  });

  it('a signing failure still publishes, unsigned and without ingredients', async () => {
    const { signer } = fakeSigner({ fail: true });
    const { request, previews } = cloud();
    const result = await publishImage(signer, request);

    expect(result.fileId).toBe('file-1');
    expect(previews).toEqual(['page']);
    expect(result.ingredients).toBeUndefined();
  });

  it('a composed video signs the master and derives the other renditions from it', async () => {
    const { signer, calls } = fakeSigner();
    const out = await credentialVideo(
      signer,
      {
        poster: preview('poster', 'image/jpeg'),
        sd: preview('sd', 'video/mp4'),
        hd: preview('hd', 'video/mp4')
      } as ComposePageVideoResult,
      { title: 'Page', slug: 'body' }
    );

    expect(await out.hd!.blob.text()).toBe('signed(hd)');
    expect(out.hd!.byteSize).toBe(out.hd!.blob.size);
    expect(await out.sd!.blob.text()).toBe('signed(sd)');
    expect(await out.poster.blob.text()).toBe('signed(poster)');
    expect(calls.filter((c) => c.kind === 'derivative')).toEqual([
      { kind: 'derivative', input: 'poster', parent: 'signed(hd)', action: 'c2pa.transcoded' },
      { kind: 'derivative', input: 'sd', parent: 'signed(hd)', action: 'c2pa.transcoded' }
    ]);
  });

  it('a rendition pushed past its size cap by the manifest uploads unsigned', async () => {
    const { signer } = fakeSigner({ pad: FEED_PREVIEW_POSTER_MAX_BYTES });
    const out = await credentialVideo(
      signer,
      { poster: preview('poster', 'image/jpeg'), sd: preview('sd', 'video/mp4') } as ComposePageVideoResult,
      { title: 'Page' }
    );

    expect(await out.sd!.blob.text()).toBe('signed(sd)');
    expect(await out.poster.blob.text()).toBe('poster');
  });
});
