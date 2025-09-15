import { cryptoWorkerManager } from '../../cryptoWorkerManager';
// import { IdentityError, IdentityErrorCodes } from '../../../types';

// True ZK Proof interface with real protocol components
export interface ZKProofData {
  schnorrProof?: SchnorrZKProof;
  pedersenProof?: PedersenZKProof;
  sigmaProtocol?: SigmaProtocolProof;
  fiatShamirTransform?: FiatShamirProof;
}

export interface ZKProof {
  id: string;
  type: ZKProofType;
  statement: ZKStatement;
  proof: ZKProofData;
  publicInputs: Record<string, any>;
  timestamp: string;
  expiresAt: string;
  verificationKey: string;
  securityLevel: 'standard' | 'military' | 'top-secret';
  algorithm: string;
  keyLength: number;
  quantumResistant: boolean;
  // True ZK protocol components
  schnorrProof: SchnorrZKProof;
  pedersenProof: PedersenZKProof;
  sigmaProtocol: SigmaProtocolProof;
  fiatShamirTransform: FiatShamirProof;
}

// True ZK statement types
export interface ZKStatement {
  type: 'discrete_log' | 'pedersen_commitment' | 'range_proof' | 'set_membership' | 'equality' | 'custom';
  description: string;
  publicInputs: Record<string, string>; // e.g., { "g": "...", "y": "..." }
  privateInputs: Record<string, string>; // e.g., { "x": "..." } - only for prover
  relation: string; // e.g., "y = g^x"
}

// Real Schnorr ZK proof for discrete logarithm
export interface SchnorrZKProof {
  commitment: string; // R = g^k
  challenge: string;  // c = H(R || g || y || m)
  response: string;   // s = k + c*x (mod n)
  publicKey: string;  // y = g^x
  message: string;    // m
  curve: 'secp256k1' | 'P-384' | 'P-521';
  generator: string;  // g
  order: string;      // n
}

// Real Pedersen commitment ZK proof
export interface PedersenZKProof {
  commitment: string;     // C = g^m * h^r
  opening: {
    message: string;      // m
    randomness: string;   // r
  };
  generators: {
    g: string;
    h: string;
  };
  proofOfKnowledge: {
    commitment: string;   // A = g^w * h^v
    challenge: string;    // c = H(A || C || g || h)
    response1: string;    // z1 = w + c*m (mod n)
    response2: string;    // z2 = v + c*r (mod n)
  };
}

// Real Sigma protocol proof
export interface SigmaProtocolProof {
  commitment: string;     // A = g^w
  challenge: string;      // c = H(A || statement)
  response: string;       // z = w + c*x (mod n)
  statement: string;
  generator: string;
  order: string;
}

// Fiat-Shamir transform for non-interactive proofs
export interface FiatShamirProof {
  commitment: string;
  challenge: string;
  response: string;
  hashFunction: string;
  transformType: 'schnorr' | 'pedersen' | 'sigma';
}

// ZK proof types
export type ZKProofType = 
  | 'discrete_logarithm'
  | 'pedersen_commitment'
  | 'range_proof'
  | 'set_membership'
  | 'equality_proof'
  | 'custom_proof';

// ZK proof request
export interface ZKProofRequest {
  type: ZKProofType;
  statement: ZKStatement;
  expirationHours?: number;
  securityLevel?: 'standard' | 'military' | 'top-secret';
  quantumResistant?: boolean;
  interactive?: boolean;
}

// ZK proof verification result
export interface ZKProofVerificationResult {
  isValid: boolean;
  error?: string;
  details?: {
    schnorrValid: boolean;
    pedersenValid: boolean;
    sigmaValid: boolean;
    fiatShamirValid: boolean;
  };
}

// Curve parameters
export interface CurveParams {
  name: string;
  g: { x: bigint; y: bigint };
  n: bigint;
  p: bigint;
  h: { x: bigint; y: bigint };
  keyLength: number;
}

// ZK proof configuration
export interface ZKProofConfig {
  curve: 'secp256k1' | 'P-384' | 'P-521';
  keyLength: number;
  securityLevel: 'standard' | 'military' | 'top-secret';
  quantumResistant: boolean;
  proofExpirationHours: number;
  enableInteractiveProofs: boolean;
  enableProofCaching: boolean;
  maxCacheSize: number;
  enableAuditLogging: boolean;
}

// ZK proof statistics
export interface ZKProofStats {
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
}

// ZK proof cache entry
export interface ZKProofCacheEntry {
  proof: ZKProof;
  createdAt: number;
  lastAccessed: number;
  accessCount: number;
}

// ZK proof audit log entry
export interface ZKProofAuditEntry {
  timestamp: string;
  event: string;
  proofId: string;
  details: any;
  userAgent?: string;
  ipAddress?: string;
}
