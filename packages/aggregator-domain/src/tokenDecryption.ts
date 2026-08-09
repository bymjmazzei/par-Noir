export interface ShareToken {
  fileId: string;
  contentKey: {
    encrypted: string;
    wrappedWith: string;
    iv: string;
  };
  expiresAt: string;
  permissions: string[];
  metadata?: {
    title?: string;
    description?: string;
  };
  shareKey?: string;
  /**
   * @deprecated Public feed must not embed ciphertext. Kept only so legacy parsers
   * fail closed when present; new publishes must omit this and use publicContentRef.
   */
  shareEncrypted?:
    | string
    | {
        encrypted: string;
        iv: string;
        salt: string;
      };
}

export interface PublicCipherEnvelope {
  encrypted: string;
  iv: string;
  salt?: string;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  if (!base64 || typeof base64 !== 'string') {
    throw new Error('Invalid base64 input: must be a non-empty string');
  }
  const cleanBase64 = base64.trim().replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/=]*$/.test(cleanBase64)) {
    throw new Error('Invalid base64 format: contains invalid characters');
  }
  const binary = atob(cleanBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function mimeFromTitle(title?: string): string {
  if (!title) return 'application/octet-stream';
  const fileName = title.toLowerCase();
  if (fileName.match(/\.(jpg|jpeg|png|gif|webp)$/)) return 'image/jpeg';
  if (fileName.match(/\.(mp4|mov|avi|webm)$/)) return 'video/mp4';
  if (fileName.match(/\.(mp3|wav|ogg)$/)) return 'audio/mpeg';
  if (fileName.match(/\.pdf$/)) return 'application/pdf';
  return 'application/octet-stream';
}

/**
 * Decrypt public ciphertext fetched from the owner's cloud (via blind proxy).
 * shareKey lives in API metadata; envelope bytes live on the cloud.
 */
export async function decryptPublicCiphertext(
  envelope: PublicCipherEnvelope,
  shareKeyBase64: string,
  titleHint?: string
): Promise<Blob> {
  if (!shareKeyBase64?.trim()) throw new Error('Share key is empty or undefined');
  if (!envelope?.encrypted?.trim()) throw new Error('Share encrypted data is empty or undefined');
  if (!envelope?.iv?.trim()) throw new Error('Share IV is empty or undefined');

  const shareKey = await crypto.subtle.importKey(
    'raw',
    base64ToArrayBuffer(shareKeyBase64),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToArrayBuffer(envelope.iv) },
    shareKey,
    base64ToArrayBuffer(envelope.encrypted)
  );

  return new Blob([new Uint8Array(decryptedBuffer)], { type: mimeFromTitle(titleHint) });
}

/**
 * @deprecated Prefer decryptPublicCiphertext with cloud-fetched envelope.
 * Fails if shareEncrypted is missing (correct for new public posts).
 */
export async function decryptWithToken(token: ShareToken): Promise<Blob> {
  if (!token.shareEncrypted || !token.shareKey) {
    throw new Error(
      'Share token missing cloud envelope — public media must be fetched via publicContentRef + shareKey'
    );
  }
  if (!token.shareKey.trim()) throw new Error('Share key is empty or undefined');

  const shareEncrypted =
    typeof token.shareEncrypted === 'string'
      ? (JSON.parse(token.shareEncrypted) as { encrypted?: string; iv?: string; salt?: string })
      : token.shareEncrypted;
  if (!shareEncrypted.encrypted?.trim() || !shareEncrypted.iv?.trim()) {
    throw new Error('Share token envelope incomplete');
  }

  return decryptPublicCiphertext(
    { encrypted: shareEncrypted.encrypted, iv: shareEncrypted.iv, salt: shareEncrypted.salt },
    token.shareKey,
    token.metadata?.title
  );
}
