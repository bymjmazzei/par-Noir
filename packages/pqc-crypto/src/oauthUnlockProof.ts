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

function sha256HexUtf8(text: string): string {
  const digest = sha256(new TextEncoder().encode(text));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Canonical platform id from ML-DSA public key (independent of Key 1 and Key 2). */
export function deriveCanonicalPnIdentifier(publicKeyB64: string): string {
  const hex = sha256HexUtf8(publicKeyB64);
  return `pn-${hex.substring(0, 12)}`;
}

/** Deterministic DID matching IdentityCrypto.generateDID / generateDIDIdentifier. */
export function deriveDidFromPublicKey(publicKeyB64: string): string {
  const hex = sha256HexUtf8(publicKeyB64);
  return `did:key:${hex.substring(0, 16)}`;
}

export function assertMlDsa65PublicKeyB64(publicKeyB64: string): boolean {
  try {
    return base64ToBytes(publicKeyB64).length === ML_DSA_65_PUBLIC_KEY_LENGTH;
  } catch {
    return false;
  }
}
