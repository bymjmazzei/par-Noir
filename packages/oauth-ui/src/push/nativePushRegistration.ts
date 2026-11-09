/**
 * Native push registration for the pN Unlock app (no OAuth session). Each saved pN
 * signs a single-use challenge with its ML-DSA key; Key 1 / Key 2 stay on device.
 */

import { base64ToBytes } from '@par-noir/pqc-crypto/encoding';
import { signOauthUnlockProof } from '@par-noir/pqc-crypto/oauth-unlock-proof';
import {
  decryptIdentityFileLocal,
  extractMlDsaSecretKeyB64,
  parseIdentityFileJson,
} from '../consentUnlock/decryptIdentityLocal';
import { requestOauthUnlockChallenge } from '../oauthUnlockProofMint';

/** First-party client + registered redirect the challenge is bound to; no code is minted. */
export const PUSH_PROOF_CLIENT_ID = 'browser-app';
export const PUSH_PROOF_REDIRECT_URI = 'https://browse.parnoir.com/oauth-callback.html';

export type NativePushAction = 'register' | 'unregister';

export interface NativePushVaultEntry {
  identityId: string;
  publicKey: string;
  key1: string;
  key2: string;
  encryptedIdentityJson?: string;
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function signingKeyFor(entry: NativePushVaultEntry): Promise<{ publicKey: string; secretKeyB64: string }> {
  const row = parseIdentityFileJson(JSON.parse(entry.encryptedIdentityJson || ''));
  const unlocked = await decryptIdentityFileLocal(row, entry.key1, entry.key2);
  const secretKeyB64 = extractMlDsaSecretKeyB64(unlocked.decryptedIdentity);
  if (!secretKeyB64) throw new Error('No ML-DSA key in identity');
  return { publicKey: unlocked.publicKey, secretKeyB64 };
}

export async function sendNativePushProof(opts: {
  apiEndpoint: string;
  entry: NativePushVaultEntry;
  token: string;
  platform: 'ios' | 'android';
  action: NativePushAction;
}): Promise<void> {
  const apiEndpoint = opts.apiEndpoint.replace(/\/$/, '');
  const scope = opts.action === 'register' ? 'pn:push_register' : 'pn:push_unregister';
  const { publicKey, secretKeyB64 } = await signingKeyFor(opts.entry);
  const { challengeId, challenge } = await requestOauthUnlockChallenge({
    apiEndpoint,
    clientId: PUSH_PROOF_CLIENT_ID,
    redirectUri: PUSH_PROOF_REDIRECT_URI,
  });
  const state = randomHex(16);
  const nonce = randomHex(16);
  const signature = signOauthUnlockProof(
    {
      challenge,
      clientId: PUSH_PROOF_CLIENT_ID,
      redirectUri: PUSH_PROOF_REDIRECT_URI,
      scope,
      state,
      nonce,
      publicKey,
    },
    base64ToBytes(secretKeyB64)
  );
  const res = await fetch(`${apiEndpoint}/oauth/push/${opts.action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: PUSH_PROOF_CLIENT_ID,
      redirect_uri: PUSH_PROOF_REDIRECT_URI,
      state,
      nonce,
      challenge_id: challengeId,
      public_key: publicKey,
      signature,
      token: opts.token,
      platform: opts.platform,
    }),
  });
  if (!res.ok) throw new Error(`Push ${opts.action} failed (${res.status})`);
}

/** Registers the device token for every saved pN; failures for one pN do not block the rest. */
export async function registerNativePushForEntries(opts: {
  apiEndpoint: string;
  entries: NativePushVaultEntry[];
  token: string;
  platform: 'ios' | 'android';
}): Promise<{ registered: number; failed: number }> {
  let registered = 0;
  let failed = 0;
  for (const entry of opts.entries) {
    try {
      await sendNativePushProof({ ...opts, entry, action: 'register' });
      registered++;
    } catch {
      failed++;
    }
  }
  return { registered, failed };
}
