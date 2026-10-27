import { b64ToBytes, bytesToB64 } from './shamir';

export interface RecoveryConfig {
  threshold: number;
  totalShares: number;
  version: 1;
  createdAt: string;
}

export interface RecoveryPayload {
  publicKey: string;
  mlKemPublicKey: string;
  mlKemSecretKey: string;
  mlDsaSecretKey: string;
  identityId: string;
  pnName: string;
  recoveryConfig: RecoveryConfig;
}

export interface RecoveryEnvelope {
  version: 1;
  iv: string;
  ciphertext: string;
}

async function deriveEnvelopeKey(master: Uint8Array): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest('SHA-256', master as BufferSource);
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptRecoveryEnvelope(
  master: Uint8Array,
  payload: RecoveryPayload
): Promise<RecoveryEnvelope> {
  const key = await deriveEnvelopeKey(master);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plaintext
  );
  return {
    version: 1,
    iv: bytesToB64(iv),
    ciphertext: bytesToB64(new Uint8Array(ciphertext))
  };
}

export async function decryptRecoveryEnvelope(
  master: Uint8Array,
  envelope: RecoveryEnvelope
): Promise<RecoveryPayload> {
  if (envelope.version !== 1) throw new Error('unsupported recovery envelope version');
  const key = await deriveEnvelopeKey(master);
  const iv = b64ToBytes(envelope.iv);
  const ciphertext = b64ToBytes(envelope.ciphertext);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ciphertext as BufferSource
  );
  return JSON.parse(new TextDecoder().decode(decrypted)) as RecoveryPayload;
}

/** Recovery payload sealed to the recovery key itself (key-only recovery, no custodians). */
export interface KeyRecoveryEnvelope {
  version: 1;
  kind: 'recovery-key';
  salt: string;
  iv: string;
  ciphertext: string;
}

const KEY_ENVELOPE_INFO = 'pn-recovery-key-envelope-v1';

/**
 * HKDF, not a bare hash: the server stores SHA-256(recoveryKey) as the key lookup hash, so the
 * envelope key must never equal it.
 */
async function deriveKeyEnvelopeKey(recoveryKey: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(recoveryKey.trim()) as BufferSource,
    'HKDF',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      info: new TextEncoder().encode(KEY_ENVELOPE_INFO) as BufferSource,
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptKeyRecoveryEnvelope(
  recoveryKey: string,
  payload: RecoveryPayload
): Promise<KeyRecoveryEnvelope> {
  if (!recoveryKey.trim()) throw new Error('recovery key required');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKeyEnvelopeKey(recoveryKey, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(JSON.stringify(payload))
  );
  return {
    version: 1,
    kind: 'recovery-key',
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    ciphertext: bytesToB64(new Uint8Array(ciphertext)),
  };
}

export async function decryptKeyRecoveryEnvelope(
  recoveryKey: string,
  envelope: KeyRecoveryEnvelope
): Promise<RecoveryPayload> {
  if (envelope.version !== 1 || envelope.kind !== 'recovery-key') {
    throw new Error('unsupported key recovery envelope');
  }
  const key = await deriveKeyEnvelopeKey(recoveryKey, b64ToBytes(envelope.salt));
  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(envelope.iv) as BufferSource },
      key,
      b64ToBytes(envelope.ciphertext) as BufferSource
    );
  } catch {
    throw new Error('This recovery key does not open the recovery data.');
  }
  return JSON.parse(new TextDecoder().decode(decrypted)) as RecoveryPayload;
}

export function buildRecoveryPayload(input: {
  publicKey: string;
  mlKemPublicKey: string;
  mlKemSecretKey: string;
  mlDsaSecretKey: string;
  identityId: string;
  pnName: string;
  recoveryConfig: RecoveryConfig;
}): RecoveryPayload {
  return { ...input };
}
