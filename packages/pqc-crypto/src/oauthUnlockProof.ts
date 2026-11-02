/**
 * OAuth unlock proof: challenge-bound ML-DSA-65 signature.
 * Key 1 and Key 2 never leave the device; the server verifies possession
 * of the ML-DSA secret that only three-factor unlock can produce.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { ML_DSA_65_PUBLIC_KEY_LENGTH } from './constants';
import { bytesToBase64, base64ToBytes } from './encoding';
import { mlDsa65Sign, mlDsa65Verify } from './mlDsa';

export const OAUTH_UNLOCK_PROOF_VERSION = 'PN-OAUTH-UNLOCK-V1' as const;

export type OauthUnlockProofParams = {
  challenge: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  state?: string;
  nonce?: string;
  publicKey: string;
};

function normalizeRedirectUri(redirectUri: string): string {
  return redirectUri.replace(/\/$/, '');
}

/** Canonical UTF-8 message bound to the OAuth request + server challenge. */
export function buildOauthUnlockProofMessage(params: OauthUnlockProofParams): Uint8Array {
  const lines = [
    OAUTH_UNLOCK_PROOF_VERSION,
    `challenge=${params.challenge}`,
    `client_id=${params.clientId}`,
    `redirect_uri=${normalizeRedirectUri(params.redirectUri)}`,
    `scope=${params.scope || ''}`,
    `state=${params.state || ''}`,
    `nonce=${params.nonce || ''}`,
    `public_key=${params.publicKey}`,
  ];
  return new TextEncoder().encode(lines.join('\n'));
}

export function signOauthUnlockProof(
  params: OauthUnlockProofParams,
  mlDsaSecretKey: Uint8Array
): string {
  const message = buildOauthUnlockProofMessage(params);
  return bytesToBase64(mlDsa65Sign(message, mlDsaSecretKey));
}

export function verifyOauthUnlockProof(
  signatureB64: string,
  params: OauthUnlockProofParams,
  publicKeyB64: string
): boolean {
  let signature: Uint8Array;
  let publicKey: Uint8Array;
  try {
    signature = base64ToBytes(signatureB64);
    publicKey = base64ToBytes(publicKeyB64);
  } catch {
    return false;
  }
  if (publicKey.length !== ML_DSA_65_PUBLIC_KEY_LENGTH) {
    return false;
  }
  const message = buildOauthUnlockProofMessage({ ...params, publicKey: publicKeyB64 });
  try {
    return mlDsa65Verify(signature, message, publicKey);
  } catch {
    return false;
  }
}

export const RECOVERY_SETUP_PROOF_VERSION = 'PN-RECOVERY-SETUP-V1' as const;

export type RecoverySetupProofParams = {
  challenge: string;
  pnIdentifier: string;
  publicKey: string;
};

/** Proof of the pN root key for changing recovery setup without a keyed device. */
export function buildRecoverySetupProofMessage(params: RecoverySetupProofParams): Uint8Array {
  const lines = [
    RECOVERY_SETUP_PROOF_VERSION,
    `challenge=${params.challenge}`,
    `pn_identifier=${params.pnIdentifier}`,
    `public_key=${params.publicKey}`,
  ];
  return new TextEncoder().encode(lines.join('\n'));
}

export function signRecoverySetupProof(params: RecoverySetupProofParams, mlDsaSecretKey: Uint8Array): string {
  return bytesToBase64(mlDsa65Sign(buildRecoverySetupProofMessage(params), mlDsaSecretKey));
}

export function verifyRecoverySetupProof(signatureB64: string, params: RecoverySetupProofParams): boolean {
  let signature: Uint8Array;
  let publicKey: Uint8Array;
  try {
    signature = base64ToBytes(signatureB64);
    publicKey = base64ToBytes(params.publicKey);
  } catch {
    return false;
  }
  if (publicKey.length !== ML_DSA_65_PUBLIC_KEY_LENGTH) return false;
  try {
    return mlDsa65Verify(signature, buildRecoverySetupProofMessage(params), publicKey);
  } catch {
    return false;
  }
}

export const PN_IDENTIFIER_PREFIX = 'pn-' as const;
export const PN_DID_PREFIX = 'did:pn:' as const;
export const PN_IDENTIFIER_RE = /^pn-[0-9a-f]{64}$/;
export const PN_DID_RE = /^did:pn:[0-9a-f]{64}$/;

/** SHA-256 over the raw ML-DSA-65 public key bytes, lowercase hex. */
function pnKeyHash(publicKeyB64: string): string {
  let publicKey: Uint8Array;
  try {
    publicKey = base64ToBytes(publicKeyB64);
  } catch {
    throw new Error('Invalid ML-DSA-65 public key');
  }
  if (publicKey.length !== ML_DSA_65_PUBLIC_KEY_LENGTH) {
    throw new Error('Invalid ML-DSA-65 public key');
  }
  return Array.from(sha256(publicKey), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Canonical pN id: `pn-` + SHA-256(ML-DSA-65 public key bytes). Independent of Key 1 and Key 2. */
export function deriveCanonicalPnIdentifier(publicKeyB64: string): string {
  return `${PN_IDENTIFIER_PREFIX}${pnKeyHash(publicKeyB64)}`;
}

/** pN DID: `did:pn:` + the same hash as the pN id. */
export function deriveDidFromPublicKey(publicKeyB64: string): string {
  return `${PN_DID_PREFIX}${pnKeyHash(publicKeyB64)}`;
}

export function isPnIdentifier(value: unknown): value is string {
  return typeof value === 'string' && PN_IDENTIFIER_RE.test(value);
}

/** True for any `did:pn:` string (format-checked ids use PN_DID_RE). */
export function isPnDid(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(PN_DID_PREFIX);
}

/** `did:pn:<hash>` -> `pn-<hash>`; null when the DID is not a well-formed pN DID. */
export function pnIdentifierFromDid(did: string): string | null {
  return PN_DID_RE.test(did) ? `${PN_IDENTIFIER_PREFIX}${did.slice(PN_DID_PREFIX.length)}` : null;
}

/** `pn-<hash>` -> `did:pn:<hash>`; null when the id is not a well-formed pN id. */
export function pnDidFromIdentifier(pnIdentifier: string): string | null {
  return isPnIdentifier(pnIdentifier)
    ? `${PN_DID_PREFIX}${pnIdentifier.slice(PN_IDENTIFIER_PREFIX.length)}`
    : null;
}

export function assertMlDsa65PublicKeyB64(publicKeyB64: string): boolean {
  try {
    return base64ToBytes(publicKeyB64).length === ML_DSA_65_PUBLIC_KEY_LENGTH;
  } catch {
    return false;
  }
}
