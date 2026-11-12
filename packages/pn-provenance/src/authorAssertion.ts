/**
 * `org.parnoir.author.v1`: a CAWG identity assertion whose credential is an ML-DSA-65 signature
 * by the author's pN key over the assertions the claim references, plus the registry receipt
 * that binds that key to a handle. Any C2PA generator can embed it (see SPEC.md).
 */

import { mlDsa65Sign, mlDsa65Verify } from '@par-noir/pqc-crypto/ml-dsa';
import { authorKeyId } from '@par-noir/pen-protocol';
import { handleBoundToKey, isMlDsa65PublicKeyB64 } from '@par-noir/public-names';
import { base64ToBytes, bytesToBase64, toBytes, utf8 } from './bytes.js';

export const PN_AUTHOR_SIG_TYPE = 'org.parnoir.author.v1';
const SIGNING_DOMAIN = 'PN-AUTHOR-V1';

/** Space to reserve for the credential in the identity assertion. */
export const PN_AUTHOR_RESERVE_SIZE = 20_000;

export interface SignerPayloadRef {
  url: string;
  hash: string;
}

/** The CAWG signer payload, normalized: references sorted by URL, hashes base64. */
export interface NormalizedSignerPayload {
  sigType: string;
  refs: SignerPayloadRef[];
}

/** What the credential holder signs over: handle receipt optional, chain head for Pen files. */
export interface PnAuthorCredential {
  v: 1;
  alg: 'ML-DSA-65';
  publicKey: string;
  signature: string;
  receipt: { receipt: unknown; signature: string } | null;
  chainHead: string | null;
}

/**
 * Accepts the callback form (`referencedAssertions`, `sigType`) and the reader JSON form
 * (`referenced_assertions`, `sig_type`).
 */
export function normalizeSignerPayload(raw: unknown): NormalizedSignerPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const sigType = p.sigType ?? p.sig_type;
  const list = p.referencedAssertions ?? p.referenced_assertions;
  if (typeof sigType !== 'string' || !Array.isArray(list)) return null;
  const refs: SignerPayloadRef[] = [];
  for (const r of list) {
    const url = (r as { url?: unknown })?.url;
    const hash = toBytes((r as { hash?: unknown })?.hash);
    if (typeof url !== 'string' || !hash) return null;
    refs.push({ url, hash: bytesToBase64(hash) });
  }
  refs.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
  return { sigType, refs };
}

export function authorSigningBytes(payload: NormalizedSignerPayload, chainHead: string | null): Uint8Array {
  return utf8(`${SIGNING_DOMAIN}\n${JSON.stringify({ sigType: payload.sigType, refs: payload.refs, chainHead })}`);
}

/** Credential bytes for the CAWG `signature` field. */
export function signAuthorCredential(input: {
  signerPayload: unknown;
  secretKey: Uint8Array;
  publicKey: Uint8Array;
  receipt?: { receipt: unknown; signature: string } | null;
  chainHead?: string | null;
}): Uint8Array {
  const payload = normalizeSignerPayload(input.signerPayload);
  if (!payload || payload.sigType !== PN_AUTHOR_SIG_TYPE) throw new Error('signer_payload_invalid');
  const chainHead = input.chainHead ?? null;
  const credential: PnAuthorCredential = {
    v: 1,
    alg: 'ML-DSA-65',
    publicKey: bytesToBase64(input.publicKey),
    signature: bytesToBase64(mlDsa65Sign(authorSigningBytes(payload, chainHead), input.secretKey)),
    receipt: input.receipt ?? null,
    chainHead,
  };
  return utf8(JSON.stringify(credential));
}

export function parseAuthorCredential(raw: unknown): PnAuthorCredential | null {
  const bytes = toBytes(raw);
  if (!bytes) return null;
  let c: Record<string, unknown>;
  try {
    c = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (!c || c.v !== 1 || c.alg !== 'ML-DSA-65') return null;
  if (!isMlDsa65PublicKeyB64(c.publicKey) || typeof c.signature !== 'string') return null;
  const receipt = c.receipt as PnAuthorCredential['receipt'];
  if (receipt !== null && (typeof receipt !== 'object' || typeof receipt?.signature !== 'string')) return null;
  const chainHead = c.chainHead ?? null;
  if (chainHead !== null && typeof chainHead !== 'string') return null;
  return { v: 1, alg: 'ML-DSA-65', publicKey: c.publicKey, signature: c.signature, receipt, chainHead };
}

export type AuthorVerification =
  | {
      ok: true;
      authorKeyId: string;
      publicKey: string;
      /** Null when the credential carries no receipt (key-only author). */
      handle: string | null;
      chainHead: string | null;
    }
  | {
      ok: false;
      error:
        | 'not_pn_author'
        | 'credential_invalid'
        | 'signature_invalid'
        | 'hard_binding_missing'
        | 'receipt_invalid';
    };

/**
 * Checks the ML-DSA signature over the signer payload and, when a receipt is present, that the
 * registry signed it and it names this key. `at` is the claim time; a receipt issued later
 * does not count.
 */
export function verifyAuthorAssertion(input: {
  signerPayload: unknown;
  credential: unknown;
  registryPublicKey: string | null;
  at?: string;
}): AuthorVerification {
  const payload = normalizeSignerPayload(input.signerPayload);
  if (!payload || payload.sigType !== PN_AUTHOR_SIG_TYPE) return { ok: false, error: 'not_pn_author' };
  if (!payload.refs.some((r) => /c2pa\.hash\.(data|bmff|boxes|collection)/.test(r.url))) {
    return { ok: false, error: 'hard_binding_missing' };
  }
  const credential = parseAuthorCredential(input.credential);
  if (!credential) return { ok: false, error: 'credential_invalid' };
  let signed = false;
  try {
    signed = mlDsa65Verify(
      base64ToBytes(credential.signature),
      authorSigningBytes(payload, credential.chainHead),
      base64ToBytes(credential.publicKey)
    );
  } catch {
    signed = false;
  }
  if (!signed) return { ok: false, error: 'signature_invalid' };
  let handle: string | null = null;
  if (credential.receipt) {
    handle = input.registryPublicKey
      ? handleBoundToKey(credential.receipt, input.registryPublicKey, credential.publicKey, input.at)
      : null;
    if (!handle) return { ok: false, error: 'receipt_invalid' };
  }
  return {
    ok: true,
    authorKeyId: authorKeyId(credential.publicKey),
    publicKey: credential.publicKey,
    handle,
    chainHead: credential.chainHead,
  };
}
