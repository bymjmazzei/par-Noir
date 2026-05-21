import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { bytesToBase64, base64ToBytes } from './encoding';

export const KEM_ALG_ID = 'ML-KEM-768';

export type DmSessionMaterial = {
  kemCiphertext: string;
  messageRootKey: string;
};

/** Acceptor encapsulates to requester's ML-KEM public key. */
export function establishDmSession(
  peerMlKemPublicKeyB64: string,
  _myMlKemSecretKeyB64: string
): DmSessionMaterial {
  const peerPk = base64ToBytes(peerMlKemPublicKeyB64);
  const { cipherText, sharedSecret } = ml_kem768.encapsulate(peerPk);
  return {
    kemCiphertext: bytesToBase64(cipherText),
    messageRootKey: bytesToBase64(sharedSecret),
  };
}

/** Requester (or either party) opens session from stored kem ciphertext. */
export function openDmSession(kemCiphertextB64: string, myMlKemSecretKeyB64: string): string {
  const ct = base64ToBytes(kemCiphertextB64);
  const sk = base64ToBytes(myMlKemSecretKeyB64);
  const shared = ml_kem768.decapsulate(ct, sk);
  return bytesToBase64(shared);
}
