import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';

export type MlKemKeypair = {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
};

export type MlKemEncapsulateResult = {
  cipherText: Uint8Array;
  sharedSecret: Uint8Array;
};

export function mlKem768Keygen(seed?: Uint8Array): MlKemKeypair {
  const keys = ml_kem768.keygen(seed);
  return { publicKey: keys.publicKey, secretKey: keys.secretKey };
}

export function mlKem768Encapsulate(publicKey: Uint8Array): MlKemEncapsulateResult {
  const { cipherText, sharedSecret } = ml_kem768.encapsulate(publicKey);
  return { cipherText, sharedSecret };
}

export function mlKem768Decapsulate(cipherText: Uint8Array, secretKey: Uint8Array): Uint8Array {
  return ml_kem768.decapsulate(cipherText, secretKey);
}
