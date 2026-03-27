import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';

export type MlDsaKeypair = {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
};

export function mlDsa65Keygen(seed?: Uint8Array): MlDsaKeypair {
  const keys = ml_dsa65.keygen(seed);
  return { publicKey: keys.publicKey, secretKey: keys.secretKey };
}

export function mlDsa65Sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
  return ml_dsa65.sign(message, secretKey);
}

export function mlDsa65Verify(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array
): boolean {
  return ml_dsa65.verify(signature, message, publicKey);
}
