/**
 * Upload Worker - Handles encryption/decryption operations off main thread
 * Prevents blocking UI during file encryption operations
 */

interface EncryptRequest {
  id: string;
  type: 'encrypt';
  data: Uint8Array;
  pnId: string;
  publicKey: string;
}

interface DecryptRequest {
  id: string;
  type: 'decrypt';
  encrypted: string;
  iv: string;
  salt: string;
  pnId: string;
  publicKey: string;
}

type WorkerRequest = EncryptRequest | DecryptRequest;

interface WorkerResponse {
  id: string;
  success: boolean;
  result?: any;
  error?: string;
}

// Helper functions
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function generateSalt(): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return arrayBufferToBase64(salt.buffer);
}

function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(12)); // 12 bytes for AES-GCM
}

async function deriveKey(keyMaterial: string, salt: string): Promise<CryptoKey> {
  const saltBuffer = base64ToArrayBuffer(salt);
  const keyMaterialBuffer = new TextEncoder().encode(keyMaterial);
  
  // Import key material
  const baseKey = await crypto.subtle.importKey(
    'raw',
    keyMaterialBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );
  
  // Derive key using PBKDF2 - MUST match dashboard: 1M iterations, SHA-512
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: 1000000, // Military-grade: 1M iterations (matches dashboard)
      hash: 'SHA-512' // Military-grade: SHA-512 (matches dashboard)
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  
  return derivedKey;
}

async function encrypt(data: Uint8Array, pnId: string, publicKey: string): Promise<{ encrypted: string; iv: string; salt: string }> {
  // Derive encryption key from stable pN identity (id + publicKey)
  const combined = `${pnId}:${publicKey}`;
  const encoder = new TextEncoder();
  const combinedData = encoder.encode(combined);
  
  // Hash the combined identity to get stable key material
  const hashBuffer = await crypto.subtle.digest('SHA-256', combinedData);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashedKeyMaterial = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  const salt = await generateSalt();
  const key = await deriveKey(hashedKeyMaterial, salt);
  const iv = generateIV();
  
  // Use crypto.subtle for file encryption
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data.buffer
  );
  
  return {
    encrypted: arrayBufferToBase64(encryptedBuffer),
    iv: arrayBufferToBase64(iv),
    salt
  };
}

async function decrypt(encryptedData: string, iv: string, salt: string, pnId: string, publicKey: string): Promise<Uint8Array> {
  // Derive decryption key from stable pN identity (id + publicKey)
  const combined = `${pnId}:${publicKey}`;
  const encoder = new TextEncoder();
  const combinedData = encoder.encode(combined);
  
  // Hash the combined identity (same process as encryption)
  const hashBuffer = await crypto.subtle.digest('SHA-256', combinedData);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashedKeyMaterial = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  const key = await deriveKey(hashedKeyMaterial, salt);
  const ivBuffer = base64ToArrayBuffer(iv);
  const dataBuffer = base64ToArrayBuffer(encryptedData);
  
  // Use crypto.subtle for file decryption
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuffer },
    key,
    dataBuffer
  );
  
  return new Uint8Array(decryptedBuffer);
}

// Handle messages from main thread
self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  
  try {
    let result: any;
    
    if (request.type === 'encrypt') {
      // Convert Uint8Array from transferable format
      const data = new Uint8Array(request.data);
      result = await encrypt(data, request.pnId, request.publicKey);
    } else if (request.type === 'decrypt') {
      result = await decrypt(request.encrypted, request.iv, request.salt, request.pnId, request.publicKey);
      // Convert Uint8Array to transferable format
      result = Array.from(result);
    } else {
      throw new Error(`Unknown request type: ${(request as any).type}`);
    }
    
    const response: WorkerResponse = {
      id: request.id,
      success: true,
      result
    };
    
    self.postMessage(response);
  } catch (error: any) {
    const response: WorkerResponse = {
      id: request.id,
      success: false,
      error: error?.message || 'Unknown error'
    };
    
    self.postMessage(response);
  }
});

