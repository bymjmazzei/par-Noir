/**
 * @par-noir/identity-crypto
 *
 * Canonical implementation: apps/id-dashboard/src/utils/crypto.ts (IdentityCrypto).
 * Extraction into this package is in progress; import from dashboard until migration completes.
 */

export type EncryptedIdentityPayload = {
  publicKey: string;
  mlKemPublicKey: string;
  encryptedData: string;
  iv: string;
  salt: string;
};

export type IdentityCryptoModule = {
  createIdentity: (...args: unknown[]) => Promise<EncryptedIdentityPayload>;
  authenticateIdentity: (...args: unknown[]) => Promise<unknown>;
};

/** Path to canonical implementation (dashboard L2). */
export const IDENTITY_CRYPTO_MODULE = 'apps/id-dashboard/src/utils/crypto.ts';
