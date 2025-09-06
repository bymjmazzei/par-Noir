// Re-export all modular ZK proofs components
export { AuthenticZKProofManager, ZKProofManager } from './modules/authenticZKProofManager';
export { SchnorrProofGenerator } from './modules/schnorrProofGenerator';
export { PedersenProofGenerator } from './modules/pedersenProofGenerator';
export { SigmaProtocolManager } from './modules/sigmaProtocolManager';
export { ProofCacheManager } from './modules/proofCacheManager';

// Re-export types
export * from './types/zkProofs';

// Re-export constants
export * from './constants/curveParams';
