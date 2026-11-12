/**
 * Content Credentials for Pen media. c2pa-web builds and embeds the manifest in the browser;
 * the API only signs the claim with the Pen certificate (POST /api/c2pa/sign). The author's
 * ML-DSA key signs the pN author assertion here, with their handle receipt when that handle's
 * signing key is this key. Credentialed media on the page goes in as `componentOf` ingredients.
 */

import type { C2pa, Signer, SignerPayload } from '@contentauth/c2pa-web';
import {
  FEED_PREVIEW_HD_MAX_BYTES,
  FEED_PREVIEW_POSTER_MAX_BYTES,
  FEED_PREVIEW_SD_MAX_BYTES
} from '@par-noir/aggregator-domain';
import { headHashFromChain, type PenIngredient, type PenSectionContent } from '@par-noir/pen-protocol';
import { base64ToBytes, bytesToBase64 } from '@par-noir/pqc-crypto/encoding';
import { ensurePenMediaUrl, isPenMediaSrcRef } from '@par-noir/pen-media';
import {
  DEFAULT_TRAINING_PREFERENCE,
  PN_AUTHOR_RESERVE_SIZE,
  PN_AUTHOR_SIG_TYPE,
  authorReferencedLabels,
  derivativeDefinition,
  ingredientDefinition,
  ingredientFromSummary,
  penDocAssertion,
  penOriginalDefinition,
  signAuthorCredential,
  type ManifestDefinition,
  type ManifestSummary,
  type TrainingMiningPreference
} from '@par-noir/pn-provenance';
import type { ComposePageVideoResult } from './composePageVideoEncode';
import { enrichSessionSigningKeys } from './penKeys';
import type { LocalDocBundle } from './penLocalStore';
import type { PenSession } from './penSession';
import { posterPreview, type CloudRequest, type FeedPreviewUploads } from './penPublicPublish';

const CLAIM_RESERVE = 20_000;
const PEN_C2PA_VERSION = '1.0.0';
const ENDING_EVENTS = new Set(['supersede', 'release', 'expire']);

export type DerivativeAction = 'c2pa.resized' | 'c2pa.transcoded';

export interface PenMediaSigner {
  /** The published file: a Pen original credited to the author, built from the page's media. */
  original(blob: Blob, opts: { title: string; slug?: string }): Promise<Blob>;
  /** A feed rendition (poster / sd / hd) of a signed original. */
  derivative(blob: Blob, parent: Blob, opts: { title: string; action: DerivativeAction }): Promise<Blob>;
  /** Credentialed media found while signing, for the doc's ingredient list. */
  ingredients(): PenIngredient[];
}

let c2paInstance: Promise<C2pa> | null = null;

function loadC2pa(): Promise<C2pa> {
  c2paInstance ??= (async () => {
    const [{ createC2pa }, wasm] = await Promise.all([
      import('@contentauth/c2pa-web'),
      import('@contentauth/c2pa-web/resources/c2pa.wasm?url')
    ]);
    return createC2pa({ wasmSrc: wasm.default });
  })();
  return c2paInstance;
}

type AuthorPayload = { signerPayload: unknown; credential: string };
type HandleReceipt = { receipt: unknown; signature: string };

/** The head receipt of a handle this key holds, or null (credit by key only). */
async function receiptForKey(request: CloudRequest, publicKey: string): Promise<HandleReceipt | null> {
  const res = await request('GET', '/api/public-names/receipts/mine').catch(() => null);
  if (!res?.ok) return null;
  const data = (await res.json()) as {
    handles?: Array<{ chain?: Array<{ receipt?: { signingKey?: string; event?: string }; signature?: string }> }>;
  };
  for (const h of data.handles ?? []) {
    const head = h.chain?.[h.chain.length - 1];
    if (head?.receipt?.signingKey === publicKey && !ENDING_EVENTS.has(String(head.receipt.event)) && head.signature) {
      return { receipt: head.receipt, signature: head.signature };
    }
  }
  return null;
}

function claimSigner(request: CloudRequest, author: () => AuthorPayload | null): Signer {
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
      return base64ToBytes(cose) as Uint8Array<ArrayBuffer>;
    }
  };
}

