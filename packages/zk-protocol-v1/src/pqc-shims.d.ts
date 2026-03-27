/** Types for @par-noir/pqc-crypto subpath exports (runtime resolves via package.json exports). */
declare module '@par-noir/pqc-crypto/constants' {
  export const ML_DSA_65_PUBLIC_KEY_LENGTH: number;
}
declare module '@par-noir/pqc-crypto/encoding' {
  export function bytesToBase64(u8: Uint8Array): string;
  export function base64ToBytes(b64: string): Uint8Array;
}
declare module '@par-noir/pqc-crypto/ml-dsa' {
  export function mlDsa65Sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array;
  export function mlDsa65Verify(
    signature: Uint8Array,
    message: Uint8Array,
    publicKey: Uint8Array
  ): boolean;
}
