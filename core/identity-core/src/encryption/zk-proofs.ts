/**
 * Authentic Zero-Knowledge Proof System for Identity Protocol
 * 
 * This file is now a simple re-export wrapper for the new modular ZK proofs system.
 * All functionality has been broken down into specialized modules:
 *
 * - types/zkProofs.ts: Interfaces and types for ZK proofs
 * - constants/curveParams.ts: Curve parameters and constants
 * - modules/schnorrProofGenerator.ts: Schnorr proof generation and verification
 * - modules/pedersenProofGenerator.ts: Pedersen commitment proofs
 * - modules/sigmaProtocolManager.ts: Sigma protocols and Fiat-Shamir transforms
 * - modules/proofCacheManager.ts: Proof caching and statistics
 * - modules/authenticZKProofManager.ts: Main ZK proof manager orchestrator
 * - index.ts: Re-exports all modular components
 */

// Re-export the main ZK proof manager and all modular components
export { AuthenticZKProofManager, ZKProofManager } from './zk-proofs/modules/authenticZKProofManager';

// Re-export types for backward compatibility
export * from './zk-proofs/types/zkProofs';

// Re-export constants for backward compatibility
export * from './zk-proofs/constants/curveParams';

// Re-export individual modules for direct access if needed
export { SchnorrProofGenerator } from './zk-proofs/modules/schnorrProofGenerator';
export { PedersenProofGenerator } from './zk-proofs/modules/pedersenProofGenerator';
export { SigmaProtocolManager } from './zk-proofs/modules/sigmaProtocolManager';
export { ProofCacheManager } from './zk-proofs/modules/proofCacheManager';

// Default export for backward compatibility
export { AuthenticZKProofManager as default } from './zk-proofs/modules/authenticZKProofManager';