/** Pen media refs on a page: what a flattened page or composed video is built from. */
export function sectionMediaRefs(section: PenSectionContent | undefined): Array<{ layerId: string; src: string }> {
  const out: Array<{ layerId: string; src: string }> = [];
  for (const layer of section?.layers || []) {
    for (const src of [layer.imageSrc, layer.videoSrc, layer.backgroundVideo]) {
      if (src && isPenMediaSrcRef(src) && !out.some((r) => r.src === src)) out.push({ layerId: layer.id, src });
    }
  }
  return out;
}

async function verifySummary(request: CloudRequest, blob: Blob): Promise<ManifestSummary | null> {
  const res = await request('POST', '/api/c2pa/verify', blob).catch(() => null);
  if (!res?.ok) return null;
  return ((await res.json()) as { summary?: ManifestSummary | null }).summary ?? null;
}

export function createPenMediaSigner(params: {
  bundle: LocalDocBundle;
  pnIdentifier: string;
  keys: { publicKey: string; secretKey: string };
  request: CloudRequest;
  training?: TrainingMiningPreference;
}): PenMediaSigner {
  const { bundle, request, keys } = params;
  const penDoc = penDocAssertion(bundle.manifest);
  const training = params.training ?? DEFAULT_TRAINING_PREFERENCE;
  const found: PenIngredient[] = [];
  let receipt: Promise<HandleReceipt | null> | null = null;

  async function pageIngredients(c2pa: C2pa, slug: string | undefined) {
    const { Reader } = await import('@contentauth/c2pa-web');
    const section = slug ? bundle.sections.find((s) => s.slug === slug) : undefined;
    const out: Array<{ ingredient: PenIngredient; blob: Blob }> = [];
    for (const { layerId, src } of sectionMediaRefs(section)) {
      const url = await ensurePenMediaUrl({ src, docId: bundle.manifest.docId, pnIdentifier: params.pnIdentifier });
      if (!url) continue;
      const blob = await (await fetch(url)).blob();
      const reader = await Reader.fromBlob(c2pa, blob.type || undefined, blob).catch(() => null);
      if (!reader) continue;
      await reader.free();
      const ingredient = ingredientFromSummary({
        summary: await verifySummary(request, blob),
        title: blob.type.startsWith('video/') ? 'Attached video' : 'Attached image',
        format: blob.type,
        layerId
      });
      out.push({ ingredient, blob });
      found.push(ingredient);
    }
    return out;
  }

  async function sign(def: ManifestDefinition, blob: Blob, withAuthor: boolean, ingredientBlobs: Blob[]): Promise<Blob> {
    const c2pa = await loadC2pa();
    const { Builder, Context } = await import('@contentauth/c2pa-web');
    const { ingredients, ...json } = def;
    // Feed posters have a 200 KB cap; a claim thumbnail would only add weight to every rendition.
    const builder = await Builder.fromDefinition(c2pa, json as never, new Context({ builder: { thumbnail: { enabled: false } } }));
    try {
      for (const [i, ing] of (ingredients || []).entries()) {
        const source = ingredientBlobs[i];
        if (source) await builder.addIngredientFromBlob(ing as never, source.type, source);
      }
      let author: AuthorPayload | null = null;
      const identityAssertions = withAuthor
        ? [
            {
              credentialHolder: {
                sigType: PN_AUTHOR_SIG_TYPE,
                reserveSize: PN_AUTHOR_RESERVE_SIZE,
                sign: async (payload: SignerPayload) => {
                  receipt ??= receiptForKey(request, keys.publicKey);
                  const credential = signAuthorCredential({
                    signerPayload: payload,
                    secretKey: base64ToBytes(keys.secretKey),
                    publicKey: base64ToBytes(keys.publicKey),
                    receipt: await receipt,
                    chainHead: headHashFromChain(bundle.chain)
                  });
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
                  return credential as Uint8Array<ArrayBuffer>;
                }
              },
              referencedAssertions: authorReferencedLabels(def)
            }
          ]
        : [];
      const out = await builder.sign(claimSigner(request, () => author), blob.type, blob, { identityAssertions });
      return new Blob([out], { type: blob.type });
    } finally {
      await builder.free();
    }
  }

  return {
    async original(blob, opts) {
      const c2pa = await loadC2pa();
      const media = await pageIngredients(c2pa, opts.slug);
      const def = penOriginalDefinition({
        title: opts.title,
        format: blob.type,
        version: PEN_C2PA_VERSION,
        penDoc,
        training,
        ingredients: media.map((m) => ingredientDefinition(m.ingredient))
      });
      return sign(def, blob, true, media.map((m) => m.blob));
    },
    async derivative(blob, parent, opts) {
      const def = derivativeDefinition({
        title: opts.title,
        format: blob.type,
        version: PEN_C2PA_VERSION,
        parent: { title: opts.title, format: parent.type },
        action: opts.action
      });
      return sign(def, blob, false, [parent]);
    },
    ingredients: () => [...found]
  };
}

