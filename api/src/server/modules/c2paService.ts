/**
 * C2PA for par Noir. Pen builds and embeds its manifest in the browser; the API only signs the
 * claim bytes with the Pen certificate (a direct COSE_Sign1 with an RFC 3161 countersignature),
 * after checking the pN author assertion the claim carries. Verification reads any C2PA file
 * against the trust anchors and returns a ManifestSummary.
 *
 * Env: PEN_C2PA_CERT_CHAIN_PEM, PEN_C2PA_PRIVATE_KEY_PEM, C2PA_TRUST_ANCHORS_PEM, C2PA_TSA_URL.
 * Outside production, C2PA_DEV_DIR (default api/.c2pa-dev, from scripts/c2pa-dev-cert.sh) fills
 * in missing signer values and adds its root as a trust anchor.
 */

import { createHash, createPrivateKey, createSign, X509Certificate, type KeyObject } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { Decoder, Encoder, Tag } from 'cbor-x';
import { Context, Reader } from '@contentauth/c2pa-node';
import { deriveCanonicalPnIdentifier } from '@par-noir/pqc-crypto/oauth-unlock-proof';
import {
  PARNOIR_CLAIM_GENERATORS,
  PEN_CLAIM_GENERATOR,
  normalizeSignerPayload,
  summarizeManifestStore,
  verifyAuthorAssertion,
  type ManifestSummary
} from '@par-noir/pn-provenance';
import { HandleReceiptService } from './handleReceiptService';
import { PublicNameService } from './publicNameService';
import { stampImprint } from './timestampService';

const DEV_DIR = path.resolve(__dirname, '../../../.c2pa-dev');
const MIN_RESERVE = 4_096;
const MAX_RESERVE = 65_536;
const MAX_CLAIM_BYTES = 256 * 1024;
export const MAX_VERIFY_BYTES = 64 * 1024 * 1024;

export class C2paError extends Error {
  constructor(
    readonly code:
      | 'signer_unconfigured'
      | 'claim_invalid'
      | 'not_pen_claim'
      | 'author_invalid'
      | 'author_not_caller'
      | 'author_refs_mismatch'
      | 'identity_unchecked'
      | 'reserve_invalid'
      | 'reserve_too_small'
  ) {
    super(code);
  }
}

const cbor = new Encoder({ useRecords: false, mapsAsObjects: false, tagUint8Array: false });
const claimDecoder = new Decoder({ useRecords: false, mapsAsObjects: true });

function pemEnv(name: string): string {
  return String(process.env[name] || '').replace(/\\n/g, '\n').trim();
}

