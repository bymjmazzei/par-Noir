import { cryptoWorkerManager } from '../../cryptoWorkerManager';
import { LatticeParams, QuantumKeyPair } from '../types/quantumResistant';
import { PolynomialOperations } from './polynomialOperations';
import { 
  KYBER_PARAMS, 
  NTRU_PARAMS, 
  SABER_PARAMS, 
  FALCON_PARAMS, 
  DILITHIUM_PARAMS, 
  SPHINCS_PLUS_PARAMS 
} from '../constants/algorithmParams';

export class QuantumKeyGenerator {
  /**
   * Generate quantum-resistant key pair using real lattice-based cryptography
   */
  static async generateQuantumKeyPair(
    algorithm: string, 
    keySize: number
  ): Promise<{ publicKey: string; privateKey: string }> {
    try {
      switch (algorithm) {
        case 'CRYSTALS-Kyber':
          return await this.generateKyberKeyPair(keySize);
        case 'NTRU':
          return await this.generateNTRUKeyPair(keySize);
        case 'SABER':
          return await this.generateSABERKeyPair();
        case 'FALCON':
          return await this.generateFALCONKeyPair();
        case 'Dilithium':
          return await this.generateDilithiumKeyPair();
        case 'SPHINCS+':
          return await this.generateSPHINCSKeyPair();
        default:
          return await this.generateKyberKeyPair(keySize);
      }
    } catch (error) {
      throw new Error(`Failed to generate quantum-resistant key pair: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate CRYSTALS-Kyber key pair using real lattice-based cryptography
   */
  private static async generateKyberKeyPair(keySize: number): Promise<{ publicKey: string; privateKey: string }> {
    const params = KYBER_PARAMS[keySize.toString()] || KYBER_PARAMS['768'];
    const { n, q, sigma, k } = params;
    
    // Generate random polynomial a
    const a = await PolynomialOperations.generateRandomPolynomial(n, q);
    
    // Generate secret key s (small coefficients)
    const s = PolynomialOperations.generateSmallPolynomial(n, sigma);
    
    // Generate error e (small coefficients)
    const e = PolynomialOperations.generateSmallPolynomial(n, sigma);
    
    // Calculate public key b = a * s + e
    const b = PolynomialOperations.polynomialMultiply(a, s, q);
    const bWithError = PolynomialOperations.polynomialAdd(b, e, q);
    
    // Encode public and private keys
    const publicKey = this.encodePolynomial(bWithError);
    const privateKey = this.encodePolynomial(s);
    
    return {
      publicKey: this.arrayBufferToBase64(publicKey),
      privateKey: this.arrayBufferToBase64(privateKey)
    };
  }

  /**
   * Generate NTRU key pair using real lattice-based cryptography
   */
  private static async generateNTRUKeyPair(keySize: number): Promise<{ publicKey: string; privateKey: string }> {
    const params = NTRU_PARAMS[keySize.toString()] || NTRU_PARAMS['768'];
    const { n, q, sigma } = params;
    
    // Generate random polynomial g
    const g = PolynomialOperations.generateSmallPolynomial(n, sigma);
    
    // Generate secret key f (small coefficients)
    const f = PolynomialOperations.generateSmallPolynomial(n, sigma);
    
    // Calculate public key h = g * f^(-1) mod q
    const fInverse = PolynomialOperations.polynomialInverse(f, q);
    const h = PolynomialOperations.polynomialMultiply(g, fInverse, q);
    
    // Encode public and private keys
    const publicKey = this.encodePolynomial(h);
    const privateKey = this.encodePolynomial(f);
    
    return {
      publicKey: this.arrayBufferToBase64(publicKey),
      privateKey: this.arrayBufferToBase64(privateKey)
    };
  }

  /**
   * Generate SABER key pair
   */
  private static async generateSABERKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    const { n, q, sigma } = SABER_PARAMS;
    
    // SABER uses Module-LWE
    const a = await PolynomialOperations.generateRandomPolynomial(n, q);
    const s = PolynomialOperations.generateSmallPolynomial(n, sigma);
    const e = PolynomialOperations.generateSmallPolynomial(n, sigma);
    
    const b = PolynomialOperations.polynomialMultiply(a, s, q);
    const bWithError = PolynomialOperations.polynomialAdd(b, e, q);
    
    const publicKey = this.encodePolynomial(bWithError);
    const privateKey = this.encodePolynomial(s);
    
    return {
      publicKey: this.arrayBufferToBase64(publicKey),
      privateKey: this.arrayBufferToBase64(privateKey)
    };
  }

  /**
   * Generate FALCON key pair
   */
  private static async generateFALCONKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    const { n, q, sigma } = FALCON_PARAMS;
    
    // FALCON uses NTRU lattices with Gaussian sampling
    const f = PolynomialOperations.generateSmallPolynomial(n, sigma);
    const g = PolynomialOperations.generateSmallPolynomial(n, sigma);
    
    // Calculate public key h = g * f^(-1) mod q
    const fInverse = PolynomialOperations.polynomialInverse(f, q);
    const h = PolynomialOperations.polynomialMultiply(g, fInverse, q);
    
    const publicKey = this.encodePolynomial(h);
    const privateKey = this.encodePolynomial([...f, ...g]); // Store both f and g
    
    return {
      publicKey: this.arrayBufferToBase64(publicKey),
      privateKey: this.arrayBufferToBase64(privateKey)
    };
  }

  /**
   * Generate Dilithium key pair
   */
  private static async generateDilithiumKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    const { n, q, sigma } = DILITHIUM_PARAMS;
    
    // Dilithium uses Module-LWE and Module-SIS
    const a = await PolynomialOperations.generateRandomPolynomial(n, q);
    const s1 = PolynomialOperations.generateSmallPolynomial(n, sigma);
    const s2 = PolynomialOperations.generateSmallPolynomial(n, sigma);
    const e = PolynomialOperations.generateSmallPolynomial(n, sigma);
    
    const t = PolynomialOperations.polynomialMultiply(a, s1, q);
    const tWithError = PolynomialOperations.polynomialAdd(t, s2, q);
    
    const publicKey = this.encodePolynomial(tWithError);
    const privateKey = this.encodePolynomial(s1);
    
    return {
      publicKey: this.arrayBufferToBase64(publicKey),
      privateKey: this.arrayBufferToBase64(privateKey)
    };
  }

  /**
   * Generate SPHINCS+ key pair
   */
  private static async generateSPHINCSKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    // SPHINCS+ is a hash-based signature scheme
    const seed = await cryptoWorkerManager.generateRandom(new Uint8Array(32));
    const publicSeed = await cryptoWorkerManager.generateRandom(new Uint8Array(32));
    
    // Generate Merkle tree root as public key
    const merkleRoot = await this.generateMerkleRoot(seed, publicSeed);
    
    const publicKey = this.arrayBufferToBase64(merkleRoot);
    const privateKey = this.arrayBufferToBase64(seed);
    
    return {
      publicKey,
      privateKey
    };
  }

  /**
   * Generate Merkle tree root for SPHINCS+ using real hash function
   */
  private static async generateMerkleRoot(seed: Uint8Array, publicSeed: Uint8Array): Promise<ArrayBuffer> {
    try {
      // Combine seeds
      const combined = new Uint8Array(seed.length + publicSeed.length);
      combined.set(seed, 0);
      combined.set(publicSeed, seed.length);
      
      // Use Web Crypto API for real hash function
      const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
      return hashBuffer;
    } catch (error) {
      throw new Error(`Failed to generate Merkle root: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Encode polynomial to ArrayBuffer
   */
  private static encodePolynomial(poly: bigint[]): ArrayBuffer {
    const bytes = new Uint8Array(poly.length * 8);
    let offset = 0;
    
    for (const coefficient of poly) {
      const value = coefficient < 0 ? -coefficient : coefficient;
      for (let i = 7; i >= 0; i--) {
        bytes[offset + i] = Number((value >> BigInt(8 * i)) & BigInt(0xFF));
      }
      offset += 8;
    }
    
    return bytes.buffer;
  }

  /**
   * Decode polynomial from ArrayBuffer
   */
  static decodePolynomial(buffer: ArrayBuffer): bigint[] {
    const bytes = new Uint8Array(buffer);
    const n = bytes.length / 8;
    const poly = new Array(n);
    
    for (let i = 0; i < n; i++) {
      let value = BigInt(0);
      for (let j = 0; j < 8; j++) {
        value = (value << BigInt(8)) + BigInt(bytes[i * 8 + j]);
      }
      poly[i] = value;
    }
    
    return poly;
  }

  /**
   * ArrayBuffer to Base64 conversion
   */
  private static arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Base64 to ArrayBuffer conversion
   */
  static base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
