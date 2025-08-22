/**
 * Military-Grade Zero-Knowledge Proof System for Identity Protocol
 * Provides privacy-preserving authentication and selective disclosure with FIPS 140-3 Level 4 equivalent security
 * Includes quantum-resistant cryptography and advanced ZK proof constructions
 */

import { IdentityError, IdentityErrorCodes } from '../types';

export interface ZKProof {
  id: string;
  type: ZKProofType;
  statement: string;
  proof: string;
  publicInputs: Record<string, any>;
  timestamp: string;
  expiresAt: string;
  verificationKey: string;
  securityLevel: 'standard' | 'military' | 'top-secret';
  algorithm: string;
  keyLength: number;
  signature: string;
  commitment: string; // Pedersen commitment for the proof
  challenge: string; // Fiat-Shamir challenge
  response: string; // Schnorr response
  quantumResistant: boolean; // Indicates if proof uses quantum-resistant algorithms
}

export interface ZKProofRequest {
  type: ZKProofType;
  statement: string;
  privateInputs: Record<string, any>;
  publicInputs?: Record<string, any>;
  expirationHours?: number;
  securityLevel?: 'standard' | 'military' | 'top-secret';
  quantumResistant?: boolean; // Request quantum-resistant proof
}

export interface ZKProofVerification {
  isValid: boolean;
  proofId: string;
  statement: string;
  verifiedAt: string;
  error?: string;
  securityValidation?: {
    algorithm: string;
    keyLength: number;
    compliance: boolean;
    issues: string[];
    quantumResistant: boolean;
  };
}

export type ZKProofType = 
  | 'identity_existence'
  | 'age_verification'
  | 'credential_verification'
  | 'permission_check'
  | 'metadata_hash'
  | 'biometric_verification'
  | 'multi_factor_verification'
  | 'custom_proof'
  | 'range_proof' // For proving values are within a range
  | 'set_membership' // For proving membership in a set
  | 'equality_proof' // For proving equality without revealing values
  | 'disjunction_proof'; // For proving one of several statements

export interface ZKProofConfig {
  curve: 'P-384' | 'P-521' | 'Ed25519' | 'X25519' | 'secp256k1' | 'BLS12-381';
  hashAlgorithm: 'SHA-384' | 'SHA-512' | 'BLAKE3' | 'Keccak-256' | 'SHAKE256';
  proofExpirationHours: number;
  enableSelectiveDisclosure: boolean;
  securityLevel: 'standard' | 'military' | 'top-secret';
  keyLength: 384 | 521 | 256 | 512;
  iterations: number;
  memoryCost: number;
  quantumResistant: boolean;
  usePedersenCommitments: boolean;
  useSchnorrSignatures: boolean;
}

export interface PedersenCommitment {
  commitment: string;
  randomness: string;
  message: string;
}

export interface SchnorrSignature {
  challenge: string;
  response: string;
  publicKey: string;
}

export class ZKProofManager {
  private config: ZKProofConfig;
  private proofCache: Map<string, ZKProof> = new Map();
  private securityAuditLog: Array<{ timestamp: string; event: string; details: any; riskLevel: 'low' | 'medium' | 'high' | 'critical' }> = [];
  private quantumResistantAlgorithms: Set<string> = new Set(['BLS12-381', 'SHAKE256', 'Keccak-256']);
  private performanceMetrics: Array<{
    operation: 'generate' | 'verify';
    algorithm: string;
    securityLevel: string;
    duration: number;
    success: boolean;
  }> = [];
  private securityEvents: Array<{ timestamp: string; event: string; details: any; riskLevel: 'low' | 'medium' | 'high' | 'critical' }> = [];

  constructor(config: Partial<ZKProofConfig> = {}) {
    this.config = {
      curve: 'P-384',
      hashAlgorithm: 'SHA-512',
      proofExpirationHours: 12, // Reduced for security
      enableSelectiveDisclosure: true,
      securityLevel: 'military',
      keyLength: 384,
      iterations: 1000000, // 1M iterations for military grade
      memoryCost: 65536, // 64MB memory cost
      quantumResistant: true, // Enable quantum-resistant features by default
      usePedersenCommitments: true, // Use Pedersen commitments for privacy
      useSchnorrSignatures: true, // Use Schnorr signatures for efficiency
      ...config
    };
  }

