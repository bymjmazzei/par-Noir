/** Types for identity crypto and encryption manager. */

import type {
  RecoveryEnvelope,
  RecoverySharesSealed,
  ShamirShare,
} from '@par-noir/recovery-crypto';

export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

export interface DIDResult {
  publicKey: string;
  privateKey: string;
  did: string;
}

export interface DIDKeyPair {
  /** ML-DSA-65 public key (base64). */
  publicKey: string;
  /** ML-DSA-65 secret key (base64) — stored only inside encrypted identity payload. */
  privateKey: string;
  did: string;
  /** ML-KEM-768 public key (base64), plaintext alongside ML-DSA public key. */
  mlKemPublicKey: string;
  /** ML-KEM-768 secret key (base64) — stored only inside encrypted identity payload. */
  mlKemSecretKey: string;
}

export interface AuthSession {
  id: string; // DID - public identifier, safe to store
  nickname: string; // Display name - safe to store
  accessToken: string;
  expiresIn: number;
  authenticatedAt: string;
  publicKey: string; // Public key - safe to store
  authToken?: string;
  // SECURITY: pnName and passcode are SECRETS and must NEVER be stored here
  // Use SecureCredentialManager.getCredentials(id) to retrieve them when needed
}

export interface IdentityData {
  id: string;
  username: string;
  nickname: string;
  email: string;
  phone: string;
  recoveryEmail: string;
  recoveryPhone: string;
  profilePicture: string;
  createdAt: string;
  status: string;
  custodiansRequired: boolean;
  custodiansSetup: boolean;
  recoveryKeys: string[];
}

export interface EncryptedData {
  encrypted: string;
  iv: string;
  salt: string;
}

export interface EncryptedIdentity {
  /** ML-DSA-65 public key (base64) — API / OAuth binding. */
  publicKey: string;
  /** ML-KEM-768 public key (base64) — optional on legacy files; required for new PQC identities. */
  mlKemPublicKey?: string;
  encryptedData: string; // Contains ALL sensitive data including PQC secret keys, DID, username, ...
  iv: string;
  salt: string;
  /** Shamir recovery envelope (AES-GCM of recovery payload, key = recovery master). */
  recoveryEnvelope?: RecoveryEnvelope;
  /** Shamir shares sealed with pN name + passcode — durable recovery vault seed in .pn file. */
  recoverySharesSealed?: RecoverySharesSealed;
}

/** Result of identity creation including Shamir shares for custodian distribution. */
export interface IdentityCreationResult {
  identity: EncryptedIdentity;
  /** Unassigned Shamir shares (index + hex data) — distribute to custodians; never store master. */
  recoveryShares: ShamirShare[];
  recoveryConfig: { threshold: number; totalShares: number; version: 1; createdAt: string };
}

export interface AuthenticationResult {
  id: string;
  pnName: string;
  nickname: string;
  accessToken: string;
  expiresIn: number;
  authenticatedAt: string;
  publicKey: string;
}

export interface RecoveryKeyData {
  identityId: string;
  purpose: string;
  timestamp: number;
  random: Uint8Array;
}

export interface TokenPayload {
  did: string;
  username: string;
  iat: number;
  exp: number;
}

export interface TokenHeader {
  alg: string;
  typ: string;
}

export interface DecryptionParameters {
  iterations: number;
  hash: string;
}
