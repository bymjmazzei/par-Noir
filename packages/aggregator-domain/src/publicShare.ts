import type { ShareToken, PublicCipherEnvelope } from './tokenDecryption';

export interface PublicShareGenerationResult {
  /** Key material only — safe to store in API publicToken */
  token: ShareToken;
  /** Ciphertext envelope — must be uploaded to owner cloud, never to API */
  envelope: PublicCipherEnvelope;
}

export function envelopeJsonBytes(envelope: PublicCipherEnvelope): Blob {
  return new Blob([JSON.stringify(envelope)], { type: 'application/json' });
}

export function slimPublicTokenJson(token: ShareToken): string {
  const { shareEncrypted: _omit, ...slim } = token as ShareToken & { shareEncrypted?: unknown };
  return JSON.stringify(slim);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Seal plaintext into the public-share envelope aggregators decrypt.
 * Ciphertext stays on the owner cloud; only the slim token (with shareKey) is indexed.
 */
export async function sealPublicShareFromBytes(params: {
  bytes: Uint8Array;
  title?: string;
  fileIdHint?: string;
}): Promise<PublicShareGenerationResult> {
  const shareKeyArray = crypto.getRandomValues(new Uint8Array(32));
  const shareIv = crypto.getRandomValues(new Uint8Array(12));
  const saltArray = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', shareKeyArray, { name: 'AES-GCM' }, false, [
    'encrypt'
  ]);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: shareIv }, key, params.bytes as BufferSource)
  );
  return {
    token: {
      fileId: params.fileIdHint || '',
      contentKey: { encrypted: '', wrappedWith: '', iv: '' },
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      permissions: ['read'],
      ...(params.title ? { metadata: { title: params.title } } : {}),
      shareKey: bytesToBase64(shareKeyArray)
    },
    envelope: {
      encrypted: bytesToBase64(encrypted),
      iv: bytesToBase64(shareIv),
      salt: bytesToBase64(saltArray)
    }
  };
}
