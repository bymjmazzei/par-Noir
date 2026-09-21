/**
 * ML-DSA genesis + promote chain for Pen authenticity.
 * Hashes only — never put plaintext secrets in signed messages.
 */

import { sha3_384 } from '@noble/hashes/sha3.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { mlDsa65Sign, mlDsa65Verify } from '@par-noir/pqc-crypto/ml-dsa';
import type { PenGenesisProof, PenHistoryChain, PenPromoteLink, PenNotaryToken } from './types.js';

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

export function buildGenesisMessage(input: {
  docId: string;
  templateId: string;
  authorPnHash: string;
  clientCreatedAt: string;
  contentCommitment: string;
}): string {
  return [
    'pen.genesis.v1',
    input.docId,
    input.templateId,
    input.authorPnHash,
    input.clientCreatedAt,
    input.contentCommitment
  ].join('|');
}

export function buildPromoteMessage(input: {
  sectionSlug: string;
  pastName: string;
  contentHash: string;
  prevHeadHash: string;
  authorPnHash: string;
  clientPromotedAt: string;
}): string {
  return [
    'pen.promote.v1',
    input.sectionSlug,
    input.pastName,
    input.contentHash,
    input.prevHeadHash,
    input.authorPnHash,
    input.clientPromotedAt
  ].join('|');
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

export function signGenesis(input: {
  docId: string;
  templateId: string;
  authorPn: string;
  clientCreatedAt: string;
  contentCommitment: string;
  secretKey: Uint8Array;
  publicKey: Uint8Array;
  notary?: PenNotaryToken;
}): PenGenesisProof {
  const authorPnHash = hashPnIdentifier(input.authorPn);
  const msg = buildGenesisMessage({
    docId: input.docId,
    templateId: input.templateId,
    authorPnHash,
    clientCreatedAt: input.clientCreatedAt,
    contentCommitment: input.contentCommitment
  });
  const signature = b64(mlDsa65Sign(utf8ToBytes(msg), input.secretKey));
  return {
    docId: input.docId,
    templateId: input.templateId,
    authorPnHash,
    clientCreatedAt: input.clientCreatedAt,
    contentCommitment: input.contentCommitment,
    signature,
    publicKey: b64(input.publicKey),
    notary: input.notary
  };
}

export function verifyGenesis(proof: PenGenesisProof): boolean {
  const msg = buildGenesisMessage(proof);
  try {
    return mlDsa65Verify(fromB64(proof.signature), utf8ToBytes(msg), fromB64(proof.publicKey));
  } catch {
    return false;
  }
}

export function signPromoteLink(input: {
  sectionSlug: string;
  pastName: string;
  contentHash: string;
  prevHeadHash: string;
  authorPn: string;
  clientPromotedAt: string;
  secretKey: Uint8Array;
  publicKey: Uint8Array;
  notary?: PenNotaryToken;
}): PenPromoteLink {
  const authorPnHash = hashPnIdentifier(input.authorPn);
  const msg = buildPromoteMessage({
    sectionSlug: input.sectionSlug,
    pastName: input.pastName,
    contentHash: input.contentHash,
    prevHeadHash: input.prevHeadHash,
    authorPnHash,
    clientPromotedAt: input.clientPromotedAt
  });
  const signature = b64(mlDsa65Sign(utf8ToBytes(msg), input.secretKey));
  return {
    sectionSlug: input.sectionSlug,
    pastName: input.pastName,
    contentHash: input.contentHash,
    prevHeadHash: input.prevHeadHash,
    authorPnHash,
    clientPromotedAt: input.clientPromotedAt,
    signature,
    publicKey: b64(input.publicKey),
    notary: input.notary
  };
}

export function verifyPromoteLink(link: PenPromoteLink): boolean {
  const msg = buildPromoteMessage(link);
  try {
    return mlDsa65Verify(fromB64(link.signature), utf8ToBytes(msg), fromB64(link.publicKey));
  } catch {
    return false;
  }
}

export function headHashFromChain(chain: PenHistoryChain): string {
  if (chain.links.length === 0) {
    return digestHex(['genesis', chain.genesis.contentCommitment, chain.genesis.signature]);
  }
  const last = chain.links[chain.links.length - 1]!;
  return digestHex(['link', last.contentHash, last.signature, last.prevHeadHash]);
}

export function verifyChain(chain: PenHistoryChain): { ok: true } | { ok: false; error: string } {
  if (!verifyGenesis(chain.genesis)) return { ok: false, error: 'genesis_invalid' };
  let prev = digestHex(['genesis', chain.genesis.contentCommitment, chain.genesis.signature]);
  for (let i = 0; i < chain.links.length; i++) {
    const link = chain.links[i]!;
    if (!verifyPromoteLink(link)) return { ok: false, error: `link_${i}_sig_invalid` };
    if (link.prevHeadHash !== prev) return { ok: false, error: `link_${i}_prev_mismatch` };
    prev = digestHex(['link', link.contentHash, link.signature, link.prevHeadHash]);
  }
  return { ok: true };
}

export function attachNotary(proof: PenGenesisProof | PenPromoteLink, notary: PenNotaryToken): void {
  proof.notary = notary;
}

/** Hash that notary should stamp (never plaintext). */
export function notaryHashForGenesis(proof: PenGenesisProof): string {
  return digestHex(['notary', proof.docId, proof.contentCommitment, proof.signature]);
}

export function notaryHashForPromote(link: PenPromoteLink): string {
  return digestHex(['notary', link.sectionSlug, link.contentHash, link.signature]);
}
