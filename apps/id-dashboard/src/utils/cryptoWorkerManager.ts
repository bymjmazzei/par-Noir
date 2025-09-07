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
  private isHealthy: boolean = false;
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
        this.isHealthy = false;
      };
      this.isHealthy = true;
    } catch (error) {
      // Failed to initialize crypto worker - handled silently
      this.worker = null;
      this.isHealthy = false;
    }
  }

  private async sendMessage(type: string, data: any): Promise<any> {
    if (!this.worker || !this.isHealthy) {
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
  async generateKey(algorithm: string, extractable: boolean = false, keyUsages: string[] = []): Promise<CryptoKey> {
    return this.sendMessage('generateKey', { algorithm, extractable, keyUsages });
  }

  async generateKeyPair(algorithm: string, extractable: boolean = false, keyUsages: string[] = []): Promise<CryptoKeyPair> {
    return this.sendMessage('generateKeyPair', { algorithm, extractable, keyUsages });
  }

  async encrypt(algorithm: string, key: CryptoKey, data: ArrayBuffer, options?: any): Promise<ArrayBuffer> {
    return this.sendMessage('encrypt', { algorithm, key, data, options });
  }

  async decrypt(algorithm: string, key: CryptoKey, data: ArrayBuffer, options?: any): Promise<ArrayBuffer> {
    return this.sendMessage('decrypt', { algorithm, key, data, options });
  }

  async sign(algorithm: string, key: CryptoKey, data: ArrayBuffer, options?: any): Promise<ArrayBuffer> {
    return this.sendMessage('sign', { algorithm, key, data, options });
  }

  async verify(algorithm: string, key: CryptoKey, signature: ArrayBuffer, data: ArrayBuffer, options?: any): Promise<boolean> {
    return this.sendMessage('verify', { algorithm, key, signature, data, options });
  }

  async hash(algorithm: string, data: ArrayBuffer): Promise<ArrayBuffer> {
    return this.sendMessage('hash', { algorithm, data });
  }

  async generateRandom(lengthOrArray: number | Uint8Array): Promise<Uint8Array> {
    const length = typeof lengthOrArray === 'number' ? lengthOrArray : lengthOrArray.length;
    return this.sendMessage('generateRandom', { length, type: 'bytes' });
  }

  async deriveKey(algorithm: string, baseKey: CryptoKey, derivedKeyType: any, extractable: boolean, keyUsages: string[]): Promise<CryptoKey> {
    return this.sendMessage('deriveKey', { algorithm, baseKey, derivedKeyType, extractable, keyUsages });
  }

  async importKey(format: string, keyData: any, algorithm: string, extractable: boolean, keyUsages: string[]): Promise<CryptoKey> {
    return this.sendMessage('importKey', { format, keyData, algorithm, extractable, keyUsages });
  }

  async exportKey(format: string, key: CryptoKey): Promise<any> {
    return this.sendMessage('exportKey', { format, key });
  }

  async computeSharedSecret(privateKey: CryptoKey, publicKey: CryptoKey): Promise<ArrayBuffer> {
    return this.sendMessage('computeSharedSecret', { privateKey, publicKey });
  }

  // Health check
  getHealth(): boolean {
    return this.isHealthy;
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

// Create and export singleton instance
export const cryptoWorkerManager = new CryptoWorkerManager();
export default cryptoWorkerManager;
