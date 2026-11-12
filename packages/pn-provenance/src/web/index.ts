/**
 * Browser Content Credentials: c2pa-web builds and embeds the manifest; the par Noir API signs
 * only the claim (POST /api/c2pa/sign) and validates manifests (POST /api/c2pa/verify).
 * Shared by Pen (originals and renditions) and browse uploads (renditions of uploaded media).
 * Source-only: apps compile it; the API never imports it.
 */

import type { Builder as C2paBuilder, C2pa, Signer, SignerPayload } from '@contentauth/c2pa-web';
import { base64ToBytes, bytesToBase64 } from '@par-noir/pqc-crypto/encoding';
import { derivativeDefinition, type ManifestDefinition } from '../manifestDefinition.js';
import type { ManifestSummary } from '../manifestSummary.js';

/** Authenticated first-party API call; a Blob body is sent raw with its own type. */
export type ApiRequest = (method: string, path: string, body?: unknown) => Promise<Response>;

export type DerivativeAction = 'c2pa.resized' | 'c2pa.transcoded';

const CLAIM_RESERVE = 20_000;

export interface C2paWeb {
  c2pa: C2pa;
  sdk: typeof import('@contentauth/c2pa-web');
}

/** One c2pa-web instance per page; `wasmSrc` is the app's bundled URL for c2pa.wasm. */
export function c2paLoader(wasmSrc: () => Promise<string>): () => Promise<C2paWeb> {
  let instance: Promise<C2paWeb> | null = null;
  return () => {
    instance ??= (async () => {
      const sdk = await import('@contentauth/c2pa-web');
      return { sdk, c2pa: await sdk.createC2pa({ wasmSrc: await wasmSrc() }) };
    })();
    instance.catch(() => {
      instance = null;
    });
    return instance;
  };
}

/** An identity assertion credential (the pN author assertion) over the given assertion labels. */
export interface IdentityCredential {
  sigType: string;
  reserveSize: number;
  referencedAssertions: string[];
  sign(payload: SignerPayload): Promise<Uint8Array>;
}

type AuthorPayload = {
  signerPayload: { sigType: string; referencedAssertions: Array<{ url: string; hash: string }> };
  credential: string;
};

function claimSigner(request: ApiRequest, author: () => AuthorPayload | null): Signer {
  return {
    alg: 'es256',
    reserveSize: async () => CLAIM_RESERVE,
    sign: async (claim, reserveSize) => {
      const res = await request('POST', '/api/c2pa/sign', {
        claim: bytesToBase64(claim),
        reserveSize,
        author: author()
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(`c2pa_sign_${err.error || res.status}`);
      }
      const { cose } = (await res.json()) as { cose: string };
      return base64ToBytes(cose);
    }
  };
}

/** Embed and sign `def` into `blob`. Ingredient i of `def` is built from `ingredientBlobs[i]`. */
export async function signManifest(params: {
  web: C2paWeb;
  request: ApiRequest;
  def: ManifestDefinition;
  blob: Blob;
  ingredientBlobs?: Blob[];
  identity?: IdentityCredential;
}): Promise<Blob> {
  const { web, request, def, blob } = params;
  const { ingredients, ...json } = def;
  // Feed posters have a 200 KB cap; a claim thumbnail would only add weight to every rendition.
  const settings = new web.sdk.Context({ builder: { generateC2paArchive: true, thumbnail: { enabled: false } } });
  const builder: C2paBuilder = await web.sdk.Builder.fromDefinition(web.c2pa, json as never, settings);
  try {
    for (const [i, ing] of (ingredients || []).entries()) {
      const source = params.ingredientBlobs?.[i];
      if (source) await builder.addIngredientFromBlob(ing as never, source.type, source);
    }
    let author: AuthorPayload | null = null;
    const identity = params.identity;
    const identityAssertions = identity
      ? [
          {
            credentialHolder: {
              sigType: identity.sigType,
              reserveSize: identity.reserveSize,
              sign: async (payload: SignerPayload) => {
                const credential = await identity.sign(payload);
                author = {
                  signerPayload: {
                    sigType: payload.sigType,
                    referencedAssertions: payload.referencedAssertions.map((r) => ({
                      url: r.url,
                      hash: bytesToBase64(r.hash)
                    }))
                  },
                  credential: bytesToBase64(credential)
                };
                return credential;
              }
            },
            referencedAssertions: identity.referencedAssertions
          }
        ]
      : [];
    const out = await builder.sign(claimSigner(request, () => author), blob.type, blob, { identityAssertions });
    return new Blob([out], { type: blob.type });
  } finally {
    await builder.free();
  }
}

/** A rendition of `parent` (poster, sd, hd) that carries the parent's manifest as `parentOf`. */
export function signDerivative(params: {
  web: C2paWeb;
  request: ApiRequest;
  blob: Blob;
  parent: Blob;
  title: string;
  action: DerivativeAction;
  generator: string;
  version: string;
}): Promise<Blob> {
  const def = derivativeDefinition({
    title: params.title,
    format: params.blob.type,
    version: params.version,
    generator: params.generator,
    parent: { title: params.title, format: params.parent.type },
    action: params.action
  });
  return signManifest({ web: params.web, request: params.request, def, blob: params.blob, ingredientBlobs: [params.parent] });
}

/** True when the file embeds a C2PA manifest (not whether it validates). */
export async function hasManifest(web: C2paWeb, blob: Blob): Promise<boolean> {
  const reader = await web.sdk.Reader.fromBlob(web.c2pa, blob.type || 'application/octet-stream', blob).catch(() => null);
  if (!reader) return false;
  await reader.free();
  return true;
}

/** The API's validation of the file's manifest, or null when it has none. */
export async function verifySummary(request: ApiRequest, blob: Blob): Promise<ManifestSummary | null> {
  const res = await request('POST', '/api/c2pa/verify', blob).catch(() => null);
  if (!res?.ok) return null;
  return ((await res.json()) as { summary?: ManifestSummary | null }).summary ?? null;
}

/** Credentials never block a publish: on failure, or past the variant's size cap, the file goes unsigned. */
export async function credentialOr(fallback: Blob, run: () => Promise<Blob>, cap?: number): Promise<Blob> {
  try {
    const signed = await run();
    return cap && signed.size > cap ? fallback : signed;
  } catch (e) {
    console.warn('[c2pa] content credentials skipped', e instanceof Error ? e.message : e);
    return fallback;
  }
}
