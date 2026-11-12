/**
 * ML-DSA genesis + promote chain for Pen authenticity.
 * Proofs name the signing key (`authorKeyId`), never a pN. Hashes only — never put plaintext
 * secrets in signed messages.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { sha3_384 } from '@noble/hashes/sha3.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { mlDsa65Sign, mlDsa65Verify } from '@par-noir/pqc-crypto/ml-dsa';
import { timeStampTokenMatches } from './rfc3161.js';
import type { PenRoleAssignment } from './roles.js';
import type { PenGenesisProof, PenHistoryChain, PenPromoteLink, PenTimestampToken } from './types.js';

function digestHex(parts: string[]): string {
  const msg = utf8ToBytes(parts.join('|'));
  return bytesToHex(sha3_384(msg));
}

export function hashPnIdentifier(pn: string): string {
  return digestHex(['pn', pn]);
}

export function hashSectionContent(bytes: Uint8Array): string {
  return bytesToHex(sha3_384(bytes));
}

function b64(u8: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]!);
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'base64'));
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** SHA3-384 of the ML-DSA public key bytes: how proofs and assertions name a signer. */
export function authorKeyId(publicKeyB64: string): string {
  return bytesToHex(sha3_384(fromB64(publicKeyB64)));
}

export function buildGenesisMessage(input: {
  docId: string;
  templateId: string;
  authorKeyId: string;
  clientCreatedAt: string;
  contentCommitment: string;
}): string {
  return [
    'pen.genesis.v2',
    input.docId,
    input.templateId,
    input.authorKeyId,
    input.clientCreatedAt,
    input.contentCommitment
  ].join('|');
}

export function buildPromoteMessage(input: {
  sectionSlug: string;
  pastName: string;
  contentHash: string;
  prevHeadHash: string;
  authorKeyId: string;
  clientPromotedAt: string;
}): string {
  return [
    'pen.promote.v2',
    input.sectionSlug,
    input.pastName,
    input.contentHash,
    input.prevHeadHash,
    input.authorKeyId,
    input.clientPromotedAt
  ].join('|');
}

export function signGenesis(input: {
  docId: string;
  templateId: string;
  clientCreatedAt: string;
  contentCommitment: string;
  secretKey: Uint8Array;
  publicKey: Uint8Array;
}): PenGenesisProof {
  const publicKey = b64(input.publicKey);
  const keyId = authorKeyId(publicKey);
  const msg = buildGenesisMessage({
    docId: input.docId,
    templateId: input.templateId,
    authorKeyId: keyId,
    clientCreatedAt: input.clientCreatedAt,
    contentCommitment: input.contentCommitment
  });
  return {
    v: 2,
    docId: input.docId,
    templateId: input.templateId,
    authorKeyId: keyId,
    clientCreatedAt: input.clientCreatedAt,
    contentCommitment: input.contentCommitment,
    signature: b64(mlDsa65Sign(utf8ToBytes(msg), input.secretKey)),
    publicKey
  };
}

function verifySigned(msg: string, signature: string, publicKey: string, keyId: string): boolean {
  try {
    if (authorKeyId(publicKey) !== keyId) return false;
    return mlDsa65Verify(fromB64(signature), utf8ToBytes(msg), fromB64(publicKey));
  } catch {
    return false;
  }
}

export function verifyGenesis(proof: PenGenesisProof): boolean {
  if (proof?.v !== 2) return false;
  return verifySigned(buildGenesisMessage(proof), proof.signature, proof.publicKey, proof.authorKeyId);
}

export function signPromoteLink(input: {
  sectionSlug: string;
  pastName: string;
  contentHash: string;
  prevHeadHash: string;
  clientPromotedAt: string;
  secretKey: Uint8Array;
  publicKey: Uint8Array;
}): PenPromoteLink {
  const publicKey = b64(input.publicKey);
  const keyId = authorKeyId(publicKey);
  const msg = buildPromoteMessage({
    sectionSlug: input.sectionSlug,
    pastName: input.pastName,
    contentHash: input.contentHash,
    prevHeadHash: input.prevHeadHash,
    authorKeyId: keyId,
    clientPromotedAt: input.clientPromotedAt
  });
  return {
    v: 2,
    sectionSlug: input.sectionSlug,
    pastName: input.pastName,
    contentHash: input.contentHash,
    prevHeadHash: input.prevHeadHash,
    authorKeyId: keyId,
    clientPromotedAt: input.clientPromotedAt,
    signature: b64(mlDsa65Sign(utf8ToBytes(msg), input.secretKey)),
    publicKey
  };
}

