/**
 * Content Credentials for Pen media. The author's ML-DSA key signs the pN author assertion
 * here, with their handle receipt when that handle's signing key is this key. Credentialed
 * media on the page goes in as `componentOf` ingredients; renditions are signed derivatives.
 */

import { maxBytesForVariant } from '@par-noir/aggregator-domain';
import { headHashFromChain, type PenIngredient, type PenSectionContent } from '@par-noir/pen-protocol';
import { base64ToBytes } from '@par-noir/pqc-crypto/encoding';
import { ensurePenMediaUrl, isPenMediaSrcRef } from '@par-noir/pen-media';
import {
  DEFAULT_TRAINING_PREFERENCE,
  PEN_CLAIM_GENERATOR,
  PN_AUTHOR_RESERVE_SIZE,
  PN_AUTHOR_SIG_TYPE,
  authorReferencedLabels,
  ingredientDefinition,
  ingredientFromSummary,
  penDocAssertion,
  penOriginalDefinition,
  signAuthorCredential,
  type TrainingMiningPreference
} from '@par-noir/pn-provenance';
import {
  c2paLoader,
  credentialOr,
  hasManifest,
  signDerivative,
  signManifest,
  verifySummary,
  type C2paWeb,
  type DerivativeAction
} from '@par-noir/pn-provenance/web';
import type { ComposePageVideoResult } from './composePageVideoEncode';
import { enrichSessionSigningKeys } from './penKeys';
import type { LocalDocBundle } from './penLocalStore';
import type { PenSession } from './penSession';
import { posterPreview, type CloudRequest, type FeedPreviewUploads } from './penPublicPublish';

const PEN_C2PA_VERSION = '1.0.0';
const ENDING_EVENTS = new Set(['supersede', 'release', 'expire']);

const loadC2pa = c2paLoader(async () => (await import('@contentauth/c2pa-web/resources/c2pa.wasm?url')).default);

export interface PenMediaSigner {
  /** The published file: a Pen original credited to the author, built from the page's media. */
  original(blob: Blob, opts: { title: string; slug?: string }): Promise<Blob>;
  /** A feed rendition (poster / sd / hd) of a signed original. */
  derivative(blob: Blob, parent: Blob, opts: { title: string; action: DerivativeAction }): Promise<Blob>;
  /** Credentialed media found while signing, for the doc's ingredient list. */
  ingredients(): PenIngredient[];
}

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

  async function pageIngredients(web: C2paWeb, slug: string | undefined) {
    const section = slug ? bundle.sections.find((s) => s.slug === slug) : undefined;
    const out: Array<{ ingredient: PenIngredient; blob: Blob }> = [];
    for (const { layerId, src } of sectionMediaRefs(section)) {
      const url = await ensurePenMediaUrl({ src, docId: bundle.manifest.docId, pnIdentifier: params.pnIdentifier });
      if (!url) continue;
      const blob = await (await fetch(url)).blob();
      if (!(await hasManifest(web, blob))) continue;
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

  return {
    async original(blob, opts) {
      const web = await loadC2pa();
      const media = await pageIngredients(web, opts.slug);
      const def = penOriginalDefinition({
        title: opts.title,
        format: blob.type,
        version: PEN_C2PA_VERSION,
        penDoc,
        training,
        ingredients: media.map((m) => ingredientDefinition(m.ingredient))
      });
      return signManifest({
        web,
        request,
        def,
        blob,
        ingredientBlobs: media.map((m) => m.blob),
        identity: {
          sigType: PN_AUTHOR_SIG_TYPE,
          reserveSize: PN_AUTHOR_RESERVE_SIZE,
          referencedAssertions: authorReferencedLabels(def),
          sign: async (payload) => {
            receipt ??= receiptForKey(request, keys.publicKey);
            return signAuthorCredential({
              signerPayload: payload,
              secretKey: base64ToBytes(keys.secretKey),
              publicKey: base64ToBytes(keys.publicKey),
              receipt: await receipt,
              chainHead: headHashFromChain(bundle.chain)
            });
          }
        }
      });
    },
    async derivative(blob, parent, opts) {
      return signDerivative({
        web: await loadC2pa(),
        request,
        blob,
        parent,
        title: opts.title,
        action: opts.action,
        generator: PEN_CLAIM_GENERATOR,
        version: PEN_C2PA_VERSION
      });
    },
    ingredients: () => [...found]
  };
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
      maxBytesForVariant('poster')
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
  const signed = await credentialOr(master.blob, () => signer.original(master.blob, opts), maxBytesForVariant(masterKey));
  if (signed === master.blob) return previews;
  const out: ComposePageVideoResult = { ...previews, [masterKey]: { ...master, blob: signed, byteSize: signed.size } };
  for (const key of ['poster', 'sd'] as const) {
    const variant = previews[key];
    if (key === masterKey || !variant) continue;
    const blob = await credentialOr(
      variant.blob,
      () => signer.derivative(variant.blob, signed, { title: opts.title, action: 'c2pa.transcoded' }),
      maxBytesForVariant(key)
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
