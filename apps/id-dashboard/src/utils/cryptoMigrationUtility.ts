// Crypto Migration Utility
// Provi helper functions to migrate existing crypto operations to use the crypto worker manager


import { cryptoWorkerManager } from './cryptoWorkerManager';

export class CryptoMigrationUtility {
  /**
   * Migrate Ed25519 key generation to worker
   */
  static async migrateEd25519KeyGeneration(): Promise<CryptoKeyPair> {
    try {
      return await cryptoWorkerManager.generateEd25519KeyPair();
    } catch (error) {
      // Console statement removed for production
      throw error;
    }
  }

  /**
   * Migrate ECDSA key generation to worker
   */
  static async migrateECDSAKeyGeneration(): Promise<CryptoKeyPair> {
    try {
      return await cryptoWorkerManager.generateECDSAKeyPair();
    } catch (error) {
      // Console statement removed for production
      throw error;
    }
  }

  /**
   * Migrate ECDH key generation to worker
   */
  static async migrateECDHKeyGeneration(): Promise<CryptoKeyPair> {
    try {
      return await cryptoWorkerManager.generateECDHKeyPair();
    } catch (error) {
      // Console statement removed for production
      throw error;
    }
  }

  /**
   * Migrate  key generation to worker
   */
  static async migrateAES256GCMKeyGeneration(): Promise<CryptoKey> {
    try {
      return await cryptoWorkerManager.generateAES256GCMKey();
    } catch (error) {
      // Console statement removed for production
      throw error;
    }
  }

  /**
   * Migrate  encryption to worker
   */
  static async migrateAES256GCMEncryption(key: CryptoKey, data: ArrayBuffer): Promise<{ encrypted: ArrayBuffer; iv: Uint8Array }> {
    try {
      return await cryptoWorkerManager.encryptAES256GCM(key, data);
    } catch (error) {
      // Console statement removed for production
      throw error;
    }
  }

  /**
   * Migrate  decryption to worker
   */
  static async migrateAES256GCMDecryption(key: CryptoKey, encryptedData: { encrypted: ArrayBuffer; iv: Uint8Array }): Promise<ArrayBuffer> {
    try {
      return await cryptoWorkerManager.decryptAES256GCM(key, encryptedData);
    } catch (error) {
      // Console statement removed for production
      throw error;
    }
  }

  /**
   * Migrate Ed25519 signing to worker
   */
  static async migrateEd25519Signing(key: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
    try {
      return await cryptoWorkerManager.signEd25519(key, data);
    } catch (error) {
      // Console statement removed for production
      throw error;
    }
  }

  /**
   * Migrate Ed25519 verification to worker
   */
  static async migrateEd25519Verification(key: CryptoKey, signature: ArrayBuffer, data: ArrayBuffer): Promise<boolean> {
    try {
      return await cryptoWorkerManager.verifyEd25519(key, signature, data);
    } catch (error) {
      // Console statement removed for production
      throw error;
    }
  }

  /**
   * Migrate SHA-512 hashing to worker
   */
  static async migrateSHA512Hashing(data: ArrayBuffer): Promise<ArrayBuffer> {
    try {
      return await cryptoWorkerManager.sha512(data);
    } catch (error) {
      // Console statement removed for production
      throw error;
    }
  }

  /**
   * Migrate secure random generation to worker
   */
  static async migrateSecureRandomGeneration(length: number, type: 'bytes' | 'string' | 'number'): Promise<any> {
    try {
      return await cryptoWorkerManager.generateRandom(length, type);
    } catch (error) {
      // Console statement removed for production
      throw error;
    }
  }

  /**
   * Migrate PBKDF2 key derivation to worker
   */
  static async migratePBKDF2Derivation(password: ArrayBuffer, salt: ArrayBuffer, iterations: number, keyLength: number, hash: string): Promise<ArrayBuffer> {
    try {
      return await cryptoWorkerManager.pbkdf2(password, salt, iterations, keyLength, hash);
    } catch (error) {
      // Console statement removed for production
      throw error;
    }
  }

  /**
   * Migrate scrypt key derivation to worker
   */
  static async migrateScryptDerivation(password: ArrayBuffer, salt: ArrayBuffer, n: number, r: number, p: number, keyLength: number): Promise<ArrayBuffer> {
    try {
      return await cryptoWorkerManager.scrypt(password, salt, n, r, p, keyLength);
    } catch (error) {
      // Console statement removed for production
      throw error;
    }
  }

  /**
   * Migrate polynomial operations to worker
   */
  static async migratePolynomialOperation(operation: string, polynomials: number[][], modulus: number): Promise<number[]> {
    try {
      return await cryptoWorkerManager.polynomialOperation(operation, polynomials, modulus);
    } catch (error) {
      // Console statement removed for production
      throw error;
    }
  }

  /**
   * Migrate quantum-resistant hashing to worker
   */
  static async migrateQuantumResistantHashing(algorithm: string, data: ArrayBuffer): Promise<ArrayBuffer> {
    try {
      return await cryptoWorkerManager.quantumResistantHash(algorithm, data);
    } catch (error) {
      // Console statement removed for production
      throw error;
    }
  }

  /**
   * Migrate lattice operations to worker
   */
  static async migrateLatticeOperation(operation: string, data: any, parameters: any): Promise<any> {
    try {
      return await cryptoWorkerManager.latticeOperation(operation, data, parameters);
    } catch (error) {
      // Console statement removed for production
      throw error;
    }
  }