function devFile(name: string): string {
  if (process.env.NODE_ENV === 'production') return '';
  const p = path.join(process.env.C2PA_DEV_DIR || DEV_DIR, name);
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

function pemCertificates(pem: string): string[] {
  return [...pem.matchAll(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g)].map((m) => m[0]);
}

type PenSigner = { certsDer: Uint8Array[]; key: KeyObject };

function penSigner(): PenSigner {
  const chain = pemEnv('PEN_C2PA_CERT_CHAIN_PEM') || devFile('pen.pem');
  const keyPem = pemEnv('PEN_C2PA_PRIVATE_KEY_PEM') || devFile('pen.key');
  const certs = pemCertificates(chain);
  if (!certs.length || !keyPem) throw new C2paError('signer_unconfigured');
  return {
    certsDer: certs.map((c) => new Uint8Array(new X509Certificate(c).raw)),
    key: createPrivateKey(keyPem)
  };
}

/** Trust anchors for reading: the configured list, plus the dev root outside production. */
export function trustAnchorsPem(): string {
  return [pemEnv('C2PA_TRUST_ANCHORS_PEM'), devFile('root.pem')].filter(Boolean).join('\n');
}

function b64(bytes: unknown): string | null {
  return bytes instanceof Uint8Array ? Buffer.from(bytes).toString('base64') : null;
}

type ClaimRef = { url: string; hash: string };

/** The claim's generator and assertion references (claim v2, or v1 `assertions`). */
export function parseClaim(claim: Uint8Array): { generator: string | null; refs: ClaimRef[] } {
  let c: Record<string, any>;
  try {
    c = claimDecoder.decode(claim);
  } catch {
    throw new C2paError('claim_invalid');
  }
  if (!c || typeof c !== 'object') throw new C2paError('claim_invalid');
  const info = Array.isArray(c.claim_generator_info) ? c.claim_generator_info[0] : c.claim_generator_info;
  const generator = typeof info?.name === 'string' ? info.name : typeof c.claim_generator === 'string' ? c.claim_generator : null;
  const refs: ClaimRef[] = [];
  for (const r of [...(c.created_assertions ?? []), ...(c.gathered_assertions ?? []), ...(c.assertions ?? [])]) {
    const hash = b64(r?.hash);
    if (typeof r?.url === 'string' && hash) refs.push({ url: r.url, hash });
  }
  return { generator, refs };
}

/**
 * Pen only signs its own claims. An identity assertion must be a pN author assertion by the
 * caller (their root key or registered handle key) over assertions this claim holds; a claim
 * with no identity assertion (a rendition that inherits its parent's credit) needs no author.
 */
export async function checkPenClaim(
  claim: Uint8Array,
  author: { signerPayload: unknown; credential: unknown } | null,
  callerPn: string,
  now = new Date()
): Promise<{ authorKeyId: string | null; handle: string | null }> {
  const { generator, refs } = parseClaim(claim);
  if (!generator || !PARNOIR_CLAIM_GENERATORS.has(generator)) throw new C2paError('not_pen_claim');
  if (author && generator !== PEN_CLAIM_GENERATOR) throw new C2paError('author_invalid');
  const identities = refs.filter((r) => /c2pa\.assertions\/cawg\.identity/.test(r.url));
  if (!author) {
    if (identities.length) throw new C2paError('identity_unchecked');
    return { authorKeyId: null, handle: null };
  }
  if (identities.length !== 1) throw new C2paError('identity_unchecked');
  const v = verifyAuthorAssertion({
    signerPayload: author.signerPayload,
    credential: author.credential,
    registryPublicKey: HandleReceiptService.publicKeyB64(),
    at: now.toISOString()
  });
  if (!v.ok) throw new C2paError('author_invalid');
  if (deriveCanonicalPnIdentifier(v.publicKey) !== callerPn && (await PublicNameService.signingKey(callerPn)) !== v.publicKey) {
    throw new C2paError('author_not_caller');
  }
  const inClaim = new Set(refs.map((r) => `${r.url}\n${r.hash}`));
  const signed = normalizeSignerPayload(author.signerPayload)!.refs;
  if (!signed.every((r) => inClaim.has(`${r.url}\n${r.hash}`))) throw new C2paError('author_refs_mismatch');
  return { authorKeyId: v.authorKeyId, handle: v.handle };
}

/** What the RFC 3161 token stamps: the COSE countersignature structure over the claim signature. */
export function timestampImprint(protectedHeader: Uint8Array, signature: Uint8Array): Uint8Array {
  const tbs = cbor.encode(['CounterSignature', protectedHeader, new Uint8Array(0), cbor.encode(signature)]);
  return new Uint8Array(createHash('sha256').update(tbs).digest());
}

export type Stamp = (imprint: Uint8Array) => Promise<Uint8Array>;

const defaultStamp: Stamp = async (imprint) => (await stampImprint(imprint)).token;

/**
 * COSE_Sign1 (detached claim) for the Pen certificate, ES256, timestamped, padded to exactly
 * `reserveSize` bytes as the builder requires.
 */
export async function signClaimCose(claim: Uint8Array, reserveSize: number, stamp: Stamp = defaultStamp): Promise<Uint8Array> {
  if (!Number.isInteger(reserveSize) || reserveSize < MIN_RESERVE || reserveSize > MAX_RESERVE) {
    throw new C2paError('reserve_invalid');
  }
  if (claim.length === 0 || claim.length > MAX_CLAIM_BYTES) throw new C2paError('claim_invalid');
  const { certsDer, key } = penSigner();
  const protectedHeader = cbor.encode(new Map<number, unknown>([[1, -7], [33, certsDer.length === 1 ? certsDer[0] : certsDer]]));
  const tbs = cbor.encode(['Signature1', protectedHeader, new Uint8Array(0), claim]);
  const signature = new Uint8Array(createSign('SHA256').update(tbs).sign({ key, dsaEncoding: 'ieee-p1363' }));
  const token = await stamp(timestampImprint(protectedHeader, signature));
  const sigTst2 = new Map([['tstTokens', [new Map([['val', token]])]]]);

  const build = (pad: number, pad2: number | null) => {
    const unprotected = new Map<string, unknown>([['sigTst2', sigTst2], ['pad', new Uint8Array(pad)]]);
    if (pad2 !== null) unprotected.set('pad2', new Uint8Array(pad2));
    return cbor.encode(new Tag([protectedHeader, unprotected, null, signature], 18));
  };
  // A bstr length header grows at 24/256/65536 bytes, so an exact fit can need a second pad.
  for (const pad2 of [null, 0, 1, 2, 3, 4]) {
    let pad = Math.max(0, reserveSize - build(0, pad2).length);
    for (let i = 0; i < 4 && pad >= 0; i++) {
      const out = build(pad, pad2);
      if (out.length === reserveSize) return new Uint8Array(out);
      pad -= out.length - reserveSize;
    }
  }
  throw new C2paError('reserve_too_small');
}

/** Summary of the file's manifest store, or null when it has none (or it can't be read). */
export async function verifyAsset(
  bytes: Uint8Array,
  mimeType: string,
  opts: { onAuthor?: (author: { authorKeyId: string; publicKey: string }) => void } = {}
): Promise<ManifestSummary | null> {
  const anchors = trustAnchorsPem();
  const ctx = new Context(
    { verify: { verifyTrust: true }, ...(anchors ? { trust: { trustAnchors: anchors } } : {}) },
    { maxSizeInBytes: MAX_VERIFY_BYTES }
  );
  let store: unknown;
  try {
    const reader = await Reader.fromAsset({ buffer: Buffer.from(bytes), mimeType }, ctx);
    if (!reader) return null;
    store = reader.json();
  } catch {
    return null;
  }
  return summarizeManifestStore(store, {
    registryPublicKey: HandleReceiptService.publicKeyB64(),
    onAuthor: opts.onAuthor
  });
}
