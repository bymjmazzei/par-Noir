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
  /** Object form (browser decrypt) or JSON string (dashboard generateShareToken) */
  shareEncrypted?:
    | string
    | {
        encrypted: string;
        iv: string;
        salt: string;
      };
}

export async function decryptWithToken(token: ShareToken): Promise<Blob> {
  if (!token.shareEncrypted || !token.shareKey) {
    throw new Error('Share token missing share key or share-encrypted content');
  }
  if (!token.shareKey.trim()) throw new Error('Share key is empty or undefined');

  const shareEncrypted =
    typeof token.shareEncrypted === 'string'
      ? (JSON.parse(token.shareEncrypted) as { encrypted?: string; iv?: string; salt?: string })
      : token.shareEncrypted;
  if (!shareEncrypted.encrypted?.trim()) throw new Error('Share encrypted data is empty or undefined');
  if (!shareEncrypted.iv?.trim()) throw new Error('Share IV is empty or undefined');

  const shareKey = await crypto.subtle.importKey(
    'raw',
    base64ToArrayBuffer(token.shareKey),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToArrayBuffer(shareEncrypted.iv) },
    shareKey,
    base64ToArrayBuffer(shareEncrypted.encrypted)
  );

  const bytes = new Uint8Array(decryptedBuffer);
  let mimeType = 'application/octet-stream';
  if (token.metadata?.title) {
    const fileName = token.metadata.title.toLowerCase();
    if (fileName.match(/\.(jpg|jpeg|png|gif|webp)$/)) mimeType = 'image/jpeg';
    else if (fileName.match(/\.(mp4|mov|avi|webm)$/)) mimeType = 'video/mp4';
    else if (fileName.match(/\.(mp3|wav|ogg)$/)) mimeType = 'audio/mpeg';
    else if (fileName.match(/\.pdf$/)) mimeType = 'application/pdf';
  }
  return new Blob([bytes], { type: mimeType });
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
