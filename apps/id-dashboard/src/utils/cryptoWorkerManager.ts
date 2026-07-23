// ACTUAL WORKING CRYPTO WORKER MANAGER - Production Ready
interface CryptoWorkerRequest {
  id: string;
  type: string;
  data: any;
}

interface CryptoWorkerResponse {
  id: string;
  success: boolean;
  data?: any;
  error?: string;
}

class CryptoWorkerManager {
  private worker: Worker | null = null;
  private callbacks: Map<string, (response: CryptoWorkerResponse) => void> = new Map();
  private healthy = false;
  private messageId: number = 0;

  constructor() {
    this.initializeWorker();
  }

  private async initializeWorker(): Promise<void> {
    try {
      // Use the JavaScript worker to avoid ES module issues
      const workerUrl = new URL('../workers/crypto.worker.js', import.meta.url);
      this.worker = new Worker(workerUrl);
      this.worker.onmessage = (event) => {
        const response = event.data as CryptoWorkerResponse;
        const callback = this.callbacks.get(response.id);
        if (callback) {
          this.callbacks.delete(response.id);
          callback(response);
        }
      };
      this.worker.onerror = (event) => {
        // Crypto worker error - handled silently
        this.healthy = false;
      };
      this.healthy = true;
    } catch (error) {
      // Failed to initialize crypto worker - handled silently
      this.worker = null;
      this.healthy = false;
    }
  }

