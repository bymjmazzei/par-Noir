/**
 * Decentralized Authentication System
 * 
 * This file is now a simple re-export wrapper for the new modular decentralized authentication system.
 * All functionality has been broken down into specialized modules:
 * 
 * - types/decentralizedAuth.ts: Interfaces and types for decentralized authentication
 * - authenticationManager.ts: Core authentication logic and challenge management
 * - sessionManager.ts: User session lifecycle and management
 * - cryptoManager.ts: Cryptographic operations for authentication
 * - storageManager.ts: Secure storage and retrieval of authentication data
 * - securityManager.ts: Security features (rate limiting, audit logging, timing attack mitigation)
 * - decentralizedAuth.ts: Main DecentralizedAuth orchestrator class
 * - index.ts: Re-exports all modular components
 */

// Re-export the main DecentralizedAuth class and all modular components
export { DecentralizedAuth } from './decentralizedAuth/decentralizedAuth';

// Re-export types for backward compatibility
export * from './types/decentralizedAuth';

// Re-export individual modules for direct access if needed
export { AuthenticationManager } from './decentralizedAuth/authenticationManager';
export { SessionManager } from './decentralizedAuth/sessionManager';
export { CryptoManager } from './decentralizedAuth/cryptoManager';
export { StorageManager } from './decentralizedAuth/storageManager';
export { SecurityManager } from './decentralizedAuth/securityManager';

// Default export for backward compatibility
export { DecentralizedAuth as default } from './decentralizedAuth/decentralizedAuth'; 