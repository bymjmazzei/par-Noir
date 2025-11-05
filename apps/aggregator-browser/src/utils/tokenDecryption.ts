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
    throw new Error('Share token missing share key or share-encrypted content. Token structure: ' + JSON.stringify({
      hasShareKey: !!token.shareKey,
      hasShareEncrypted: !!token.shareEncrypted,
      shareKeyLength: token.shareKey?.length || 0,
      shareEncryptedKeys: token.shareEncrypted ? Object.keys(token.shareEncrypted) : []
    }));
  }

  // Validate shareKey
  if (!token.shareKey || token.shareKey.trim().length === 0) {
    throw new Error('Share key is empty or undefined');
  }

  // Validate shareEncrypted fields
  if (!token.shareEncrypted.encrypted || token.shareEncrypted.encrypted.trim().length === 0) {
    throw new Error('Share encrypted data is empty or undefined');
  }

  if (!token.shareEncrypted.iv || token.shareEncrypted.iv.trim().length === 0) {
    throw new Error('Share IV is empty or undefined');
  }

  // Import share key
  let shareKeyBuffer: ArrayBuffer;
  try {
    shareKeyBuffer = base64ToArrayBuffer(token.shareKey);
  } catch (error) {
    throw new Error(`Failed to decode shareKey: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  const shareKey = await crypto.subtle.importKey(
    'raw',
    shareKeyBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  // Decrypt share-encrypted content
  let shareEncryptedBuffer: ArrayBuffer;
  let shareIV: ArrayBuffer;
  try {
    shareEncryptedBuffer = base64ToArrayBuffer(token.shareEncrypted.encrypted);
  } catch (error) {
    throw new Error(`Failed to decode shareEncrypted.encrypted: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  try {
    shareIV = base64ToArrayBuffer(token.shareEncrypted.iv);
  } catch (error) {
    throw new Error(`Failed to decode shareEncrypted.iv: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
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