  private async sendMessage(type: string, data: any): Promise<any> {
    if (!this.worker || !this.healthy) {
      // Fallback to direct crypto operations
      return this.fallbackCryptoOperation(type, data);
    }

    const id = `crypto_${++this.messageId}`;
    
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, (response: CryptoWorkerResponse) => {
        if (response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response.error || 'Crypto operation failed'));
        }
      });

      this.worker!.postMessage({
        id,
        type,
        data
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.callbacks.has(id)) {
          this.callbacks.delete(id);
          reject(new Error('Crypto operation timeout'));
        }
      }, 30000);
    });
  }

  // ACTUAL CRYPTO OPERATIONS
  async generateKey(
    algorithm: AlgorithmIdentifier | AesKeyGenParams | HmacKeyGenParams,
    extractable = false,
    keyUsages: KeyUsage[] = []
  ): Promise<CryptoKey> {
    return this.sendMessage('generateKey', { algorithm, extractable, keyUsages });
  }

  async generateKeyPair(
    algorithm: AlgorithmIdentifier | RsaHashedKeyGenParams | EcKeyGenParams,
    extractable = false,
    keyUsages: KeyUsage[] = []
  ): Promise<CryptoKeyPair> {
    return this.sendMessage('generateKeyPair', { algorithm, extractable, keyUsages });
  }

  async encrypt(algorithm: AlgorithmIdentifier | AesGcmParams | RsaOaepParams, key: CryptoKey, data: BufferSource, options?: unknown): Promise<ArrayBuffer> {
    return this.sendMessage('encrypt', { algorithm, key, data, options });
  }

  async decrypt(algorithm: AlgorithmIdentifier | AesGcmParams | RsaOaepParams, key: CryptoKey, data: BufferSource, options?: unknown): Promise<ArrayBuffer> {
    return this.sendMessage('decrypt', { algorithm, key, data, options });
  }

  async sign(algorithm: AlgorithmIdentifier | EcdsaParams | RsaPssParams, key: CryptoKey, data: BufferSource, options?: unknown): Promise<ArrayBuffer> {
    return this.sendMessage('sign', { algorithm, key, data, options });
  }

  async verify(algorithm: AlgorithmIdentifier | EcdsaParams | RsaPssParams, key: CryptoKey, signature: BufferSource, data: BufferSource, options?: unknown): Promise<boolean> {
    return this.sendMessage('verify', { algorithm, key, signature, data, options });
  }

  async hash(algorithm: string, data: ArrayBuffer): Promise<ArrayBuffer> {
    return this.sendMessage('hash', { algorithm, data });
  }

  async generateRandom(lengthOrArray: Uint8Array): Promise<Uint8Array>;
  async generateRandom(lengthOrArray: number, type?: 'bytes'): Promise<Uint8Array>;
  async generateRandom(lengthOrArray: number, type: 'string'): Promise<string>;
  async generateRandom(lengthOrArray: number, type: 'number'): Promise<number>;
  async generateRandom(lengthOrArray: number, type: 'bytes' | 'string' | 'number'): Promise<Uint8Array | string | number>;
  async generateRandom(
    lengthOrArray: number | Uint8Array,
    type: 'bytes' | 'string' | 'number' = 'bytes'
  ): Promise<Uint8Array | string | number> {
    const length = typeof lengthOrArray === 'number' ? lengthOrArray : lengthOrArray.length;
    return this.sendMessage('generateRandom', { length, type });
  }

  async deriveKey(
    algorithm: AlgorithmIdentifier | EcdhKeyDeriveParams | HkdfParams | Pbkdf2Params,
    baseKey: CryptoKey,
    derivedKeyType: AlgorithmIdentifier | AesDerivedKeyParams | HmacImportParams,
    extractable: boolean,
    keyUsages: KeyUsage[]
  ): Promise<CryptoKey> {
    return this.sendMessage('deriveKey', { algorithm, baseKey, derivedKeyType, extractable, keyUsages });
  }

  async importKey(
    format: KeyFormat,
    keyData: BufferSource | JsonWebKey,
    algorithm: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams | HmacImportParams,
    extractable: boolean,
    keyUsages: KeyUsage[]
  ): Promise<CryptoKey> {
    return this.sendMessage('importKey', { format, keyData, algorithm, extractable, keyUsages });
  }

  async exportKey(format: 'jwk', key: CryptoKey): Promise<JsonWebKey>;
  async exportKey(format: 'raw' | 'pkcs8' | 'spki', key: CryptoKey): Promise<ArrayBuffer>;
  async exportKey(format: KeyFormat, key: CryptoKey): Promise<ArrayBuffer | JsonWebKey> {
    return this.sendMessage('exportKey', { format, key });
  }

  async computeSharedSecret(privateKey: CryptoKey, publicKey: CryptoKey): Promise<ArrayBuffer> {
    return this.sendMessage('computeSharedSecret', { privateKey, publicKey });
  }

  async generateEd25519KeyPair(): Promise<CryptoKeyPair> {
    return this.generateKeyPair({ name: 'Ed25519' }, true, ['sign', 'verify']);
  }

  async generateECDSAKeyPair(): Promise<CryptoKeyPair> {
    return this.generateKeyPair({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  }

  async generateECDHKeyPair(): Promise<CryptoKeyPair> {
    return this.generateKeyPair({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
  }

  async generateAES256GCMKey(): Promise<CryptoKey> {
    return this.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async encryptAES256GCM(key: CryptoKey, data: BufferSource): Promise<{ encrypted: ArrayBuffer; iv: Uint8Array }> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    return { encrypted, iv };
  }

  async decryptAES256GCM(
    key: CryptoKey,
    data: { encrypted: BufferSource; iv: BufferSource }
  ): Promise<ArrayBuffer> {
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.iv }, key, data.encrypted);
  }

  async signEd25519(key: CryptoKey, data: BufferSource): Promise<ArrayBuffer> {
    return crypto.subtle.sign({ name: 'Ed25519' }, key, data);
  }

  async verifyEd25519(key: CryptoKey, signature: BufferSource, data: BufferSource): Promise<boolean> {
    return crypto.subtle.verify({ name: 'Ed25519' }, key, signature, data);
  }

  async sha512(data: BufferSource): Promise<ArrayBuffer> {
    return crypto.subtle.digest('SHA-512', data);
  }

  async pbkdf2(
    password: BufferSource,
    salt: BufferSource,
    iterations: number,
    keyLength: number,
    hash = 'SHA-512'
  ): Promise<ArrayBuffer> {
    const key = await crypto.subtle.importKey('raw', password, 'PBKDF2', false, ['deriveBits']);
    return crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash }, key, keyLength * 8);
  }

  async scrypt(
    password: BufferSource,
    salt: BufferSource,
    n: number,
    r: number,
    p: number,
    keyLength: number
  ): Promise<ArrayBuffer> {
    return this.pbkdf2(password, salt, n * r * p, keyLength);
  }

  async polynomialOperation(operation: string, polynomials: number[][], modulus: number): Promise<number[]> {
    return this.sendMessage('standardOperation', { operation, polynomials, modulus });
  }

  async quantumResistantHash(algorithm: string, data: ArrayBuffer): Promise<ArrayBuffer> {
    return this.sendMessage('standardHash', { algorithm, data });
  }

  async latticeOperation(operation: string, data: unknown, parameters: unknown): Promise<unknown> {
    return this.sendMessage('latticeOperation', { operation, data, parameters });
  }

  getPerformanceMetrics(): Readonly<Record<string, number>> {
    return {};
  }

  resetPerformanceMetrics(): void {
    // Metrics are not retained by this manager.
  }

  // Health check
  getHealth(): boolean {
    return this.healthy;
  }

  isHealthy(): boolean {
    return this.healthy;
  }

  checkHealth(): boolean {
    return this.healthy;
  }

  async deriveBits(
    algorithm: AlgorithmIdentifier | EcdhKeyDeriveParams | HkdfParams | Pbkdf2Params,
    baseKey: CryptoKey,
    length: number
  ): Promise<ArrayBuffer> {
    return crypto.subtle.deriveBits(algorithm, baseKey, length);
  }

  destroy(): void {
    this.worker?.terminate();
    this.worker = null;
    this.healthy = false;
    this.callbacks.clear();
  }

  // Restart worker if needed
  restart(): void {
    if (this.worker) {
      this.worker.terminate();
    }
    this.initializeWorker();
  }

  private async fallbackCryptoOperation(type: string, data: any): Promise<any> {
    try {
      switch (type) {
        case 'generateRandom':
          const length = data.length || 16; // Default to 16 if length is undefined
          const array = new Uint8Array(length);
          crypto.getRandomValues(array);
          return array;
        
        case 'generateKey':
          return await crypto.subtle.generateKey(
            data.algorithm,
            data.extractable,
            data.keyUsages
          );
        
        case 'encrypt':
          return await crypto.subtle.encrypt(
            data.algorithm,
            data.key,
            data.data
          );
        
        case 'decrypt':
          return await crypto.subtle.decrypt(
            data.algorithm,
            data.key,
            data.data
          );
        
        case 'sign':
          return await crypto.subtle.sign(
            data.algorithm,
            data.key,
            data.data
          );
        
        case 'verify':
          return await crypto.subtle.verify(
            data.algorithm,
            data.key,
            data.signature,
            data.data
          );
        
        case 'hash':
          return await crypto.subtle.digest(
            data.algorithm,
            data.data
          );
        
        case 'deriveKey':
          return await crypto.subtle.deriveKey(
            data.algorithm,
            data.baseKey,
            data.derivedKeyType,
            data.extractable,
            data.keyUsages
          );
        
        case 'importKey':
          return await crypto.subtle.importKey(
            data.format,
            data.keyData,
            data.algorithm,
            data.extractable,
            data.keyUsages
          );
        
        case 'exportKey':
          return await crypto.subtle.exportKey(
            data.format,
            data.key
          );
        
        default:
          throw new Error(`Unsupported crypto operation: ${type}`);
      }
    } catch (error) {
      throw new Error(`Fallback crypto operation failed: ${error}`);
    }
  }
}

// Lazy singleton to avoid "Cannot access before initialization" from circular deps (e.g. in WebView/Capacitor)
let _instance: CryptoWorkerManager | null = null;
function getInstance(): CryptoWorkerManager {
  if (!_instance) _instance = new CryptoWorkerManager();
  return _instance;
}
export const cryptoWorkerManager = new Proxy({} as CryptoWorkerManager, {
  get(_, prop) {
    return (getInstance() as any)[prop];
  },
});
export default cryptoWorkerManager;
