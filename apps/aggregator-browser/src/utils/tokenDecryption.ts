/**
 * Token Decryption Utility (Phase 3)
 * Decrypts files using share tokens from public metadata
 * 
 * Note: The share-encrypted content is stored in the token itself,
 * so we don't need to download the original encrypted file.
 */

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
  shareEncrypted?: {
    encrypted: string;
    iv: string;
    salt: string;
  };
}

/**
 * Decrypt file content using share token
 * Returns decrypted content as Blob
 */
export async function decryptWithToken(token: ShareToken): Promise<Blob> {
  if (!token.shareEncrypted || !token.shareKey) {
    throw new Error('Share token missing share key or share-encrypted content');
  }

  // Import share key
  const shareKeyBuffer = base64ToArrayBuffer(token.shareKey);
  const shareKey = await crypto.subtle.importKey(
    'raw',
    shareKeyBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  // Decrypt share-encrypted content
  const shareEncryptedBuffer = base64ToArrayBuffer(token.shareEncrypted.encrypted);
  const shareIV = base64ToArrayBuffer(token.shareEncrypted.iv);
  
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: shareIV
    },
    shareKey,
    shareEncryptedBuffer
  );

  // Decrypted content is already raw bytes (Uint8Array from encryption)
  // No need for base64 decoding - just use the decrypted buffer directly
  const bytes = new Uint8Array(decryptedBuffer);

  // Determine MIME type from filename
  let mimeType = 'application/octet-stream';
  if (token.metadata?.title) {
    const fileName = token.metadata.title.toLowerCase();
    if (fileName.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
      mimeType = 'image/jpeg';
    } else if (fileName.match(/\.(mp4|mov|avi|webm)$/)) {
      mimeType = 'video/mp4';
    } else if (fileName.match(/\.(mp3|wav|ogg)$/)) {
      mimeType = 'audio/mpeg';
    } else if (fileName.match(/\.pdf$/)) {
      mimeType = 'application/pdf';
    }
  }

  return new Blob([bytes], { type: mimeType });
}

/**
 * Helper: Convert Base64 to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  try {
    // Validate base64 string
    if (!base64 || typeof base64 !== 'string') {
      throw new Error('Invalid base64 input: must be a non-empty string');
    }
    
    // Remove any whitespace
    const cleanBase64 = base64.trim().replace(/\s/g, '');
    
    // Validate base64 format
    if (!/^[A-Za-z0-9+/=]*$/.test(cleanBase64)) {
      throw new Error('Invalid base64 format: contains invalid characters');
    }
    
    const binary = atob(cleanBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (error) {
    throw new Error(`Failed to decode base64: ${error instanceof Error ? error.message : 'Unknown error'}. Input length: ${base64?.length || 0}`);
  }
}

