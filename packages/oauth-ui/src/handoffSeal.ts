/**
 * Unlock handoff secrets are sealed to a keypair that stays in the calling tab.
 * The API stores the ciphertext. It never receives the ML-KEM or ML-DSA secret.
 */

import { base64ToBytes, bytesToBase64 } from '@par-noir/pqc-crypto';
import { mlKem768Decapsulate, mlKem768Encapsulate, mlKem768Keygen } from '@par-noir/pqc-crypto';

export const HANDOFF_PK_PARAM = 'handoff_pk';

export type SealedHandoff = {
  kemCiphertext: string;
  ciphertext: string;
};

export type HandoffKem = {
  publicKey: string;
  secretKey: string;
};

export type SealedHandoffPlaintext = {
  shellResult?: Record<string, string>;
  messagingSession?: Record<string, string>;
};

const PRIVATE_BROKER_KEYS = new Set([
  'passcode',
  'pnname',
  'pn_name',
  'key1',
  'key2',
  'mlkemsecretkey',
  'mldsasecretkey',
]);

const secretsByState = new Map<string, string>();

export function createHandoffKem(): HandoffKem {
  const keys = mlKem768Keygen();
  return {
    publicKey: bytesToBase64(keys.publicKey),
    secretKey: bytesToBase64(keys.secretKey),
  };
}

/** Remember the ephemeral secret for this OAuth state. The public key goes on the launch URL. */
export function bindHandoffKem(state: string): HandoffKem {
  const kem = createHandoffKem();
  if (state) secretsByState.set(state, kem.secretKey);
  return kem;
}

export function takeHandoffKemSecret(state: string): string | null {
  if (!state) return null;
  return secretsByState.get(state) || null;
}

export function clearHandoffKemForTests(): void {
  secretsByState.clear();
}

export async function sealHandoffPayload(
  publicKeyB64: string,
  payload: SealedHandoffPlaintext
): Promise<SealedHandoff> {
  const { cipherText, sharedSecret } = mlKem768Encapsulate(base64ToBytes(publicKeyB64));
  const ciphertext = await aesGcmEncrypt(sharedSecret, JSON.stringify(payload));
  return {
    kemCiphertext: bytesToBase64(cipherText),
    ciphertext,
  };
}

export async function openHandoffPayload(
  sealed: SealedHandoff,
  secretKeyB64: string
): Promise<SealedHandoffPlaintext> {
  const shared = mlKem768Decapsulate(base64ToBytes(sealed.kemCiphertext), base64ToBytes(secretKeyB64));
  const json = await aesGcmDecrypt(shared, sealed.ciphertext);
  const parsed = JSON.parse(json) as SealedHandoffPlaintext;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Unlock handoff did not open');
  }
  return parsed;
}

export function brokerBodyHasPrivateKey(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (PRIVATE_BROKER_KEYS.has(key.toLowerCase())) return key;
    const nested = brokerBodyHasPrivateKey(child);
    if (nested) return nested;
  }
  return null;
}

export function assertBrokerBodyHasNoPrivateKeys(value: unknown): void {
  const found = brokerBodyHasPrivateKey(value);
  if (found) {
    throw new Error(`Unlock handoff must not include ${found}`);
  }
}

/** Attach handoff_pk to a consent URL. No-op when state is too short to bind. */
export function withHandoffPk(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.searchParams.get(HANDOFF_PK_PARAM)) return url;
  const state = parsed.searchParams.get('state') || '';
  if (state.length < 8) return url;
  const kem = bindHandoffKem(state);
  parsed.searchParams.set(HANDOFF_PK_PARAM, kem.publicKey);
  return parsed.toString();
}

/**
 * Open sealedHandoff with this tab's ephemeral secret and put the secrets back
 * on the payload the app already consumes. Apps do not unwrap on their own.
 */
export async function openSealedBrokerPayload(
  state: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const sealed = payload.sealedHandoff;
  if (!sealed || typeof sealed !== 'object') return payload;
  const row = sealed as SealedHandoff;
  if (typeof row.kemCiphertext !== 'string' || typeof row.ciphertext !== 'string') {
    throw new Error('Unlock handoff ciphertext is incomplete');
  }
  const secret = takeHandoffKemSecret(state);
  if (!secret) throw new Error('Unlock handoff key is not in this tab');
  const opened = await openHandoffPayload(row, secret);
  const next: Record<string, unknown> = { ...payload };
  delete next.sealedHandoff;
  if (opened.shellResult && next.shellSession && typeof next.shellSession === 'object') {
    const session = next.shellSession as Record<string, unknown>;
    const prev =
      session.result && typeof session.result === 'object'
        ? (session.result as Record<string, string>)
        : {};
    next.shellSession = { ...session, result: { ...prev, ...opened.shellResult } };
  }
  if (opened.messagingSession) {
    const prev =
      next.messagingHandoff && typeof next.messagingHandoff === 'object'
        ? (next.messagingHandoff as Record<string, unknown>)
        : { v: 1, timestamp: Date.now() };
    next.messagingHandoff = { ...prev, session: opened.messagingSession };
  }
  return next;
}

async function aesGcmEncrypt(keyBytes: Uint8Array, plaintext: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext))
  );
  const packed = new Uint8Array(iv.length + ct.length);
  packed.set(iv, 0);
  packed.set(ct, iv.length);
  return bytesToBase64(packed);
}

async function aesGcmDecrypt(keyBytes: Uint8Array, packedB64: string): Promise<string> {
  const packed = base64ToBytes(packedB64);
  const iv = packed.slice(0, 12);
  const ct = packed.slice(12);
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(plain);
}