  /**
   * Batch migrate multiple crypto operations
   */
  static async batchMigrate(operations: Array<{ type: string; data: any }>): Promise<any[]> {
    const results = [];
    
    for (const operation of operations) {
      try {
        let result;
        
        switch (operation.type) {
          case 'generateEd25519KeyPair':
            result = await this.migrateEd25519KeyGeneration();
            break;
          case 'generateECDSAKeyPair':
            result = await this.migrateECDSAKeyGeneration();
            break;
          case 'generateECDHKeyPair':
            result = await this.migrateECDHKeyGeneration();
            break;
          case 'generateAES256GCMKey':
            result = await this.migrateAES256GCMKeyGeneration();
            break;
          case 'encryptAES256GCM':
            result = await this.migrateAES256GCMEncryption(operation.data.key, operation.data.data);
            break;
          case 'decryptAES256GCM':
            result = await this.migrateAES256GCMDecryption(operation.data.key, operation.data.encryptedData);
            break;
          case 'signEd25519':
            result = await this.migrateEd25519Signing(operation.data.key, operation.data.data);
            break;
          case 'verifyEd25519':
            result = await this.migrateEd25519Verification(operation.data.key, operation.data.signature, operation.data.data);
            break;
          case 'sha512':
            result = await this.migrateSHA512Hashing(operation.data.data);
            break;
          case 'generateRandom':
            result = await this.migrateSecureRandomGeneration(operation.data.length, operation.data.type);
            break;
          case 'pbkdf2':
            result = await this.migratePBKDF2Derivation(
              operation.data.password,
              operation.data.salt,
              operation.data.iterations,
              operation.data.keyLength,
              operation.data.hash
            );
            break;
          case 'scrypt':
            result = await this.migrateScryptDerivation(
              operation.data.password,
              operation.data.salt,
              operation.data.n,
              operation.data.r,
              operation.data.p,
              operation.data.keyLength
            );
            break;
          case 'polynomialOperation':
            result = await this.migratePolynomialOperation(
              operation.data.operation,
              operation.data.polynomials,
              operation.data.modulus
            );
            break;
          case 'quantumResistantHash':
            result = await this.migrateQuantumResistantHashing(
              operation.data.algorithm,
              operation.data.data
            );
            break;
          case 'latticeOperation':
            result = await this.migrateLatticeOperation(
              operation.data.operation,
              operation.data.data,
              operation.data.parameters
            );
            break;
          default:
            throw new Error(`Unknown operation type: ${operation.type}`);
        }
        
        results.push({ success: true, type: operation.type, result });
      } catch (error) {
        results.push({ success: false, type: operation.type, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }
    
    return results;
  }

  /**
   * Check if crypto worker is healthy
   */
  static isWorkerHealthy(): boolean {
    return cryptoWorkerManager.checkHealth();
  }

  /**
   * Get crypto worker performance metrics
   */
  static getWorkerPerformanceMetrics() {
    return cryptoWorkerManager.getPerformanceMetrics();
  }

  /**
   * Reset crypto worker performance metrics
   */
  static resetWorkerPerformanceMetrics() {
    cryptoWorkerManager.resetPerformanceMetrics();
  }

  /**
   * Cleanup crypto worker
   */
  static cleanup() {
    cryptoWorkerManager.troy();
  }
}

// Export convenience functions
export const migrateEd25519KeyGeneration = CryptoMigrationUtility.migrateEd25519KeyGeneration.bind(CryptoMigrationUtility);
export const migrateECDSAKeyGeneration = CryptoMigrationUtility.migrateECDSAKeyGeneration.bind(CryptoMigrationUtility);
export const migrateECDHKeyGeneration = CryptoMigrationUtility.migrateECDHKeyGeneration.bind(CryptoMigrationUtility);
export const migrateAES256GCMKeyGeneration = CryptoMigrationUtility.migrateAES256GCMKeyGeneration.bind(CryptoMigrationUtility);
export const migrateAES256GCMEncryption = CryptoMigrationUtility.migrateAES256GCMEncryption.bind(CryptoMigrationUtility);
export const migrateAES256GCMDecryption = CryptoMigrationUtility.migrateAES256GCMDecryption.bind(CryptoMigrationUtility);
export const migrateEd25519Signing = CryptoMigrationUtility.migrateEd25519Signing.bind(CryptoMigrationUtility);
export const migrateEd25519Verification = CryptoMigrationUtility.migrateEd25519Verification.bind(CryptoMigrationUtility);
export const migrateSHA512Hashing = CryptoMigrationUtility.migrateSHA512Hashing.bind(CryptoMigrationUtility);
export const migrateSecureRandomGeneration = CryptoMigrationUtility.migrateSecureRandomGeneration.bind(CryptoMigrationUtility);
export const migratePBKDF2Derivation = CryptoMigrationUtility.migratePBKDF2Derivation.bind(CryptoMigrationUtility);
export const migrateScryptDerivation = CryptoMigrationUtility.migrateScryptDerivation.bind(CryptoMigrationUtility);
export const migratePolynomialOperation = CryptoMigrationUtility.migratePolynomialOperation.bind(CryptoMigrationUtility);
export const migrateQuantumResistantHashing = CryptoMigrationUtility.migrateQuantumResistantHashing.bind(CryptoMigrationUtility);
export const migrateLatticeOperation = CryptoMigrationUtility.migrateLatticeOperation.bind(CryptoMigrationUtility);
export const batchMigrate = CryptoMigrationUtility.batchMigrate.bind(CryptoMigrationUtility);
export const isWorkerHealthy = CryptoMigrationUtility.isWorkerHealthy.bind(CryptoMigrationUtility);
export const getWorkerPerformanceMetrics = CryptoMigrationUtility.getWorkerPerformanceMetrics.bind(CryptoMigrationUtility);
export const resetWorkerPerformanceMetrics = CryptoMigrationUtility.resetWorkerPerformanceMetrics.bind(CryptoMigrationUtility);
export const cleanupCryptoWorker = CryptoMigrationUtility.cleanup.bind(CryptoMigrationUtility);