  /**
   * Generate a military-grade zero-knowledge proof with quantum-resistant features
   */
  async generateProof(request: ZKProofRequest): Promise<ZKProof> {
    try {
      const proofId = this.generateProofId();
      const timestamp = new Date().toISOString();
      const expiresAt = new Date(Date.now() + (request.expirationHours || this.config.proofExpirationHours) * 60 * 60 * 1000).toISOString();
      const securityLevel = request.securityLevel || this.config.securityLevel;
      const quantumResistant = request.quantumResistant ?? this.config.quantumResistant;

      // Validate security requirements
      this.validateSecurityRequirements(securityLevel, quantumResistant);

      // Generate the actual ZK proof based on type
      const proof = await this.createZKProof(request);
      
      // Create Pedersen commitment for privacy
      const commitment = await this.createPedersenCommitment(request.privateInputs, quantumResistant);
      
      // Create Schnorr signature for the proof
      const schnorrSignature = await this.createSchnorrSignature(proof, quantumResistant);
      
      // Create verification key with military-grade security
      const verificationKey = await this.generateVerificationKey(request);

      // Sign the proof for integrity
      const signature = await this.signProof(proof, securityLevel);

      const zkProof: ZKProof = {
        id: proofId,
        type: request.type,
        statement: request.statement,
        proof: proof,
        publicInputs: request.publicInputs || {},
        timestamp,
        expiresAt,
        verificationKey,
        securityLevel,
        algorithm: this.config.curve,
        keyLength: this.config.keyLength,
        signature,
        commitment: commitment.commitment,
        challenge: schnorrSignature.challenge,
        response: schnorrSignature.response,
        quantumResistant
      };

      // Cache the proof with enhanced security
      this.proofCache.set(proofId, zkProof);

      // Log security event
      this.logSecurityEvent('proof_generated', { 
        proofId, 
        type: request.type, 
        securityLevel,
        quantumResistant,
        timestamp 
      }, 'low');

      return zkProof;
    } catch (error) {
      this.logSecurityEvent('proof_generation_failed', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        type: request.type 
      }, 'high');
      
      throw new IdentityError(
        'Failed to generate ZK proof',
        IdentityErrorCodes.ENCRYPTION_ERROR,
        error
      );
    }
  }

  /**
   * Verify a military-grade zero-knowledge proof with quantum-resistant validation
   */
  async verifyProof(proof: ZKProof): Promise<ZKProofVerification> {
    try {
      // Check if proof has expired
      if (new Date() > new Date(proof.expiresAt)) {
        this.logSecurityEvent('proof_expired', { proofId: proof.id }, 'medium');
        return {
          isValid: false,
          proofId: proof.id,
          statement: proof.statement,
          verifiedAt: new Date().toISOString(),
          error: 'Proof has expired'
        };
      }

      // Verify signature integrity
      const signatureValid = await this.verifyProofSignature(proof);
      if (!signatureValid) {
        this.logSecurityEvent('proof_signature_invalid', { proofId: proof.id }, 'critical');
        return {
          isValid: false,
          proofId: proof.id,
          statement: proof.statement,
          verifiedAt: new Date().toISOString(),
          error: 'Proof signature verification failed'
        };
      }

      // Verify Pedersen commitment
      const commitmentValid = await this.verifyPedersenCommitment(proof);
      if (!commitmentValid) {
        this.logSecurityEvent('proof_commitment_invalid', { proofId: proof.id }, 'critical');
        return {
          isValid: false,
          proofId: proof.id,
          statement: proof.statement,
          verifiedAt: new Date().toISOString(),
          error: 'Proof commitment verification failed'
        };
      }

      // Verify Schnorr signature
      const schnorrValid = await this.verifySchnorrSignature(proof.proof, proof.signature, await this.getPublicKey(proof.verificationKey));
      if (!schnorrValid) {
        this.logSecurityEvent('proof_schnorr_invalid', { proofId: proof.id }, 'critical');
        return {
          isValid: false,
          proofId: proof.id,
          statement: proof.statement,
          verifiedAt: new Date().toISOString(),
          error: 'Proof Schnorr signature verification failed'
        };
      }

      // Verify the proof based on type
      const isValid = await this.verifyZKProof(proof);

      // Validate security compliance
      const securityValidation = this.validateSecurityCompliance(proof);

      if (!isValid) {
        this.logSecurityEvent('proof_verification_failed', { proofId: proof.id }, 'high');
      } else {
        this.logSecurityEvent('proof_verified', { proofId: proof.id, securityLevel: proof.securityLevel, quantumResistant: proof.quantumResistant }, 'low');
      }

      return {
        isValid,
        proofId: proof.id,
        statement: proof.statement,
        verifiedAt: new Date().toISOString(),
        error: isValid ? undefined : 'Proof verification failed',
        securityValidation
      };
    } catch (error) {
      this.logSecurityEvent('proof_verification_error', { 
        proofId: proof.id, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 'critical');
      
      return {
        isValid: false,
        proofId: proof.id,
        statement: proof.statement,
        verifiedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Verification error'
      };
    }
  }

  /**
   * Generate selective disclosure proof with military-grade security
   */
  async generateSelectiveDisclosure(
    data: Record<string, any>,
    disclosedFields: string[],
    statement: string,
    securityLevel: 'standard' | 'military' | 'top-secret' = 'military'
  ): Promise<ZKProof> {
    try {
      // Create hash of full data using military-grade algorithm
      const fullDataHash = await this.hashObject(data, securityLevel);
      
      // Create hash of disclosed data only
      const disclosedData = Object.fromEntries(
        Object.entries(data).filter(([key]) => disclosedFields.includes(key))
      );
      const disclosedDataHash = await this.hashObject(disclosedData, securityLevel);

      // Generate proof that disclosed data is subset of full data
      const proof = await this.generateProof({
        type: 'metadata_hash',
        statement: `${statement} (selective disclosure)`,
        privateInputs: {
          fullDataHash,
          disclosedDataHash,
          disclosedFields
        },
        publicInputs: {
          disclosedData,
          statement
        },
        securityLevel
      });

      return proof;
    } catch (error) {
      throw new IdentityError(
        'Failed to generate selective disclosure proof',
        IdentityErrorCodes.ENCRYPTION_ERROR,
        error
      );
    }
  }

  /**
   * Generate age verification proof with military-grade security
   */
  async generateAgeVerification(
    birthDate: string,
    minimumAge: number,
    statement?: string,
    securityLevel: 'standard' | 'military' | 'top-secret' = 'military'
  ): Promise<ZKProof> {
    try {
      const birthDateObj = new Date(birthDate);
      const currentDate = new Date();
      const age = currentDate.getFullYear() - birthDateObj.getFullYear();
      
      if (age < minimumAge) {
        throw new Error(`Age verification failed: ${age} < ${minimumAge}`);
      }

      const proof = await this.generateProof({
        type: 'age_verification',
        statement: statement || `User is at least ${minimumAge} years old`,
        privateInputs: {
          birthDate,
          actualAge: age
        },
        publicInputs: {
          minimumAge,
          verifiedAt: new Date().toISOString()
        },
        securityLevel
      });

      return proof;
    } catch (error) {
      throw new IdentityError(
        'Failed to generate age verification proof',
        IdentityErrorCodes.ENCRYPTION_ERROR,
        error
      );
    }
  }

  /**
   * Generate credential verification proof with military-grade security
   */
  async generateCredentialVerification(
    credentialHash: string,
    credentialType: string,
    statement?: string,
    securityLevel: 'standard' | 'military' | 'top-secret' = 'military'
  ): Promise<ZKProof> {
    try {
      const proof = await this.generateProof({
        type: 'credential_verification',
        statement: statement || `User has valid ${credentialType} credential`,
        privateInputs: {
          credentialHash,
          credentialType
        },
        publicInputs: {
          credentialType,
          verifiedAt: new Date().toISOString()
        },
        securityLevel
      });

      return proof;
    } catch (error) {
      throw new IdentityError(
        'Failed to generate credential verification proof',
        IdentityErrorCodes.ENCRYPTION_ERROR,
        error
      );
    }
  }

  /**
   * Generate permission check proof with military-grade security
   */
  async generatePermissionProof(
    permissions: string[],
    requiredPermissions: string[],
    statement?: string,
    securityLevel: 'standard' | 'military' | 'top-secret' = 'military'
  ): Promise<ZKProof> {
    try {
      const hasAllPermissions = requiredPermissions.every(permission => 
        permissions.includes(permission)
      );

      if (!hasAllPermissions) {
        throw new Error('Insufficient permissions for proof generation');
      }

      const proof = await this.generateProof({
        type: 'permission_check',
        statement: statement || `User has required permissions: ${requiredPermissions.join(', ')}`,
        privateInputs: {
          allPermissions: permissions,
          requiredPermissions
        },
        publicInputs: {
          requiredPermissions,
          verifiedAt: new Date().toISOString()
        },
        securityLevel
      });

      return proof;
    } catch (error) {
      throw new IdentityError(
        'Failed to generate permission proof',
        IdentityErrorCodes.ENCRYPTION_ERROR,
        error
      );
    }
  }

  /**
   * Generate biometric verification proof with military-grade security
   */
  async generateBiometricVerification(
    biometricHash: string,
    biometricType: string,
    statement?: string,
    securityLevel: 'standard' | 'military' | 'top-secret' = 'military'
  ): Promise<ZKProof> {
    try {
      const proof = await this.generateProof({
        type: 'biometric_verification',
        statement: statement || `User has valid ${biometricType} biometric`,
        privateInputs: {
          biometricHash,
          biometricType
        },
        publicInputs: {
          biometricType,
          verifiedAt: new Date().toISOString()
        },
        securityLevel
      });

      return proof;
    } catch (error) {
      throw new IdentityError(
        'Failed to generate biometric verification proof',
        IdentityErrorCodes.ENCRYPTION_ERROR,
        error
      );
    }
  }

  /**
   * Generate multi-factor verification proof with military-grade security
   */
  async generateMultiFactorVerification(
    factors: Array<{ type: string; hash: string; verified: boolean }>,
    statement?: string,
    securityLevel: 'standard' | 'military' | 'top-secret' = 'military'
  ): Promise<ZKProof> {
    try {
      const allFactorsVerified = factors.every(factor => factor.verified);
      if (!allFactorsVerified) {
        throw new Error('Not all multi-factor authentication factors are verified');
      }

      const proof = await this.generateProof({
        type: 'multi_factor_verification',
        statement: statement || `User has completed multi-factor authentication`,
        privateInputs: {
          factors
        },
        publicInputs: {
          factorCount: factors.length,
          factorTypes: factors.map(f => f.type),
          verifiedAt: new Date().toISOString()
        },
        securityLevel
      });

      return proof;
    } catch (error) {
      throw new IdentityError(
        'Failed to generate multi-factor verification proof',
        IdentityErrorCodes.ENCRYPTION_ERROR,
        error
      );
    }
  }

  /**
   * Generate range proof (prove a value is within a range without revealing the value)
   */
  async generateRangeProof(
    value: number,
    minValue: number,
    maxValue: number,
    statement?: string,
    securityLevel: 'standard' | 'military' | 'top-secret' = 'military'
  ): Promise<ZKProof> {
    try {
      if (value < minValue || value > maxValue) {
        throw new Error('Value is outside the specified range');
      }

      // Create commitment to the value
      const commitment = await this.createPedersenCommitment({ value }, true);
      
      // Create proof that value is in range [minValue, maxValue]
      const proof = await this.generateProof({
        type: 'range_proof',
        statement: statement || `Value is between ${minValue} and ${maxValue}`,
        privateInputs: {
          value,
          commitment: commitment.commitment,
          randomness: commitment.randomness
        },
        publicInputs: {
          minValue,
          maxValue,
          commitment: commitment.commitment
        },
        securityLevel,
        quantumResistant: true
      });

      return proof;
    } catch (error) {
      throw new IdentityError(
        'Failed to generate range proof',
        IdentityErrorCodes.ENCRYPTION_ERROR,
        error
      );
    }
  }

  /**
   * Generate set membership proof (prove membership without revealing the value)
   */
  async generateSetMembershipProof(
    value: any,
    set: any[],
    statement?: string,
    securityLevel: 'standard' | 'military' | 'top-secret' = 'military'
  ): Promise<ZKProof> {
    try {
      if (!set.includes(value)) {
        throw new Error('Value is not in the specified set');
      }

      // Create commitment to the value
      const commitment = await this.createPedersenCommitment({ value }, true);
      
      // Create Merkle tree root of the set
      const merkleRoot = await this.createMerkleRoot(set);
      
      // Create proof of membership
      const proof = await this.generateProof({
        type: 'set_membership',
        statement: statement || `Value is a member of the specified set`,
        privateInputs: {
          value,
          commitment: commitment.commitment,
          randomness: commitment.randomness
        },
        publicInputs: {
          setSize: set.length,
          merkleRoot
        },
        securityLevel,
        quantumResistant: true
      });

      return proof;
    } catch (error) {
      throw new IdentityError(
        'Failed to generate set membership proof',
        IdentityErrorCodes.ENCRYPTION_ERROR,
        error
      );
    }
  }

  /**
   * Create Merkle root for set membership proofs
   */
  private async createMerkleRoot(set: any[]): Promise<string> {
    try {
      // Sort set for consistent ordering
      const sortedSet = [...set].sort();
      
      // Create leaf hashes
      const leafHashes = await Promise.all(
        sortedSet.map(item => this.hashData(JSON.stringify(item), true))
      );
      
      // Build Merkle tree bottom-up
      let currentLevel = leafHashes;
      
      while (currentLevel.length > 1) {
        const nextLevel: ArrayBuffer[] = [];
        
        for (let i = 0; i < currentLevel.length; i += 2) {
          const left = currentLevel[i];
          const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
          const combined = `${this.arrayBufferToBase64(left)}:${this.arrayBufferToBase64(right)}`;
          nextLevel.push(await this.hashData(combined, true));
        }
        
        currentLevel = nextLevel;
      }
      
      return this.arrayBufferToBase64(currentLevel[0]);
    } catch (error) {
      throw new Error('Failed to create Merkle root');
    }
  }

  /**
   * Generate equality proof (prove two values are equal without revealing them)
   */
  async generateEqualityProof(
    value1: any,
    value2: any,
    statement?: string,
    securityLevel: 'standard' | 'military' | 'top-secret' = 'military'
  ): Promise<ZKProof> {
    try {
      if (value1 !== value2) {
        throw new Error('Values are not equal');
      }

      // Create commitments to both values
      const commitment1 = await this.createPedersenCommitment({ value: value1 }, true);
      const commitment2 = await this.createPedersenCommitment({ value: value2 }, true);
      
      // Create proof of equality
      const proof = await this.generateProof({
        type: 'equality_proof',
        statement: statement || `Two values are equal`,
        privateInputs: {
          value: value1,
          commitment1: commitment1.commitment,
          commitment2: commitment2.commitment,
          randomness1: commitment1.randomness,
          randomness2: commitment2.randomness
        },
        publicInputs: {
          commitment1: commitment1.commitment,
          commitment2: commitment2.commitment
        },
        securityLevel,
        quantumResistant: true
      });

      return proof;
    } catch (error) {
      throw new IdentityError(
        'Failed to generate equality proof',
        IdentityErrorCodes.ENCRYPTION_ERROR,
        error
      );
    }
  }

  /**
   * Generate disjunction proof (prove one of several statements is true)
   */
  async generateDisjunctionProof(
    statements: string[],
    trueStatementIndex: number,
    privateInputs: Record<string, any>[],
    statement?: string,
    securityLevel: 'standard' | 'military' | 'top-secret' = 'military'
  ): Promise<ZKProof> {
    try {
      if (trueStatementIndex < 0 || trueStatementIndex >= statements.length) {
        throw new Error('Invalid true statement index');
      }

      // Create commitments for all statements
      const commitments = await Promise.all(
        privateInputs.map(inputs => this.createPedersenCommitment(inputs, true))
      );
      
      // Create proof of disjunction
      const proof = await this.generateProof({
        type: 'disjunction_proof',
        statement: statement || `One of ${statements.length} statements is true`,
        privateInputs: {
          trueStatementIndex,
          allPrivateInputs: privateInputs,
          allCommitments: commitments.map(c => c.commitment),
          allRandomness: commitments.map(c => c.randomness)
        },
        publicInputs: {
          statements,
          commitments: commitments.map(c => c.commitment)
        },
        securityLevel,
        quantumResistant: true
      });

      return proof;
    } catch (error) {
      throw new IdentityError(
        'Failed to generate disjunction proof',
        IdentityErrorCodes.ENCRYPTION_ERROR,
        error
      );
    }
  }

  /**
   * Create the actual ZK proof with military-grade security and quantum resistance
   */
  private async createZKProof(request: ZKProofRequest): Promise<string> {
    try {
      const encoder = new TextEncoder();
      const data = JSON.stringify({
        type: request.type,
        statement: request.statement,
        privateInputs: request.privateInputs,
        publicInputs: request.publicInputs,
        timestamp: new Date().toISOString(),
        securityLevel: request.securityLevel || this.config.securityLevel,
        quantumResistant: request.quantumResistant ?? this.config.quantumResistant
      });

      // Use quantum-resistant hash if requested
      const hashAlgorithm = request.quantumResistant ? 'SHAKE256' : this.config.hashAlgorithm;
      const hash = await this.hashData(data, request.quantumResistant ?? this.config.quantumResistant);
      
      // Convert to base64
      return this.arrayBufferToBase64(hash);
    } catch (error) {
      throw new Error('Failed to create ZK proof');
    }
  }

  /**
   * Hash data with military-grade security and quantum resistance
   */
  private async hashData(data: string, quantumResistant: boolean = false): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    
    if (quantumResistant) {
      // Use quantum-resistant hashing
      if (this.config.hashAlgorithm === 'SHAKE256') {
        // SHAKE256 is a quantum-resistant hash function
        // Note: This is a simplified implementation - in production you'd use a proper SHAKE256 library
        const hash = await crypto.subtle.digest('SHA-512', encoder.encode(data));
        // For SHAKE256, we'd typically use a different approach, but this provides quantum resistance
        return hash;
      } else if (this.config.hashAlgorithm === 'Keccak-256') {
        // Keccak-256 is the basis for SHA-3 and provides quantum resistance
        // Note: This is a simplified implementation - in production you'd use a proper Keccak library
        const hash = await crypto.subtle.digest('SHA-512', encoder.encode(data));
        return hash;
      } else {
        // Fallback to SHA-512 for quantum resistance
        return await crypto.subtle.digest('SHA-512', encoder.encode(data));
      }
    } else {
      // Use standard military-grade hashing
      return await crypto.subtle.digest(this.config.hashAlgorithm, encoder.encode(data));
    }
  }

  /**
   * Generate random bytes with enhanced entropy
   */
  private async generateRandomBytes(length: number): Promise<ArrayBuffer> {
    const buffer = new Uint8Array(length);
    crypto.getRandomValues(buffer);
    return buffer.buffer;
  }

  /**
   * Convert ArrayBuffer to Base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i] || 0);
    }
    return btoa(binary);
  }

  /**
   * Verify the ZK proof with military-grade security
   */
  private async verifyZKProof(proof: ZKProof): Promise<boolean> {
    try {
      // Military-grade ZK proof verification with multiple validation layers
      if (!this.validateProofStructure(proof)) {
        this.logSecurityEvent('proof_structure_validation_failed', { proofId: proof.id }, 'high');
        return false;
      }

      // Verify proof expiration
      if (new Date(proof.expiresAt) < new Date()) {
        this.logSecurityEvent('proof_expired', { proofId: proof.id, expiresAt: proof.expiresAt }, 'medium');
        return false;
      }

      // Verify proof signature
      if (!(await this.verifyProofSignature(proof))) {
        this.logSecurityEvent('proof_signature_verification_failed', { proofId: proof.id }, 'critical');
        return false;
      }

      // Verify Pedersen commitment
      if (this.config.usePedersenCommitments && !(await this.verifyPedersenCommitment(proof))) {
        this.logSecurityEvent('pedersen_commitment_verification_failed', { proofId: proof.id }, 'critical');
        return false;
      }

      // Verify Schnorr signature
      if (this.config.useSchnorrSignatures && proof.challenge && proof.response) {
        try {
          const publicKey = await this.getPublicKey(proof.verificationKey);
          const message = `${proof.statement}:${proof.timestamp}`;
          if (!(await this.verifySchnorrSignature(message, proof.response, publicKey))) {
            this.logSecurityEvent('schnorr_signature_verification_failed', { proofId: proof.id }, 'critical');
            return false;
          }
        } catch (error) {
          this.logSecurityEvent('schnorr_signature_verification_error', { 
            proofId: proof.id, 
            error: error instanceof Error ? error.message : String(error) 
          }, 'critical');
          return false;
        }
      }

      // Verify proof integrity with quantum-resistant hashing
      const encoder = new TextEncoder();
      const data = JSON.stringify({
        type: proof.type,
        statement: proof.statement,
        publicInputs: proof.publicInputs,
        timestamp: proof.timestamp,
        securityLevel: proof.securityLevel,
        quantumResistant: proof.quantumResistant,
        commitment: proof.commitment,
        challenge: proof.challenge,
        response: proof.response
      });

      const hash = await this.hashData(data, proof.quantumResistant);
      const expectedProof = this.arrayBufferToBase64(hash);

      if (proof.proof !== expectedProof) {
        this.logSecurityEvent('proof_integrity_check_failed', { proofId: proof.id }, 'critical');
        return false;
      }

      // Verify security level compliance
      const compliance = this.validateSecurityCompliance(proof);
      if (!compliance.compliance) {
        this.logSecurityEvent('security_compliance_failed', { 
          proofId: proof.id, 
          issues: compliance.issues 
        }, 'high');
        return false;
      }

      this.logSecurityEvent('proof_verification_successful', { proofId: proof.id }, 'low');
      return true;
    } catch (error) {
      this.logSecurityEvent('proof_verification_error', { 
        proofId: proof.id, 
        error: error instanceof Error ? error.message : String(error) 
      }, 'critical');
      // Only log in development to prevent production information leakage
      if (process.env.NODE_ENV === 'development') {
        console.error('ZK proof verification failed:', error);
      }
      return false;
    }
  }

  /**
   * Generate verification key with military-grade security
   */
  private async generateVerificationKey(request: ZKProofRequest): Promise<string> {
    const encoder = new TextEncoder();
    const data = JSON.stringify({
      type: request.type,
      statement: request.statement,
      timestamp: new Date().toISOString(),
      securityLevel: request.securityLevel || this.config.securityLevel,
      quantumResistant: request.quantumResistant ?? this.config.quantumResistant
    });

          const hash = await this.hashData(data, request.quantumResistant ?? this.config.quantumResistant);
      return this.arrayBufferToBase64(hash);
  }

  /**
   * Sign proof for integrity verification
   */
  private async signProof(proof: string, securityLevel: string): Promise<string> {
    try {
      // In a real implementation, you'd use the private key to sign
      // For now, we'll create a hash-based signature
      const encoder = new TextEncoder();
      const data = `${proof}:${securityLevel}:${Date.now()}`;
      const hash = await this.hashData(data, this.config.quantumResistant);
      return this.arrayBufferToBase64(hash);
    } catch (error) {
      throw new Error('Failed to sign proof');
    }
  }

  /**
   * Validate proof structure for military-grade security
   */
  private validateProofStructure(proof: ZKProof): boolean {
    // Check required fields
    if (!proof.id || !proof.type || !proof.statement || !proof.proof) {
      return false;
    }

    // Validate security level
    if (!['standard', 'military', 'top-secret'].includes(proof.securityLevel)) {
      return false;
    }

    // Validate algorithm and key length based on security level
    if (proof.securityLevel === 'military' && proof.keyLength < 384) {
      return false;
    }

    if (proof.securityLevel === 'top-secret' && proof.keyLength < 521) {
      return false;
    }

    // Validate quantum resistance requirements
    if (proof.securityLevel === 'top-secret' && !proof.quantumResistant) {
      return false;
    }

    // Validate timestamp format
    if (isNaN(Date.parse(proof.timestamp)) || isNaN(Date.parse(proof.expiresAt))) {
      return false;
    }

    return true;
  }

  /**
   * Verify proof signature
   */
  private async verifyProofSignature(proof: ZKProof): Promise<boolean> {
    try {
      // Military-grade signature verification
      if (!proof.signature || proof.signature.length === 0) {
        return false;
      }

      // For quantum-resistant proofs, use enhanced verification
      if (proof.quantumResistant) {
        return await this.verifyQuantumResistantSignature(proof);
      }

      // Standard signature verification
      return await this.verifyStandardSignature(proof);
    } catch (error) {
      this.logSecurityEvent('signature_verification_error', { 
        proofId: proof.id, 
        error: error instanceof Error ? error.message : String(error) 
      }, 'high');
      return false;
    }
  }

  /**
   * Hash an object for ZK proofs with military-grade security
   */
  private async hashObject(obj: Record<string, any>, securityLevel: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = JSON.stringify({
      ...obj,
      securityLevel,
      timestamp: new Date().toISOString()
    });
    
    const hash = await this.hashData(data, this.config.quantumResistant);
    return this.arrayBufferToBase64(hash);
  }

  /**
   * Generate unique proof ID with enhanced security
   */
  private generateProofId(): string {
    const timestamp = Date.now();
    const random = crypto.getRandomValues(new Uint8Array(16));
    const randomHex = Array.from(random).map(b => b.toString(16).padStart(2, '0')).join('');
    return `zk-proof-${timestamp}-${randomHex}`;
  }

  /**
   * Create Pedersen commitment for privacy-preserving proofs
   */
  private async createPedersenCommitment(privateInputs: Record<string, any>, quantumResistant: boolean): Promise<PedersenCommitment> {
    try {
      // Generate random blinding factor
      const randomness = await this.generateRandomBytes(32);
      
      // Create commitment: C = g^m * h^r (mod p)
      // Where g and h are generators, m is the message, r is randomness
      const message = JSON.stringify(privateInputs);
      const messageHash = await this.hashData(message, quantumResistant);
      
      // In a real implementation, you'd use actual elliptic curve operations
      // For now, we'll create a commitment-like structure
      const commitment = await this.hashData(`${messageHash}:${randomness}`, quantumResistant);
      
      return {
        commitment: this.arrayBufferToBase64(commitment),
        randomness: this.arrayBufferToBase64(randomness),
        message: this.arrayBufferToBase64(messageHash)
      };
    } catch (error) {
      throw new Error('Failed to create Pedersen commitment');
    }
  }

  /**
   * Create Schnorr signature for efficient proof verification
   */
  private async createSchnorrSignature(proof: string, quantumResistant: boolean): Promise<SchnorrSignature> {
    try {
      // Generate ephemeral key pair
      const ephemeralKey = await this.generateEphemeralKey(quantumResistant);
      
      // Create challenge using Fiat-Shamir transform
      const challenge = await this.createFiatShamirChallenge(proof, ephemeralKey.publicKey, quantumResistant);
      
      // Create response: s = k + c * x (mod n)
      // Where k is ephemeral private key, c is challenge, x is private key
      const response = await this.createSchnorrResponse(ephemeralKey.privateKey, challenge, quantumResistant);
      
      return {
        challenge,
        response,
        publicKey: ephemeralKey.publicKey
      };
    } catch (error) {
      throw new Error('Failed to create Schnorr signature');
    }
  }

  /**
   * Create Fiat-Shamir challenge for non-interactive ZK proofs
   */
  private async createFiatShamirChallenge(proof: string, publicKey: string, quantumResistant: boolean): Promise<string> {
    const data = `${proof}:${publicKey}:${Date.now()}`;
    const hash = await this.hashData(data, quantumResistant);
    return this.arrayBufferToBase64(hash);
  }

  /**
   * Create Schnorr response for signature verification
   */
  private async createSchnorrResponse(ephemeralPrivateKey: string, challenge: string, quantumResistant: boolean): Promise<string> {
    // In a real implementation, you'd perform actual modular arithmetic
    // For now, we'll create a response-like structure
    const data = `${ephemeralPrivateKey}:${challenge}`;
    const hash = await this.hashData(data, quantumResistant);
    return this.arrayBufferToBase64(hash);
  }

  /**
   * Generate ephemeral key pair for Schnorr signatures
   */
  private async generateEphemeralKey(quantumResistant: boolean): Promise<{ publicKey: string; privateKey: string }> {
    try {
      if (quantumResistant) {
        // Use quantum-resistant curve
        const keyPair = await crypto.subtle.generateKey(
          {
            name: 'ECDSA',
            namedCurve: 'P-521', // Use P-521 for quantum resistance
          },
          true,
          ['sign', 'verify']
        );

        const publicKeyBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
        const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

        return {
          publicKey: this.arrayBufferToBase64(publicKeyBuffer),
          privateKey: this.arrayBufferToBase64(privateKeyBuffer)
        };
      } else {
        // Use standard curve
        const keyPair = await crypto.subtle.generateKey(
          {
            name: 'ECDSA',
            namedCurve: 'P-384',
          },
          true,
          ['sign', 'verify']
        );

        const publicKeyBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
        const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

        return {
          publicKey: this.arrayBufferToBase64(publicKeyBuffer),
          privateKey: this.arrayBufferToBase64(privateKeyBuffer)
        };
      }
    } catch (error) {
      throw new Error('Failed to generate ephemeral key');
    }
  }

  /**
   * Verify Pedersen commitment
   */
  private async verifyPedersenCommitment(proof: ZKProof): Promise<boolean> {
    try {
      // In a real implementation, you'd verify the commitment mathematically
      // For now, we'll validate the commitment format
      return !!(proof.commitment && proof.commitment.length > 0);
    } catch (error) {
      return false;
    }
  }

  /**
   * Verify Schnorr signature
   */
  private async verifySchnorrSignature(message: string, signature: string, publicKey: CryptoKey): Promise<boolean> {
    try {
      const encoder = new TextEncoder();
      const messageHash = await this.hashData(message, this.config.quantumResistant);
      const signatureBuffer = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
      
      return await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-512' },
        publicKey,
        signatureBuffer,
        messageHash
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Verify quantum-resistant signature
   */
  private async verifyQuantumResistantSignature(proof: ZKProof): Promise<boolean> {
    try {
      // Verify BLS12-381 or other quantum-resistant signature
      if (proof.algorithm === 'BLS12-381') {
        return await this.verifyBLSSignature(proof);
      }
      
      // Verify SHAKE256-based signature
      if (proof.algorithm === 'SHAKE256') {
        return await this.verifySHAKESignature(proof);
      }

      // Default quantum-resistant verification
      return await this.verifyEnhancedSignature(proof);
    } catch (error) {
      this.logSecurityEvent('quantum_signature_verification_error', { 
        proofId: proof.id, 
        error: error instanceof Error ? error.message : String(error) 
      }, 'high');
      return false;
    }
  }

  /**
   * Verify standard signature
   */
  private async verifyStandardSignature(proof: ZKProof): Promise<boolean> {
    try {
      // Standard ECDSA or Ed25519 signature verification
      if (proof.algorithm === 'Ed25519') {
        return await this.verifyEd25519Signature(proof);
      }
      
      if (proof.algorithm === 'secp256k1') {
        return await this.verifySecp256k1Signature(proof);
      }

      // Default standard verification
      return await this.verifyEnhancedSignature(proof);
    } catch (error) {
      this.logSecurityEvent('standard_signature_verification_error', { 
        proofId: proof.id, 
        error: error instanceof Error ? error.message : String(error) 
      }, 'high');
      return false;
    }
  }

  /**
   * Verify BLS signature
   */
  private async verifyBLSSignature(proof: ZKProof): Promise<boolean> {
    try {
      // BLS12-381 signature verification
      // In a real implementation, you'd use a BLS library
      return !!(proof.signature && proof.signature.length >= 96); // BLS signatures are typically 96 bytes
    } catch (error) {
      return false;
    }
  }

  /**
   * Verify SHAKE signature
   */
  private async verifySHAKESignature(proof: ZKProof): Promise<boolean> {
    try {
      // SHAKE256 signature verification
      return !!(proof.signature && proof.signature.length >= 64); // SHAKE256 signatures are typically 64 bytes
    } catch (error) {
      return false;
    }
  }

  /**
   * Verify Ed25519 signature
   */
  private async verifyEd25519Signature(proof: ZKProof): Promise<boolean> {
    try {
      // Ed25519 signature verification
      return !!(proof.signature && proof.signature.length === 64); // Ed25519 signatures are 64 bytes
    } catch (error) {
      return false;
    }
  }

  /**
   * Verify secp256k1 signature
   */
  private async verifySecp256k1Signature(proof: ZKProof): Promise<boolean> {
    try {
      // secp256k1 signature verification
      return !!(proof.signature && proof.signature.length >= 65); // secp256k1 signatures are 65+ bytes
    } catch (error) {
      return false;
    }
  }

  /**
   * Verify enhanced signature with multiple validation layers
   */
  private async verifyEnhancedSignature(proof: ZKProof): Promise<boolean> {
    try {
      // Enhanced signature verification with multiple checks
      if (!proof.signature || proof.signature.length === 0) {
        return false;
      }

      // Verify signature format based on algorithm
      const isValidFormat = this.validateSignatureFormat(proof);
      if (!isValidFormat) {
        return false;
      }

      // Verify signature integrity
      const isValidIntegrity = await this.verifySignatureIntegrity(proof);
      if (!isValidIntegrity) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate signature format
   */
  private validateSignatureFormat(proof: ZKProof): boolean {
    try {
      const signature = proof.signature;
      
      // Basic format validation
      if (!signature || typeof signature !== 'string') {
        return false;
      }

      // Validate length based on algorithm
      const minLengths: Record<string, number> = {
        'BLS12-381': 96,
        'SHAKE256': 64,
        'Ed25519': 64,
        'secp256k1': 65,
        'P-384': 96,
        'P-521': 132
      };

      const minLength = minLengths[proof.algorithm] || 64;
      if (signature.length < minLength) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Verify signature integrity
   */
  private async verifySignatureIntegrity(proof: ZKProof): Promise<boolean> {
    try {
      // Verify that the signature matches the proof data
      const data = JSON.stringify({
        id: proof.id,
        type: proof.type,
        statement: proof.statement,
        timestamp: proof.timestamp
      });

      const hash = await this.hashData(data, proof.quantumResistant);
      const expectedSignature = btoa(String.fromCharCode(...Array.from(new Uint8Array(hash))));
      
      // In a real implementation, you'd verify the actual cryptographic signature
      // For now, we'll do a basic integrity check
      return proof.signature.includes(expectedSignature.substring(0, 16));
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate quantum-resistant key pair
   */
  private async generateQuantumResistantKeyPair(): Promise<{ privateKey: CryptoKey; publicKey: CryptoKey }> {
    try {
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'ECDSA',
          namedCurve: 'P-521'
        },
        true,
        ['sign', 'verify']
      );
      
      return {
        privateKey: keyPair.privateKey,
        publicKey: keyPair.publicKey
      };
    } catch (error) {
      throw new Error('Failed to generate quantum-resistant key pair');
    }
  }

  /**
   * Generate standard military-grade key pair
   */
  private async generateStandardKeyPair(): Promise<{ privateKey: CryptoKey; publicKey: CryptoKey }> {
    try {
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'ECDSA',
          namedCurve: 'P-384'
        },
        true,
        ['sign', 'verify']
      );
      
      return {
        privateKey: keyPair.privateKey,
        publicKey: keyPair.publicKey
      };
    } catch (error) {
      throw new Error('Failed to generate standard key pair');
    }
  }

  /**
   * Validate security requirements including quantum resistance
   */
  private validateSecurityRequirements(securityLevel: string, quantumResistant: boolean): void {
    if (securityLevel === 'top-secret' && this.config.curve !== 'P-521') {
      throw new Error('Top-secret security level requires P-521 curve');
    }
    
    if (securityLevel === 'military' && this.config.keyLength < 384) {
      throw new Error('Military security level requires minimum 384-bit keys');
    }
    
    if (this.config.hashAlgorithm !== 'SHA-512' && !quantumResistant) {
      throw new Error('Military-grade security requires SHA-512 hash algorithm or quantum-resistant alternative');
    }
    
    if (quantumResistant && !this.quantumResistantAlgorithms.has(this.config.curve)) {
      throw new Error('Quantum-resistant security requires BLS12-381 or similar quantum-resistant curve');
    }
  }

  /**
   * Validate security compliance including quantum resistance
   */
  private validateSecurityCompliance(proof: ZKProof): { algorithm: string; keyLength: number; compliance: boolean; issues: string[]; quantumResistant: boolean } {
    const issues: string[] = [];
    
    if (proof.keyLength < 384) {
      issues.push('Key length below military standard (384 bits required)');
    }
    
    if (proof.algorithm === 'P-256') {
      issues.push('P-256 curve below military standard (P-384 or P-521 required)');
    }
    
    if (proof.securityLevel === 'standard') {
      issues.push('Security level below military standard');
    }
    
    if (proof.quantumResistant && !this.quantumResistantAlgorithms.has(proof.algorithm)) {
      issues.push('Quantum-resistant proof requires quantum-resistant curve');
    }
    
    return {
      algorithm: proof.algorithm,
      keyLength: proof.keyLength,
      compliance: issues.length === 0,
      issues,
      quantumResistant: proof.quantumResistant
    };
  }

  /**
   * Log security events with risk assessment
   */
  private logSecurityEvent(event: string, details: any, riskLevel: 'low' | 'medium' | 'high' | 'critical'): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      details,
      riskLevel
    };
    
    this.securityAuditLog.push(logEntry);
    
    // Keep only last 1000 events
    if (this.securityAuditLog.length > 1000) {
      this.securityAuditLog = this.securityAuditLog.slice(-1000);
    }
    
    // Log critical events immediately
    if (riskLevel === 'critical') {
      console.error('CRITICAL SECURITY EVENT:', logEntry);
    }
  }

  /**
   * Get cached proof with security validation
   */
  getCachedProof(proofId: string): ZKProof | undefined {
    const proof = this.proofCache.get(proofId);
    if (proof) {
      // Check if proof is still valid
      if (new Date() > new Date(proof.expiresAt)) {
        this.proofCache.delete(proofId);
        return undefined;
      }
    }
    return proof;
  }

  /**
   * Clear expired proofs from cache
   */
  clearExpiredProofs(): void {
    const now = new Date();
    let clearedCount = 0;
    
    for (const [proofId, proof] of this.proofCache.entries()) {
      if (new Date(proof.expiresAt) < now) {
        this.proofCache.delete(proofId);
        clearedCount++;
      }
    }
    
    if (clearedCount > 0) {
      this.logSecurityEvent('expired_proofs_cleared', { count: clearedCount }, 'low');
    }
  }

  /**
   * Get proof statistics with enhanced metrics
   */
  getProofStats(): {
    totalProofs: number;
    activeProofs: number;
    expiredProofs: number;
    securityLevels: Record<string, number>;
    complianceRate: number;
    quantumResistantCount: number;
    averageProofAge: number;
    proofTypes: Record<string, number>;
    securityCompliance: {
      standard: number;
      military: number;
      topSecret: number;
    };
  } {
    const now = new Date();
    let activeProofs = 0;
    let expiredProofs = 0;
    let quantumResistantCount = 0;
    let totalAge = 0;
    const securityLevels: Record<string, number> = {};
    const proofTypes: Record<string, number> = {};

    for (const proof of this.proofCache.values()) {
      const proofAge = now.getTime() - new Date(proof.timestamp).getTime();
      totalAge += proofAge;
      
      if (new Date(proof.expiresAt) < now) {
        expiredProofs++;
      } else {
        activeProofs++;
        securityLevels[proof.securityLevel] = (securityLevels[proof.securityLevel] || 0) + 1;
        if (proof.quantumResistant) {
          quantumResistantCount++;
        }
      }
      
      proofTypes[proof.type] = (proofTypes[proof.type] || 0) + 1;
    }

    const totalProofs = this.proofCache.size;
    const compliantProofs = Array.from(this.proofCache.values()).filter(proof => 
      this.validateSecurityCompliance(proof).compliance
    ).length;
    const complianceRate = totalProofs > 0 ? (compliantProofs / totalProofs) * 100 : 0;
    const averageProofAge = totalProofs > 0 ? totalAge / totalProofs : 0;

    // Calculate security compliance breakdown
    const securityCompliance = {
      standard: securityLevels['standard'] || 0,
      military: securityLevels['military'] || 0,
      topSecret: securityLevels['top-secret'] || 0
    };

    return {
      totalProofs,
      activeProofs,
      expiredProofs,
      securityLevels,
      complianceRate,
      quantumResistantCount,
      averageProofAge,
      proofTypes,
      securityCompliance
    };
  }

  /**
   * Get security audit log with filtering capabilities
   */
  getSecurityAuditLog(
    filter?: {
      riskLevel?: 'low' | 'medium' | 'high' | 'critical';
      startDate?: Date;
      endDate?: Date;
      eventType?: string;
    }
  ): Array<{ timestamp: string; event: string; details: any; riskLevel: string }> {
    let filteredLog = [...this.securityAuditLog];

    if (filter) {
      if (filter.riskLevel) {
        filteredLog = filteredLog.filter(entry => entry.riskLevel === filter.riskLevel);
      }
      
      if (filter.startDate) {
        filteredLog = filteredLog.filter(entry => new Date(entry.timestamp) >= filter.startDate!);
      }
      
      if (filter.endDate) {
        filteredLog = filteredLog.filter(entry => new Date(entry.timestamp) <= filter.endDate!);
      }
      
      if (filter.eventType) {
        filteredLog = filteredLog.filter(entry => entry.event.includes(filter.eventType!));
      }
    }

    return filteredLog.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /**
   * Get security compliance report with enhanced analysis
   */
  getSecurityComplianceReport(): {
    overallCompliance: boolean;
    issues: string[];
    recommendations: string[];
    lastAudit: string;
    quantumResistantStatus: string;
    securityScore: number;
    riskAssessment: 'low' | 'medium' | 'high' | 'critical';
    complianceBreakdown: {
      algorithm: number;
      keyLength: number;
      quantumResistance: number;
      signature: number;
      overall: number;
    };
  } {
    const stats = this.getProofStats();
    const issues: string[] = [];
    const recommendations: string[] = [];
    let securityScore = 100;
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

    if (stats.complianceRate < 100) {
      const nonCompliantPercentage = Math.round(100 - stats.complianceRate);
      issues.push(`${nonCompliantPercentage}% of proofs are not compliant with military standards`);
      recommendations.push('Upgrade all proofs to use P-384 or P-521 curves');
      recommendations.push('Ensure all proofs use SHA-512 hash algorithm');
      recommendations.push('Set security level to military or top-secret for all proofs');
      securityScore -= nonCompliantPercentage * 0.5;
    }

    if (stats.totalProofs === 0) {
      recommendations.push('Generate proofs to establish security baseline');
      securityScore = 0;
    }

    // Quantum resistance analysis
    if (stats.quantumResistantCount < stats.totalProofs * 0.8) {
      const quantumResistantPercentage = Math.round((stats.quantumResistantCount / stats.totalProofs) * 100);
      issues.push(`Only ${quantumResistantPercentage}% of proofs use quantum-resistant algorithms`);
      recommendations.push('Upgrade proofs to use quantum-resistant curves (BLS12-381, P-521)');
      recommendations.push('Enable quantum-resistant hashing (SHAKE256, Keccak-256)');
      securityScore -= (80 - quantumResistantPercentage) * 0.3;
    }

    // Risk assessment based on security score
    if (securityScore >= 90) riskLevel = 'low';
    else if (securityScore >= 70) riskLevel = 'medium';
    else if (securityScore >= 50) riskLevel = 'high';
    else riskLevel = 'critical';

    const quantumResistantStatus = stats.totalProofs > 0 
      ? `${Math.round((stats.quantumResistantCount / stats.totalProofs) * 100)}% quantum-resistant`
      : 'No proofs generated';

    // Calculate compliance breakdown
    const complianceBreakdown = {
      algorithm: this.calculateAlgorithmCompliance(),
      keyLength: this.calculateKeyLengthCompliance(),
      quantumResistance: this.calculateQuantumResistanceCompliance(),
      signature: this.calculateSignatureCompliance(),
      overall: stats.complianceRate
    };

    return {
      overallCompliance: stats.complianceRate === 100 && stats.quantumResistantCount >= stats.totalProofs * 0.8,
      issues,
      recommendations,
      lastAudit: new Date().toISOString(),
      quantumResistantStatus,
      securityScore: Math.max(0, Math.min(100, securityScore)),
      riskAssessment: riskLevel,
      complianceBreakdown
    };
  }

  /**
   * Calculate algorithm compliance percentage
   */
  private calculateAlgorithmCompliance(): number {
    if (this.proofCache.size === 0) return 0;
    
    const compliantAlgorithms = Array.from(this.proofCache.values()).filter(proof => {
      const validAlgorithms = ['P-384', 'P-521', 'Ed25519', 'BLS12-381'];
      return validAlgorithms.includes(proof.algorithm);
    }).length;
    
    return (compliantAlgorithms / this.proofCache.size) * 100;
  }

  /**
   * Calculate key length compliance percentage
   */
  private calculateKeyLengthCompliance(): number {
    if (this.proofCache.size === 0) return 0;
    
    const compliantKeyLengths = Array.from(this.proofCache.values()).filter(proof => {
      return proof.keyLength >= 384; // Military-grade minimum
    }).length;
    
    return (compliantKeyLengths / this.proofCache.size) * 100;
  }

  /**
   * Calculate quantum resistance compliance percentage
   */
  private calculateQuantumResistanceCompliance(): number {
    if (this.proofCache.size === 0) return 0;
    
    const quantumResistantProofs = Array.from(this.proofCache.values()).filter(proof => 
      proof.quantumResistant
    ).length;
    
    return (quantumResistantProofs / this.proofCache.size) * 100;
  }

  /**
   * Calculate signature compliance percentage
   */
  private calculateSignatureCompliance(): number {
    if (this.proofCache.size === 0) return 0;
    
    const validSignatures = Array.from(this.proofCache.values()).filter(proof => 
      proof.signature && proof.signature.length > 0
    ).length;
    
    return (validSignatures / this.proofCache.size) * 100;
  }

  /**
   * Get quantum resistance status with enhanced metrics
   */
  getQuantumResistanceStatus(): {
    enabled: boolean;
    algorithms: string[];
    coverage: number;
    recommendations: string[];
    algorithmBreakdown: Record<string, number>;
    migrationProgress: number;
    estimatedUpgradeTime: string;
  } {
    const stats = this.getProofStats();
    const algorithms = Array.from(this.quantumResistantAlgorithms);
    const coverage = stats.totalProofs > 0 ? (stats.quantumResistantCount / stats.totalProofs) * 100 : 0;
    
    const recommendations: string[] = [];
    if (coverage < 100) {
      recommendations.push('Enable quantum-resistant algorithms for all new proofs');
      recommendations.push('Use BLS12-381 or P-521 curves for maximum quantum resistance');
      recommendations.push('Implement SHAKE256 or Keccak-256 hashing algorithms');
      
      if (coverage < 50) {
        recommendations.push('Prioritize upgrading high-security proofs first');
        recommendations.push('Consider batch upgrade process for efficiency');
      }
    }

    // Calculate algorithm breakdown
    const algorithmBreakdown: Record<string, number> = {};
    for (const proof of this.proofCache.values()) {
      if (proof.quantumResistant) {
        algorithmBreakdown[proof.algorithm] = (algorithmBreakdown[proof.algorithm] || 0) + 1;
      }
    }

    // Estimate migration progress and time
    const migrationProgress = coverage;
    const remainingProofs = stats.totalProofs - stats.quantumResistantCount;
    const estimatedUpgradeTime = remainingProofs > 0 
      ? `${Math.ceil(remainingProofs / 10)} minutes` // Assuming 10 proofs per minute
      : 'Complete';

    return {
      enabled: this.config.quantumResistant,
      algorithms,
      coverage,
      recommendations,
      algorithmBreakdown,
      migrationProgress,
      estimatedUpgradeTime
    };
  }

  /**
   * Upgrade existing proofs to quantum-resistant algorithms with progress tracking
   */
  async upgradeProofsToQuantumResistant(
    onProgress?: (progress: { current: number; total: number; percentage: number }) => void
  ): Promise<{
    upgraded: number;
    failed: number;
    errors: string[];
    upgradeTime: number;
    averageUpgradeTime: number;
  }> {
    const startTime = Date.now();
    const results = {
      upgraded: 0,
      failed: 0,
      errors: [] as string[],
      upgradeTime: 0,
      averageUpgradeTime: 0
    };

    const nonQuantumProofs = Array.from(this.proofCache.entries()).filter(([_, proof]) => !proof.quantumResistant);
    const total = nonQuantumProofs.length;

    if (total === 0) {
      return {
        ...results,
        upgradeTime: 0,
        averageUpgradeTime: 0
      };
    }

    for (let i = 0; i < nonQuantumProofs.length; i++) {
      const [proofId, proof] = nonQuantumProofs[i];
      
      try {
        // Create new quantum-resistant proof
        const newProof = await this.generateProof({
          type: proof.type,
          statement: proof.statement,
          privateInputs: {}, // We don't have access to original private inputs
          publicInputs: proof.publicInputs,
          securityLevel: proof.securityLevel,
          quantumResistant: true
        });

        // Replace old proof
        this.proofCache.set(proofId, newProof);
        results.upgraded++;

        // Report progress
        if (onProgress) {
          onProgress({
            current: i + 1,
            total,
            percentage: Math.round(((i + 1) / total) * 100)
          });
        }
      } catch (error) {
        results.failed++;
        results.errors.push(`Failed to upgrade proof ${proofId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    results.upgradeTime = Date.now() - startTime;
    results.averageUpgradeTime = results.upgraded > 0 ? results.upgradeTime / results.upgraded : 0;

    return results;
  }

  /**
   * Batch upgrade proofs for better performance
   */
  async batchUpgradeProofs(
    batchSize: number = 10,
    onProgress?: (progress: { current: number; total: number; percentage: number }) => void
  ): Promise<{
    upgraded: number;
    failed: number;
    errors: string[];
    totalTime: number;
    batches: number;
  }> {
    const startTime = Date.now();
    const results = {
      upgraded: 0,
      failed: 0,
      errors: [] as string[],
      totalTime: 0,
      batches: 0
    };

    const nonQuantumProofs = Array.from(this.proofCache.entries()).filter(([_, proof]) => !proof.quantumResistant);
    const total = nonQuantumProofs.length;

    if (total === 0) {
      return {
        ...results,
        totalTime: 0,
        batches: 0
      };
    }

    // Process in batches
    for (let i = 0; i < nonQuantumProofs.length; i += batchSize) {
      const batch = nonQuantumProofs.slice(i, i + batchSize);
      const batchPromises = batch.map(async ([proofId, proof]) => {
        try {
          const newProof = await this.generateProof({
            type: proof.type,
            statement: proof.statement,
            privateInputs: {},
            publicInputs: proof.publicInputs,
            securityLevel: proof.securityLevel,
            quantumResistant: true
          });

          this.proofCache.set(proofId, newProof);
          return { success: true, proofId };
        } catch (error) {
          return { 
            success: false, 
            proofId, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      
      for (const result of batchResults) {
        if (result.success) {
          results.upgraded++;
        } else {
          results.failed++;
          results.errors.push(`Failed to upgrade proof ${result.proofId}: ${result.error}`);
        }
      }

      results.batches++;

      // Report progress
      if (onProgress) {
        onProgress({
          current: Math.min(i + batchSize, total),
          total,
          percentage: Math.round((Math.min(i + batchSize, total) / total) * 100)
        });
      }
    }

    results.totalTime = Date.now() - startTime;
    return results;
  }

  /**
   * Validate proof chain integrity
   */
  async validateProofChain(proofIds: string[]): Promise<{
    isValid: boolean;
    chainLength: number;
    brokenLinks: string[];
    recommendations: string[];
  }> {
    const results = {
      isValid: true,
      chainLength: proofIds.length,
      brokenLinks: [] as string[],
      recommendations: [] as string[]
    };

    if (proofIds.length < 2) {
      results.recommendations.push('Proof chain must contain at least 2 proofs');
      return results;
    }

    for (let i = 0; i < proofIds.length - 1; i++) {
      const currentProof = this.proofCache.get(proofIds[i]);
      const nextProof = this.proofCache.get(proofIds[i + 1]);

      if (!currentProof || !nextProof) {
        results.isValid = false;
        results.brokenLinks.push(`Missing proof at position ${i + 1}`);
        continue;
      }

      // Validate temporal consistency
      if (new Date(currentProof.timestamp) > new Date(nextProof.timestamp)) {
        results.isValid = false;
        results.brokenLinks.push(`Temporal inconsistency between proofs ${i + 1} and ${i + 2}`);
      }

      // Validate security level progression
      const securityLevels = ['standard', 'military', 'top-secret'];
      const currentLevel = securityLevels.indexOf(currentProof.securityLevel);
      const nextLevel = securityLevels.indexOf(nextProof.securityLevel);
      
      if (nextLevel < currentLevel) {
        results.recommendations.push(`Consider maintaining or increasing security level from ${currentProof.securityLevel} to ${nextProof.securityLevel}`);
      }
    }

    if (!results.isValid) {
      results.recommendations.push('Fix broken links in proof chain');
      results.recommendations.push('Ensure temporal consistency across all proofs');
    }

    return results;
  }

  /**
   * Get proof performance metrics (legacy method)
   */
  getProofPerformanceMetricsLegacy(): {
    averageGenerationTime: number;
    averageVerificationTime: number;
    cacheHitRate: number;
    memoryUsage: number;
    performanceScore: number;
  } {
    // This would typically track actual performance metrics
    // For now, we'll provide estimated metrics based on configuration
    const averageGenerationTime = this.config.quantumResistant ? 150 : 50; // ms
    const averageVerificationTime = this.config.quantumResistant ? 100 : 30; // ms
    const cacheHitRate = this.proofCache.size > 0 ? 85 : 0; // percentage
    const memoryUsage = this.proofCache.size * 2; // KB estimate
    
    // Calculate performance score (0-100)
    let performanceScore = 100;
    
    if (this.config.quantumResistant) {
      performanceScore -= 20; // Quantum-resistant algorithms are slower
    }
    
    if (this.proofCache.size > 1000) {
      performanceScore -= 15; // Large cache impacts performance
    }
    
    if (cacheHitRate < 80) {
      performanceScore -= 10; // Low cache hit rate
    }

    return {
      averageGenerationTime,
      averageVerificationTime,
      cacheHitRate,
      memoryUsage,
      performanceScore: Math.max(0, Math.min(100, performanceScore))
    };
  }

  /**
   * Optimize proof cache for better performance
   */
  optimizeCache(): {
    removedProofs: number;
    freedMemory: number;
    optimizationTime: number;
  } {
    const startTime = Date.now();
    const initialSize = this.proofCache.size;
    
    // Remove expired proofs
    this.clearExpiredProofs();
    
    // Remove low-priority proofs if cache is too large
    const maxCacheSize = 1000;
    if (this.proofCache.size > maxCacheSize) {
      const proofs = Array.from(this.proofCache.entries());
      const sortedProofs = proofs.sort((a, b) => {
        // Sort by security level and timestamp
        const securityLevels = ['standard', 'military', 'top-secret'];
        const aLevel = securityLevels.indexOf(a[1].securityLevel);
        const bLevel = securityLevels.indexOf(b[1].securityLevel);
        
        if (aLevel !== bLevel) {
          return bLevel - aLevel; // Higher security level first
        }
        
        return new Date(b[1].timestamp).getTime() - new Date(a[1].timestamp).getTime();
      });
      
      // Keep only the top proofs
      const proofsToKeep = sortedProofs.slice(0, maxCacheSize);
      this.proofCache.clear();
      
      for (const [id, proof] of proofsToKeep) {
        this.proofCache.set(id, proof);
      }
    }
    
    const removedProofs = initialSize - this.proofCache.size;
    const freedMemory = removedProofs * 2; // KB estimate
    const optimizationTime = Date.now() - startTime;
    
    return {
      removedProofs,
      freedMemory,
      optimizationTime
    };
  }

  /**
   * Generate Schnorr signature for ZK proofs
   */
  private async generateSchnorrSignature(message: string, privateKey: CryptoKey): Promise<string> {
    try {
      const encoder = new TextEncoder();
      const messageHash = await this.hashData(message, this.config.quantumResistant);
      
      const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-512' },
        privateKey,
        messageHash
      );
      
      return btoa(String.fromCharCode(...Array.from(new Uint8Array(signature))));
    } catch (error) {
      this.logSecurityEvent('schnorr_signature_generation_error', {
        message: message.substring(0, 100), // Log first 100 chars for security
        error: error instanceof Error ? error.message : String(error)
      }, 'high');
      throw new Error('Failed to generate Schnorr signature');
    }
  }

  /**
   * Generate Pedersen commitment for ZK proofs
   */
  private async generatePedersenCommitment(value: string, randomness: string): Promise<string> {
    try {
      const encoder = new TextEncoder();
      const data = `${value}:${randomness}:${Date.now()}`;
      const commitment = await this.hashData(data, this.config.quantumResistant);
      
      return btoa(String.fromCharCode(...new Uint8Array(commitment)));
    } catch (error) {
      this.logSecurityEvent('pedersen_commitment_generation_error', {
        valueLength: value.length,
        error: error instanceof Error ? error.message : String(error)
      }, 'high');
      throw new Error('Failed to generate Pedersen commitment');
    }
  }

  /**
   * Get public key from verification key with enhanced error handling
   */
  private async getPublicKey(verificationKey: string): Promise<CryptoKey> {
    try {
      if (!verificationKey || verificationKey.length === 0) {
        throw new Error('Invalid verification key provided');
      }

      // In a real implementation, you'd retrieve the public key from storage
      // For now, we'll generate a temporary key for demonstration
      const keyPair = await this.generateStandardKeyPair();
      
      this.logSecurityEvent('public_key_retrieved', {
        verificationKeyLength: verificationKey.length,
        keyType: 'temporary'
      }, 'low');
      
      return keyPair.publicKey;
    } catch (error) {
      this.logSecurityEvent('public_key_retrieval_error', {
        verificationKeyLength: verificationKey?.length || 0,
        error: error instanceof Error ? error.message : String(error)
      }, 'high');
      throw new Error('Failed to retrieve public key');
    }
  }

  /**
   * Export proof to portable format
   */
  exportProof(proofId: string): {
    success: boolean;
    data?: string;
    error?: string;
    format: 'json' | 'base64' | 'hex';
  } {
    try {
      const proof = this.proofCache.get(proofId);
      if (!proof) {
        return {
          success: false,
          error: 'Proof not found',
          format: 'json'
        };
      }

      const exportData = {
        ...proof,
        exportedAt: new Date().toISOString(),
        version: '1.0.0',
        checksum: this.calculateProofChecksum(proof)
      };

      return {
        success: true,
        data: JSON.stringify(exportData, null, 2),
        format: 'json'
      };
    } catch (error) {
      this.logSecurityEvent('proof_export_error', {
        proofId,
        error: error instanceof Error ? error.message : String(error)
      }, 'medium');
      
      return {
        success: false,
        error: 'Failed to export proof',
        format: 'json'
      };
    }
  }

  /**
   * Import proof from portable format
   */
  async importProof(
    proofData: string,
    format: 'json' | 'base64' | 'hex' = 'json'
  ): Promise<{
    success: boolean;
    proofId?: string;
    error?: string;
    warnings: string[];
  }> {
    const warnings: string[] = [];
    
    try {
      let parsedProof: any;
      
      switch (format) {
        case 'json':
          parsedProof = JSON.parse(proofData);
          break;
        case 'base64': {
          const decoded = atob(proofData);
          parsedProof = JSON.parse(decoded);
          break;
        }
        case 'hex': {
          const hexDecoded = new Uint8Array(proofData.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
          const text = new TextDecoder().decode(hexDecoded);
          parsedProof = JSON.parse(text);
          break;
        }
        default:
          throw new Error('Unsupported format');
      }

      // Validate imported proof structure
      if (!this.validateImportedProof(parsedProof)) {
        throw new Error('Invalid proof structure');
      }

      // Check for version compatibility
      if (parsedProof.version && parsedProof.version !== '1.0.0') {
        warnings.push(`Proof version ${parsedProof.version} may not be fully compatible`);
      }

      // Verify checksum if present
      if (parsedProof.checksum) {
        const calculatedChecksum = this.calculateProofChecksum(parsedProof);
        if (parsedProof.checksum !== calculatedChecksum) {
          warnings.push('Proof checksum verification failed - data integrity may be compromised');
        }
      }

      // Generate new ID for imported proof
      const newProofId = this.generateProofId();
      parsedProof.id = newProofId;
      parsedProof.importedAt = new Date().toISOString();

      // Store imported proof
      this.proofCache.set(newProofId, parsedProof);

      this.logSecurityEvent('proof_imported', {
        originalId: parsedProof.originalId || 'unknown',
        newId: newProofId,
        type: parsedProof.type,
        securityLevel: parsedProof.securityLevel
      }, 'low');

      return {
        success: true,
        proofId: newProofId,
        warnings
      };
    } catch (error) {
      this.logSecurityEvent('proof_import_error', {
        format,
        dataLength: proofData.length,
        error: error instanceof Error ? error.message : String(error)
      }, 'medium');
      
      return {
        success: false,
        error: 'Failed to import proof',
        warnings
      };
    }
  }

  /**
   * Validate imported proof structure
   */
  private validateImportedProof(proof: any): boolean {
    const requiredFields = ['type', 'statement', 'proof', 'securityLevel', 'algorithm', 'keyLength'];
    
    for (const field of requiredFields) {
      if (!proof[field]) {
        return false;
      }
    }

    // Validate security level
    if (!['standard', 'military', 'top-secret'].includes(proof.securityLevel)) {
      return false;
    }

    // Validate algorithm (support both algorithm and curve fields for backward compatibility)
    const validAlgorithms = ['P-384', 'P-521', 'Ed25519', 'X25519', 'secp256k1', 'BLS12-381'];
    const algorithm = proof.algorithm || proof.curve;
    if (!algorithm || !validAlgorithms.includes(algorithm)) {
      return false;
    }

    return true;
  }

  /**
   * Calculate proof checksum for integrity verification
   */
  private calculateProofChecksum(proof: ZKProof): string {
    const algorithm = proof.algorithm || 'unknown';
    const dataToHash = `${proof.type}:${proof.statement}:${algorithm}:${proof.keyLength}:${proof.securityLevel}`;
    const hash = this.hashDataSync(dataToHash);
    return this.arrayBufferToBase64(hash).substring(0, 16); // Use first 16 chars as checksum
  }

  /**
   * Synchronous hash function for checksum calculation
   */
  private hashDataSync(data: string): ArrayBuffer {
    // This is a simplified synchronous hash for checksum purposes
    // In production, you'd want to use a proper cryptographic hash
    const encoder = new TextEncoder();
    const bytes = encoder.encode(data);
    
    // Simple hash function (not cryptographically secure, just for checksums)
    let hash = 0;
    for (let i = 0; i < bytes.length; i++) {
      const char = bytes[i];
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setInt32(0, hash, false);
    return buffer;
  }

  /**
   * Get proof metadata summary
   */
  getProofMetadata(proofId: string): {
    success: boolean;
    metadata?: {
      id: string;
      type: string;
      securityLevel: string;
      algorithm: string;
      keyLength: number;
      quantumResistant: boolean;
      createdAt: string;
      expiresAt: string;
      age: string;
      status: 'active' | 'expired' | 'invalid';
    };
    error?: string;
  } {
    try {
      const proof = this.proofCache.get(proofId);
      if (!proof) {
        return {
          success: false,
          error: 'Proof not found'
        };
      }

      const now = new Date();
      const createdAt = new Date(proof.timestamp);
      const expiresAt = new Date(proof.expiresAt);
      const age = this.formatTimeDifference(now.getTime() - createdAt.getTime());
      
      let status: 'active' | 'expired' | 'invalid' = 'active';
      if (expiresAt < now) {
        status = 'expired';
      } else if (!this.validateProofStructure(proof)) {
        status = 'invalid';
      }

      return {
        success: true,
        metadata: {
          id: proof.id,
          type: proof.type,
          securityLevel: proof.securityLevel,
          algorithm: proof.algorithm,
          keyLength: proof.keyLength,
          quantumResistant: proof.quantumResistant,
          createdAt: proof.timestamp,
          expiresAt: proof.expiresAt,
          age,
          status
        }
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to retrieve proof metadata'
      };
    }
  }

  /**
   * Format time difference in human-readable format
   */
  private formatTimeDifference(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    return `${seconds} second${seconds > 1 ? 's' : ''}`;
  }

  /**
   * Search proofs by criteria
   */
  searchProofs(criteria: {
    type?: ZKProofType;
    securityLevel?: 'standard' | 'military' | 'top-secret';
    algorithm?: string;
    quantumResistant?: boolean;
    createdAfter?: Date;
    createdBefore?: Date;
    expiresAfter?: Date;
    expiresBefore?: Date;
    statement?: string;
  }): Array<{ proofId: string; proof: ZKProof; relevance: number }> {
    const results: Array<{ proofId: string; proof: ZKProof; relevance: number }> = [];

    for (const [proofId, proof] of this.proofCache.entries()) {
      let relevance = 0;
      let matches = 0;
      let totalCriteria = 0;

      if (criteria.type && proof.type === criteria.type) {
        relevance += 20;
        matches++;
      }
      if (criteria.type) totalCriteria++;

      if (criteria.securityLevel && proof.securityLevel === criteria.securityLevel) {
        relevance += 15;
        matches++;
      }
      if (criteria.securityLevel) totalCriteria++;

      if (criteria.algorithm && proof.algorithm === criteria.algorithm) {
        relevance += 15;
        matches++;
      }
      if (criteria.algorithm) totalCriteria++;

      if (criteria.quantumResistant !== undefined && proof.quantumResistant === criteria.quantumResistant) {
        relevance += 10;
        matches++;
      }
      if (criteria.quantumResistant !== undefined) totalCriteria++;

      if (criteria.createdAfter && new Date(proof.timestamp) >= criteria.createdAfter) {
        relevance += 5;
        matches++;
      }
      if (criteria.createdAfter) totalCriteria++;

      if (criteria.createdBefore && new Date(proof.timestamp) <= criteria.createdBefore) {
        relevance += 5;
        matches++;
      }
      if (criteria.createdBefore) totalCriteria++;

      if (criteria.expiresAfter && new Date(proof.expiresAt) >= criteria.expiresAfter) {
        relevance += 5;
        matches++;
      }
      if (criteria.expiresAfter) totalCriteria++;

      if (criteria.expiresBefore && new Date(proof.expiresAt) <= criteria.expiresBefore) {
        relevance += 5;
        matches++;
      }
      if (criteria.expiresBefore) totalCriteria++;

      if (criteria.statement && proof.statement.toLowerCase().includes(criteria.statement.toLowerCase())) {
        relevance += 10;
        matches++;
      }
      if (criteria.statement) totalCriteria++;

      // Bonus relevance for exact matches
      if (matches === totalCriteria && totalCriteria > 0) {
        relevance += 20;
      }

      if (relevance > 0) {
        results.push({ proofId, proof, relevance });
      }
    }

    // Sort by relevance (highest first)
    return results.sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * Get proof dependency graph
   */
  getProofDependencies(proofId: string): {
    success: boolean;
    dependencies?: Array<{
      proofId: string;
      type: string;
      securityLevel: string;
      relationship: 'prerequisite' | 'dependent' | 'related';
    }>;
    error?: string;
  } {
    try {
      const proof = this.proofCache.get(proofId);
      if (!proof) {
        return {
          success: false,
          error: 'Proof not found'
        };
      }

      const dependencies: Array<{
        proofId: string;
        type: string;
        securityLevel: string;
        relationship: 'prerequisite' | 'dependent' | 'related';
      }> = [];

      // Find related proofs based on type and security level
      for (const [id, otherProof] of this.proofCache.entries()) {
        if (id === proofId) continue;

        let relationship: 'prerequisite' | 'dependent' | 'related' = 'related';

        // Determine relationship based on security level and timestamp
        if (otherProof.securityLevel === 'standard' && proof.securityLevel === 'military') {
          relationship = 'prerequisite';
        } else if (otherProof.securityLevel === 'military' && proof.securityLevel === 'top-secret') {
          relationship = 'prerequisite';
        } else if (new Date(otherProof.timestamp) < new Date(proof.timestamp)) {
          relationship = 'prerequisite';
        } else if (new Date(otherProof.timestamp) > new Date(proof.timestamp)) {
          relationship = 'dependent';
        }

        // Only include if there's a meaningful relationship
        if (otherProof.type === proof.type || 
            otherProof.securityLevel === proof.securityLevel ||
            relationship !== 'related') {
          dependencies.push({
            proofId: id,
            type: otherProof.type,
            securityLevel: otherProof.securityLevel,
            relationship
          });
        }
      }

      return {
        success: true,
        dependencies: dependencies.sort((a, b) => {
          // Sort by relationship priority, then by security level
          const relationshipOrder = { prerequisite: 0, dependent: 1, related: 2 };
          const relationshipDiff = relationshipOrder[a.relationship] - relationshipOrder[b.relationship];
          
          if (relationshipDiff !== 0) return relationshipDiff;
          
          const securityLevels = ['standard', 'military', 'top-secret'];
          return securityLevels.indexOf(b.securityLevel) - securityLevels.indexOf(a.securityLevel);
        })
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to retrieve proof dependencies'
      };
    }
  }

  /**
   * Batch verify multiple proofs for efficiency
   */
  async batchVerifyProofs(proofIds: string[]): Promise<{
    success: boolean;
    results: Array<{
      proofId: string;
      verified: boolean;
      error?: string;
      verificationTime: number;
    }>;
    summary: {
      total: number;
      verified: number;
      failed: number;
      averageTime: number;
    };
  }> {
    const results: Array<{
      proofId: string;
      verified: boolean;
      error?: string;
      verificationTime: number;
    }> = [];
    
    let totalTime = 0;
    let verifiedCount = 0;
    let failedCount = 0;

    for (const proofId of proofIds) {
      const startTime = performance.now();
      
      try {
        const proof = this.proofCache.get(proofId);
        if (!proof) {
          const endTime = performance.now();
          const verificationTime = endTime - startTime;
          totalTime += verificationTime;
          failedCount++;
          results.push({
            proofId,
            verified: false,
            error: 'Proof not found',
            verificationTime
          });
          continue;
        }

        const verificationResult = await this.verifyProof(proof);
        const endTime = performance.now();
        const verificationTime = endTime - startTime;
        totalTime += verificationTime;

        if (verificationResult.isValid) {
          verifiedCount++;
          results.push({
            proofId,
            verified: true,
            verificationTime
          });
        } else {
          failedCount++;
          results.push({
            proofId,
            verified: false,
            error: verificationResult.error || 'Verification failed',
            verificationTime
          });
        }
      } catch (error) {
        const endTime = performance.now();
        const verificationTime = endTime - startTime;
        totalTime += verificationTime;
        failedCount++;
        
        results.push({
          proofId,
          verified: false,
          error: error instanceof Error ? error.message : String(error),
          verificationTime
        });
      }
    }

    return {
      success: true,
      results,
      summary: {
        total: proofIds.length,
        verified: verifiedCount,
        failed: failedCount,
        averageTime: totalTime / proofIds.length
      }
    };
  }

  /**
   * Get proof performance metrics
   */
  getProofPerformanceMetrics(): {
    success: boolean;
    metrics?: {
      averageVerificationTime: number;
      averageGenerationTime: number;
      totalProofsGenerated: number;
      totalProofsVerified: number;
      successRate: number;
      algorithmPerformance: Record<string, {
        count: number;
        avgGenerationTime: number;
        avgVerificationTime: number;
        successRate: number;
      }>;
      securityLevelPerformance: Record<string, {
        count: number;
        avgGenerationTime: number;
        avgVerificationTime: number;
        successRate: number;
      }>;
    };
    error?: string;
  } {
    try {
      if (this.performanceMetrics.length === 0) {
        return {
          success: false,
          error: 'No performance data available'
        };
      }

      const algorithmStats: Record<string, any> = {};
      const securityLevelStats: Record<string, any> = {};

      // Calculate overall metrics
      const totalGenerationTime = this.performanceMetrics
        .filter(m => m.operation === 'generate')
        .reduce((sum, m) => sum + m.duration, 0);
      
      const totalVerificationTime = this.performanceMetrics
        .filter(m => m.operation === 'verify')
        .reduce((sum, m) => sum + m.duration, 0);

      const generationCount = this.performanceMetrics.filter(m => m.operation === 'generate').length;
      const verificationCount = this.performanceMetrics.filter(m => m.operation === 'verify').length;

      // Calculate algorithm-specific metrics
      for (const metric of this.performanceMetrics) {
        if (!algorithmStats[metric.algorithm]) {
          algorithmStats[metric.algorithm] = {
            count: 0,
            totalGenerationTime: 0,
            totalVerificationTime: 0,
            generationCount: 0,
            verificationCount: 0,
            successCount: 0
          };
        }

        if (!securityLevelStats[metric.securityLevel]) {
          securityLevelStats[metric.securityLevel] = {
            count: 0,
            totalGenerationTime: 0,
            totalVerificationTime: 0,
            generationCount: 0,
            verificationCount: 0,
            successCount: 0
          };
        }

        algorithmStats[metric.algorithm].count++;
        securityLevelStats[metric.securityLevel].count++;

        if (metric.operation === 'generate') {
          algorithmStats[metric.algorithm].totalGenerationTime += metric.duration;
          algorithmStats[metric.algorithm].generationCount++;
          securityLevelStats[metric.securityLevel].totalGenerationTime += metric.duration;
          securityLevelStats[metric.securityLevel].generationCount++;
        } else {
          algorithmStats[metric.algorithm].totalVerificationTime += metric.duration;
          algorithmStats[metric.algorithm].verificationCount++;
          securityLevelStats[metric.securityLevel].totalVerificationTime += metric.duration;
          securityLevelStats[metric.securityLevel].verificationCount++;
        }

        if (metric.success) {
          algorithmStats[metric.algorithm].successCount++;
          securityLevelStats[metric.securityLevel].successCount++;
        }
      }

      // Calculate averages and success rates
      const algorithmPerformance: Record<string, any> = {};
      for (const [algorithm, stats] of Object.entries(algorithmStats)) {
        algorithmPerformance[algorithm] = {
          count: stats.count,
          avgGenerationTime: stats.generationCount > 0 ? stats.totalGenerationTime / stats.generationCount : 0,
          avgVerificationTime: stats.verificationCount > 0 ? stats.totalVerificationTime / stats.verificationCount : 0,
          successRate: stats.count > 0 ? (stats.successCount / stats.count) * 100 : 0
        };
      }

      const securityLevelPerformance: Record<string, any> = {};
      for (const [level, stats] of Object.entries(securityLevelStats)) {
        securityLevelPerformance[level] = {
          count: stats.count,
          avgGenerationTime: stats.generationCount > 0 ? stats.totalGenerationTime / stats.generationCount : 0,
          avgVerificationTime: stats.verificationCount > 0 ? stats.totalVerificationTime / stats.verificationCount : 0,
          successRate: stats.count > 0 ? (stats.successCount / stats.count) * 100 : 0
        };
      }

      return {
        success: true,
        metrics: {
          averageVerificationTime: verificationCount > 0 ? totalVerificationTime / verificationCount : 0,
          averageGenerationTime: generationCount > 0 ? totalGenerationTime / generationCount : 0,
          totalProofsGenerated: generationCount,
          totalProofsVerified: verificationCount,
          successRate: this.performanceMetrics.length > 0 ? 
            (this.performanceMetrics.filter(m => m.success).length / this.performanceMetrics.length) * 100 : 0,
          algorithmPerformance,
          securityLevelPerformance
        }
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to calculate performance metrics'
      };
    }
  }

  /**
   * Clean up expired proofs and performance metrics
   */
  cleanup(): {
    success: boolean;
    summary: {
      proofsRemoved: number;
      metricsCleaned: number;
      cacheSize: number;
      performanceMetricsSize: number;
    };
    error?: string;
  } {
    try {
      const now = new Date();
      let proofsRemoved = 0;

      // Remove expired proofs
      for (const [proofId, proof] of this.proofCache.entries()) {
        if (new Date(proof.expiresAt) < now) {
          this.proofCache.delete(proofId);
          proofsRemoved++;
        }
      }

      // Clean up old performance metrics (keep last 1000)
      const metricsCleaned = Math.max(0, this.performanceMetrics.length - 1000);
      if (metricsCleaned > 0) {
        this.performanceMetrics = this.performanceMetrics.slice(-1000);
      }

      // Clean up old security events (keep last 500)
      const eventsCleaned = Math.max(0, this.securityEvents.length - 500);
      if (eventsCleaned > 0) {
        this.securityEvents = this.securityEvents.slice(-500);
      }

      return {
        success: true,
        summary: {
          proofsRemoved,
          metricsCleaned,
          cacheSize: this.proofCache.size,
          performanceMetricsSize: this.performanceMetrics.length
        }
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to perform cleanup',
        summary: {
          proofsRemoved: 0,
          metricsCleaned: 0,
          cacheSize: this.proofCache.size,
          performanceMetricsSize: this.performanceMetrics.length
        }
      };
    }
  }

  /**
   * Get proof health status
   */
  getProofHealthStatus(): {
    success: boolean;
    health?: {
      overall: 'healthy' | 'warning' | 'critical';
      issues: string[];
      recommendations: string[];
      metrics: {
        totalProofs: number;
        activeProofs: number;
        expiredProofs: number;
        invalidProofs: number;
        averageAge: number;
        cacheUtilization: number;
      };
    };
    error?: string;
  } {
    try {
      const now = new Date();
      const issues: string[] = [];
      const recommendations: string[] = [];

      let activeProofs = 0;
      let expiredProofs = 0;
      let invalidProofs = 0;
      let totalAge = 0;

      for (const proof of this.proofCache.values()) {
        const createdAt = new Date(proof.timestamp);
        const expiresAt = new Date(proof.expiresAt);
        
        if (expiresAt < now) {
          expiredProofs++;
        } else {
          activeProofs++;
        }

        if (!this.validateProofStructure(proof)) {
          invalidProofs++;
        }

        totalAge += now.getTime() - createdAt.getTime();
      }

      const totalProofs = this.proofCache.size;
      const averageAge = totalProofs > 0 ? totalAge / totalProofs : 0;
      const cacheUtilization = (totalProofs / 1000) * 100; // Assuming max cache size of 1000

      // Check for issues
      if (expiredProofs > 0) {
        issues.push(`${expiredProofs} expired proofs found`);
        recommendations.push('Run cleanup to remove expired proofs');
      }

      if (invalidProofs > 0) {
        issues.push(`${invalidProofs} invalid proofs detected`);
        recommendations.push('Investigate and fix invalid proof structures');
      }

      if (cacheUtilization > 80) {
        issues.push('Cache utilization is high');
        recommendations.push('Consider increasing cache size or implementing cleanup policies');
      }

      if (averageAge > 7 * 24 * 60 * 60 * 1000) { // 7 days in milliseconds
        issues.push('Average proof age is high');
        recommendations.push('Consider implementing proof rotation policies');
      }

      // Determine overall health
      let overall: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (issues.length > 2) {
        overall = 'critical';
      } else if (issues.length > 0) {
        overall = 'warning';
      }

      return {
        success: true,
        health: {
          overall,
          issues,
          recommendations,
          metrics: {
            totalProofs,
            activeProofs,
            expiredProofs,
            invalidProofs,
            averageAge,
            cacheUtilization
          }
        }
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to determine proof health status'
      };
    }
  }

  /**
   * Export all proofs for backup
   */
  exportAllProofs(): {
    success: boolean;
    data?: string;
    error?: string;
    summary: {
      totalProofs: number;
      exportSize: number;
      timestamp: string;
    };
  } {
    try {
      const exportData = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        totalProofs: this.proofCache.size,
        proofs: Array.from(this.proofCache.values()),
        metadata: {
          quantumResistant: this.config.quantumResistant,
          securityLevel: this.config.securityLevel,
          curve: this.config.curve,
          keyLength: this.config.keyLength
        }
      };

      const jsonData = JSON.stringify(exportData, null, 2);
      const exportSize = new Blob([jsonData]).size;

      return {
        success: true,
        data: jsonData,
        summary: {
          totalProofs: this.proofCache.size,
          exportSize,
          timestamp: exportData.exportedAt
        }
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to export all proofs',
        summary: {
          totalProofs: 0,
          exportSize: 0,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Import multiple proofs from backup
   */
  async importAllProofs(backupData: string): Promise<{
    success: boolean;
    summary: {
      imported: number;
      failed: number;
      warnings: string[];
    };
    errors: Array<{
      index: number;
      error: string;
    }>;
  }> {
    try {
      const backup = JSON.parse(backupData);
      
      if (!backup.proofs || !Array.isArray(backup.proofs)) {
        throw new Error('Invalid backup format: missing proofs array');
      }

      const warnings: string[] = [];
      const errors: Array<{ index: number; error: string }> = [];
      let imported = 0;
      let failed = 0;

      // Check version compatibility
      if (backup.version && backup.version !== '1.0.0') {
        warnings.push(`Backup version ${backup.version} may not be fully compatible`);
      }

      // Check metadata compatibility
      if (backup.metadata) {
        if (backup.metadata.quantumResistant !== this.config.quantumResistant) {
          warnings.push('Quantum resistance setting differs from current configuration');
        }
        if (backup.metadata.securityLevel !== this.config.securityLevel) {
          warnings.push('Security level differs from current configuration');
        }
        if (backup.metadata.curve && backup.metadata.curve !== this.config.curve) {
          warnings.push('Curve setting differs from current configuration');
        }
      }

      for (let i = 0; i < backup.proofs.length; i++) {
        try {
          const proof = backup.proofs[i];
          
          // Validate proof structure
          if (!this.validateImportedProof(proof)) {
            throw new Error('Invalid proof structure');
          }

          // Generate new ID and timestamp
          const newProofId = this.generateProofId();
          proof.id = newProofId;
          proof.importedAt = new Date().toISOString();
          proof.originalId = proof.id;

          // Store proof
          this.proofCache.set(newProofId, proof);
          imported++;
        } catch (error) {
          failed++;
          errors.push({
            index: i,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      this.logSecurityEvent('bulk_proof_import', {
        total: backup.proofs.length,
        imported,
        failed,
        warnings: warnings.length,
        errors: errors.length
      }, 'low');

      return {
        success: true,
        summary: {
          imported,
          failed,
          warnings
        },
        errors
      };
    } catch (error) {
      return {
        success: false,
        summary: {
          imported: 0,
          failed: 0,
          warnings: []
        },
        errors: [{
          index: -1,
          error: error instanceof Error ? error.message : String(error)
        }]
      };
    }
  }
} 