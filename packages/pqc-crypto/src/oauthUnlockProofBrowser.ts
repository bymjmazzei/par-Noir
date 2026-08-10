/**
 * Browser IIFE entry for OAuth unlock proof signing.
 * Bundled to api/src/static/oauth/oauth-unlock-proof.js by build:oauth-unlock-script.
 */

import { base64ToBytes, bytesToBase64 } from './encoding';
import { signOauthUnlockProof, type OauthUnlockProofParams } from './oauthUnlockProof';

export type UnlockProofSignInput = OauthUnlockProofParams & {
  /** Base64 ML-DSA-65 secret key from decrypted identity. */
  mlDsaSecretKeyB64: string;
};

function sign(input: UnlockProofSignInput): string {
  const sk = base64ToBytes(input.mlDsaSecretKeyB64);
  return signOauthUnlockProof(
    {
      challenge: input.challenge,
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      scope: input.scope,
      state: input.state,
      nonce: input.nonce,
      publicKey: input.publicKey,
    },
    sk
  );
}

function extractMlDsaSecretKeyB64(decrypted: {
  privateKey?: string;
  pqcSecrets?: { mlDsaSecretKey?: string };
} | null | undefined): string | null {
  if (!decrypted) return null;
  const sk = decrypted.pqcSecrets?.mlDsaSecretKey || decrypted.privateKey;
  return typeof sk === 'string' && sk.length > 0 ? sk : null;
}

const api = {
  sign,
  extractMlDsaSecretKeyB64,
  bytesToBase64,
};

declare global {
  interface Window {
    ParNoirOauthUnlockProof: typeof api;
  }
}

(globalThis as unknown as { ParNoirOauthUnlockProof: typeof api }).ParNoirOauthUnlockProof = api;

export type ParNoirOauthUnlockProofApi = typeof api;
