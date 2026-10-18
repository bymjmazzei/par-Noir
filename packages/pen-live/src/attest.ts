/**
 * Who may sign live batches.
 *
 * The owner's ML-DSA key is anchored by the doc's genesis proof. The owner
 * attests each member's key for this doc. A member proves a key claim with a
 * secret the owner derived for them and sealed into their invite, so another
 * member holding the docKey cannot register a key in someone else's name.
 */

import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { mlDsa65Sign, mlDsa65Verify } from '@par-noir/pqc-crypto/ml-dsa';
import type { PenRoleAssignment } from '@par-noir/pen-protocol';
import { base64ToBytes, bytesToBase64 } from './crypto.js';
import type { PenLiveSigner } from './batch.js';

export interface PenLiveTrustAnchor {
  docId: string;
  ownerPnHash: string;
  /** Genesis proof public key (base64). */
  ownerMlDsaPublicKey: string;
}

const utf8 = (s: string) => new TextEncoder().encode(s);

function attestationBytes(docId: string, pnHash: string, mlDsaPublicKey: string): Uint8Array {
  return utf8(`pen-live-key/v1|${docId}|${pnHash}|${mlDsaPublicKey}`);
}

function verifySig(signatureB64: string, msg: Uint8Array, publicKeyB64: string): boolean {
  try {
    return mlDsa65Verify(base64ToBytes(signatureB64), msg, base64ToBytes(publicKeyB64));
  } catch {
    return false;
  }
}

export function attestMemberKey(params: {
  docId: string;
  pnHash: string;
  mlDsaPublicKey: string;
  owner: PenLiveSigner;
}): NonNullable<PenRoleAssignment['keyAttestation']> {
  const sig = mlDsa65Sign(
    attestationBytes(params.docId, params.pnHash, params.mlDsaPublicKey),
    params.owner.mlDsaSecretKey
  );
  return { by: params.owner.pnHash, signature: bytesToBase64(sig) };
}

/**
 * Roles as the live session may trust them: the owner's key comes from the
 * anchor; any other member keeps a key only with a valid owner attestation.
 */
export function trustedLiveRoles(
  roles: PenRoleAssignment[] | undefined,
  anchor: PenLiveTrustAnchor
): PenRoleAssignment[] {
  const out: PenRoleAssignment[] = [];
  let sawOwner = false;
  for (const r of roles || []) {
    if (r.pnHash === anchor.ownerPnHash) {
      sawOwner = true;
      out.push({ pnHash: r.pnHash, role: 'owner', mlDsaPublicKey: anchor.ownerMlDsaPublicKey });
      continue;
    }
    const attested =
      r.mlDsaPublicKey &&
      r.keyAttestation?.by === anchor.ownerPnHash &&
      verifySig(
        r.keyAttestation.signature,
        attestationBytes(anchor.docId, r.pnHash, r.mlDsaPublicKey),
        anchor.ownerMlDsaPublicKey
      );
    out.push(attested ? { ...r } : { pnHash: r.pnHash, role: r.role });
  }
  if (!sawOwner) {
    out.unshift({
      pnHash: anchor.ownerPnHash,
      role: 'owner',
      mlDsaPublicKey: anchor.ownerMlDsaPublicKey
    });
  }
  return out;
}

/** Per-member claim secret only the owner can derive (keyed by the owner's ML-KEM secret). */
export function deriveKeyClaimSecret(ownerSecret: string, docId: string, pnHash: string): string {
  return bytesToBase64(
    hmac(sha256, utf8(`pen-live-claim-key|${ownerSecret}`), utf8(`pen-live-claim:${docId}:${pnHash}`))
  );
}

export interface PenLiveKeyClaim {
  t: 'key_claim';
  docId: string;
  pnHash: string;
  mlDsaPublicKey: string;
  mac: string;
}

function claimMac(secretB64: string, docId: string, pnHash: string, mlDsaPublicKey: string): string {
  return bytesToHex(
    hmac(sha256, base64ToBytes(secretB64), utf8(`pen-live-claim/v1|${docId}|${pnHash}|${mlDsaPublicKey}`))
  );
}

export function makeKeyClaim(params: {
  docId: string;
  pnHash: string;
  mlDsaPublicKey: string;
  claimSecret: string;
}): PenLiveKeyClaim {
  return {
    t: 'key_claim',
    docId: params.docId,
    pnHash: params.pnHash,
    mlDsaPublicKey: params.mlDsaPublicKey,
    mac: claimMac(params.claimSecret, params.docId, params.pnHash, params.mlDsaPublicKey)
  };
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Owner side: is this claim really from `claim.pnHash`? */
export function verifyKeyClaim(ownerSecret: string, claim: PenLiveKeyClaim): boolean {
  if (claim?.t !== 'key_claim' || typeof claim.mlDsaPublicKey !== 'string') return false;
  const secret = deriveKeyClaimSecret(ownerSecret, claim.docId, claim.pnHash);
  return timingSafeEqualHex(
    claimMac(secret, claim.docId, claim.pnHash, claim.mlDsaPublicKey),
    String(claim.mac || '')
  );
}

/** Owner-signed membership change pushed to members over the live channel. */
export interface PenLiveRolesUpdate {
  t: 'roles';
  docId: string;
  keyEpoch: number;
  issuedAt: number;
  roles: PenRoleAssignment[];
  signature: string;
}

function rolesBytes(u: Omit<PenLiveRolesUpdate, 'signature'>): Uint8Array {
  return utf8(`pen-live-roles/v1|${u.docId}|${u.keyEpoch}|${u.issuedAt}|${JSON.stringify(u.roles)}`);
}

export function signRolesUpdate(params: {
  docId: string;
  keyEpoch: number;
  roles: PenRoleAssignment[];
  owner: PenLiveSigner;
  issuedAt?: number;
}): PenLiveRolesUpdate {
  const unsigned = {
    t: 'roles' as const,
    docId: params.docId,
    keyEpoch: params.keyEpoch,
    issuedAt: params.issuedAt ?? Date.now(),
    roles: params.roles
  };
  return {
    ...unsigned,
    signature: bytesToBase64(mlDsa65Sign(rolesBytes(unsigned), params.owner.mlDsaSecretKey))
  };
}

export function verifyRolesUpdate(update: PenLiveRolesUpdate, anchor: PenLiveTrustAnchor): boolean {
  if (update.t !== 'roles' || update.docId !== anchor.docId) return false;
  const { signature, ...unsigned } = update;
  return verifySig(signature, rolesBytes(unsigned), anchor.ownerMlDsaPublicKey);
}

export type PenLiveControl = PenLiveKeyClaim | PenLiveRolesUpdate;
