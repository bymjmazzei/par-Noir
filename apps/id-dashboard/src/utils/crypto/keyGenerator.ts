// Key Generation for DIDs — ML-DSA-65 + ML-KEM-768 (@par-noir/pqc-crypto)
import { mlDsa65Keygen, mlKem768Keygen, bytesToBase64 } from '@par-noir/pqc-crypto';

export class KeyGenerator {
  static generateKeyPair(): {
    publicKey: string;
    privateKey: string;
    mlKemPublicKey: string;
    mlKemSecretKey: string;
  } {
    const dsa = mlDsa65Keygen();
    const kem = mlKem768Keygen();
    return {
      publicKey: bytesToBase64(dsa.publicKey),
      privateKey: bytesToBase64(dsa.secretKey),
      mlKemPublicKey: bytesToBase64(kem.publicKey),
      mlKemSecretKey: bytesToBase64(kem.secretKey),
    };
  }
}
