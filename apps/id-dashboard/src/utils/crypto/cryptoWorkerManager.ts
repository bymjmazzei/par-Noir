import { cryptoWorkerManager } from '../../types/cryptoWorkerManager';

// Enhanced Crypto Worker Manager for Phase 2
export class CryptoWorkerManager {
  private worker: Worker | null = null;
  private messageId = 0;
  private pendingOperations = new Map<string, { resolve: Function; reject: Function }>();

  constructor() {
    this.initializeWorker();
  }

  private initializeWorker(): void {
    try {
      this.worker = new Worker(new URL('../../workers/crypto.worker.ts', import.meta.url));
      this.worker.onmessage = this.handleWorkerMessage.bind(this);
      this.worker.onerror = this.handleWorkerError.bind(this);
    } catch (error) {
      // Crypto worker initialization failed - error logged internally
      throw new Error('Crypto worker initialization failed');
    }
  }

  private handleWorkerMessage(event: MessageEvent): void {
    const { id, success, data, error } = event.data;
    const operation = this.pendingOperations.get(id);
    
    if (operation) {
      this.pendingOperations.delete(id);
      if (success) {
        operation.resolve(data);
      } else {
        operation.reject(new Error(error));
      }
    }
  }

  private handleWorkerError(error: ErrorEvent): void {
    // Crypto worker error - reject all pending operations
    this.pendingOperations.forEach((operation) => {
      operation.reject(new Error('Crypto worker error'));
    });
    this.pendingOperations.clear();
  }

  private async sendMessage(type: string, data: any): Promise<any> {
    if (!this.worker) {
      throw new Error('Crypto worker not initialized');
    }

    const id = `crypto_${++this.messageId}`;
    
    return new Promise((resolve, reject) => {
      this.pendingOperations.set(id, { resolve, reject });
      
      this.worker!.postMessage({
        id,
        type,
        data
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingOperations.has(id)) {
          this.pendingOperations.delete(id);
          reject(new Error('Crypto operation timeout'));
        }
      }, 30000);
    });
  }

  // Key Generation
  async generateKey(algorithm: string, extractable: boolean = false, keyUsages: string[] = []): Promise<CryptoKey> {
    return this.sendMessage('generateKey', { algorithm, extractable, keyUsages });
  }

  async generateKeyPair(algorithm: string, extractable: boolean = false, keyUsages: string[] = []): Promise<CryptoKeyPair> {
    return this.sendMessage('generateKeyPair', { algorithm, extractable, keyUsages });
  }

  // Encryption/Decryption
  async encrypt(algorithm: string, key: CryptoKey, data: ArrayBuffer, options?: any): Promise<ArrayBuffer> {
    return this.sendMessage('encrypt', { algorithm, key, data, options });
  }

  async decrypt(algorithm: string, key: CryptoKey, data: ArrayBuffer, options?: any): Promise<ArrayBuffer> {
    return this.sendMessage('decrypt', { algorithm, key, data, options });
  }

  // Signing/Verification
  async sign(algorithm: string, key: CryptoKey, data: ArrayBuffer, options?: any): Promise<ArrayBuffer> {
    return this.sendMessage('sign', { algorithm, key, data, options });
  }

  async verify(algorithm: string, key: CryptoKey, signature: ArrayBuffer, data: ArrayBuffer, options?: any): Promise<boolean> {
    return this.sendMessage('verify', { algorithm, key, signature, data, options });
  }

  // Hashing
  async hash(algorithm: string, data: ArrayBuffer): Promise<ArrayBuffer> {
    return this.sendMessage('hash', { algorithm, data });
  }

  // Random Generation
  async generateRandom(length: number, type: string = 'Uint8Array'): Promise<Uint8Array> {
    return this.sendMessage('generateRandom', { length, type });
  }

  // Key Derivation
  async deriveKey(algorithm: string, baseKey: CryptoKey, derivedKeyAlgorithm: any, extractable: boolean, keyUsages: string[]): Promise<CryptoKey> {
    return this.sendMessage('deriveKey', { algorithm, baseKey, derivedKeyAlgorithm, extractable, keyUsages });
  }

  // Key Import/Export
  async importKey(format: string, keyData: any, algorithm: any, extractable: boolean, keyUsages: string[]): Promise<CryptoKey> {
    return this.sendMessage('importKey', { format, keyData, algorithm, extractable, keyUsages });
  }

  async exportKey(format: string, key: CryptoKey): Promise<ArrayBuffer> {
    return this.sendMessage('exportKey', { format, key });
  }

  // Shared Secret Computation
  async computeSharedSecret(privateKey: CryptoKey, publicKey: CryptoKey, algorithm: string): Promise<ArrayBuffer> {
    return this.sendMessage('computeSharedSecret', { privateKey, publicKey, algorithm });
  }

  // PBKDF2
  async pbkdf2(password: string, salt: Uint8Array, iterations: number, keyLength: number, hash: string = 'SHA-512'): Promise<ArrayBuffer> {
    return this.sendMessage('pbkdf2', { password, salt, iterations, keyLength, hash });
  }

  // Scrypt
  async scrypt(password: string, salt: Uint8Array, n: number, r: number, p: number, keyLength: number): Promise<ArrayBuffer> {
    return this.sendMessage('scrypt', { password, salt, n, r, p, keyLength });
  }

  // Polynomial Operations
  async polynomialOperation(operation: string, polynomials: any[], modulus: number): Promise<any> {
    return this.sendMessage('polynomialOperation', { operation, polynomials, modulus });
  }

  // Quantum Resistant Hashing
  async quantumResistantHash(algorithm: string, data: ArrayBuffer): Promise<ArrayBuffer> {
    return this.sendMessage('quantumResistantHash', { algorithm, data });
  }

  // Lattice Operations
  async latticeOperation(operation: string, data: any, parameters: any): Promise<any> {
    return this.sendMessage('latticeOperation', { operation, data, parameters });
  }

  // Cleanup
  destroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingOperations.clear();
  }
}

// Export singleton instance
export const cryptoWorkerManager = new CryptoWorkerManager();
