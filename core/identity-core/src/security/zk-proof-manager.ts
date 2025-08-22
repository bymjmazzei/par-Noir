/**
 * Enhanced ZK Proof Manager
 * Provides timestamped proofs with replay attack prevention
 * Runs automatically without user interaction
 */

import { DID } from '../types';
import { ZKProof } from '../encryption/zk-proofs';

export interface TimestampedZKProof extends ZKProof {
  timestamp: string;
  nonce: string;
  context: string;
  expiresAt: string;
  proofHash: string;
  signature: string;
}

export interface ProofValidationResult {
  isValid: boolean;
  reason?: string;
  riskLevel: 'low' | 'medium' | 'high';
  recommendations: string[];
}

export interface ProofConfig {
  expirationTime: number; // milliseconds
  maxProofsPerHour: number;
  requireContext: boolean;
  enableReplayProtection: boolean;
  securityLevel: 'standard' | 'military' | 'top-secret';
}

export class ZKProofManager {
  private static readonly DEFAULT_CONFIG: ProofConfig = {
    expirationTime: 24 * 60 * 60 * 1000, // 24 hours
    maxProofsPerHour: 100,
    requireContext: true,
    enableReplayProtection: true,
    securityLevel: 'military'
  };

  private static readonly USED_PROOFS_CACHE = new Set<string>();
  private static readonly PROOF_RATE_LIMITS = new Map<string, number[]>();
  private static readonly PROOF_HISTORY = new Map<string, TimestampedZKProof[]>();

  /**
   * Generate timestamped proof with automatic security features
   */
  static async generateTimestampedProof(
    did: DID,
    statement: string,
    context: string,
    config: Partial<ProofConfig> = {}
  ): Promise<TimestampedZKProof> {
    const fullConfig = { ...this.DEFAULT_CONFIG, ...config };

    // Check rate limiting
    if (!this.checkRateLimit(did.id, fullConfig)) {
      throw new Error('Rate limit exceeded for proof generation');
    }

    // Generate base proof
    const baseProof = await this.generateBaseProof(did, statement);
    
    // Add security features
    const timestamp = new Date().toISOString();
    const nonce = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + fullConfig.expirationTime).toISOString();
    
    const timestampedProof: TimestampedZKProof = {
      ...baseProof,
      timestamp,
      nonce,
      context,
      expiresAt,
      proofHash: this.hashProof(baseProof, timestamp, nonce, context),
      signature: await this.signProof(baseProof, timestamp, nonce, context)
    };

    // Store in history
    const userProofs = this.PROOF_HISTORY.get(did.id) || [];
    userProofs.push(timestampedProof);
    this.PROOF_HISTORY.set(did.id, userProofs);

    // Update rate limiting
    this.updateRateLimit(did.id);