export function verifyPromoteLink(link: PenPromoteLink): boolean {
  if (link?.v !== 2) return false;
  return verifySigned(buildPromoteMessage(link), link.signature, link.publicKey, link.authorKeyId);
}

/** Bytes the doc owner signs to vouch for a member's ML-DSA key on this doc (shared with Pen Live). */
export function penKeyAttestationBytes(docId: string, pnHash: string, mlDsaPublicKey: string): Uint8Array {
  return utf8ToBytes(`pen-live-key/v1|${docId}|${pnHash}|${mlDsaPublicKey}`);
}

/** Keys the genesis signer vouched for on this doc, plus the genesis key itself. */
export function attestedChainKeys(docId: string, genesisPublicKey: string, roles?: PenRoleAssignment[]): Set<string> {
  const keys = new Set<string>([genesisPublicKey]);
  for (const r of roles || []) {
    if (!r.mlDsaPublicKey || !r.keyAttestation?.signature) continue;
    try {
      if (
        mlDsa65Verify(
          fromB64(r.keyAttestation.signature),
          penKeyAttestationBytes(docId, r.pnHash, r.mlDsaPublicKey),
          fromB64(genesisPublicKey)
        )
      ) {
        keys.add(r.mlDsaPublicKey);
      }
    } catch {
      /* not attested */
    }
  }
  return keys;
}

export function headHashFromChain(chain: PenHistoryChain): string {
  if (chain.links.length === 0) {
    return digestHex(['genesis', chain.genesis.contentCommitment, chain.genesis.signature]);
  }
  const last = chain.links[chain.links.length - 1]!;
  return digestHex(['link', last.contentHash, last.signature, last.prevHeadHash]);
}

/** SHA-256 hex the RFC 3161 TSA stamps for a genesis proof. */
export function timestampImprintForGenesis(proof: PenGenesisProof): string {
  return bytesToHex(sha256(utf8ToBytes(['pen.ts.v2', 'genesis', proof.docId, proof.contentCommitment, proof.signature].join('|'))));
}

/** SHA-256 hex the RFC 3161 TSA stamps for a promote link. */
export function timestampImprintForPromote(link: PenPromoteLink): string {
  return bytesToHex(sha256(utf8ToBytes(['pen.ts.v2', 'promote', link.sectionSlug, link.contentHash, link.signature].join('|'))));
}

export function attachTimestamp(proof: PenGenesisProof | PenPromoteLink, timestamp: PenTimestampToken): void {
  proof.timestamp = timestamp;
}

function timestampOk(timestamp: PenTimestampToken | undefined, imprintHex: string): boolean {
  if (!timestamp) return true;
  if (timestamp.kind !== 'rfc3161' || typeof timestamp.token !== 'string') return false;
  try {
    return timeStampTokenMatches(fromB64(timestamp.token), imprintHex);
  } catch {
    return false;
  }
}

/**
 * Genesis signature, every link's signature and back-pointer, every timestamp's imprint, and
 * every link signed by the genesis key or a key the genesis signer attested in `roles`.
 */
export function verifyChain(
  chain: PenHistoryChain,
  roles?: PenRoleAssignment[]
): { ok: true } | { ok: false; error: string } {
  if (!verifyGenesis(chain.genesis)) return { ok: false, error: 'genesis_invalid' };
  if (!timestampOk(chain.genesis.timestamp, timestampImprintForGenesis(chain.genesis))) {
    return { ok: false, error: 'genesis_timestamp_invalid' };
  }
  const keys = attestedChainKeys(chain.docId, chain.genesis.publicKey, roles);
  let prev = digestHex(['genesis', chain.genesis.contentCommitment, chain.genesis.signature]);
  for (let i = 0; i < chain.links.length; i++) {
    const link = chain.links[i]!;
    if (!verifyPromoteLink(link)) return { ok: false, error: `link_${i}_sig_invalid` };
    if (!keys.has(link.publicKey)) return { ok: false, error: `link_${i}_key_unattested` };
    if (!timestampOk(link.timestamp, timestampImprintForPromote(link))) {
      return { ok: false, error: `link_${i}_timestamp_invalid` };
    }
    if (link.prevHeadHash !== prev) return { ok: false, error: `link_${i}_prev_mismatch` };
    prev = digestHex(['link', link.contentHash, link.signature, link.prevHeadHash]);
  }
  return { ok: true };
}
