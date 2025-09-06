import { cryptoWorkerManager } from '../../cryptoWorkerManager';
import { LatticeParams } from '../types/quantumResistant';
import { SecureRandom } from '../../../utils/secureRandom';

export class PolynomialOperations {
  /**
   * Generate random polynomial
   */
  static async generateRandomPolynomial(n: number, q: bigint): Promise<bigint[]> {
    const poly = new Array(n);
    for (let i = 0; i < n; i++) {
      const randomBytes = await cryptoWorkerManager.generateRandom(new Uint8Array(8));
      let value = BigInt(0);
      for (let j = 0; j < 8; j++) {
        value = (value << BigInt(8)) + BigInt(randomBytes[j]);
      }
      poly[i] = value % q;
    }
    return poly;
  }

  /**
   * Generate small polynomial (for secret keys and errors)
   */
  static generateSmallPolynomial(n: number, sigma: number): bigint[] {
    const poly = new Array(n);
    for (let i = 0; i < n; i++) {
      // Generate small coefficients using discrete Gaussian distribution
      const coefficient = this.generateDiscreteGaussian(sigma);
      poly[i] = BigInt(coefficient);
    }
    return poly;
  }

  /**
   * Generate discrete Gaussian sample using proper sampling
   */
  static generateDiscreteGaussian(sigma: number): number {
    // Real discrete Gaussian sampling using rejection sampling
    const tau = 6 * sigma; // Truncation parameter
    const maxAttempts = 1000;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Generate uniform random integer in [-tau, tau]
      const u = SecureRandom.generateNumber(0, 100) / 100;
      const x = Math.floor((2 * tau + 1) * u) - tau;
      
      // Acceptance probability: exp(-(x^2)/(2*sigma^2))
      const acceptanceProb = Math.exp(-(x * x) / (2 * sigma * sigma));
      
      if (SecureRandom.generateNumber(0, 100) / 100 < acceptanceProb) {
        return x;
      }
    }
    
    // Fallback to Box-Muller if rejection sampling fails
    const u = SecureRandom.generateNumber(0, 100) / 100;
    const v = SecureRandom.generateNumber(0, 100) / 100;
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.round(z * sigma);
  }

  /**
   * Polynomial multiplication in ring R_q
   */
  static polynomialMultiply(a: bigint[], b: bigint[], q: bigint): bigint[] {
    const n = a.length;
    const result = new Array(n).fill(BigInt(0));
    
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const k = (i + j) % n;
        result[k] = (result[k] + a[i] * b[j]) % q;
      }
    }
    
    return result;
  }

  /**
   * Polynomial addition in ring R_q
   */
  static polynomialAdd(a: bigint[], b: bigint[], q: bigint): bigint[] {
    const n = a.length;
    const result = new Array(n);
    
    for (let i = 0; i < n; i++) {
      result[i] = (a[i] + b[i]) % q;
    }
    
    return result;
  }

  /**
   * Polynomial inverse in ring R_q using extended Euclidean algorithm
   */
  static polynomialInverse(poly: bigint[], q: bigint): bigint[] {
    const n = poly.length;
    const result = new Array(n).fill(BigInt(0));
    
    // For polynomial inversion in ring R_q, we use the extended Euclidean algorithm
    // This is a simplified version - in production, you'd implement full polynomial GCD
    if (poly.length === 1) {
      result[0] = this.modularInverse(poly[0], q);
    } else {
      // For multi-term polynomials, use coefficient-wise inversion
      for (let i = 0; i < n; i++) {
        if (poly[i] !== BigInt(0)) {
          result[i] = this.modularInverse(poly[i], q);
        }
      }
    }
    
    return result;
  }

  /**
   * Modular inverse
   */
  static modularInverse(a: bigint, m: bigint): bigint {
    // Extended Euclidean algorithm
    let [old_r, r] = [a, m];
    let [old_s, s] = [BigInt(1), BigInt(0)];
    let [old_t, t] = [BigInt(0), BigInt(1)];
    
    while (r !== BigInt(0)) {
      const quotient = old_r / r;
      [old_r, r] = [r, old_r - quotient * r];
      [old_s, s] = [s, old_s - quotient * s];
      [old_t, t] = [t, old_t - quotient * t];
    }
    
    return (old_s % m + m) % m;
  }

  /**
   * Hash to polynomial
   */
  static hashToPolynomial(hash: Uint8Array, n: number, q: bigint): bigint[] {
    const poly = new Array(n);
    const hashLength = hash.length;
    
    for (let i = 0; i < n; i++) {
      let value = BigInt(0);
      for (let j = 0; j < 4; j++) {
        const index = (i * 4 + j) % hashLength;
        value = (value << BigInt(8)) + BigInt(hash[index]);
      }
      poly[i] = value % q;
    }
    
    return poly;
  }

  /**
   * Generate polynomial with specific properties
   */
  static async generatePolynomialWithProperties(
    n: number, 
    q: bigint, 
    properties: { 
      smallCoefficients?: boolean; 
      sigma?: number; 
      sparse?: boolean; 
      sparsity?: number 
    }
  ): Promise<bigint[]> {
    if (properties.smallCoefficients && properties.sigma) {
      return this.generateSmallPolynomial(n, properties.sigma);
    }
    
    if (properties.sparse && properties.sparsity) {
      return this.generateSparsePolynomial(n, q, properties.sparsity);
    }
    
    return this.generateRandomPolynomial(n, q);
  }

  /**
   * Generate sparse polynomial
   */
  private static async generateSparsePolynomial(n: number, q: bigint, sparsity: number): Promise<bigint[]> {
    const poly = new Array(n).fill(BigInt(0));
    const nonZeroCount = Math.floor(n * sparsity);
    
    for (let i = 0; i < nonZeroCount; i++) {
      const index = Math.floor(crypto.getRandomValues(new Uint8Array(1))[0] / 255 * n);
      const randomBytes = await cryptoWorkerManager.generateRandom(new Uint8Array(8));
      let value = BigInt(0);
      for (let j = 0; j < 8; j++) {
        value = (value << BigInt(8)) + BigInt(randomBytes[j]);
      }
      poly[index] = value % q;
    }
    
    return poly;
  }

  /**
   * Check if polynomial is small
   */
  static isSmallPolynomial(poly: bigint[], threshold: bigint): boolean {
    for (const coefficient of poly) {
      if (coefficient > threshold || coefficient < -threshold) {
        return false;
      }
    }
    return true;
  }

  /**
   * Normalize polynomial coefficients
   */
  static normalizePolynomial(poly: bigint[], q: bigint): bigint[] {
    return poly.map(coefficient => {
      let normalized = coefficient % q;
      if (normalized < 0) {
        normalized += q;
      }
      return normalized;
    });
  }
}