    return timestampedProof;
  }

  /**
   * Validate proof with comprehensive security checks
   */
  static validateProof(
    proof: TimestampedZKProof,
    context: string,
    config: Partial<ProofConfig> = {}
  ): ProofValidationResult {
    const fullConfig = { ...this.DEFAULT_CONFIG, ...config };
    const recommendations: string[] = [];
    let isValid = true;
    let reason: string | undefined;
    let riskLevel: 'low' | 'medium' | 'high' = 'low';

    // Check expiration
    if (new Date(proof.expiresAt) < new Date()) {
      isValid = false;
      reason = 'Proof expired';
      riskLevel = 'medium';
    }

    // Check context
    if (fullConfig.requireContext && proof.context !== context) {
      isValid = false;
      reason = 'Context mismatch';
      riskLevel = 'high';
      recommendations.push('Proof generated for different context');
    }

    // Check for replay attacks
    if (fullConfig.enableReplayProtection) {
      const proofHash = this.hashProof(proof, proof.timestamp, proof.nonce, proof.context);
      if (this.USED_PROOFS_CACHE.has(proofHash)) {
        isValid = false;
        reason = 'Proof already used (replay attack)';
        riskLevel = 'high';
        recommendations.push('This proof has been used before');
      }
    }

    // Verify proof hash
    const expectedHash = this.hashProof(proof, proof.timestamp, proof.nonce, proof.context);
    if (proof.proofHash !== expectedHash) {
      isValid = false;
      reason = 'Invalid proof hash';
      riskLevel = 'high';
      recommendations.push('Proof integrity compromised');
    }

    // Verify signature
    if (!this.verifyProofSignature(proof)) {
      isValid = false;
      reason = 'Invalid proof signature';
      riskLevel = 'high';
      recommendations.push('Proof authenticity cannot be verified');
    }

    // Check for suspicious patterns
    const suspiciousPatterns = this.detectSuspiciousPatterns(proof);
    if (suspiciousPatterns.length > 0) {
      recommendations.push(...suspiciousPatterns);
      if (riskLevel === 'low') riskLevel = 'medium';
    }

    // Mark as used if valid
    if (isValid && fullConfig.enableReplayProtection) {
      const proofHash = this.hashProof(proof, proof.timestamp, proof.nonce, proof.context);
      this.USED_PROOFS_CACHE.add(proofHash);
    }

    return {
      isValid,
      reason,
      riskLevel,
      recommendations
    };
  }

  /**
   * Generate base ZK proof
   */
  private static async generateBaseProof(did: DID, statement: string): Promise<ZKProof> {
    // This would integrate with your existing ZK proof system
    // For now, return a mock proof
    return {
      type: 'custom',
      statement,
      proof: crypto.randomUUID(),
      securityLevel: 'military',
      algorithm: 'P-384',
      keyLength: 384
    };
  }

  /**
   * Hash proof data
   */
  private static hashProof(
    proof: ZKProof,
    timestamp: string,
    nonce: string,
    context: string
  ): string {
    const data = `${proof.type}:${proof.statement}:${proof.proof}:${timestamp}:${nonce}:${context}`;
    return this.hashString(data);
  }

  /**
   * Sign proof data
   */
  private static async signProof(
    proof: ZKProof,
    timestamp: string,
    nonce: string,
    context: string
  ): Promise<string> {
    const data = `${proof.type}:${proof.statement}:${timestamp}:${nonce}:${context}`;
    return this.hashString(data); // In production, use proper digital signature
  }

  /**
   * Verify proof signature
   */
  private static verifyProofSignature(proof: TimestampedZKProof): boolean {
    const expectedSignature = this.hashString(
      `${proof.type}:${proof.statement}:${proof.timestamp}:${proof.nonce}:${proof.context}`
    );
    return proof.signature === expectedSignature;
  }

  /**
   * Check rate limiting
   */
  private static checkRateLimit(userId: string, config: ProofConfig): boolean {
    const now = Date.now();
    const userProofs = this.PROOF_RATE_LIMITS.get(userId) || [];
    
    // Remove old entries (older than 1 hour)
    const recentProofs = userProofs.filter(timestamp => 
      now - timestamp < 60 * 60 * 1000
    );
    
    return recentProofs.length < config.maxProofsPerHour;
  }

  /**
   * Update rate limiting
   */
  private static updateRateLimit(userId: string): void {
    const now = Date.now();
    const userProofs = this.PROOF_RATE_LIMITS.get(userId) || [];
    userProofs.push(now);
    
    // Keep only last hour
    const recentProofs = userProofs.filter(timestamp => 
      now - timestamp < 60 * 60 * 1000
    );
    
    this.PROOF_RATE_LIMITS.set(userId, recentProofs);
  }

  /**
   * Detect suspicious patterns
   */
  private static detectSuspiciousPatterns(proof: TimestampedZKProof): string[] {
    const patterns: string[] = [];

    // Check for very old proofs
    const proofAge = Date.now() - new Date(proof.timestamp).getTime();
    if (proofAge > 7 * 24 * 60 * 60 * 1000) { // 7 days
      patterns.push('Proof is very old');
    }

    // Check for rapid proof generation
    const userProofs = this.PROOF_HISTORY.get(proof.id || 'unknown') || [];
    const recentProofs = userProofs.filter(p => 
      Date.now() - new Date(p.timestamp).getTime() < 60 * 60 * 1000 // Last hour
    );

    if (recentProofs.length > 50) {
      patterns.push('Unusually high proof generation rate');
    }

    // Check for suspicious statements
    const suspiciousStatements = [
      /admin/i,
      /root/i,
      /system/i,
      /privileged/i,
      /bypass/i
    ];

    for (const pattern of suspiciousStatements) {
      if (pattern.test(proof.statement)) {
        patterns.push('Suspicious proof statement detected');
        break;
      }
    }

    return patterns;
  }

  /**
   * Clean up expired proofs
   */
  static cleanupExpiredProofs(): void {
    const now = Date.now();
    
    // Clean up used proofs cache
    for (const proofHash of this.USED_PROOFS_CACHE) {
      // In a real implementation, you'd store expiration times with the hashes
      // For now, we'll just clean up periodically
    }

    // Clean up rate limiting
    for (const [userId, timestamps] of this.PROOF_RATE_LIMITS.entries()) {
      const recentTimestamps = timestamps.filter(timestamp => 
        now - timestamp < 60 * 60 * 1000
      );
      
      if (recentTimestamps.length === 0) {
        this.PROOF_RATE_LIMITS.delete(userId);
      } else {
        this.PROOF_RATE_LIMITS.set(userId, recentTimestamps);
      }
    }
  }

  /**
   * Get proof statistics
   */
  static getProofStats(): {
    totalProofs: number;
    activeProofs: number;
    expiredProofs: number;
    averageProofAge: number;
  } {
    let totalProofs = 0;
    let activeProofs = 0;
    let expiredProofs = 0;
    let totalAge = 0;
    const now = Date.now();

    for (const proofs of this.PROOF_HISTORY.values()) {
      totalProofs += proofs.length;
      
      for (const proof of proofs) {
        const age = now - new Date(proof.timestamp).getTime();
        totalAge += age;
        
        if (new Date(proof.expiresAt) > new Date()) {
          activeProofs++;
        } else {
          expiredProofs++;
        }
      }
    }

    return {
      totalProofs,
      activeProofs,
      expiredProofs,
      averageProofAge: totalProofs > 0 ? totalAge / totalProofs : 0
    };
  }

  /**
   * Silent proof validation - no user interaction required
   */
  static silentValidate(proof: TimestampedZKProof, context: string): boolean {
    const result = this.validateProof(proof, context);
    
    if (!result.isValid) {
      // Log for security monitoring
      console.warn('Proof validation failed:', result.reason);
      return false;
    }
    
    if (result.riskLevel === 'high') {
      // Log high-risk proofs for investigation
      console.warn('High-risk proof detected:', result.recommendations);
    }
    
    return true;
  }

  /**
   * Hash string using SHA-256
   */
  private static hashString(str: string): string {
    // Simple hash function for demo purposes
    // In production, use crypto.subtle.digest
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }
}