const PREVIEW_CAP = {
  poster: FEED_PREVIEW_POSTER_MAX_BYTES,
  sd: FEED_PREVIEW_SD_MAX_BYTES,
  hd: FEED_PREVIEW_HD_MAX_BYTES
} as const;

/** Credentials never block a publish: on failure, or past the variant's size cap, the file goes unsigned. */
async function credentialOr(fallback: Blob, run: () => Promise<Blob>, cap?: number): Promise<Blob> {
  try {
    const signed = await run();
    return cap && signed.size > cap ? fallback : signed;
  } catch (e) {
    console.warn('[pen] content credentials skipped', e instanceof Error ? e.message : e);
    return fallback;
  }
}

/** A flattened page: the signed original, and a poster that is the original or its signed resize. */
export async function credentialImage(
  signer: PenMediaSigner | null,
  blob: Blob,
  opts: { title: string; slug?: string }
): Promise<{ file: Blob; previews: FeedPreviewUploads | undefined }> {
  const file = signer ? await credentialOr(blob, () => signer.original(blob, opts)) : blob;
  const previews = await posterPreview(file);
  const poster = previews?.poster;
  if (signer && file !== blob && poster && poster.blob !== file) {
    const resized = poster.blob;
    poster.blob = await credentialOr(
      resized,
      () => signer.derivative(resized, file, { title: opts.title, action: 'c2pa.resized' }),
      PREVIEW_CAP.poster
    );
  }
  return { file, previews };
}

/** A composed video: the master (hd, else sd) is the signed original; other variants are signed transcodes of it. */
export async function credentialVideo(
  signer: PenMediaSigner | null,
  previews: ComposePageVideoResult,
  opts: { title: string; slug?: string }
): Promise<ComposePageVideoResult> {
  if (!signer) return previews;
  const masterKey = previews.hd ? 'hd' : 'sd';
  const master = previews[masterKey]!;
  const signed = await credentialOr(master.blob, () => signer.original(master.blob, opts), PREVIEW_CAP[masterKey]);
  if (signed === master.blob) return previews;
  const out: ComposePageVideoResult = { ...previews, [masterKey]: { ...master, blob: signed, byteSize: signed.size } };
  for (const key of ['poster', 'sd'] as const) {
    const variant = previews[key];
    if (key === masterKey || !variant) continue;
    const blob = await credentialOr(
      variant.blob,
      () => signer.derivative(variant.blob, signed, { title: opts.title, action: 'c2pa.transcoded' }),
      PREVIEW_CAP[key]
    );
    out[key] = { ...variant, blob, byteSize: blob.size };
  }
  return out;
}

/** The signer for this publish, when the session holds the author's keys. */
export function penMediaSignerFor(params: {
  bundle: LocalDocBundle;
  pnIdentifier: string;
  session?: PenSession | null;
  request: CloudRequest;
  training?: TrainingMiningPreference;
}): PenMediaSigner | null {
  const keys = params.session ? enrichSessionSigningKeys(params.session) : null;
  const publicKey = keys?.mlDsaPublicKey;
  const secretKey = keys?.mlDsaSecretKey;
  if (!publicKey || !secretKey) return null;
  return createPenMediaSigner({ ...params, keys: { publicKey, secretKey } });
}
