/**
 * Browse uploads with Content Credentials: each feed rendition is re-signed by par Noir as a
 * `parentOf` derivative of the untouched original; uploads without a manifest pass through.
 */
import { describe, expect, it } from 'vitest';
import type { EncodedPreview } from '@par-noir/aggregator-domain';
import type { C2paWeb } from '@par-noir/pn-provenance/web';
import { renditionCredentials } from './uploadCredentials';

type Built = {
  def: { claim_generator_info: Array<{ name: string }>; assertions: Array<{ data: { actions?: Array<{ action: string }> } }> };
  ingredients: Array<{ def: { relationship: string }; blob: Blob }>;
};

function fakeWeb(opts: { manifest: boolean; signedSize?: number }) {
  const built: Built[] = [];
  class FakeBuilder {
    def!: Built['def'];
    ingredients: Built['ingredients'] = [];
    static async fromDefinition(_c2pa: unknown, def: Built['def']) {
      const b = new FakeBuilder();
      b.def = def;
      built.push(b);
      return b;
    }
    async addIngredientFromBlob(def: { relationship: string }, _type: string, blob: Blob) {
      this.ingredients.push({ def, blob });
    }
    async sign(signer: { sign(claim: Uint8Array, reserve: number): Promise<Uint8Array> }, _type: string, blob: Blob) {
      await signer.sign(new Uint8Array([1, 2, 3]), 20_000);
      return new Uint8Array(opts.signedSize ?? blob.size + 100);
    }
    async free() {}
  }
  const web = {
    c2pa: {},
    sdk: {
      Context: class {},
      Builder: FakeBuilder,
      Reader: { fromBlob: async () => (opts.manifest ? { free: async () => {} } : null) }
    }
  } as unknown as C2paWeb;
  return { web: async () => web, built };
}

function api(status = 200) {
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  const request = async (_method: string, path: string, body?: unknown) => {
    calls.push({ path, body: body as Record<string, unknown> });
    return new Response(JSON.stringify(status === 200 ? { cose: 'AAEC' } : { error: 'signer_unconfigured' }), { status });
  };
  return { request, calls };
}

const photo = new Blob([new Uint8Array(5000)], { type: 'image/jpeg' });
const video = new Blob([new Uint8Array(9000)], { type: 'video/mp4' });
const preview = (variant: EncodedPreview['variant'], size: number, contentType: string) =>
  ({ variant, blob: new Blob([new Uint8Array(size)], { type: contentType }), contentType, byteSize: size }) as EncodedPreview;

describe('upload rendition credentials', () => {
  it('leaves uploads without a manifest alone', async () => {
    const { web } = fakeWeb({ manifest: false });
    const { request, calls } = api();
    expect(await renditionCredentials(photo, 'Photo', { web, request })).toBeNull();
    expect(calls).toEqual([]);
  });

  it('re-signs a poster as a par Noir resize of the original, which stays the parent', async () => {
    const { web, built } = fakeWeb({ manifest: true });
    const { request, calls } = api();
    const credential = (await renditionCredentials(photo, 'Photo', { web, request }))!;
    const out = await credential(preview('poster', 1000, 'image/jpeg'));

    expect(out.byteSize).toBe(1100);
    expect(out.blob.size).toBe(1100);
    expect(calls).toEqual([{ path: '/api/c2pa/sign', body: expect.objectContaining({ author: null }) }]);
    expect(built[0]!.def.claim_generator_info[0]!.name).toBe('par Noir');
    expect(built[0]!.def.assertions[0]!.data.actions!.map((a) => a.action)).toEqual(['c2pa.opened', 'c2pa.resized']);
    expect(built[0]!.ingredients).toEqual([{ def: expect.objectContaining({ relationship: 'parentOf' }), blob: photo }]);
  });

  it('marks video renditions as transcodes', async () => {
    const { web, built } = fakeWeb({ manifest: true });
    const { request } = api();
    const credential = (await renditionCredentials(video, 'Clip', { web, request }))!;
    await credential(preview('sd', 4000, 'video/mp4'));
    expect(built[0]!.def.assertions[0]!.data.actions!.map((a) => a.action)).toEqual(['c2pa.opened', 'c2pa.transcoded']);
  });

  it('keeps the unsigned rendition when signing fails or the manifest pushes it past its cap', async () => {
    const failing = fakeWeb({ manifest: true });
    const down = api(503);
    const p = preview('poster', 1000, 'image/jpeg');
    expect(await (await renditionCredentials(photo, 'Photo', { web: failing.web, request: down.request }))!(p)).toBe(p);

    const heavy = fakeWeb({ manifest: true, signedSize: 204_801 });
    const ok = api();
    expect(await (await renditionCredentials(photo, 'Photo', { web: heavy.web, request: ok.request }))!(p)).toBe(p);
  });
});
