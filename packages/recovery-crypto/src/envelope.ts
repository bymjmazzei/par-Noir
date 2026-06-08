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
  const hash = await crypto.subtle.digest('SHA-256', master);
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptRecoveryEnvelope(
  master: Uint8Array,
  payload: RecoveryPayload
): Promise<RecoveryEnvelope> {
  const key = await deriveEnvelopeKey(master);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
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
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
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
